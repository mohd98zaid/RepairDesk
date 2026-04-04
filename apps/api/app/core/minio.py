from minio import Minio
from minio.error import S3Error
import uuid
import re
from datetime import timedelta
from typing import BinaryIO

from app.core.config import settings

_minio_client: Minio | None = None

# Allowed extensions for ticket image uploads
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"}
BLOCKED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
    ".sh", ".bash", ".csh", ".ksh",
    ".php", ".php3", ".php4", ".php5", ".phtml",
    ".py", ".rb", ".pl", ".js", ".mjs", ".vbs", ".vbe",
    ".wsf", ".wsc", ".wsh", ".ps1", ".psm1", ".psd1",
    ".asp", ".aspx", ".jsp", ".cgi",
    ".html", ".htm", ".svg",  # SVG can contain scripts
}


def get_minio_client() -> Minio:
    """Return or initialise the MinIO client (connects to the internal endpoint)."""
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_use_ssl,
        )
        # Ensure default bucket exists
        if not _minio_client.bucket_exists(settings.minio_bucket):
            _minio_client.make_bucket(settings.minio_bucket)
    return _minio_client


def get_public_minio_client() -> Minio:
    """Return a MinIO client configured with the public endpoint.
    Used ONLY for generating presigned URLs so the S3 signature matches
    the browser's Host header.

    We set region explicitly to prevent the SDK from making a region
    auto-detection network call (which would fail inside Docker since
    localhost:9000 is not reachable from the container).
    """
    endpoint = "localhost:9000" if settings.minio_endpoint == "minio:9000" else settings.minio_endpoint
    return Minio(
        endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
        region="us-east-1",
    )


from minio.datatypes import PostPolicy
from datetime import datetime, timezone

def generate_presigned_post_policy(object_key: str, content_type: str, expires_hours: int = 1) -> dict:
    """Generate a secure S3 Post Policy for file uploads enforcing constraints."""
    client = get_public_minio_client()
    now = datetime.now(timezone.utc)
    
    policy = PostPolicy(
        settings.minio_bucket,
        now + timedelta(hours=expires_hours)
    )
    
    # Require precise object key
    policy.add_equals_condition("key", object_key)
    
    # Content-Type constraints
    if content_type.startswith("image/"):
        policy.add_starts_with_condition("Content-Type", "image/")
    else:
        policy.add_equals_condition("Content-Type", content_type)
        
    # Strictly enforce 5MB maximum file size (1 byte to 5,242,880 bytes)
    policy.add_content_length_range_condition(1, 5 * 1024 * 1024)
    
    form_data = client.presigned_post_policy(policy)
    
    endpoint = "localhost:9000" if settings.minio_endpoint == "minio:9000" else settings.minio_endpoint
    scheme = "https" if settings.minio_use_ssl else "http"
    upload_url = f"{scheme}://{endpoint}/{settings.minio_bucket}"
    
    return {
        "upload_url": upload_url,
        "form_data": form_data,
        "object_key": object_key
    }


def generate_presigned_download_url(object_key: str, expires_hours: int = 24, filename: str | None = None) -> str:
    """Generate a presigned download URL using the public endpoint
    so the signature matches the browser's Host header."""
    client = get_public_minio_client()
    kwargs: dict = {
        "bucket_name": settings.minio_bucket,
        "object_name": object_key,
        "expires": timedelta(hours=expires_hours),
    }
    if filename:
        kwargs["response_headers"] = {
            "response-content-disposition": f'attachment; filename="{filename}"'
        }

    url = client.presigned_get_object(**kwargs)
    return url


def delete_object(object_key: str) -> None:
    """Permanently remove an object from the MinIO bucket."""
    client = get_minio_client()
    try:
        client.remove_object(settings.minio_bucket, object_key)
    except S3Error:
        # If it doesn't exist, we don't care during a delete operation
        pass


def build_ticket_image_key(shop_id: str, ticket_id: str, filename: str) -> str:
    """Build a consistent MinIO object key for ticket images.
    Validates the file extension and rejects dangerous file types.
    """
    # Sanitize: strip path separators, keep only basename
    safe_filename = re.sub(r"[^\w\-.]", "_", filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1])
    ext = safe_filename.rsplit(".", 1)[-1].lower() if "." in safe_filename else "jpg"
    ext_with_dot = f".{ext}"

    # SECURITY: Reject blocked executable/script extensions
    if ext_with_dot in BLOCKED_EXTENSIONS:
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException(
            f"File type '{ext}' is not allowed for security reasons. "
            f"Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        )

    # SECURITY: Only allow known safe image extensions
    if ext_with_dot not in ALLOWED_IMAGE_EXTENSIONS:
        from app.core.exceptions import ForbiddenException
        raise ForbiddenException(
            f"Unsupported file type '.{ext}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_IMAGE_EXTENSIONS))}"
        )

    return f"{shop_id}/tickets/{ticket_id}/{uuid.uuid4().hex}.{ext}"


def build_invoice_key(shop_id: str, invoice_number: str) -> str:
    """Build a consistent MinIO object key for invoice PDFs."""
    import re
    safe_number = re.sub(r"[^\w\-]", "_", invoice_number)
    return f"{shop_id}/invoices/{safe_number}.pdf"


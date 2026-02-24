from minio import Minio
from minio.error import S3Error
import uuid
from datetime import timedelta
from typing import BinaryIO

from app.core.config import settings

_minio_client: Minio | None = None


def get_minio_client() -> Minio:
    """Return or initialise the MinIO client."""
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
    """Return an offline MinIO client configured with the public endpoint.
    Used ONLY for generating presigned URLs so the S3 signature matches the browser's Host header.
    """
    endpoint = "localhost:9000" if settings.minio_endpoint == "minio:9000" else settings.minio_endpoint
    return Minio(
        endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
    )


def generate_presigned_upload_url(object_key: str, content_type: str, expires_hours: int = 1) -> str:
    client = get_public_minio_client()
    url = client.presigned_put_object(
        bucket_name=settings.minio_bucket,
        object_name=object_key,
        expires=timedelta(hours=expires_hours),
    )
    return url


def generate_presigned_download_url(object_key: str, expires_hours: int = 24, filename: str | None = None) -> str:
    client = get_public_minio_client()
    kwargs = {
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


def build_ticket_image_key(shop_id: str, ticket_id: str, filename: str) -> str:
    """Build a consistent MinIO object key for ticket images."""
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"
    return f"{shop_id}/tickets/{ticket_id}/{uuid.uuid4().hex}.{ext}"


def build_invoice_key(shop_id: str, invoice_number: str) -> str:
    """Build a consistent MinIO object key for invoice PDFs."""
    return f"{shop_id}/invoices/{invoice_number}.pdf"

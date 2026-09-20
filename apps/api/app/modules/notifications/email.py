import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_email_sync(to_email: str, subject: str, html_content: str) -> bool:
        # Helper to detect if SMTP is explicitly configured (e.g. Gmail)
        has_smtp = bool(settings.smtp_host and settings.smtp_password and settings.smtp_host != "smtp.example.com")
        is_gmail = bool(settings.smtp_host and "gmail" in settings.smtp_host.lower() or (settings.smtp_user and "gmail.com" in settings.smtp_user.lower()))

        # If Gmail or custom SMTP is explicitly provided, prefer SMTP over Resend's free tier
        prefer_smtp = has_smtp

        def _send_via_smtp() -> bool:
            try:
                # Format sender properly for Gmail
                if is_gmail and settings.smtp_user:
                    sender = f"RepairDesk <{settings.smtp_user}>"
                elif settings.smtp_user and "repairdesk.app" in settings.from_email:
                    sender = settings.smtp_user
                else:
                    sender = settings.from_email

                msg = MIMEMultipart("alternative")
                msg["Subject"] = subject
                msg["From"] = sender
                msg["To"] = to_email

                part = MIMEText(html_content, "html")
                msg.attach(part)

                port = int(settings.smtp_port or 587)
                if port == 465:
                    with smtplib.SMTP_SSL(settings.smtp_host, port, timeout=12) as server:
                        server.login(settings.smtp_user, settings.smtp_password)
                        server.sendmail(sender, to_email, msg.as_string())
                else:
                    with smtplib.SMTP(settings.smtp_host, port, timeout=12) as server:
                        server.starttls()
                        server.login(settings.smtp_user, settings.smtp_password)
                        server.sendmail(sender, to_email, msg.as_string())
                    
                print(f"✅ [EMAIL SUCCESS] Sent email to {to_email} via {settings.smtp_host}:{port} from {sender}", flush=True)
                logger.info(f"Successfully sent email to {to_email}")
                return True
            except Exception as e:
                print(f"❌ [EMAIL FAILED] Could not send email via SMTP to {to_email}: {type(e).__name__}: {e}", flush=True)
                logger.error(f"Failed to send email to {to_email}: {e}")
                return False

        def _send_via_resend() -> bool:
            if not settings.resend_api_key:
                return False
            try:
                import httpx
                resend_sender = "RepairDesk <onboarding@resend.dev>"
                if settings.from_email and not any(d in settings.from_email.lower() for d in ["repairdesk.app", "gmail.com", "yahoo.com", "hotmail.com", "outlook.com"]):
                    resend_sender = settings.from_email
                resp = httpx.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {settings.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": resend_sender,
                        "to": [to_email],
                        "subject": subject,
                        "html": html_content,
                    },
                    timeout=10.0,
                )
                if resp.status_code in (200, 201):
                    print(f"✅ [RESEND SUCCESS] Sent email to {to_email} via Resend HTTPS API", flush=True)
                    return True
                else:
                    print(f"❌ [RESEND ERROR] Resend returned {resp.status_code}: {resp.text}", flush=True)
                    return False
            except Exception as e:
                print(f"❌ [RESEND FAILED] Failed sending via Resend: {e}", flush=True)
                return False

        # Execution flow:
        if prefer_smtp:
            if _send_via_smtp():
                return True
            # If SMTP fails (e.g. timeout on port 587 on Render Free), fallback to Resend if available
            if settings.resend_api_key:
                print(f"🔄 [FALLBACK] Attempting Resend fallback for {to_email}...", flush=True)
                return _send_via_resend()
            return False
        else:
            if settings.resend_api_key:
                if _send_via_resend():
                    return True
            if has_smtp:
                return _send_via_smtp()

        print(f"⚠️ [EMAIL WARNING] Neither working SMTP nor Resend configured. Skipping email to {to_email}", flush=True)
        return False

    @staticmethod
    async def send_email(to_email: str, subject: str, html_content: str) -> bool:
        """Async wrapper for the blocking SMTP call."""
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, EmailService.send_email_sync, to_email, subject, html_content)

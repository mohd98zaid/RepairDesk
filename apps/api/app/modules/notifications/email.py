import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.core.config import settings

logger = logging.getLogger(__name__)

class EmailService:
    @staticmethod
    def send_email_sync(to_email: str, subject: str, html_content: str) -> bool:
        if not settings.smtp_host or not settings.smtp_password:
            print(f"⚠️ [SMTP WARNING] SMTP not configured (host={settings.smtp_host}, password_set={bool(settings.smtp_password)}). Skipping email to {to_email}", flush=True)
            logger.warning(f"SMTP not configured. Skipping email to {to_email}")
            return False

        try:
            sender = settings.smtp_user if (settings.smtp_user and "repairdesk.app" in settings.from_email) else settings.from_email

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = sender
            msg["To"] = to_email

            part = MIMEText(html_content, "html")
            msg.attach(part)

            port = int(settings.smtp_port or 587)
            if port == 465:
                with smtplib.SMTP_SSL(settings.smtp_host, port, timeout=10) as server:
                    server.login(settings.smtp_user, settings.smtp_password)
                    server.sendmail(sender, to_email, msg.as_string())
            else:
                with smtplib.SMTP(settings.smtp_host, port, timeout=10) as server:
                    server.starttls()
                    server.login(settings.smtp_user, settings.smtp_password)
                    server.sendmail(sender, to_email, msg.as_string())
                
            print(f"✅ [EMAIL SUCCESS] Sent email to {to_email} via {settings.smtp_host}:{port} from {sender}", flush=True)
            logger.info(f"Successfully sent email to {to_email}")
            return True
        except Exception as e:
            print(f"❌ [EMAIL FAILED] Could not send email to {to_email}: {type(e).__name__}: {e}", flush=True)
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    @staticmethod
    async def send_email(to_email: str, subject: str, html_content: str) -> bool:
        """Async wrapper for the blocking SMTP call."""
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, EmailService.send_email_sync, to_email, subject, html_content)

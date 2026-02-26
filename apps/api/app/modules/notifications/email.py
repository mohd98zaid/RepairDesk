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
            logger.warning(f"SMTP not configured. Skipping email to {to_email}")
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = settings.from_email
            msg["To"] = to_email

            part = MIMEText(html_content, "html")
            msg.attach(part)

            with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
                server.starttls()
                server.login(settings.smtp_user, settings.smtp_password)
                server.sendmail(settings.from_email, to_email, msg.as_string())
                
            logger.info(f"Successfully sent email to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    @staticmethod
    async def send_email(to_email: str, subject: str, html_content: str) -> bool:
        """Async wrapper for the blocking SMTP call."""
        import asyncio
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, EmailService.send_email_sync, to_email, subject, html_content)

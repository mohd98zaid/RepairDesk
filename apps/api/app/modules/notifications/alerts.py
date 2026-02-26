import logging
from typing import Optional

logger = logging.getLogger(__name__)

class AlertService:
    """
    Handles outbound transactional SMS and Emails to customers.
    Connects to Twilio / SendGrid / AWS SES.
    """
    
    @staticmethod
    async def send_sms(phone: str, message: str) -> bool:
        """Sends an SMS using Twilio."""
        if not phone:
            return False
            
        from app.modules.notifications.sms import SmsService
        return await SmsService.send_sms(phone, message)

    @staticmethod
    async def send_email(email: str, subject: str, html_content: str) -> bool:
        """Sends an email using SMTP."""
        if not email:
            return False
            
        from app.modules.notifications.email import EmailService
        return await EmailService.send_email(email, subject, html_content)

    @classmethod
    async def notify_status_change(cls, ticket_number: int, status: str, customer_phone: Optional[str], customer_email: Optional[str]):
        """
        High level orchestrator context for sending status updates
        """
        message = f"RepairDesk Update: Ticket #{ticket_number} is now {status}."
        
        if customer_phone:
            await cls.send_sms(customer_phone, message)
            
        if customer_email:
            subject = f"Repair Ticket #{ticket_number} Status Update"
            content = f"<p>Hello,</p><p>Your device repair ticket <strong>#{ticket_number}</strong> has been updated to <strong>{status}</strong>.</p><p>Thank you.</p>"
            await cls.send_email(customer_email, subject, content)

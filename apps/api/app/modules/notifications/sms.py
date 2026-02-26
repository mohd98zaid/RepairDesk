import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

class SmsService:
    @staticmethod
    async def send_sms(to_phone: str, message: str) -> bool:
        if not settings.twilio_account_sid or not settings.twilio_auth_token:
            logger.warning(f"Twilio not configured. Skipping SMS to {to_phone}")
            return False

        url = f"https://api.twilio.com/2010-04-01/Accounts/{settings.twilio_account_sid}/Messages.json"
        data = {
            "To": to_phone,
            "From": settings.twilio_from_number,
            "Body": message
        }

        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    url,
                    auth=(settings.twilio_account_sid, settings.twilio_auth_token),
                    data=data
                )
                response.raise_for_status()
            logger.info(f"Successfully sent SMS to {to_phone}")
            return True
        except Exception as e:
            logger.error(f"Failed to send SMS to {to_phone}: {e}")
            return False

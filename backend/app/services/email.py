import logging
from email.message import EmailMessage

import aiosmtplib

from app.core.config import settings

logger = logging.getLogger(__name__)


async def send_email(to: str, subject: str, body: str) -> bool:
    """
    Send an email via SMTP.

    If SMTP_HOST is not configured, the message is logged instead and
    this returns False. That keeps local development usable without a
    mail server.
    """
    if not settings.SMTP_HOST:
        logger.warning(
            "SMTP not configured. Email not sent.\nTo: %s\nSubject: %s\n\n%s",
            to, subject, body,
        )
        return False

    message = EmailMessage()
    message["From"] = settings.SMTP_FROM
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)

    try:
        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            start_tls=settings.SMTP_STARTTLS,
        )
        logger.info("Sent email to %s", to)
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to, exc)
        return False

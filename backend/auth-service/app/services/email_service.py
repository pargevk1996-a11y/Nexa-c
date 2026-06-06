"""Async email sending with SMTP. Falls back silently in dev (no SMTP configured)."""

from __future__ import annotations

import asyncio
import logging
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from functools import partial

from app.core.config import settings

logger = logging.getLogger(__name__)


def _send_sync(*, to: str, subject: str, html: str) -> None:
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.smtp_from_email
    msg["To"] = to
    msg.attach(MIMEText(html, "html"))

    context = ssl.create_default_context()
    if settings.smtp_use_tls:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            server.ehlo()
            server.starttls(context=context)
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_pass)
            server.sendmail(settings.smtp_from_email, to, msg.as_string())
    else:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_pass)
            server.sendmail(settings.smtp_from_email, to, msg.as_string())


async def send_email(*, to: str, subject: str, html: str) -> None:
    if not settings.smtp_host:
        logger.info("SMTP not configured — skipping email to %s: %s", to, subject)
        return
    loop = asyncio.get_event_loop()
    try:
        await loop.run_in_executor(None, partial(_send_sync, to=to, subject=subject, html=html))
    except Exception:
        logger.exception("Failed to send email to %s", to)


async def send_verification_email(*, to: str, code: str, frontend_url: str) -> None:
    verify_url = f"{frontend_url.rstrip('/')}/verify-email?code={code}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2>Verify your Nexa account</h2>
      <p>Enter this code in the app, or click the link below to verify your email address.</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center">{code}</p>
      <p style="text-align:center">
        <a href="{verify_url}" style="background:#5865f2;color:#fff;padding:12px 24px;
           border-radius:6px;text-decoration:none;display:inline-block">Verify email</a>
      </p>
      <p style="color:#888;font-size:12px">This code expires in 30 minutes. If you did not create a Nexa account, you can ignore this email.</p>
    </div>
    """
    await send_email(to=to, subject="Verify your Nexa account", html=html)


async def send_password_reset_email(*, to: str, code: str, frontend_url: str) -> None:
    reset_url = f"{frontend_url.rstrip('/')}/reset-password?code={code}"
    html = f"""
    <div style="font-family:sans-serif;max-width:480px;margin:auto">
      <h2>Reset your Nexa password</h2>
      <p>Use this code to reset your password, or click the button below.</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;text-align:center">{code}</p>
      <p style="text-align:center">
        <a href="{reset_url}" style="background:#5865f2;color:#fff;padding:12px 24px;
           border-radius:6px;text-decoration:none;display:inline-block">Reset password</a>
      </p>
      <p style="color:#888;font-size:12px">This code expires in 30 minutes. If you did not request a password reset, you can ignore this email.</p>
    </div>
    """
    await send_email(to=to, subject="Reset your Nexa password", html=html)

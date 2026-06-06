"""Server-side encryption for message bodies at rest (not E2EE)."""

from __future__ import annotations

from app.core.config import settings
from nexa_shared.security.field_encryption import decrypt_field, encrypt_field


def maybe_encrypt_body(body: str) -> str:
    key = settings.data_encryption_key
    if not key:
        return body
    blob = encrypt_field({"t": body}, master_key_b64=key, aad="message-body")
    return f"{_ENC_PREFIX}{blob}"


_ENC_PREFIX = "enc:"


def maybe_decrypt_body(stored: str) -> str:
    key = settings.data_encryption_key
    if not key or not stored.startswith(_ENC_PREFIX):
        return stored
    stored = stored[len(_ENC_PREFIX) :]
    try:
        data = decrypt_field(stored, master_key_b64=key, aad="message-body")
        return str(data.get("t", ""))
    except Exception:
        return "[encrypted]"

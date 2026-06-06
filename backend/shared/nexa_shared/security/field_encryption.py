"""AES-GCM field encryption for sensitive data at rest (server-side)."""

from __future__ import annotations

import base64
import json
import os
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _decode_master_key(key_b64: str) -> bytes:
    raw = base64.urlsafe_b64decode(key_b64.encode("ascii"))
    if len(raw) != 32:
        raise ValueError("DATA_ENCRYPTION_KEY must decode to 32 bytes")
    return raw


def encrypt_field(value: Any, *, master_key_b64: str, aad: str = "securechat-v1") -> str:
    """Return urlsafe base64 blob: nonce + ciphertext."""
    key = _decode_master_key(master_key_b64)
    aes = AESGCM(key)
    nonce = os.urandom(12)
    plaintext = json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ct = aes.encrypt(nonce, plaintext, aad.encode("utf-8"))
    return base64.urlsafe_b64encode(nonce + ct).decode("ascii")


def decrypt_field(blob_b64: str, *, master_key_b64: str, aad: str = "securechat-v1") -> Any:
    raw = base64.urlsafe_b64decode(blob_b64.encode("ascii"))
    nonce, ct = raw[:12], raw[12:]
    key = _decode_master_key(master_key_b64)
    aes = AESGCM(key)
    plaintext = aes.decrypt(nonce, ct, aad.encode("utf-8"))
    return json.loads(plaintext.decode("utf-8"))

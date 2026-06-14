"""Encrypted blobs at rest (AES-256-GCM)."""

from __future__ import annotations

import hashlib
import os
from pathlib import Path

from app.core.config import settings
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def _key() -> bytes:
    raw = settings.media_encryption_key or settings.media_signing_secret
    return hashlib.sha256(raw.encode("utf-8")).digest()


def encrypt_bytes(data: bytes, *, aad: str = "media-v1") -> bytes:
    aes = AESGCM(_key())
    nonce = os.urandom(12)
    ct = aes.encrypt(nonce, data, aad.encode("utf-8"))
    return nonce + ct


def decrypt_bytes(blob: bytes, *, aad: str = "media-v1") -> bytes:
    aes = AESGCM(_key())
    return aes.decrypt(blob[:12], blob[12:], aad.encode("utf-8"))


def write_encrypted(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(encrypt_bytes(data))


def read_encrypted(path: Path) -> bytes:
    return decrypt_bytes(path.read_bytes())

import hashlib
import secrets


def generate_opaque_token(num_bytes: int = 32) -> str:
    """Cryptographically secure opaque token (not JWT)."""
    return secrets.token_urlsafe(num_bytes)


def hash_token(token: str) -> str:
    """SHA-256 hex digest for Redis storage (never store raw token)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

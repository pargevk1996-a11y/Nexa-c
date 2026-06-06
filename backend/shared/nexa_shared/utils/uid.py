import secrets

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_PREFIX = "SC-"


def generate_public_uid(length: int = 10) -> str:
    """Generate SC- prefixed public UID for user search."""
    body = "".join(secrets.choice(_CROCKFORD) for _ in range(length))
    return f"{_PREFIX}{body}"


def is_valid_public_uid(uid: str) -> bool:
    if not uid.startswith(_PREFIX):
        return False
    body = uid[len(_PREFIX) :]
    if len(body) < 8 or len(body) > 16:
        return False
    return all(c in _CROCKFORD for c in body)

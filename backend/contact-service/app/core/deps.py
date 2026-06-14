from fastapi import Header, HTTPException
from nexa_shared.security.jwt_keys import load_pem, verify_access_token

from app.core.config import settings


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Bearer token required"}},
        )
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = verify_access_token(
            token,
            algorithm=settings.jwt_algorithm,
            hs_secret=settings.jwt_access_secret or None,
            public_key_pem=load_pem(
                settings.jwt_access_public_key_file,
                settings.jwt_access_public_key,
            ),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token"}},
        ) from exc
    return str(payload["sub"])

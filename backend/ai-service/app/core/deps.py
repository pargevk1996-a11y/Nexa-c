from fastapi import Header, HTTPException

from app.core.config import settings
from nexa_shared.security.jwt_keys import load_pem, verify_access_token


def get_current_user_id(authorization: str | None = Header(default=None)) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Bearer token required"}},
        )
    token = authorization.split(" ", 1)[1].strip()
    public = load_pem(settings.jwt_access_public_key_file, settings.jwt_access_public_key)
    try:
        payload = verify_access_token(
            token,
            algorithm=settings.jwt_algorithm,
            hs_secret=settings.jwt_access_secret or None,
            public_key_pem=public,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid token"}},
        ) from exc
    return str(payload["sub"])


def get_current_user_id_or_internal(
    authorization: str | None = Header(default=None),
    x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> str:
    if (
        x_internal_secret
        and settings.internal_service_secret
        and x_internal_secret == settings.internal_service_secret
        and x_user_id
    ):
        return x_user_id
    return get_current_user_id(authorization)

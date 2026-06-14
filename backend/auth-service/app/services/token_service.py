from app.core.config import settings
from fastapi import HTTPException, Request

_auto_private_pem: str | None = None
_auto_public_pem: str | None = None


def set_auto_keys(private_pem: str, public_pem: str) -> None:
    global _auto_private_pem, _auto_public_pem
    _auto_private_pem = private_pem
    _auto_public_pem = public_pem
from app.services.session_store import StoredSession, session_store
from app.services.user_store import store as user_store
from nexa_shared.security.device_fingerprint import fingerprint_request
from nexa_shared.security.jwt_keys import (
    create_access_token,
    load_pem,
    verify_access_token,
)
from nexa_shared.security.tokens import new_refresh_token


def _get_client_ip(request: "Request | None") -> str | None:
    if not request:
        return None
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None


def _jwt_material() -> tuple[str, str | None, str | None, str | None]:
    algorithm = settings.jwt_algorithm
    hs = settings.jwt_access_secret or None
    private = load_pem(settings.jwt_access_private_key_file, settings.jwt_access_private_key) or _auto_private_pem
    public = load_pem(settings.jwt_access_public_key_file, settings.jwt_access_public_key) or _auto_public_pem
    return algorithm, hs, private, public


async def issue_tokens_for_user(
    user_id: str,
    email: str,
    *,
    device_label: str = "Web browser",
    request: Request | None = None,
    revoke_others: bool = True,
) -> tuple[str, str, StoredSession, int]:
    raw_refresh = new_refresh_token()
    fp = fingerprint_request(request) if request else "unknown"
    ip_hint = _get_client_ip(request)
    session = await session_store.create_session(
        user_id,
        raw_refresh,
        device_label=device_label,
        ip_hint=ip_hint,
        device_fingerprint=fp,
    )
    # SINGLE-SESSION POLICY: a fresh credentials login (password / 2FA / OAuth /
    # WebAuthn — they all funnel through here) terminates every other session.
    # The ONLY sanctioned way to hold two active devices is QR pairing
    # ("Trusted Access Points"), which passes revoke_others=False and enforces
    # its own max-2 invariant in qr_approve. Revoked sessions die at their next
    # token refresh (access tokens are short-lived, jwt_access_ttl_seconds).
    if revoke_others:
        await session_store.revoke_other_sessions(user_id, session.id)
    algorithm, hs_secret, private_pem, _public_pem = _jwt_material()
    ttl = settings.jwt_access_ttl_seconds
    access = create_access_token(
        {
            "sub": user_id,
            "sid": session.id,
            "email": email,
            "typ": "access",
            "dfp": fp,
        },
        algorithm=algorithm,
        expires_seconds=ttl,
        hs_secret=hs_secret,
        private_key_pem=private_pem,
    )
    return access, raw_refresh, session, ttl


async def refresh_session(raw_refresh: str, *, request: Request | None = None) -> tuple[str, str, int]:
    reused = await session_store.find_revoked_by_refresh(raw_refresh)
    if reused:
        await session_store.revoke_family(reused.refresh_family_id)
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "REFRESH_REUSE",
                    "message": "Session invalidated. Please sign in again.",
                }
            },
        )

    session = await session_store.find_by_refresh_hash(raw_refresh)
    if not session:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_REFRESH", "message": "Invalid or expired session"}},
        )

    user = await user_store.get_by_id(session.user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )

    new_raw = new_refresh_token()
    await session_store.rotate_refresh(session.id, new_raw)
    algorithm, hs_secret, private_pem, _public_pem = _jwt_material()
    ttl = settings.jwt_access_ttl_seconds
    access = create_access_token(
        {
            "sub": user.id,
            "sid": session.id,
            "email": user.email,
            "typ": "access",
            "dfp": session.device_fingerprint,
        },
        algorithm=algorithm,
        expires_seconds=ttl,
        hs_secret=hs_secret,
        private_key_pem=private_pem,
    )
    return access, new_raw, ttl


def decode_bearer_token(authorization: str | None) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNAUTHORIZED", "message": "Missing bearer token"}},
        )
    token = authorization.split(" ", 1)[1].strip()
    algorithm, hs_secret, _private_pem, public_pem = _jwt_material()
    try:
        return verify_access_token(
            token,
            algorithm=algorithm,
            hs_secret=hs_secret,
            public_key_pem=public_pem,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_TOKEN", "message": "Invalid access token"}},
        ) from exc

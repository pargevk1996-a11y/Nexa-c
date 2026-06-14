from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Header, HTTPException, Request, Response
from nexa_shared.security.field_encryption import encrypt_cookie_token
from nexa_shared.security.jwt_keys import create_access_token
from nexa_shared.security.tokens import new_refresh_token

from app.core.config import settings
from app.schemas.auth import (
    AuthResponse,
    QrApproveRequest,
    QrPollResponse,
    QrStartResponse,
    RefreshRequest,
    SessionResponse,
    UserResponse,
)
from app.services.session_store import session_store
from app.services.token_service import (
    _jwt_material,
    decode_bearer_token,
    issue_tokens_for_user,
    refresh_session,
)
from app.services.user_store import store as user_store

router = APIRouter(prefix="/api/v1", tags=["sessions"])


def _user_response(user) -> UserResponse:
    return UserResponse(id=user.id, email=user.email, username=user.username, uid=user.uid)


def _set_refresh_cookie(response: Response, raw_refresh: str) -> None:
    max_age = settings.jwt_refresh_ttl_seconds
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=raw_refresh,
        max_age=max_age,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        path="/api/v1/auth",
    )


def _set_access_cookie(response: Response, access_token: str) -> None:
    """Store the access JWT encrypted in an httpOnly cookie.

    The cookie value is an AES-256-GCM blob — opaque, not a readable JWT.
    The browser sends it automatically on every same-site request (REST +
    WebSocket upgrade); api-gateway decrypts it and injects Authorization.
    """
    key = settings.cookie_encryption_key
    value = encrypt_cookie_token(access_token, key_b64=key) if key else access_token
    response.set_cookie(
        key="access_token",
        value=value,
        max_age=settings.jwt_access_ttl_seconds,
        httponly=True,
        secure=settings.app_env == "production",
        samesite="strict",
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=settings.refresh_cookie_name, path="/api/v1/auth")


def _clear_access_cookie(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/")


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    authorization: str | None = Header(default=None),
) -> dict:
    payload = decode_bearer_token(authorization)
    await session_store.revoke_session(payload["sid"])
    _clear_refresh_cookie(response)
    _clear_access_cookie(response)
    return {"message": "Signed out"}


@router.post("/refresh", response_model=AuthResponse)
async def refresh_tokens(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
) -> AuthResponse:
    raw = (body.refresh_token if body else None) or request.cookies.get(settings.refresh_cookie_name)
    if not raw:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "NO_REFRESH", "message": "Refresh token required"}},
        )
    access, new_raw, ttl = await refresh_session(raw, request=request)
    session = await session_store.find_by_refresh_hash(new_raw)
    if not session:
        raise HTTPException(status_code=401, detail={"error": {"code": "SESSION_LOST", "message": "Session error"}})
    user = await user_store.get_by_id(session.user_id)
    if not user:
        raise HTTPException(status_code=401, detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}})
    _set_refresh_cookie(response, new_raw)
    _set_access_cookie(response, access)
    return AuthResponse(
        user=_user_response(user),
        access_token=access,
        expires_in=ttl,
    )


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(authorization: str | None = Header(default=None)) -> list[SessionResponse]:
    payload = decode_bearer_token(authorization)
    current_sid = payload["sid"]
    sessions = await session_store.list_user_sessions(payload["sub"])
    return [
        SessionResponse(
            id=s.id,
            device_label=s.device_label,
            created_at=s.created_at.isoformat(),
            last_used_at=s.last_used_at.isoformat(),
            ip_hint=s.ip_hint,
            current=s.id == current_sid,
        )
        for s in sorted(sessions, key=lambda x: x.last_used_at, reverse=True)
    ]


@router.post("/sessions/revoke-others", response_model=dict)
async def revoke_other_sessions(
    authorization: str | None = Header(default=None),
) -> dict:
    payload = decode_bearer_token(authorization)
    count = await session_store.revoke_other_sessions(payload["sub"], payload["sid"])
    return {"message": f"Revoked {count} other session(s).", "revoked": count}


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: str,
    authorization: str | None = Header(default=None),
) -> dict:
    payload = decode_bearer_token(authorization)
    target = await session_store.get_session(session_id)
    if not target or target.user_id != payload["sub"]:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Session not found"}})
    await session_store.revoke_session(session_id)
    return {"message": "Session revoked"}


@router.post("/qr/start", response_model=QrStartResponse)
async def qr_start() -> QrStartResponse:
    token = new_refresh_token()[:32]
    expires = datetime.now(UTC) + timedelta(minutes=5)
    await session_store.create_qr(token, expires)
    base = settings.oauth_public_base_url.rstrip("/")
    # NB: the poll token is sent via the X-QR-Token request header, never in the
    # URL — so it cannot leak into access logs / CDN / browser history.
    return QrStartResponse(
        qr_token=token,
        expires_at=expires.isoformat(),
        poll_url=f"{base}/api/v1/auth/qr/poll",
    )


@router.get("/qr/poll", response_model=QrPollResponse)
async def qr_poll(
    response: Response,
    x_qr_token: str | None = Header(default=None, alias="X-QR-Token"),
) -> QrPollResponse:
    token = x_qr_token
    if not token:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "QR_TOKEN_REQUIRED", "message": "X-QR-Token header required"}},
        )
    qr = await session_store.get_qr(token)
    if not qr:
        return QrPollResponse(status="expired")
    if datetime.now(UTC) > qr.expires_at.replace(tzinfo=UTC):
        return QrPollResponse(status="expired")
    if qr.status == "pending":
        return QrPollResponse(status="pending")
    if qr.status == "approved" and qr.user_id and qr.session_id:
        user = await user_store.get_by_id(qr.user_id)
        if user:
            algorithm, hs_secret, private_pem, _ = _jwt_material()
            ttl = settings.jwt_access_ttl_seconds
            access = create_access_token(
                {
                    "sub": user.id,
                    "sid": qr.session_id,
                    "email": user.email,
                    "typ": "access",
                    "dfp": "",
                },
                algorithm=algorithm,
                expires_seconds=ttl,
                hs_secret=hs_secret,
                private_key_pem=private_pem,
            )
            if qr.refresh_token_raw:
                _set_refresh_cookie(response, qr.refresh_token_raw)
                # One-time read: drop the plaintext refresh token from the QR row
                # as soon as the paired device has it set as an HttpOnly cookie,
                # so it is never left at rest in the qr_sessions table.
                await session_store.consume_qr_refresh(token)
            _set_access_cookie(response, access)
            return QrPollResponse(
                status="approved",
                access_token=access,
                token_type="Bearer",
                expires_in=ttl,
                user=_user_response(user),
            )
    return QrPollResponse(status="expired")


@router.post("/qr/approve", response_model=dict)
async def qr_approve(
    body: QrApproveRequest,
    request: Request,
    authorization: str | None = Header(default=None),
) -> dict:
    payload = decode_bearer_token(authorization)
    user = await user_store.get_by_id(payload["sub"])
    if not user:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "Unauthorized"}})
    # QR pairing ("Trusted Access Points") is the ONLY path allowed to add a
    # second concurrent session — skip the single-session revocation here.
    _, raw_refresh, session, _ = await issue_tokens_for_user(
        user.id,
        user.email,
        device_label="QR linked device",
        request=request,
        revoke_others=False,
    )
    qr = await session_store.approve_qr(
        body.qr_token,
        user.id,
        session.id,
        refresh_token_raw=raw_refresh,
    )
    if not qr:
        # Pairing failed — don't leave the freshly minted session dangling.
        await session_store.revoke_session(session.id)
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "QR_INVALID", "message": "QR code expired or invalid"}},
        )
    # MAX-2 INVARIANT: after pairing, exactly two sessions stay active — the
    # approving device (this caller) and the newly linked one. All others are
    # revoked ("only QR-linked devices can be active simultaneously, max 2").
    approver_sid = str(payload.get("sid") or "")
    keep = {approver_sid, session.id}
    for s in await session_store.list_user_sessions(user.id):
        if s.id not in keep:
            await session_store.revoke_session(s.id)
    return {"message": "Device approved", "refresh_token": raw_refresh}

"""PIN setup and verification routes."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException, Response

logger = logging.getLogger(__name__)

from nexa_shared.security.jwt_keys import create_access_token
from nexa_shared.security.passwords import hash_password, verify_password
from pydantic import BaseModel, Field, field_validator

from app.api.session_routes import _clear_access_cookie, _clear_refresh_cookie, _set_access_cookie
from app.core.config import settings
from app.services.session_store import session_store
from app.services.token_service import (
    _jwt_material,
    decode_bearer_token,
)
from app.services.user_store import store as user_store

pin_router = APIRouter(prefix="/api/v1/pin", tags=["pin"])


class PinBody(BaseModel):
    pin: str = Field(..., min_length=1, max_length=6)

    @field_validator("pin")
    @classmethod
    def digits_only(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("PIN must contain digits only")
        return v


class PinStatusResponse(BaseModel):
    pin_status: str
    pin_verified: bool


def _build_verified_access_token(
    user_id: str, session_id: str, email: str, device_fingerprint: str, pin_status: str
) -> str:
    algorithm, hs_secret, private_pem, _ = _jwt_material()
    return create_access_token(
        {
            "sub": user_id,
            "sid": session_id,
            "email": email,
            "typ": "access",
            "dfp": device_fingerprint,
            "pin_status": pin_status,
            "pin_verified": True,
        },
        algorithm=algorithm,
        expires_seconds=settings.jwt_access_ttl_seconds,
        hs_secret=hs_secret,
        private_key_pem=private_pem,
    )


@pin_router.post("/setup", response_model=PinStatusResponse)
async def setup_pin(
    body: PinBody,
    response: Response,
    authorization: str | None = Header(default=None),
) -> PinStatusResponse:
    payload = decode_bearer_token(authorization)

    if payload.get("pin_status") == "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "PIN_ALREADY_SET", "message": "PIN is already configured"}},
        )

    user_id = payload["sub"]
    session_id = payload["sid"]

    user = await user_store.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )

    hashed = hash_password(body.pin)
    await user_store.set_pin(user_id, hashed)
    await session_store.set_pin_verified_at(session_id)

    session = await session_store.get_session(session_id)
    fp = session.device_fingerprint if session else "unknown"

    access = _build_verified_access_token(user_id, session_id, user.email, fp, "ACTIVE")
    _set_access_cookie(response, access)

    return PinStatusResponse(pin_status="ACTIVE", pin_verified=True)


@pin_router.post("/verify", response_model=PinStatusResponse)
async def verify_pin(
    body: PinBody,
    response: Response,
    authorization: str | None = Header(default=None),
) -> PinStatusResponse:
    payload = decode_bearer_token(authorization)

    if payload.get("pin_status") != "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "PIN_NOT_SET", "message": "No PIN configured. Use /pin/setup first."}},
        )

    user_id = payload["sub"]
    session_id = payload["sid"]

    user = await user_store.get_by_id(user_id)
    if not user or not user.pin_hash:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )

    if not verify_password(user.pin_hash, body.pin):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_PIN", "message": "Incorrect PIN"}},
        )

    await session_store.set_pin_verified_at(session_id)

    session = await session_store.get_session(session_id)
    fp = session.device_fingerprint if session else "unknown"

    access = _build_verified_access_token(user_id, session_id, user.email, fp, "ACTIVE")
    _set_access_cookie(response, access)

    return PinStatusResponse(pin_status="ACTIVE", pin_verified=True)


@pin_router.get("/status", response_model=PinStatusResponse)
async def pin_status(
    authorization: str | None = Header(default=None),
) -> PinStatusResponse:
    payload = decode_bearer_token(authorization)
    return PinStatusResponse(
        pin_status=payload.get("pin_status", "PENDING_PIN"),
        pin_verified=bool(payload.get("pin_verified", False)),
    )


@pin_router.post("/lock", response_model=PinStatusResponse)
async def lock_all_sessions(
    response: Response,
    authorization: str | None = Header(default=None),
) -> PinStatusResponse:
    """Manually lock the account — clears PIN verification on ALL sessions so
    every device must re-enter the PIN before resuming. The current device
    also gets a fresh token with pin_verified=False."""
    payload = decode_bearer_token(authorization)

    if payload.get("pin_status") != "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "PIN_NOT_SET", "message": "No PIN configured"}},
        )

    user_id = payload["sub"]
    session_id = payload["sid"]

    user = await user_store.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )

    # Clear pin_verified_at on ALL sessions — forces PIN re-entry everywhere.
    await session_store.clear_pin_verified_all(user_id)

    session = await session_store.get_session(session_id)
    fp = session.device_fingerprint if session else "unknown"

    # Issue a fresh access token with pin_verified=False for this device.
    algorithm, hs_secret, private_pem, _ = _jwt_material()
    access = create_access_token(
        {
            "sub": user_id,
            "sid": session_id,
            "email": user.email,
            "typ": "access",
            "dfp": fp,
            "pin_status": "ACTIVE",
            "pin_verified": False,
        },
        algorithm=algorithm,
        expires_seconds=settings.jwt_access_ttl_seconds,
        hs_secret=hs_secret,
        private_key_pem=private_pem,
    )
    _set_access_cookie(response, access)

    # Notify all WebSocket connections for this user to show PIN lock screen.
    from app.main import publish_session_lock
    await publish_session_lock(user_id)

    return PinStatusResponse(pin_status="ACTIVE", pin_verified=False)


@pin_router.post("/cancel", response_model=PinStatusResponse)
async def cancel_pin_setup(
    response: Response,
    authorization: str | None = Header(default=None),
) -> PinStatusResponse:
    """Abort registration at the PIN-creation step. ONLY valid while the account
    is still PENDING_PIN (no PIN ever created) — deletes the account entirely so
    nothing is left behind. Once a PIN exists (ACTIVE), the account is protected
    and cannot be cancelled this way."""
    payload = decode_bearer_token(authorization)

    if payload.get("pin_status") == "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "PIN_ALREADY_SET", "message": "Account is protected; cannot cancel"}},
        )

    user_id = payload["sub"]
    user = await user_store.get_by_id(user_id)
    # Re-check against the DB (the token claim is advisory only).
    if user and user.pin_status == "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "PIN_ALREADY_SET", "message": "Account is protected; cannot cancel"}},
        )

    if user:
        try:
            for s in await session_store.list_user_sessions(user_id):
                await session_store.revoke_session(s.id)
            await user_store.delete_user(user_id)
        except Exception:
            # Best-effort deletion — always clear cookies below so the
            # browser is signed out even if the DB operation fails.
            logger.exception("cancel_pin_setup: failed to delete user %s", user_id)

    # Clear auth cookies so the browser is fully signed out.
    _clear_access_cookie(response)
    _clear_refresh_cookie(response)
    return PinStatusResponse(pin_status="CANCELLED", pin_verified=False)

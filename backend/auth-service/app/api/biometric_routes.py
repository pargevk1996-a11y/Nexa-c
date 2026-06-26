"""Biometric (platform authenticator) PIN-unlock routes.

Opt-in, mobile-browser biometric: a user who has registered a platform
authenticator (Face ID / fingerprint) can clear the PIN gate by signing a
fresh server-issued challenge instead of typing the PIN. Unlike the legacy
``/webauthn/login/*`` stub, the verify step does REAL assertion verification
(see ``webauthn_store.verify_assertion``), so a stolen session cookie alone
cannot unlock — the device's private key (in the secure enclave) is required.

The PIN-unlock endpoints (``/pin/start`` and ``/pin/verify``) are reachable
while the session is PIN-locked; the api-gateway exempts the
``/api/v1/auth/biometric/pin`` prefix from the PIN gate.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Header, HTTPException, Response
from pydantic import BaseModel, Field

from app.api.pin_routes import _build_verified_access_token
from app.api.session_routes import _set_access_cookie
from app.services.session_store import session_store
from app.services.token_service import decode_bearer_token
from app.services.user_store import store as user_store
from app.services.webauthn_store import verify_assertion, webauthn_store

logger = logging.getLogger(__name__)

biometric_router = APIRouter(prefix="/api/v1/biometric", tags=["biometric"])


class BiometricRegisterRequest(BaseModel):
    credential_id: str
    public_key: str
    device_label: str = Field(default="This device", max_length=80)


class BiometricStatusResponse(BaseModel):
    enabled: bool
    count: int


class BiometricStartResponse(BaseModel):
    challenge: str
    credential_ids: list[str]


class BiometricVerifyRequest(BaseModel):
    credential_id: str
    challenge: str
    authenticator_data: str
    client_data_json: str
    signature: str


class MessageResponse(BaseModel):
    message: str


@biometric_router.post("/register", response_model=MessageResponse)
async def biometric_register(
    body: BiometricRegisterRequest,
    authorization: str | None = Header(default=None),
) -> MessageResponse:
    user_id = decode_bearer_token(authorization)["sub"]
    webauthn_store.register(
        user_id,
        body.credential_id,
        body.public_key,
        device_label=body.device_label,
    )
    return MessageResponse(message="Biometric unlock enabled on this device.")


@biometric_router.get("/status", response_model=BiometricStatusResponse)
async def biometric_status(
    authorization: str | None = Header(default=None),
) -> BiometricStatusResponse:
    user_id = decode_bearer_token(authorization)["sub"]
    count = webauthn_store.count_for_user(user_id)
    return BiometricStatusResponse(enabled=count > 0, count=count)


@biometric_router.delete("", response_model=MessageResponse)
async def biometric_remove(
    authorization: str | None = Header(default=None),
) -> MessageResponse:
    user_id = decode_bearer_token(authorization)["sub"]
    removed = webauthn_store.remove_for_user(user_id)
    return MessageResponse(message=f"Removed {removed} biometric credential(s).")


@biometric_router.post("/pin/start", response_model=BiometricStartResponse)
async def biometric_pin_start(
    authorization: str | None = Header(default=None),
) -> BiometricStartResponse:
    payload = decode_bearer_token(authorization)
    user_id = payload["sub"]

    creds = webauthn_store.list_for_user(user_id)
    if not creds:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "NO_CREDENTIAL", "message": "Biometric unlock not set up"}},
        )
    challenge = webauthn_store.issue_user_challenge(user_id)
    return BiometricStartResponse(
        challenge=challenge,
        credential_ids=[c.credential_id for c in creds],
    )


@biometric_router.post("/pin/verify", response_model=dict)
async def biometric_pin_verify(
    body: BiometricVerifyRequest,
    response: Response,
    authorization: str | None = Header(default=None),
) -> dict:
    payload = decode_bearer_token(authorization)

    if payload.get("pin_status") != "ACTIVE":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "PIN_NOT_SET", "message": "No PIN configured"}},
        )

    user_id = payload["sub"]
    session_id = payload["sid"]

    # The challenge must be the one we just issued for this user (single use).
    if not webauthn_store.consume_user_challenge(user_id, body.challenge):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_CHALLENGE", "message": "Challenge expired"}},
        )

    cred = webauthn_store.get_by_credential_id(body.credential_id)
    if not cred or cred.user_id != user_id:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "UNKNOWN_CREDENTIAL", "message": "Unknown credential"}},
        )

    ok, sign_count = verify_assertion(
        public_key_b64=cred.public_key,
        client_data_json_b64=body.client_data_json,
        authenticator_data_b64=body.authenticator_data,
        signature_b64=body.signature,
        expected_challenge=body.challenge,
    )
    if not ok:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "BIOMETRIC_FAILED", "message": "Biometric verification failed"}},
        )

    webauthn_store.update_sign_count(cred.credential_id, sign_count)

    user = await user_store.get_by_id(user_id)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )

    await session_store.set_pin_verified_at(session_id)

    session = await session_store.get_session(session_id)
    fp = session.device_fingerprint if session else "unknown"
    access = _build_verified_access_token(user_id, session_id, user.email, fp, "ACTIVE")
    _set_access_cookie(response, access)

    return {"pin_status": "ACTIVE", "pin_verified": True}

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response

from app.api.session_routes import _set_refresh_cookie
from app.schemas.auth import (
    AccountDeleteRequest,
    AuthResponse,
    BackupCodesResponse,
    MessageResponse,
    SecurityStatusResponse,
    TotpConfirmRequest,
    TotpDisableRequest,
    TotpSetupResponse,
    TotpVerifyRequest,
    WebAuthnCredentialResponse,
    WebAuthnLoginFinishRequest,
    WebAuthnLoginStartRequest,
    WebAuthnRegisterRequest,
)
from app.services.session_store import session_store
from app.services.token_service import decode_bearer_token, issue_tokens_for_user
from nexa_shared.security.passwords import verify_password
from app.services.totp_service import totp_store
from app.services.user_store import store as user_store
from app.services.webauthn_store import webauthn_store

router = APIRouter(prefix="/api/v1", tags=["security"])


def _user_id(authorization: str | None = Header(default=None)) -> str:
    return decode_bearer_token(authorization)["sub"]


@router.post("/2fa/setup", response_model=TotpSetupResponse)
async def totp_setup(user_id: str = Depends(_user_id)) -> TotpSetupResponse:
    secret, uri = totp_store.start_setup(user_id)
    return TotpSetupResponse(secret=secret, provisioning_uri=uri)


@router.post("/2fa/confirm", response_model=BackupCodesResponse)
async def totp_confirm(
    body: TotpConfirmRequest,
    user_id: str = Depends(_user_id),
) -> BackupCodesResponse:
    codes = totp_store.confirm_setup(user_id, body.code)
    if not codes:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_TOTP", "message": "Invalid verification code"}},
        )
    return BackupCodesResponse(backup_codes=codes, message="Save these codes securely.")


@router.post("/2fa/verify", response_model=MessageResponse)
async def totp_verify(
    body: TotpVerifyRequest,
    user_id: str = Depends(_user_id),
) -> MessageResponse:
    if not totp_store.verify(user_id, body.code):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_2FA", "message": "Invalid 2FA code"}},
        )
    return MessageResponse(message="2FA verified")


@router.get("/2fa/status")
async def totp_status(user_id: str = Depends(_user_id)) -> dict:
    return {"enabled": totp_store.is_enabled(user_id)}


@router.post("/2fa/disable", response_model=MessageResponse)
async def totp_disable(
    body: TotpDisableRequest,
    user_id: str = Depends(_user_id),
) -> MessageResponse:
    if not totp_store.disable(user_id, body.code):
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_2FA", "message": "Invalid code — 2FA not disabled"}},
        )
    return MessageResponse(message="Two-factor authentication disabled.")


@router.get("/me/security", response_model=SecurityStatusResponse)
async def security_status(user_id: str = Depends(_user_id)) -> SecurityStatusResponse:
    user = await user_store.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "User not found"}})
    sessions = await session_store.list_user_sessions(user_id)
    return SecurityStatusResponse(
        email_verified=user.is_email_verified,
        phone=user.phone,
        phone_verified=user.is_phone_verified,
        totp_enabled=totp_store.is_enabled(user_id),
        webauthn_credentials=webauthn_store.count_for_user(user_id),
        active_sessions=len(sessions),
    )


@router.post("/webauthn/register", response_model=MessageResponse)
async def webauthn_register(
    body: WebAuthnRegisterRequest,
    user_id: str = Depends(_user_id),
) -> MessageResponse:
    webauthn_store.register(
        user_id,
        body.credential_id,
        body.public_key,
        device_label=body.device_label,
    )
    return MessageResponse(message="Biometric key registered on this device.")


@router.get("/webauthn/credentials", response_model=list[WebAuthnCredentialResponse])
async def webauthn_list(user_id: str = Depends(_user_id)) -> list[WebAuthnCredentialResponse]:
    return [
        WebAuthnCredentialResponse(
            id=c.id,
            credential_id=c.credential_id[:12] + "…",
            device_label=c.device_label,
        )
        for c in webauthn_store.list_for_user(user_id)
    ]


@router.delete("/webauthn/credentials", response_model=MessageResponse)
async def webauthn_remove(user_id: str = Depends(_user_id)) -> MessageResponse:
    removed = webauthn_store.remove_for_user(user_id)
    return MessageResponse(message=f"Removed {removed} biometric credential(s).")



@router.post("/account/delete", response_model=MessageResponse)
async def delete_account(
    body: AccountDeleteRequest,
    user_id: str = Depends(_user_id),
) -> MessageResponse:
    user = await user_store.get_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "User not found"}})
    if not verify_password(user.password_hash, body.password):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_PASSWORD", "message": "Password is incorrect"}},
        )
    if body.confirm_text.strip().upper() != "DELETE":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "CONFIRM_REQUIRED", "message": 'Type DELETE in confirm_text'}},
        )
    for s in await session_store.list_user_sessions(user_id):
        await session_store.revoke_session(s.id)
    webauthn_store.remove_for_user(user_id)
    totp_store.purge_user(user_id)
    await user_store.delete_user(user_id)
    return MessageResponse(message="Account scheduled for deletion. Sign-in disabled.")


@router.post("/webauthn/login/start")
async def webauthn_login_start(body: WebAuthnLoginStartRequest) -> dict:
    user = await user_store.get_by_email(body.email)
    if not user:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": "No account with this email"}},
        )
    creds = webauthn_store.list_for_user(user.id)
    if not creds:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "NO_CREDENTIAL", "message": "Biometric sign-in not set up"}},
        )
    challenge = webauthn_store.issue_challenge(user.email)
    return {
        "challenge": challenge,
        "credential_ids": [c.credential_id for c in creds],
        "user_id": user.id,
    }


@router.post("/webauthn/login/finish", response_model=AuthResponse)
async def webauthn_login_finish(
    body: WebAuthnLoginFinishRequest,
    request: Request,
    response: Response,
) -> AuthResponse:
    user = await user_store.get_by_email(body.email)
    if not user:
        raise HTTPException(status_code=401, detail={"error": {"code": "INVALID", "message": "Sign-in failed"}})
    if not webauthn_store.consume_challenge(user.email, body.challenge):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_CHALLENGE", "message": "Challenge expired"}},
        )
    cred = webauthn_store.get_by_credential_id(body.credential_id)
    if not cred or cred.user_id != user.id:
        raise HTTPException(status_code=401, detail={"error": {"code": "INVALID", "message": "Unknown credential"}})

    access, raw_refresh, _session, ttl = await issue_tokens_for_user(
        user.id,
        user.email,
        device_label="Biometric sign-in",
        request=request,
    )
    _set_refresh_cookie(response, raw_refresh)
    from app.schemas.auth import UserResponse

    return AuthResponse(
        user=UserResponse(
            id=user.id,
            email=user.email,
            username=user.username,
            uid=user.uid,
        ),
        access_token=access,
        expires_in=ttl,
    )

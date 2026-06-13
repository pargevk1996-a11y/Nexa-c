from fastapi import APIRouter, Header, HTTPException, Request, Response


def _get_client_ip(request: Request) -> str | None:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else None

from app.core.config import settings
from app.schemas.auth import (
    AuthConfigResponse,
    AuthResponse,
    ChangePasswordRequest,
    EmailRequest,
    Login2faRequest,
    LoginRequest,
    MessageResponse,
    PhoneSendRequest,
    PhoneVerifyRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
    VerifyEmailRequest,
)
from app.services.verification_store import verification_store
from app.api.session_routes import _set_access_cookie, _set_refresh_cookie
from app.services.session_store import session_store
from app.services.token_service import issue_tokens_for_user
from app.services.login_challenge_store import login_challenge_store
from app.services.totp_service import totp_store
from app.services.user_store import store
from nexa_shared.security.audit import audit_log
from app.services.login_protection_service import get_login_protection
from nexa_shared.security.device_fingerprint import fingerprint_request
from nexa_shared.security.login_risk import assess_login
from nexa_shared.security.password_policy import PasswordPolicy, validate_password

router = APIRouter(prefix="/api/v1", tags=["auth"])

_POLICY = PasswordPolicy(
    min_length=settings.password_min_length,
    require_uppercase=settings.password_require_uppercase,
    require_lowercase=settings.password_require_lowercase,
    require_digit=settings.password_require_digit,
    require_special=settings.password_require_special,
)


def _to_user_response(user) -> UserResponse:
    return UserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        uid=user.uid,
    )


@router.get("/config", response_model=AuthConfigResponse)
async def auth_config() -> AuthConfigResponse:
    return AuthConfigResponse(oauth_enabled=settings.oauth_enabled)


@router.post("/register", response_model=MessageResponse, status_code=201)
async def register(body: RegisterRequest) -> MessageResponse:
    violations = validate_password(body.password, _POLICY)
    if violations:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "PASSWORD_TOO_WEAK",
                    "message": "Please choose a stronger password.",
                    "details": violations,
                }
            },
        )
    try:
        user = await store.create(
            body.email,
            body.password,
            body.username,
            auto_verify=settings.auto_verify_email,
        )
    except ValueError as e:
        if str(e) == "EMAIL_EXISTS":
            raise HTTPException(
                status_code=409,
                detail={"error": {"code": "EMAIL_EXISTS", "message": "Email already registered"}},
            ) from e
        raise
    if not settings.auto_verify_email:
        code = await verification_store.issue_email_code(user.email)
        from app.services.email_service import send_verification_email
        await send_verification_email(to=user.email, code=code, frontend_url=settings.frontend_url)
        msg = (
            f"Account created! Verification code (dev): {code}"
            if settings.app_env != "production"
            else "Account created! Check your inbox for a confirmation email."
        )
    else:
        msg = "Account created! You can sign in now."
    return MessageResponse(message=msg)


def _login_protection_error(check_code: str, message: str, *, retry_after_seconds: int | None = None) -> HTTPException:
    status = 403 if check_code == "PASSWORD_RESET_REQUIRED" else 429
    err: dict = {"code": check_code, "message": message}
    if retry_after_seconds is not None:
        err["retry_after_seconds"] = retry_after_seconds
    return HTTPException(status_code=status, detail={"error": err})


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest, request: Request, response: Response) -> AuthResponse:
    ip = _get_client_ip(request)
    login_id = body.login_id
    if not login_id:
        raise HTTPException(
            status_code=422,
            detail={"error": {"code": "IDENTIFIER_REQUIRED", "message": "Username or email is required"}},
        )
    protection = await get_login_protection()
    check = await protection.check(login_id, ip)
    if not check.allowed:
        raise _login_protection_error(
            check.code or "ACCOUNT_LOCKED",
            check.message or "Too many failed attempts. Try again later.",
            retry_after_seconds=check.retry_after_seconds,
        )

    user = await store.verify_credentials_by_identifier(login_id, body.password)
    if not user:
        failure = await protection.record_failure(login_id, ip)
        audit_log.record(
            "auth.login_failed",
            ip_hint=ip,
            metadata={
                "identifier": login_id,
                "failures": failure.failures,
                "strikes": failure.strikes,
                "requires_password_reset": failure.requires_password_reset,
            },
        )
        if failure.requires_password_reset:
            raise _login_protection_error(
                "PASSWORD_RESET_REQUIRED",
                "This account is locked. Reset your password to sign in again.",
            )
        if failure.locked and failure.retry_after_seconds:
            wait_min = max(1, (failure.retry_after_seconds + 59) // 60)
            raise _login_protection_error(
                "ACCOUNT_LOCKED",
                f"Too many failed attempts. Try again in {wait_min} minute{'s' if wait_min != 1 else ''}.",
                retry_after_seconds=failure.retry_after_seconds,
            )
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_CREDENTIALS",
                    "message": "Incorrect username or password. Please try again.",
                }
            },
        )
    await protection.record_success(login_id, ip)
    fp = fingerprint_request(request)
    known_fps = {s.device_fingerprint for s in await session_store.list_user_sessions(user.id)}
    risk = assess_login(
        known_fingerprints=known_fps,
        fingerprint=fp,
        failed_attempts_recent=0,
        ip_changed=bool(known_fps and ip),
    )
    if risk.block:
        audit_log.record("auth.login_blocked", user_id=user.id, ip_hint=ip, metadata={"flags": risk.flags})
        raise HTTPException(
            status_code=403,
            detail={"error": {"code": "LOGIN_BLOCKED", "message": "Suspicious sign-in blocked"}},
        )
    if not user.is_email_verified:
        raise HTTPException(
            status_code=403,
            detail={
                "error": {
                    "code": "EMAIL_NOT_VERIFIED",
                    "message": "Email address is not verified",
                }
            },
        )
    state = totp_store.get(user.id)
    if state.enabled:
        challenge = login_challenge_store.create(
            user.id,
            user.email,
            device_label=request.headers.get("user-agent", "Web")[:80],
            ip_hint=ip,
        )
        audit_log.record("auth.login_2fa_pending", user_id=user.id, ip_hint=ip)
        return AuthResponse(requires_2fa=True, challenge_token=challenge)
    access, raw_refresh, session, ttl = await issue_tokens_for_user(
        user.id,
        user.email,
        device_label=request.headers.get("user-agent", "Web")[:80],
        request=request,
    )
    _set_refresh_cookie(response, raw_refresh)
    _set_access_cookie(response, access)
    audit_log.record(
        "auth.login_success",
        user_id=user.id,
        session_id=session.id,
        ip_hint=ip,
        metadata={"risk_score": risk.score, "flags": risk.flags},
    )
    return AuthResponse(
        user=_to_user_response(user),
        access_token=access,
        expires_in=ttl,
    )


@router.post("/login/2fa", response_model=AuthResponse)
async def login_2fa(body: Login2faRequest, request: Request, response: Response) -> AuthResponse:
    pending = login_challenge_store.consume(body.challenge_token)
    if not pending:
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_CHALLENGE",
                    "message": "Login session expired. Sign in again.",
                }
            },
        )
    if not totp_store.verify(pending.user_id, body.code):
        audit_log.record(
            "auth.login_2fa_failed",
            user_id=pending.user_id,
            ip_hint=pending.ip_hint,
        )
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_2FA",
                    "message": "Invalid authentication code",
                }
            },
        )
    user = await store.get_by_id(pending.user_id)
    if not user:
        raise HTTPException(status_code=401, detail={"error": {"code": "INVALID_CHALLENGE", "message": "User not found"}})
    access, raw_refresh, session, ttl = await issue_tokens_for_user(
        user.id,
        user.email,
        device_label=pending.device_label,
        request=request,
    )
    _set_refresh_cookie(response, raw_refresh)
    _set_access_cookie(response, access)
    ip = _get_client_ip(request)
    audit_log.record(
        "auth.login_success",
        user_id=user.id,
        session_id=session.id,
        ip_hint=ip,
        metadata={"via": "2fa"},
    )
    return AuthResponse(
        user=_to_user_response(user),
        access_token=access,
        expires_in=ttl,
    )


@router.post("/verify-email", response_model=MessageResponse)
async def verify_email(body: VerifyEmailRequest) -> MessageResponse:
    if not await verification_store.consume_email_code(body.email, body.code):
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_CODE",
                    "message": "Invalid or expired verification code",
                }
            },
        )
    await store.mark_email_verified(body.email)
    return MessageResponse(message="Email verified. You can sign in now.")


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(body: EmailRequest) -> MessageResponse:
    user = await store.get_by_email(body.email)
    if user and not user.is_email_verified:
        code = await verification_store.issue_email_code(user.email)
        from app.services.email_service import send_verification_email
        await send_verification_email(to=user.email, code=code, frontend_url=settings.frontend_url)
        if settings.app_env != "production":
            return MessageResponse(message=f"Verification code (dev): {code}")
    return MessageResponse(message="If an account exists, a verification email was sent.")


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(body: EmailRequest) -> MessageResponse:
    user = await store.get_by_email(body.email)
    if user:
        token = await verification_store.issue_reset_token(user.email)
        from app.services.email_service import send_password_reset_email
        await send_password_reset_email(to=user.email, code=token, frontend_url=settings.frontend_url)
        if settings.app_env != "production":
            return MessageResponse(message=f"Reset link (dev): /reset-password?token={token}")
    return MessageResponse(message="If an account exists, password reset instructions were sent.")


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(body: ResetPasswordRequest) -> MessageResponse:
    violations = validate_password(body.password, _POLICY)
    if violations:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "PASSWORD_TOO_WEAK",
                    "message": "Please choose a stronger password.",
                    "details": violations,
                }
            },
        )
    email = await verification_store.consume_reset_token(body.token)
    if not email or not await store.update_password(email, body.password):
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "INVALID_TOKEN",
                    "message": "Reset link expired or invalid",
                }
            },
        )
    protection = await get_login_protection()
    await protection.unlock_after_password_reset(email)
    return MessageResponse(message="Password updated. Please sign in again.")


@router.post("/phone/send-code", response_model=MessageResponse)
async def phone_send_code(
    body: PhoneSendRequest,
    authorization: str | None = Header(default=None),
) -> MessageResponse:
    from app.services.token_service import decode_bearer_token

    payload = decode_bearer_token(authorization)
    code = await verification_store.issue_phone_otp(payload["sub"], body.phone)
    if settings.app_env != "production":
        return MessageResponse(message=f"SMS code (dev): {code}")
    return MessageResponse(message="If the number is valid, a code was sent.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    body: ChangePasswordRequest,
    authorization: str | None = Header(default=None),
) -> MessageResponse:
    from app.services.token_service import decode_bearer_token

    payload = decode_bearer_token(authorization)
    violations = validate_password(body.new_password, _POLICY)
    if violations:
        raise HTTPException(
            status_code=400,
            detail={
                "error": {
                    "code": "PASSWORD_TOO_WEAK",
                    "message": "Please choose a stronger password.",
                    "details": violations,
                }
            },
        )
    if not await store.change_password(payload["sub"], body.current_password, body.new_password):
        raise HTTPException(
            status_code=401,
            detail={
                "error": {
                    "code": "INVALID_PASSWORD",
                    "message": "Current password is incorrect",
                }
            },
        )
    return MessageResponse(message="Password updated successfully.")


@router.post("/phone/verify", response_model=MessageResponse)
async def phone_verify(
    body: PhoneVerifyRequest,
    authorization: str | None = Header(default=None),
) -> MessageResponse:
    from app.services.token_service import decode_bearer_token

    payload = decode_bearer_token(authorization)
    if not await verification_store.consume_phone_otp(payload["sub"], body.phone, body.code):
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "INVALID_CODE", "message": "Invalid or expired SMS code"}},
        )
    if not await store.set_phone(payload["sub"], body.phone, verified=True):
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "User not found"}})
    return MessageResponse(message="Phone number verified.")

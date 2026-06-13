from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    username: str = Field(min_length=3, max_length=64)


class LoginRequest(BaseModel):
    # Username OR email. `email` kept for backward-compat with older clients.
    identifier: str | None = Field(default=None, max_length=254)
    email: str | None = Field(default=None, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @property
    def login_id(self) -> str:
        return (self.identifier or self.email or "").strip()


class EmailRequest(BaseModel):
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=8)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=128)
    password: str = Field(min_length=8, max_length=128)


class PhoneSendRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=20)


class PhoneVerifyRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=20)
    code: str = Field(min_length=6, max_length=8)


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    uid: str


class AuthResponse(BaseModel):
    user: UserResponse | None = None
    access_token: str | None = None
    token_type: str = "Bearer"
    expires_in: int | None = None
    requires_2fa: bool = False
    challenge_token: str | None = None


class Login2faRequest(BaseModel):
    challenge_token: str = Field(min_length=16, max_length=128)
    code: str = Field(min_length=6, max_length=16)


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class SessionResponse(BaseModel):
    id: str
    device_label: str
    created_at: str
    last_used_at: str
    ip_hint: str | None = None
    current: bool = False


class QrStartResponse(BaseModel):
    qr_token: str
    expires_at: str
    poll_url: str


class QrPollResponse(BaseModel):
    status: str
    access_token: str | None = None
    token_type: str | None = None
    expires_in: int | None = None
    user: UserResponse | None = None


class QrApproveRequest(BaseModel):
    qr_token: str


class MessageResponse(BaseModel):
    message: str


class AuthConfigResponse(BaseModel):
    oauth_enabled: bool


class OAuthExchangeRequest(BaseModel):
    exchange: str = Field(min_length=16, max_length=128)


class TotpSetupResponse(BaseModel):
    secret: str
    provisioning_uri: str


class TotpConfirmRequest(BaseModel):
    code: str = Field(min_length=6, max_length=8)


class TotpVerifyRequest(BaseModel):
    code: str = Field(min_length=6, max_length=16)


class BackupCodesResponse(BaseModel):
    backup_codes: list[str]
    message: str


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class TotpDisableRequest(BaseModel):
    code: str = Field(min_length=6, max_length=16)


class SecurityStatusResponse(BaseModel):
    email_verified: bool
    phone: str | None = None
    phone_verified: bool = False
    totp_enabled: bool = False
    webauthn_credentials: int = 0
    active_sessions: int = 0


class WebAuthnRegisterRequest(BaseModel):
    credential_id: str
    public_key: str
    device_label: str = Field(default="Biometric device", max_length=80)


class WebAuthnCredentialResponse(BaseModel):
    id: str
    credential_id: str
    device_label: str


class AccountDeleteRequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    confirm_text: str = Field(min_length=1, max_length=32)


class WebAuthnLoginStartRequest(BaseModel):
    email: EmailStr


class WebAuthnLoginFinishRequest(BaseModel):
    email: EmailStr
    credential_id: str
    challenge: str

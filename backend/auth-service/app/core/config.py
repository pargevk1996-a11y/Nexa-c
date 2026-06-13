from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = next((str(p / ".env") for p in Path(__file__).resolve().parents if (p / ".env").exists()), None)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ENV, extra="ignore")

    service_name: str = "auth-service"
    app_env: str = "development"
    log_level: str = "info"
    host: str = "0.0.0.0"
    port: int = 8001
    redis_url: str = "redis://redis:6379/0"
    database_url: str = Field(default="", validation_alias="AUTH_DATABASE_URL")

    auto_verify_email: bool = Field(default=True, validation_alias="AUTO_VERIFY_EMAIL")
    password_min_length: int = Field(default=8, validation_alias="PASSWORD_MIN_LENGTH")
    password_require_uppercase: bool = Field(default=True, validation_alias="PASSWORD_REQUIRE_UPPERCASE")
    password_require_lowercase: bool = Field(default=True, validation_alias="PASSWORD_REQUIRE_LOWERCASE")
    password_require_digit: bool = Field(default=True, validation_alias="PASSWORD_REQUIRE_DIGIT")
    password_require_special: bool = Field(default=True, validation_alias="PASSWORD_REQUIRE_SPECIAL")

    login_max_attempts: int = Field(default=3, validation_alias="LOGIN_MAX_ATTEMPTS")
    login_first_lockout_seconds: int = Field(default=600, validation_alias="LOGIN_FIRST_LOCKOUT_SECONDS")
    login_retry_lockout_seconds: int = Field(default=300, validation_alias="LOGIN_RETRY_LOCKOUT_SECONDS")
    login_max_strikes: int = Field(default=3, validation_alias="LOGIN_MAX_STRIKES")
    login_protection_use_memory: bool = Field(
        default=False,
        validation_alias="LOGIN_PROTECTION_USE_MEMORY",
    )

    oauth_enabled: bool = Field(default=True, validation_alias="OAUTH_ENABLED")
    frontend_url: str = Field(default="http://127.0.0.1:5173", validation_alias="FRONTEND_URL")
    oauth_public_base_url: str = Field(
        default="http://127.0.0.1:8000",
        validation_alias="OAUTH_PUBLIC_BASE_URL",
    )
    google_client_id: str = Field(default="", validation_alias="GOOGLE_CLIENT_ID")
    google_client_secret: str = Field(default="", validation_alias="GOOGLE_CLIENT_SECRET")
    github_client_id: str = Field(default="", validation_alias="GITHUB_CLIENT_ID")
    github_client_secret: str = Field(default="", validation_alias="GITHUB_CLIENT_SECRET")

    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_refresh_secret: str = Field(default="", validation_alias="JWT_REFRESH_SECRET")
    jwt_algorithm: str = Field(default="RS256", validation_alias="JWT_ALGORITHM")
    jwt_access_ttl_seconds: int = Field(default=900, validation_alias="JWT_ACCESS_TTL_SECONDS")
    jwt_refresh_ttl_seconds: int = Field(default=604800, validation_alias="JWT_REFRESH_TTL_SECONDS")
    refresh_cookie_name: str = Field(default="refresh_token", validation_alias="REFRESH_COOKIE_NAME")
    jwt_access_private_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PRIVATE_KEY_FILE")
    jwt_access_private_key: str = Field(default="", validation_alias="JWT_ACCESS_PRIVATE_KEY")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")
    data_encryption_key: str = Field(default="", validation_alias="DATA_ENCRYPTION_KEY")
    cookie_encryption_key: str = Field(default="", validation_alias="COOKIE_ENCRYPTION_KEY")

    smtp_host: str = Field(default="", validation_alias="SMTP_HOST")
    smtp_port: int = Field(default=587, validation_alias="SMTP_PORT")
    smtp_user: str = Field(default="", validation_alias="SMTP_USER")
    smtp_pass: str = Field(default="", validation_alias="SMTP_PASS")
    smtp_from_email: str = Field(default="noreply@securechat.app", validation_alias="SMTP_FROM_EMAIL")
    smtp_use_tls: bool = Field(default=True, validation_alias="SMTP_USE_TLS")


settings = Settings()

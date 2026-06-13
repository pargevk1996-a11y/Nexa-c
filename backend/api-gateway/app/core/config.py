from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = next((str(p / ".env") for p in Path(__file__).resolve().parents if (p / ".env").exists()), None)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ENV, extra="ignore")

    service_name: str = "api-gateway"
    app_env: str = "development"
    log_level: str = "info"
    host: str = Field(default="0.0.0.0", validation_alias="GATEWAY_HOST")
    port: int = Field(default=8000, validation_alias="GATEWAY_PORT")
    redis_url: str = Field(default="redis://redis:6379/0", validation_alias="REDIS_URL")

    cors_origins: str = Field(
        default="http://localhost:5173",
        validation_alias="CORS_ORIGINS",
    )

    jwt_access_secret: str = Field(default="", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="RS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")

    csrf_enabled: bool = Field(default=True, validation_alias="CSRF_ENABLED")
    csrf_cookie_name: str = Field(default="csrf_token", validation_alias="CSRF_COOKIE_NAME")
    csrf_header_name: str = Field(default="X-CSRF-Token", validation_alias="CSRF_HEADER_NAME")
    cookie_secure: bool = Field(default=False, validation_alias="COOKIE_SECURE")
    cookie_samesite: str = Field(default="lax", validation_alias="COOKIE_SAMESITE")
    jwt_refresh_ttl_seconds: int = Field(default=604800, validation_alias="JWT_REFRESH_TTL_SECONDS")

    auth_service_url: str = Field(default="http://127.0.0.1:8001", validation_alias="AUTH_SERVICE_URL")
    user_service_url: str = Field(default="http://127.0.0.1:8002", validation_alias="USER_SERVICE_URL")
    contact_service_url: str = Field(default="http://127.0.0.1:8003", validation_alias="CONTACT_SERVICE_URL")
    chat_service_url: str = Field(default="http://127.0.0.1:8004", validation_alias="CHAT_SERVICE_URL")
    media_service_url: str = Field(default="http://127.0.0.1:8005", validation_alias="MEDIA_SERVICE_URL")
    story_service_url: str = Field(default="http://127.0.0.1:8006", validation_alias="STORY_SERVICE_URL")
    emoji_service_url: str = Field(default="http://127.0.0.1:8007", validation_alias="EMOJI_SERVICE_URL")
    notification_service_url: str = Field(
        default="http://127.0.0.1:8008",
        validation_alias="NOTIFICATION_SERVICE_URL",
    )
    presence_service_url: str = Field(
        default="http://127.0.0.1:8010",
        validation_alias="PRESENCE_SERVICE_URL",
    )
    call_service_url: str = Field(
        default="http://127.0.0.1:8011",
        validation_alias="CALL_SERVICE_URL",
    )
    ai_service_url: str = Field(
        default="http://127.0.0.1:8012",
        validation_alias="AI_SERVICE_URL",
    )
    internal_service_secret: str = Field(
        default="dev-internal-secret",
        validation_alias="INTERNAL_SERVICE_SECRET",
    )
    cookie_encryption_key: str = Field(default="", validation_alias="COOKIE_ENCRYPTION_KEY")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def upstream_map(self) -> dict[str, str]:
        return {
            "auth": self.auth_service_url,
            "users": self.user_service_url,
            "contacts": self.contact_service_url,
            "chat": self.chat_service_url,
            "media": self.media_service_url,
            "stories": self.story_service_url,
            "emoji": self.emoji_service_url,
            "notifications": self.notification_service_url,
            "presence": self.presence_service_url,
            "calls": self.call_service_url,
            "ai": self.ai_service_url,
        }


settings = Settings()

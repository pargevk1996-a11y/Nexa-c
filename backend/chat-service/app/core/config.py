from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_REPO_ENV), extra="ignore")

    service_name: str = "chat-service"
    app_env: str = "development"
    log_level: str = "info"
    host: str = "0.0.0.0"
    port: int = 8004
    redis_url: str = "redis://redis:6379/0"
    database_url: str = Field(default="", validation_alias="CHAT_DATABASE_URL")
    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="RS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")
    data_encryption_key: str = Field(default="", validation_alias="DATA_ENCRYPTION_KEY")
    ai_service_url: str = Field(default="", validation_alias="AI_SERVICE_URL")
    ai_moderation_enabled: bool = Field(default=True, validation_alias="AI_MODERATION_ENABLED")
    ai_request_timeout_seconds: int = Field(default=5, validation_alias="AI_REQUEST_TIMEOUT_SECONDS")
    internal_service_secret: str = Field(default="dev-internal-secret", validation_alias="INTERNAL_SERVICE_SECRET")
    notification_service_url: str = Field(
        default="http://notification-service:8008",
        validation_alias="NOTIFICATION_SERVICE_URL",
    )
    nats_url: str = Field(default="", validation_alias="NATS_URL")


settings = Settings()

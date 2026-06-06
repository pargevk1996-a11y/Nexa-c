from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "notification-service"
    app_env: str = "development"
    log_level: str = "info"
    host: str = "0.0.0.0"
    port: int = 8008
    redis_url: str = "redis://redis:6379/0"
    database_url: str = Field(default="", validation_alias="NOTIFICATION_DATABASE_URL")
    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="RS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")
    internal_service_secret: str = Field(
        default="dev-internal-secret",
        validation_alias="INTERNAL_SERVICE_SECRET",
    )


settings = Settings()

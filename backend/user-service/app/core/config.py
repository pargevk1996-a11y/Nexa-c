from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = next((str(p / ".env") for p in Path(__file__).resolve().parents if (p / ".env").exists()), None)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ENV, extra="ignore")

    service_name: str = "user-service"
    app_env: str = "development"
    log_level: str = "info"
    host: str = "0.0.0.0"
    port: int = 8002
    redis_url: str = "redis://redis:6379/0"
    database_url: str = Field(default="", validation_alias="USER_DATABASE_URL")
    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="RS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")


settings = Settings()

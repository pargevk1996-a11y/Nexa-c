from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_REPO_ENV), extra="ignore")

    service_name: str = "presence-service"
    host: str = "0.0.0.0"
    port: int = Field(default=8010, validation_alias="PRESENCE_SERVICE_PORT")
    redis_url: str = Field(default="redis://redis:6379/0", validation_alias="REDIS_URL")
    presence_ttl_seconds: int = 90
    typing_ttl_seconds: int = 8

    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="RS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")


settings = Settings()

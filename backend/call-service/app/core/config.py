from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = next((str(p / ".env") for p in Path(__file__).resolve().parents if (p / ".env").exists()), None)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ENV, extra="ignore")

    service_name: str = "call-service"
    host: str = "0.0.0.0"
    port: int = Field(default=8011, validation_alias="CALL_SERVICE_PORT")
    redis_url: str = Field(default="redis://redis:6379/0", validation_alias="REDIS_URL")

    stun_urls: str = Field(
        default="stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302",
        validation_alias="STUN_URLS",
    )
    turn_urls: str = Field(default="", validation_alias="TURN_URLS")
    turn_secret: str = Field(default="", validation_alias="TURN_SECRET")
    turn_ttl_seconds: int = Field(default=86400, validation_alias="TURN_TTL_SECONDS")
    turn_username_prefix: str = Field(default="nexa", validation_alias="TURN_USERNAME_PREFIX")

    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")

    @property
    def stun_url_list(self) -> list[str]:
        return [u.strip() for u in self.stun_urls.split(",") if u.strip()]

    @property
    def turn_url_list(self) -> list[str]:
        return [u.strip() for u in self.turn_urls.split(",") if u.strip()]


settings = Settings()

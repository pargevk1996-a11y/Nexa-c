from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    service_name: str = "emoji-service"
    app_env: str = "development"
    log_level: str = "info"
    host: str = "0.0.0.0"
    port: int = 8007
    redis_url: str = "redis://redis:6379/0"
    database_url: str = Field(default="", validation_alias="EMOJI_DATABASE_URL")


settings = Settings()

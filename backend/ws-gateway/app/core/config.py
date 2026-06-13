from pathlib import Path
import uuid

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = next((str(p / ".env") for p in Path(__file__).resolve().parents if (p / ".env").exists()), None)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ENV, extra="ignore")

    service_name: str = "ws-gateway"
    app_env: str = "development"
    host: str = "0.0.0.0"
    port: int = Field(default=8009, validation_alias="WS_GATEWAY_PORT")
    redis_url: str = Field(default="redis://redis:6379/0", validation_alias="REDIS_URL")
    node_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:12], validation_alias="WS_NODE_ID")

    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="RS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")

    chat_service_url: str = Field(default="http://127.0.0.1:8004", validation_alias="CHAT_SERVICE_URL")
    presence_service_url: str = Field(
        default="http://127.0.0.1:8010",
        validation_alias="PRESENCE_SERVICE_URL",
    )

    heartbeat_interval_seconds: int = 30
    auth_timeout_seconds: int = Field(default=10, validation_alias="WS_AUTH_TIMEOUT_SECONDS")
    max_frame_bytes: int = 65536
    per_conn_rate_per_second: int = 50
    max_connections_per_node: int = Field(
        default=50_000,
        validation_alias="WS_MAX_CONNECTIONS_PER_NODE",
    )
    nats_url: str = Field(default="", validation_alias="NATS_URL")
    cookie_encryption_key: str = Field(default="", validation_alias="COOKIE_ENCRYPTION_KEY")


settings = Settings()

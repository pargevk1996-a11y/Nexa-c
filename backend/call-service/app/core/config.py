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

    # --- SFU (LiveKit) ---------------------------------------------------------
    # 1:1 calls stay peer-to-peer (mesh): lowest latency, media never touches the
    # server (DTLS-SRTP end-to-end). Group calls (> 2 participants) route through
    # the LiveKit SFU — full mesh does not scale past a handful of peers. The SFU
    # itself is a separate process/container; this service only mints scoped join
    # tokens and reconciles room state from signed webhooks.
    livekit_url: str = Field(default="", validation_alias="LIVEKIT_URL")  # wss://… the client dials
    livekit_api_key: str = Field(default="", validation_alias="LIVEKIT_API_KEY")
    livekit_api_secret: str = Field(default="", validation_alias="LIVEKIT_API_SECRET")
    livekit_token_ttl_seconds: int = Field(default=3600, validation_alias="LIVEKIT_TOKEN_TTL_SECONDS")
    # Total participant count at/above which a call uses the SFU instead of mesh.
    sfu_min_participants: int = Field(default=3, validation_alias="SFU_MIN_PARTICIPANTS")

    @property
    def stun_url_list(self) -> list[str]:
        return [u.strip() for u in self.stun_urls.split(",") if u.strip()]

    @property
    def turn_url_list(self) -> list[str]:
        return [u.strip() for u in self.turn_urls.split(",") if u.strip()]

    @property
    def livekit_enabled(self) -> bool:
        """SFU is usable only when the URL + API credentials are all configured.
        Until then group calls degrade to mesh rather than hard-failing."""
        return bool(self.livekit_url and self.livekit_api_key and self.livekit_api_secret)


settings = Settings()

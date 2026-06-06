from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = Path(__file__).resolve().parents[4] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(_REPO_ENV), extra="ignore")

    service_name: str = "ai-service"
    host: str = "0.0.0.0"
    port: int = Field(default=8012, validation_alias="AI_SERVICE_PORT")

    ai_provider: str = Field(default="openai", validation_alias="AI_PROVIDER")
    ai_api_key: str = Field(default="", validation_alias="AI_API_KEY")
    ai_base_url: str = Field(default="https://api.openai.com/v1", validation_alias="AI_BASE_URL")
    ai_chat_model: str = Field(default="gpt-4o-mini", validation_alias="AI_CHAT_MODEL")
    ai_embed_model: str = Field(default="text-embedding-3-small", validation_alias="AI_EMBED_MODEL")
    ai_whisper_model: str = Field(default="whisper-1", validation_alias="AI_WHISPER_MODEL")
    ai_request_timeout_seconds: int = Field(default=30, validation_alias="AI_REQUEST_TIMEOUT_SECONDS")
    ai_rate_limit_per_minute: int = Field(default=30, validation_alias="AI_RATE_LIMIT_PER_MINUTE")
    ai_moderation_block_threshold: float = Field(default=0.75, validation_alias="AI_MODERATION_BLOCK_THRESHOLD")
    ai_spam_block_threshold: float = Field(default=0.8, validation_alias="AI_SPAM_BLOCK_THRESHOLD")
    internal_service_secret: str = Field(default="dev-internal-secret", validation_alias="INTERNAL_SERVICE_SECRET")

    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")

    @property
    def has_api_key(self) -> bool:
        return bool(self.ai_api_key.strip())


settings = Settings()

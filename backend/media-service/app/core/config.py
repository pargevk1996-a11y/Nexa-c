from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

_REPO_ENV = next((str(p / ".env") for p in Path(__file__).resolve().parents if (p / ".env").exists()), None)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_REPO_ENV, extra="ignore")

    service_name: str = "media-service"
    app_env: str = "development"
    host: str = "0.0.0.0"
    port: int = 8005
    redis_url: str = Field(default="redis://redis:6379/0", validation_alias="REDIS_URL")

    storage_root: str = Field(default=".dev/media-storage", validation_alias="MEDIA_STORAGE_ROOT")
    chunk_size_bytes: int = Field(default=1024 * 1024, validation_alias="MEDIA_CHUNK_SIZE")
    max_upload_bytes: int = Field(default=512 * 1024 * 1024, validation_alias="MEDIA_MAX_UPLOAD_BYTES")
    signed_url_ttl_seconds: int = Field(default=300, validation_alias="MEDIA_SIGNED_URL_TTL")
    media_signing_secret: str = Field(default="dev-media-signing-secret", validation_alias="MEDIA_SIGNING_SECRET")
    media_encryption_key: str = Field(default="", validation_alias="MEDIA_ENCRYPTION_KEY")
    cdn_public_base_url: str = Field(
        default="http://127.0.0.1:8000/api/v1/media",
        validation_alias="MEDIA_CDN_BASE_URL",
    )

    jwt_access_secret: str = Field(default="dev-access-secret", validation_alias="JWT_ACCESS_SECRET")
    jwt_algorithm: str = Field(default="HS256", validation_alias="JWT_ALGORITHM")
    jwt_access_public_key_file: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY_FILE")
    jwt_access_public_key: str = Field(default="", validation_alias="JWT_ACCESS_PUBLIC_KEY")

    image_max_edge: int = 1920
    image_jpeg_quality: int = 85
    video_max_height: int = 720


settings = Settings()

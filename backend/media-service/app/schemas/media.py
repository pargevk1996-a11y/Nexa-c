from pydantic import BaseModel, Field


class InitUploadRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=256)
    mime_type: str = Field(min_length=1, max_length=128)
    size_bytes: int = Field(ge=1, le=512 * 1024 * 1024)


class InitUploadResponse(BaseModel):
    upload_id: str
    chunk_size: int
    total_chunks: int
    expires_at: str
    uploaded_chunks: list[int] = Field(default_factory=list)


class UploadStatusResponse(BaseModel):
    upload_id: str
    received_chunks: list[int]
    total_chunks: int
    complete: bool


class CompleteUploadResponse(BaseModel):
    media_id: str
    mime_type: str
    size_bytes: int
    has_preview: bool
    stream_url: str
    preview_url: str | None = None


class SignedUrlResponse(BaseModel):
    media_id: str
    stream_url: str
    preview_url: str | None
    download_url: str
    expires_in: int

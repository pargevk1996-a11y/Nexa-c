"""Media metadata + encrypted file storage."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

from app.core.config import settings
from app.services.encrypted_storage import read_encrypted, write_encrypted
from app.services.media_processor import (
    compress_image,
    generate_image_preview,
    process_video_file,
)


@dataclass
class UploadSession:
    id: str
    owner_id: str
    filename: str
    mime_type: str
    size_bytes: int
    chunk_size: int
    received_chunks: set[int] = field(default_factory=set)
    expires_at: datetime = field(default_factory=lambda: datetime.now(UTC) + timedelta(hours=24))


@dataclass
class MediaAsset:
    id: str
    owner_id: str
    filename: str
    mime_type: str
    size_bytes: int
    variant: str
    has_preview: bool
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))


@dataclass
class MediaStore:
    _uploads: dict[str, UploadSession] = field(default_factory=dict)
    _assets: dict[str, MediaAsset] = field(default_factory=dict)
    _root: Path | None = None

    def init(self) -> None:
        self._root = Path(settings.storage_root).resolve()
        self._root.mkdir(parents=True, exist_ok=True)
        (self._root / "uploads").mkdir(exist_ok=True)
        (self._root / "media").mkdir(exist_ok=True)
        (self._root / "previews").mkdir(exist_ok=True)

    def _upload_dir(self, upload_id: str) -> Path:
        assert self._root
        return self._root / "uploads" / upload_id

    def _media_path(self, media_id: str) -> Path:
        assert self._root
        return self._root / "media" / f"{media_id}.enc"

    def _preview_path(self, media_id: str) -> Path:
        assert self._root
        return self._root / "previews" / f"{media_id}.enc"

    def create_upload(
        self,
        owner_id: str,
        *,
        filename: str,
        mime_type: str,
        size_bytes: int,
    ) -> UploadSession:
        if size_bytes > settings.max_upload_bytes:
            raise ValueError("TOO_LARGE")
        upload_id = str(uuid4())
        session = UploadSession(
            id=upload_id,
            owner_id=owner_id,
            filename=filename,
            mime_type=mime_type,
            size_bytes=size_bytes,
            chunk_size=settings.chunk_size_bytes,
        )
        self._uploads[upload_id] = session
        self._upload_dir(upload_id).mkdir(parents=True, exist_ok=True)
        return session

    def get_upload(self, upload_id: str, owner_id: str) -> UploadSession | None:
        s = self._uploads.get(upload_id)
        if not s or s.owner_id != owner_id:
            return None
        if datetime.now(UTC) > s.expires_at:
            del self._uploads[upload_id]
            return None
        return s

    def write_chunk(self, upload_id: str, index: int, data: bytes) -> None:
        path = self._upload_dir(upload_id) / f"{index:06d}.part"
        write_encrypted(path, data)
        session = self._uploads.get(upload_id)
        if session:
            session.received_chunks.add(index)

    def read_chunk(self, upload_id: str, index: int) -> bytes | None:
        path = self._upload_dir(upload_id) / f"{index:06d}.part"
        if not path.is_file():
            return None
        return read_encrypted(path)

    def complete_upload(self, upload_id: str, owner_id: str) -> MediaAsset:
        session = self.get_upload(upload_id, owner_id)
        if not session:
            raise ValueError("NOT_FOUND")
        expected = (session.size_bytes + session.chunk_size - 1) // session.chunk_size
        if len(session.received_chunks) < expected and session.size_bytes > 0:
            missing = expected - len(session.received_chunks)
            if missing > 0:
                raise ValueError("INCOMPLETE")

        parts: list[bytes] = []
        for i in sorted(session.received_chunks):
            chunk = self.read_chunk(upload_id, i)
            if chunk is not None:
                parts.append(chunk)
        raw = b"".join(parts)[: session.size_bytes]

        mime = session.mime_type
        preview_bytes: bytes | None = None
        if mime.startswith("image/"):
            raw, mime = compress_image(raw, mime_type=mime)
            preview_bytes = generate_image_preview(raw)
        elif mime.startswith("video/"):
            raw, preview_bytes, mime = process_video_file(raw)

        media_id = str(uuid4())
        write_encrypted(self._media_path(media_id), raw)
        has_preview = False
        if preview_bytes:
            write_encrypted(self._preview_path(media_id), preview_bytes)
            has_preview = True
        elif mime.startswith("image/"):
            write_encrypted(self._preview_path(media_id), generate_image_preview(raw))
            has_preview = True

        asset = MediaAsset(
            id=media_id,
            owner_id=owner_id,
            filename=session.filename,
            mime_type=mime,
            size_bytes=len(raw),
            variant="processed",
            has_preview=has_preview,
        )
        self._assets[media_id] = asset
        del self._uploads[upload_id]
        return asset

    def get_asset(self, media_id: str) -> MediaAsset | None:
        return self._assets.get(media_id)

    def read_media_bytes(self, media_id: str) -> bytes:
        return read_encrypted(self._media_path(media_id))

    def read_preview_bytes(self, media_id: str) -> bytes | None:
        p = self._preview_path(media_id)
        if not p.is_file():
            return None
        return read_encrypted(p)


media_store = MediaStore()

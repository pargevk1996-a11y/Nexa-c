"""Image compression, video transcoding, preview generation."""

from __future__ import annotations

import io
import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.config import settings

logger = logging.getLogger(__name__)


def compress_image(data: bytes, *, mime_type: str) -> tuple[bytes, str]:
    try:
        from PIL import Image
    except ImportError:
        return data, mime_type

    try:
        img = Image.open(io.BytesIO(data))
        img.load()
    except Exception:
        return data, mime_type

    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
        out_mime = "image/jpeg"
    else:
        out_mime = mime_type if mime_type.startswith("image/") else "image/jpeg"

    max_edge = settings.image_max_edge
    w, h = img.size
    if max(w, h) > max_edge:
        ratio = max_edge / max(w, h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    fmt = "JPEG" if out_mime == "image/jpeg" else "WEBP" if out_mime == "image/webp" else "PNG"
    save_kw: dict = {"quality": settings.image_jpeg_quality} if fmt == "JPEG" else {}
    img.save(buf, format=fmt, **save_kw)
    return buf.getvalue(), out_mime


def generate_image_preview(data: bytes, *, max_size: int = 320) -> bytes:
    try:
        from PIL import Image
    except ImportError:
        return data

    try:
        img = Image.open(io.BytesIO(data))
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=75)
        return buf.getvalue()
    except Exception:
        return data


def transcode_video(input_path: Path, output_path: Path) -> bool:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        logger.warning("ffmpeg not found — skipping video transcode")
        return False
    cmd = [
        ffmpeg,
        "-y",
        "-i",
        str(input_path),
        "-vf",
        f"scale=-2:{settings.video_max_height}",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, timeout=600)
        return output_path.is_file()
    except Exception:
        logger.exception("ffmpeg transcode failed")
        return False


def process_video_file(data: bytes) -> tuple[bytes, bytes | None, str]:
    """Return (main_bytes, preview_thumb_jpeg or None, mime)."""
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "input.bin"
        out = Path(tmp) / "out.mp4"
        src.write_bytes(data)
        if transcode_video(src, out):
            preview = _video_frame_jpeg(out)
            return out.read_bytes(), preview, "video/mp4"
    return data, None, "video/mp4"


def _video_frame_jpeg(video_path: Path) -> bytes | None:
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        return None
    frame = video_path.parent / "frame.jpg"
    try:
        subprocess.run(
            [ffmpeg, "-y", "-i", str(video_path), "-vframes", "1", "-q:v", "2", str(frame)],
            check=True,
            capture_output=True,
            timeout=60,
        )
        return frame.read_bytes() if frame.is_file() else None
    except Exception:
        return None

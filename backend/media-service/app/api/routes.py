import re
from math import ceil

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.deps import get_current_user_id
from app.schemas.media import (
    CompleteUploadResponse,
    InitUploadRequest,
    InitUploadResponse,
    SignedUrlResponse,
    UploadStatusResponse,
)
from app.services.media_store import media_store
from app.services.signed_urls import build_cdn_url, create_signed_token, verify_signed_token

router = APIRouter(prefix="/api/v1", tags=["media"])

_CACHE = "private, max-age=300"
_STREAM_CACHE = "private, max-age=60"


def _total_chunks(size: int, chunk_size: int) -> int:
    return max(1, ceil(size / chunk_size))


@router.post("/uploads", response_model=InitUploadResponse, status_code=201)
async def init_upload(
    body: InitUploadRequest,
    user_id: str = Depends(get_current_user_id),
) -> InitUploadResponse:
    try:
        session = media_store.create_upload(
            user_id,
            filename=body.filename,
            mime_type=body.mime_type,
            size_bytes=body.size_bytes,
        )
    except ValueError as e:
        if str(e) == "TOO_LARGE":
            raise HTTPException(
                status_code=413,
                detail={"error": {"code": "TOO_LARGE", "message": "File exceeds max upload size"}},
            ) from e
        raise
    total = _total_chunks(body.size_bytes, session.chunk_size)
    return InitUploadResponse(
        upload_id=session.id,
        chunk_size=session.chunk_size,
        total_chunks=total,
        expires_at=session.expires_at.isoformat(),
        uploaded_chunks=sorted(session.received_chunks),
    )


@router.get("/uploads/{upload_id}", response_model=UploadStatusResponse)
async def upload_status(
    upload_id: str,
    user_id: str = Depends(get_current_user_id),
) -> UploadStatusResponse:
    session = media_store.get_upload(upload_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Upload not found"}})
    total = _total_chunks(session.size_bytes, session.chunk_size)
    received = sorted(session.received_chunks)
    complete = len(received) >= total
    return UploadStatusResponse(
        upload_id=upload_id,
        received_chunks=received,
        total_chunks=total,
        complete=complete,
    )


@router.put("/uploads/{upload_id}/chunks/{chunk_index}")
async def upload_chunk(
    upload_id: str,
    chunk_index: int,
    request: Request,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    session = media_store.get_upload(upload_id, user_id)
    if not session:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Upload not found"}})
    if chunk_index < 0:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_CHUNK", "message": "Bad chunk index"}})
    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail={"error": {"code": "EMPTY_CHUNK", "message": "Empty chunk"}})
    media_store.write_chunk(upload_id, chunk_index, data)
    return {"ok": True, "chunk_index": chunk_index}


@router.post("/uploads/{upload_id}/complete", response_model=CompleteUploadResponse)
async def complete_upload(
    upload_id: str,
    user_id: str = Depends(get_current_user_id),
) -> CompleteUploadResponse:
    try:
        asset = media_store.complete_upload(upload_id, user_id)
    except ValueError as e:
        code = str(e)
        if code == "NOT_FOUND":
            raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Upload not found"}}) from e
        if code == "INCOMPLETE":
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "INCOMPLETE", "message": "Missing chunks"}},
            ) from e
        raise
    stream_tok = create_signed_token(asset.id, user_id, purpose="stream")
    preview_tok = create_signed_token(asset.id, user_id, purpose="preview") if asset.has_preview else None
    return CompleteUploadResponse(
        media_id=asset.id,
        mime_type=asset.mime_type,
        size_bytes=asset.size_bytes,
        has_preview=asset.has_preview,
        stream_url=build_cdn_url(asset.id, stream_tok, purpose="stream"),
        preview_url=build_cdn_url(asset.id, preview_tok, purpose="preview") if preview_tok else None,
    )


@router.get("/{media_id}/url", response_model=SignedUrlResponse)
async def get_signed_urls(
    media_id: str,
    user_id: str = Depends(get_current_user_id),
) -> SignedUrlResponse:
    asset = media_store.get_asset(media_id)
    if not asset:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Media not found"}})
    from app.core.config import settings

    stream_tok = create_signed_token(media_id, user_id, purpose="stream")
    dl_tok = create_signed_token(media_id, user_id, purpose="download")
    prev_tok = create_signed_token(media_id, user_id, purpose="preview") if asset.has_preview else None
    return SignedUrlResponse(
        media_id=media_id,
        stream_url=build_cdn_url(media_id, stream_tok, purpose="stream"),
        preview_url=build_cdn_url(media_id, prev_tok, purpose="preview") if prev_tok else None,
        download_url=build_cdn_url(media_id, dl_tok, purpose="download"),
        expires_in=settings.signed_url_ttl_seconds,
    )


def _parse_range(range_header: str | None, size: int) -> tuple[int, int] | None:
    if not range_header or not range_header.startswith("bytes="):
        return None
    m = re.match(r"bytes=(\d+)-(\d*)", range_header.strip())
    if not m:
        return None
    start = int(m.group(1))
    end = int(m.group(2)) if m.group(2) else size - 1
    end = min(end, size - 1)
    if start > end or start >= size:
        return None
    return start, end


def _stream_response(data: bytes, *, mime: str, range: tuple[int, int] | None, filename: str) -> Response:
    size = len(data)
    headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": _STREAM_CACHE,
        "Content-Disposition": f'inline; filename="{filename}"',
    }
    if range:
        start, end = range
        chunk = data[start : end + 1]
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
        headers["Content-Length"] = str(len(chunk))
        return Response(content=chunk, status_code=206, media_type=mime, headers=headers)
    headers["Content-Length"] = str(size)
    return Response(content=data, status_code=200, media_type=mime, headers=headers)


def _verify_access(media_id: str, sig: str, purpose: str) -> None:
    uid = verify_signed_token(sig, media_id=media_id, purpose=purpose)  # type: ignore[arg-type]
    if not uid:
        raise HTTPException(status_code=403, detail={"error": {"code": "INVALID_SIGNATURE", "message": "Invalid or expired URL"}})
    asset = media_store.get_asset(media_id)
    if not asset:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Media not found"}})


@router.get("/{media_id}/stream")
async def stream_media(
    media_id: str,
    sig: str,
    request: Request,
    access_token: str | None = None,
) -> Response:
    _verify_access(media_id, sig, "stream")
    data = media_store.read_media_bytes(media_id)
    asset = media_store.get_asset(media_id)
    assert asset
    rng = _parse_range(request.headers.get("range"), len(data))
    return _stream_response(data, mime=asset.mime_type, range=rng, filename=asset.filename)


@router.get("/{media_id}/preview")
async def preview_media(media_id: str, sig: str) -> Response:
    _verify_access(media_id, sig, "preview")
    data = media_store.read_preview_bytes(media_id)
    if not data:
        data = media_store.read_media_bytes(media_id)
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": _CACHE, "Content-Length": str(len(data))},
    )


@router.get("/{media_id}/download")
async def download_media(media_id: str, sig: str) -> Response:
    _verify_access(media_id, sig, "download")
    data = media_store.read_media_bytes(media_id)
    asset = media_store.get_asset(media_id)
    assert asset
    return Response(
        content=data,
        media_type=asset.mime_type,
        headers={
            "Content-Disposition": f'attachment; filename="{asset.filename}"',
            "Cache-Control": _STREAM_CACHE,
            "Content-Length": str(len(data)),
        },
    )

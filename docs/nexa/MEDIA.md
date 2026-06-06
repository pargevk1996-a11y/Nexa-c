# Media system

## Pipeline

```
Client (chunk upload) → api-gateway → media-service
  → encrypt at rest → process (compress / transcode) → preview
  → signed CDN URLs (short TTL) → stream with Range / lazy load
```

## API (`/api/v1/media/`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/uploads` | Init resumable upload |
| GET | `/uploads/{id}` | Resume status (received chunks) |
| PUT | `/uploads/{id}/chunks/{n}` | Upload chunk (encrypted at rest) |
| POST | `/uploads/{id}/complete` | Assemble, process, return `media_id` + URLs |
| GET | `/{id}/url` | Fresh signed stream/preview/download URLs |
| GET | `/{id}/stream?sig=` | Stream / byte-range (206) |
| GET | `/{id}/preview?sig=` | Thumbnail (cached) |
| GET | `/{id}/download?sig=` | Attachment download |

## Features

| Feature | Implementation |
|---------|----------------|
| Chunk upload | 1 MiB default (`MEDIA_CHUNK_SIZE`) |
| Resumable | `GET /uploads/{id}` + localStorage session key |
| Image compression | Pillow, max edge 1920, JPEG q=85 |
| Video transcoding | ffmpeg → H.264 720p (if installed) |
| Encrypted storage | AES-256-GCM per blob on disk |
| Secure URLs | HMAC signed `sig`, 5 min TTL |
| CDN delivery | `MEDIA_CDN_BASE_URL` → gateway `/api/v1/media/...` |
| Streaming | `Accept-Ranges`, HTTP 206 |
| Preview | JPEG thumb in `/previews/` |
| Lazy loading | `LazyMediaImage` + IntersectionObserver |
| Caching | `Cache-Control` headers + client `mediaCache.ts` |

WebRTC voice/video calls (echo cancellation, noise suppression, screen share) are documented in [CALLS.md](./CALLS.md).

## Config (`.env`)

```bash
MEDIA_STORAGE_ROOT=.dev/media-storage
MEDIA_CHUNK_SIZE=1048576
MEDIA_MAX_UPLOAD_BYTES=536870912
MEDIA_SIGNED_URL_TTL=300
MEDIA_SIGNING_SECRET=change-me-media-signing
MEDIA_ENCRYPTION_KEY=   # optional; falls back to signing secret hash
MEDIA_CDN_BASE_URL=http://127.0.0.1:8000/api/v1/media
```

## Docker

`media-service` image includes **Pillow**, **ffmpeg** for production transcode.

## Frontend demo (`/app/chats`)

| Layer | Path | Role |
|-------|------|------|
| Send | `ChatContext.sendFileMessage`, `sendVoiceMessage` | Optimistic bubbles; demo uses blob URLs + IndexedDB |
| Compress | `media/compressMedia.ts` | Canvas resize before upload |
| Cache | `media/mediaCache.ts`, `media/mediaBlobStore.ts` | sessionStorage signed URLs + IndexedDB blobs |
| UI | `FileMessage`, `VideoMessage`, `VoiceMessage`, `MediaViewer`, `ImageGallery` | Previews, player, gallery, PDF viewer |
| Input | `MessageComposer`, `ChatDropZone` | Photo/video/file/voice/video-note + drag-drop |
| Mock | `data/mockChat.ts`, `data/mockMediaSamples.ts` | Sample image/video/voice/file messages in Alex chat |

Background audio continues when the tab is hidden via `useBackgroundPlayback` (Page Visibility API).

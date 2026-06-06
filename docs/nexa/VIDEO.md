# Nexa — Video Features

## Video messages

- Attach via composer **video** button (`accept="video/*"`) or generic file attach
- Upload through **media-service** (resumable chunks, ffmpeg H.264 transcode, JPEG poster)
- Chat message `content_type: "video"` with `media_id`
- **`VideoMessage`** inline bubble: poster thumb, tap-to-play, progress bar, duration
- Lazy mount player when bubble enters viewport (IntersectionObserver)
- HTTP **Range** streaming via signed `streamUrl`

## Video calls

- **1:1** and **group** mesh WebRTC (`call_type: video`)
- Start from chat header or **Calls** page
- **CallVideoGrid**: 1 / 2 / 2×2 / scrollable tiles for remotes
- Local PiP, mute, camera on/off

## Group video calls

- Mesh topology (≤8 peers recommended) — see [CALLS.md](./CALLS.md)
- All remote streams shown in grid with participant labels
- **Calls** redial passes all `participant_ids` (not a single peer)

## Screen sharing

- `getDisplayMedia` with optional system audio
- Replaces outbound video track until stopped
- “You are presenting” banner; camera flip disabled while sharing
- Remote tiles with **Screen** badge when `displaySurface` is detected

## Camera switching

- `CallEngine.switchCamera()` — flip `facingMode` on mobile, cycle `videoinput` on desktop
- Overlay **flip camera** control

## Fullscreen mode

- **Fullscreen** button on video call stage (`requestFullscreen`)
- Keyboard **f** while overlay is open
- `.call-overlay--fullscreen` edge-to-edge layout

## Adaptive quality

- Tiers: **HD** (2.5 Mbps) → **SD** → **Low** → **Min** (400 kbps)
- `scaleResolutionDownBy` steps with bitrate caps
- Packet-loss monitor degrades after sustained loss; slow upgrade when stable
- Quality badge on call overlay

## API

| Area | Path |
|------|------|
| Video message | `POST /api/v1/chat/conversations/{id}/messages` `{ content_type: "video", media_id }` |
| Video calls | `POST /api/v1/calls/calls` + WS `call.*` — [CALLS.md](./CALLS.md) |
| Media stream | `GET /api/v1/media/{id}/stream` (206 partial content) |

## Frontend modules

| Path | Role |
|------|------|
| `src/components/chat/VideoMessage.tsx` | Inline bubble player |
| `src/components/calls/CallVideoGrid.tsx` | Multi-participant video tiles |
| `src/components/chat/CallOverlay.tsx` | Call UI + fullscreen + controls |
| `src/calls/CallEngine.ts` | WebRTC, screen share, camera switch |
| `src/calls/webrtcConfig.ts` | Bitrate tiers + ABR monitor |
| `src/realtime/mapMessage.ts` | Maps `content_type: video` → `kind: video` |

## Limitations

- No SFU — large groups need LiveKit/mediasoup later
- Screen share replaces camera track (single outbound video)
- No HLS/DASH for messages (MP4 + Range only)
- Waveform/peaks not stored server-side for video

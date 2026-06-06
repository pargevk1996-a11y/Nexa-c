# Nexa — Voice Features

## Voice messages

- Record via `VoiceRecorder` with **noise suppression**, echo cancellation, AGC (`VOICE_AUDIO_CONSTRAINTS`)
- **Live waveform** while recording (`AudioWaveform` + Web Audio analyser)
- Upload to **media-service** when logged in; `content_type: voice` on chat message
- Playback: real **waveform peaks** (decoded from blob), **progress bar**, speeds **1× / 1.25× / 1.5× / 2×**
- **Push-to-talk** in composer: toggle **PTT**, hold mic to record and release to send

## Voice & group voice chats

- **1:1 voice chat** — header phone icon → `call_type: audio` WebRTC call
- **Group voice chat** — same flow with multiple `participant_ids` (mesh topology)
- **Mute/unmute** — toggles local audio track
- **Push-to-talk** in call overlay — **PTT** mode + **Hold** button (mic open only while pressed)
- Live **waveform** on voice-only call overlay
- Noise suppression via `buildMediaConstraints("audio")` in `CallEngine`

## API

| Area | Path |
|------|------|
| Voice message send | `POST /api/v1/chat/conversations/{id}/messages` `{ content_type: "voice", media_id }` |
| Voice calls | `POST /api/v1/calls/calls` + WS `call.*` — see [CALLS.md](./CALLS.md) |

## Frontend modules

| Path | Role |
|------|------|
| `src/voice/audioUtils.ts` | Constraints, peak extraction, playback speeds |
| `src/voice/useLiveWaveform.ts` | Analyser-driven live bars |
| `src/components/voice/WaveformBars.tsx` | Static/playback waveform |
| `src/components/voice/AudioWaveform.tsx` | Live stream waveform |
| `src/components/chat/VoiceRecorder.tsx` | Record + optional ref for PTT stop |
| `src/components/chat/VoiceMessage.tsx` | Play + speed + waveform |
| `src/components/chat/CallOverlay.tsx` | Voice chat UI + PTT |

## Limitations

- Dedicated **voice chat rooms** (always-on channels) not implemented — use group audio calls
- No server-side waveform storage (peaks computed client-side)
- Group calls use mesh; large groups need SFU

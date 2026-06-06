# Nexa — Feature Registry

> Product class: **Telegram + Signal + Discord** competitor — see [PLATFORM_BLUEPRINT.md](./PLATFORM_BLUEPRINT.md), [PRODUCTION_BAR.md](./PRODUCTION_BAR.md), [MATURITY.md](./MATURITY.md).

Legend: ✅ Done · 🟡 Partial · ⬜ Planned

| Feature | Status | Layer | Notes |
|---------|--------|-------|-------|
| Registration | ✅ | auth-service | Email + username + password |
| Authorization (login) | ✅ | auth-service | JWT access + refresh session |
| Login brute-force protection | ✅ | auth-service + Redis | 3 fails → 10m; 1 IP retry; fail → 5m; 3 strikes → password reset required |
| Logout | ✅ | auth-service | Revokes session |
| Refresh session | ✅ | auth-service | Rotation + reuse detection |
| Multi-device sessions | ✅ | auth-service | One session per device/login |
| Active sessions management | ✅ | auth-service | List + revoke |
| QR login | 🟡 | auth-service | API only; web UI off (`VITE_QR_LOGIN_ENABLED`) |
| Password reset | ✅ | auth-service + web | Forgot + reset token flow |
| 2FA (TOTP) | ✅ | auth-service + web | Login challenge + Settings setup |
| Biometric auth | 🟡 | native (planned) | WebAuthn disabled on web; API remains for desktop/mobile |
| Email verification | 🟡 | auth-service | Backend + dev auto-verify; `/verify-email` page off on web |
| Phone verification | ✅ | auth-service + web | SMS OTP (dev codes in API) |
| Device management | ✅ | web | Settings → active sessions |
| Session revoke | ✅ | auth-service + web | Per-session DELETE |
| Username system | ✅ | user-service | Unique handle + $mention |
| Nickname | ✅ | user-service + web | Display name override |
| User search | ✅ | user-service | By username / nickname / uid |
| Profile system | ✅ | user-service + web | `/app/profile`, GET/PATCH `/users/me` |
| Avatar upload | ✅ | media + user-service | Resumable upload → profile URL |
| Animated avatars | ✅ | web | GIF/WebP via `avatar_kind=animated` |
| Bio / status | ✅ | user-service | bio + status_text |
| Online / offline | ✅ | user-service + web | `POST /users/presence`, heartbeat |
| Last seen | ✅ | user-service | `last_seen_at` + privacy gate |
| Profile privacy | ✅ | user-service | 6 toggles on profile |
| Verification badges | ✅ | user-service + web | verified / official / bot |
| Typing status | ✅ | presence-service + WS | Realtime fan-out |
| WebSocket gateway | ✅ | ws-gateway | `/api/v1/ws`, Redis scale-out |
| Offline sync | ✅ | chat-service + client | `GET .../sync?after_seq=` |
| Optimistic UI | ✅ | frontend | Pending messages + patch on ack |
| Message queue / retry | 🟡 | Redis stream | `nexa:mq:retry` worker in ws-gateway |
| Last seen | 🟡 | user-service | Privacy-gated in Phase 2 |
| Read receipts | ✅ | chat-service | POST read up to seq |
| Delivered status | ✅ | chat-service | Per-message delivery |
| Reactions | ✅ | chat-service | Emoji on message |
| Replies | ✅ | chat-service | reply_to_id |
| Forwards | ✅ | chat-service | forward_from_id |
| Pinned messages | ✅ | chat-service | pins per conversation |
| Edit message | ✅ | chat-service | edit envelope |
| Delete message | ✅ | chat-service | For me / everyone |
| Message history | ✅ | chat-service | Cursor by seq |
| Infinite scroll | 🟡 | frontend | Mock; API ready |
| Message search | ✅ | ai-service + frontend | Smart / semantic / keyword |
| AI assistant | ✅ | ai-service + frontend | In-chat panel |
| Smart reply | ✅ | ai-service | Composer suggestions |
| Voice-to-text | ✅ | ai-service Whisper | Composer Aa toggle |
| Translation | ✅ | ai-service | Composer Tr button |
| AI moderation | ✅ | ai-service + chat-service | Internal API on send |
| AI spam detection | ✅ | ai-service + chat-service | Combined with rules |
| AI summarization | ✅ | ai-service | Assistant panel |
| Media sharing | ✅ | chat-service + media-service | `media_id` on messages |
| File sharing | ✅ | media-service | Chunk/resumable upload |
| Image compression | ✅ | media-service | Pillow |
| Video transcoding | ✅ | media-service | ffmpeg (optional in dev) |
| CDN / signed URLs | ✅ | media-service | HMAC + gateway proxy |
| Lazy media load | ✅ | frontend | `LazyMediaImage` |
| Voice messages | ✅ | media + frontend | Upload, waveform, playback speed, PTT record |
| Voice chats | ✅ | call-service WebRTC | Audio-only calls |
| Group voice chats | ✅ | mesh WebRTC | Multi-participant audio |
| Push-to-talk | ✅ | composer + call overlay | Hold mic / PTT mode |
| Audio waveform | ✅ | Web Audio | Live + decoded peaks |
| Playback speed | ✅ | VoiceMessage | 1–2× steps |
| Noise suppression | ✅ | getUserMedia constraints | Record + calls |
| Mute/unmute | ✅ | CallEngine + overlay | PTT overrides mute |
| Video messages | ✅ | media + VideoMessage | Upload, poster, inline player |
| Group video calls | ✅ | CallVideoGrid mesh | Multi-tile remote UI |
| Camera switching | ✅ | CallEngine | Flip / cycle devices |
| Fullscreen mode | ✅ | CallOverlay | requestFullscreen + key f |
| Adaptive quality (video) | ✅ | webrtcConfig tiers | HD/SD/Low/Min badge |
| Stickers | ✅ | emoji-service + frontend | REST API: GET /stickers/packs, /stickers/packs/{id}; frontend EmojiPicker loads live packs with DEMO fallback |
| Emoji support | 🟡 | frontend picker | |
| GIF support | ⬜ | Phase 3 | |
| Private groups | ✅ | chat-service | `private_group`, invite-only |
| Public groups | ✅ | chat-service | `public_group`, discover/join |
| Channels | ✅ | chat-service | Admin-only main feed |
| Broadcast channels | ✅ | chat-service | `broadcast` type |
| Communities | ✅ | chat-service | Hub + `parent_id` channels |
| Threaded discussions | ✅ | chat-service | `thread_root_id` + thread API |
| Admin permissions | ✅ | chat-service | owner/admin/mod/member RBAC |
| Moderation tools | ✅ | chat-service | ban, mute, mod log |
| Anti-spam | ✅ | chat-service | rate + duplicate |
| Slow mode | ✅ | chat-service | per-space seconds |
| Auto moderation | ✅ | chat-service | levels 0–2 |
| Verification system | ✅ | chat-service | user + join gate + verified badge |
| Group chats | ✅ | chat-service | legacy `group` alias |
| Supergroups | 🟡 | chat-service | type=supergroup |
| Channels | 🟡 | chat-service | type=channel |
| Admin roles | ✅ | chat-service | member role enum |
| Permissions system | 🟡 | chat-service | role bitmask Phase 2 |
| Invite links | ⬜ | Phase 2 | |
| Private / public groups | 🟡 | chat-service | is_public flag |
| Mentions | ⬜ | Phase 2 | |
| Hashtags | ⬜ | Phase 3 | |
| Polls | ⬜ | Phase 2 | |
| Stories | 🟡 | story-service | Skeleton |
| Disappearing messages | 🟡 | chat-service | expires_at |
| Scheduled messages | ⬜ | Phase 2 | |
| Saved messages | ✅ | frontend | `SAVED_MESSAGES_ID`, pinned section in sidebar |
| Favorites / bookmarks | 🟡 | frontend | `favorite` flag on conversations |
| Folders / chat categories | ✅ | frontend | Category pills + Personal/Work/Teams folders |
| Private chats | ✅ | frontend | `chatType: private` + category filter |
| Secret chats | ✅ | frontend | E2EE UI, `chat-conv-item--secret` |
| Supergroups | ✅ | frontend | `chatType: supergroup`, member count in header |
| Broadcast channels | ✅ | frontend | `canPost` / read-only composer for subscribers |
| Hidden chats | ✅ | frontend | Hide/unhide context menu + toggle section |
| Archived chats | ✅ | frontend | Archive/unarchive + expandable list |
| Pinned chats | ✅ | frontend | Pin/unpin + Pinned section (see **CHATS** below) |
| Mute notifications | ✅ | Per-chat prefs + smart mute engine |
| Custom notification settings | ✅ | Settings + Profile Alerts tab |
| Push notifications | ✅ | Web Push + outbox (VAPID optional) |
| Mobile notifications | ✅ | Mobile UA + push subscription platform |
| Desktop notifications | ✅ | Notification API + grouping |
| Silent notifications | ✅ | Composer + API `silent` |
| Notification grouping | ✅ | Client debounce + server collapse_key |
| Smart mute system | ✅ | mute_until, quiet hours, mentions-only |
| Calls | ✅ | call-service + frontend | WebRTC mesh, signaling via WS |
| Video calls | ✅ | frontend CallEngine | getUserMedia + RTCPeerConnection |
| Screen sharing | ✅ | frontend CallEngine | getDisplayMedia + presenting banner |
| Group calls | ✅ | frontend mesh | CallVideoGrid; no SFU yet |
| Voice chat rooms | ⬜ | Phase 4 | Use group voice calls |
| Livestream | ⬜ | Phase 5 | |
| Bots | ⬜ | Phase 5 | |
| Mini apps | ⬜ | Phase 5 | |
| Dark / light mode | ✅ | frontend | Settings |
| Localization | ⬜ | packages/i18n | |
| Accessibility | 🟡 | frontend | Ongoing |

## CHATS (frontend demo)

Demo UI on `/app/chats` (login with demo mode). State persists via `chatVault` (encrypted local storage when signed in).

| # | Feature | Status | Key files |
|---|---------|--------|-----------|
| 1 | Private chats | ✅ | `mockChat.ts` (`c1`, `c2`), `chatTypes.ts`, category **Private** |
| 2 | Secret chats | ✅ | `secret-c1`, `ChatContext.startSecretChat`, secret badge + E2EE composer rules |
| 3 | Group chats | ✅ | `c3` Dev Team, category **Groups**, folder **Teams** |
| 4 | Supergroups | ✅ | `c-super` Nexa Community, `ChatTypeBadge`, header member count |
| 5 | Broadcast channels | ✅ | `c-channel` Nexa News — read-only composer (`canPost: false`) |
| 6 | Saved messages | ✅ | `saved` id, sidebar section + 🔖 shortcut in `ChatLeftPanel` |
| 7 | Archived chats | ✅ | `c-arch`, archive/unarchive menu, **Archived** toggle |
| 8 | Folders / categories | ✅ | Category pills + Personal/Work/Teams/Channels/Unread folders |
| 9 | Pinned chats | ✅ | Pin/unpin context menu, **Pinned** section (`c1` pinned in mock) |
| 10 | Hidden chats | ✅ | `c-hidden`, hide/unhide menu, **Hidden (n)** toggle |

**How to verify:** Open demo chats → right-click a list item (pin, archive, hide, move to folder) → toggle **Archived** / **Hidden** → open **Nexa News** (composer disabled) → **Saved** category or 🔖 button.

## Realtime (frontend + backend)

| Capability | Status | Notes |
|------------|--------|-------|
| Instant delivery (WS + REST) | ✅ | `message.send` + `message.new` |
| Optimistic updates | ✅ | Pending bubble → ack patch |
| Delivered status | ✅ | Demo progression + `receipt.delivered` |
| Read receipts | ✅ | `markConversationRead` + checkmarks |
| Typing indicators | ✅ | WS `typing` + demo on Maria chat |
| Online presence | ✅ | Heartbeat + demo toggle on Alex |
| WebSocket updates | ✅ | `RealtimeWsClient` |
| Reconnect handling | ✅ | Exponential backoff |
| Offline sync | ✅ | `offlineQueue` + `catchUpConversation` |
| Realtime sync (`after_seq`) | ✅ | `sync.ts` localStorage cursor |
| Browser notifications | ✅ | When tab hidden |

## OFFLINE MODE

| Feature | Status | Location |
|---------|--------|----------|
| Offline chat access | ✅ | Encrypted IDB + chatVault |
| Local encrypted cache | ✅ | `offline/encryptedCache.ts` |
| Sync after reconnect | ✅ | `offline/offlineSync.ts` |
| Queued messages | ✅ | `offlineQueue` + REST flush |
| Conflict resolution | ✅ | `offline/conflictResolution.ts` |

See [OFFLINE.md](./OFFLINE.md).

## SETTINGS SYSTEM

| Feature | Status | Section |
|---------|--------|---------|
| Privacy settings | ✅ | `?section=privacy` |
| Security settings | ✅ | `?section=security` |
| Device management | ✅ | `?section=devices` |
| Session history | ✅ | `?section=sessions` |
| Blocked users | ✅ | `?section=blocked` |
| Data export | ✅ | `?section=data` |
| Account deletion | ✅ | `?section=danger` |
| Username customization | ✅ | `?section=account` |
| Theme settings | ✅ | `?section=appearance` |
| Notification settings | ✅ | `?section=notifications` |

See [SETTINGS.md](./SETTINGS.md).
| Connection status bar | ✅ | Live / Reconnecting / Demo |

See [REALTIME.md](./REALTIME.md).

## MESSAGES (frontend demo)

Demo UI on `/app/chats` → open **Alex Chen** (`c1`) for samples covering all 20 capabilities. State: `ChatContext` mutations + `chatVault`; scheduled sends use an in-memory queue.

| # | Feature | Status | Key files |
|---|---------|--------|-----------|
| 1 | Text messages | ✅ | `mockChat.ts`, `ChatContext.sendMessage`, `MessageList` |
| 2 | Markdown formatting | ✅ | `messageFormat.tsx`, `FormattedMessageText` (**bold**, *italic*) |
| 3 | Link previews | ✅ | `LinkPreview.tsx`, `mockLinkPreview`, auto on URL send |
| 4 | Replies | ✅ | `MessageComposer` reply banner, `replyTo` in bubble |
| 5 | Forwards | ✅ | `MessageContextMenu` → `handleMessageMenuAction` forward |
| 6 | Reactions | ✅ | `MessageReactions`, `MessageContextMenu` quick bar, `toggleReaction` |
| 7 | Edit message | ✅ | `startEditMessage` / `saveEditMessage`, edited badge |
| 8 | Delete message (for me) | ✅ | `deleteMessage` → `hiddenForMe` |
| 9 | Delete for everyone | ✅ | `deletedForAll` → “This message was deleted” bubble |
| 10 | Scheduled messages | ✅ | Composer datetime, badge, `scheduledQueue` flush |
| 11 | Silent messages | ✅ | Bell toggle, 🔕 badge, `notifyNewMessage` silent |
| 12 | Pinned messages | ✅ | `PinnedMessagesBar`, pin/unpin menu, demo `m3pin` |
| 13 | Message search | ✅ | Header search → `MessageSearchPanel` (smart/semantic/keyword) |
| 14 | Hashtags | ✅ | `#tag` highlight in `messageFormat`, `extractHashtags` |
| 15 | Mentions | ✅ | `@user` highlight, `extractMentions` on send |
| 16 | Polls | ✅ | `PollMessage`, `PollQuizComposer`, `sendPollMessage` |
| 17 | Quizzes | ✅ | `PollMessage` reveal, `sendQuizMessage` |
| 18 | Spoilers | ✅ | `\|\|text\|\|` tap-to-reveal in `messageFormat` |
| 19 | Code formatting | ✅ | Inline `` `code` `` + fenced ` ``` ` blocks (`formatted-msg__pre`) |
| 20 | Quote formatting | ✅ | `>` blockquote lines in `messageFormat` |

**In-chat filter:** `ChatMessageFilter` (keyword) syncs with search panel via `messageFilter` in `ChatContext`.

**How to verify:** Demo login → **Alex Chen** → scroll mock thread → right-click message (reply, forward, react, edit, delete) → composer 🔔/clock/📊 → filter bar → header search icon.

## BACKEND & INFRASTRUCTURE (production stack)

| Layer | Status | Notes |
|-------|--------|-------|
| FastAPI microservices | ✅ | api-gateway, auth, chat, media, presence, call, ws-gateway, … |
| Go / Node.js | 🟡 Optional | Hot-path only if needed |
| PostgreSQL | ✅ | Per-service DBs in Compose |
| Redis | ✅ | Registry, pub/sub, cache |
| NATS / Kafka / RabbitMQ | 🟡 NATS profile | Redis pub/sub today; `docker-compose.optional.yml` |
| MinIO / S3 | 🟡 MinIO profile | Local FS default; S3 env for prod |
| Docker | ✅ | `docker-compose.yml` + prod overlay |
| Kubernetes | 🟡 Phase 6 | See DEPLOYMENT.md |
| Nginx | ✅ | `infrastructure/nginx/` |
| CDN | 🟡 Config | `MEDIA_CDN_BASE_URL` |
| Prometheus + Grafana | 🟡 Profile | `make optional-up` |
| ELK | 🟡 Profile | `make optional-logging-up` |

See [BACKEND_ARCHITECTURE.md](./BACKEND_ARCHITECTURE.md).

## DATABASE (scalable Postgres)

| Capability | Status | Location |
|------------|--------|----------|
| Scalable schema | ✅ | `migrations/chat_db/002`–`003` |
| Message indexing | ✅ | Timeline, thread, sender, GIN FTS |
| HASH partitioning (32) | ✅ | `messages_p0`–`p31` |
| Sharding strategy | ✅ | [DATABASE.md](./DATABASE.md) §3 |
| Full-text search | ✅ | `search_vector`, `message_search_index` |
| Retention policies | ✅ | `retention_policies`, SQL jobs |
| Soft delete | ✅ | `deleted_at`, `message_user_state` |
| Audit tables | ✅ | `message_audit`, `conversation_audit`, `auth_db.audit_log` |

```bash
make db-migrate   # existing Postgres
make up           # fresh volume applies migrations on init
```

## FRONTEND ARCHITECTURE (production stack)

| Layer | Status | Notes |
|-------|--------|-------|
| React + TypeScript | ✅ | Vite SPA, React 19 |
| Next.js | 🟡 Phase 2 | Optional; messenger stays SPA |
| Zustand | ✅ | `sessionStore`, `realtimeStore` |
| Redux | — | Not used |
| WebSocket client | ✅ | `RealtimeWsClient`, `useRealtimeChat` |
| Service Worker | ✅ | `public/sw.js`, prod registration |
| IndexedDB | ✅ | Unified `nexa-client` in `src/cache/idb.ts` |

See [FRONTEND_ARCHITECTURE.md](./FRONTEND_ARCHITECTURE.md) · [MASTER_PLAN.md](./MASTER_PLAN.md).

## MEDIA SYSTEM (frontend demo)

Demo UI on `/app/chats` → **Alex** (`c1`) includes mock media samples + composer attach/drag. State: `ChatContext.sendFileMessage` / `sendVoiceMessage`, IndexedDB `mediaBlobStore`, `mediaCache`.

| # | Feature | Status | Key files |
|---|---------|--------|-----------|
| 1 | Image upload | ✅ | `MessageComposer` photo button, `sendFileMessage`, `compressMedia.ts` |
| 2 | Video upload | ✅ | `MessageComposer` video attach, `VideoMessage`, `sendFileMessage` |
| 3 | File upload | ✅ | Paperclip `FileAttachButton`, `FileMessage`, `sendFileMessage` |
| 4 | Drag & drop | ✅ | `ChatDropZone.tsx`, `ChatPage` wrapper |
| 5 | Voice messages | ✅ | `VoiceRecorder`, `VoiceMessage`, `sendVoiceMessage` |
| 6 | Video messages | ✅ | Video-note button, `videoNote` flag, `VideoMessage` circle UI |
| 7 | Media compression | ✅ | `compressMedia.ts` (canvas JPEG/PNG before send) |
| 8 | Media preview | ✅ | `FileMessage`, `MediaViewer`, inline thumbs |
| 9 | Image gallery | ✅ | `ImageGallery.tsx`, `MessageList` lightbox |
| 10 | Video streaming | ✅ | `VideoMessage` blob/signed URL + `<video>` Range-ready URLs |
| 11 | Document viewer | ✅ | `MediaViewer` PDF iframe + download fallback |
| 12 | Audio player | ✅ | `VoiceMessage`, `MediaViewer` `<audio controls>` |
| 13 | Background playback | ✅ | `useBackgroundPlayback.ts` (Page Visibility) |
| 14 | Media caching | ✅ | `mediaCache.ts`, `mediaBlobStore.ts` (IndexedDB + sessionStorage) |
| 15 | Lazy media load | ✅ | `LazyMediaImage.tsx` IntersectionObserver |

**How to verify:** Demo login → **Alex** → scroll media samples → tap photo (gallery) → attach/drag file → record voice → play audio with tab hidden.

See [MEDIA.md](./MEDIA.md).

## CALL SYSTEM (frontend + call-service)

Voice/video WebRTC with mesh signaling, STUN/TURN, adaptive bitrate, screen share, and group tiles. Demo mode uses local media + simulated/loopback peers without the call-service.

| # | Feature | Status | Key files |
|---|---------|--------|-----------|
| 1 | WebRTC (offer/answer/ICE) | ✅ | `CallEngine.ts`, WS `call.signal`, REST signal relay |
| 2 | Voice calls | ✅ | `call_type: audio`, `CallOverlay` voice UI |
| 3 | Video calls | ✅ | `getUserMedia` video constraints, `CallVideoGrid` |
| 4 | Adaptive bitrate | ✅ | `webrtcConfig.ts` tiers + `getStats` loss monitor |
| 5 | TURN/STUN support | ✅ | `call-service` `turn_service.py`, `VITE_ICE_SERVERS`, `GET /calls/ice` |
| 6 | Low-latency audio | ✅ | 48 kHz mono, `latency: 0`, `bundlePolicy: max-bundle` |
| 7 | Echo cancellation | ✅ | `echoCancellation: true` in `AUDIO_CONSTRAINTS` |
| 8 | Noise suppression | ✅ | `noiseSuppression` + `autoGainControl` |
| 9 | Screen sharing | ✅ | `getDisplayMedia`, `replaceTrack` / `addTrack` |
| 10 | Group calls | ✅ | Full mesh signaling; demo canvas tiles; `CallVideoGrid` |

**How to verify (demo):** Demo login → **Alex** or **Dev Team** → header phone/video → grant camera/mic → mute, screen share (video), end. **Live:** two registered users, DM with `peer_user_id`, `make dev-up` call-service + ws-gateway.

See [CALLS.md](./CALLS.md).

## UX / UI (frontend)

Telegram + Apple inspired shell on `/app/chats`. See [UX.md](./UX.md).

| # | Requirement | Status | Key files |
|---|-------------|--------|-----------|
| 1 | Left sidebar (chats) | ✅ | `ChatLeftPanel`, `ResizableChatShell` |
| 2 | Center active chat | ✅ | `ChatPage` → `chat-main` |
| 3 | Right profile / settings | ✅ | `ProfilePanel`, drawer on mobile |
| 4 | Floating composer | ✅ | `ux-ui.css`, glass sticky composer |
| 5 | Smooth transitions | ✅ | `motion.css`, `ux-ui.css`, drawer animations |
| 6 | Keyboard shortcuts | ✅ | `useChatKeyboardShortcuts.ts` |
| 7 | Drag & drop | ✅ | `ChatDropZone` |
| 8 | Context menus | ✅ | `ChatContextMenu`, `MessageContextMenu` |
| 9 | Glassmorphism accents | ✅ | `tokens.css`, `glass-panel` |
| 10 | Responsive / mobile-first | ✅ | `premium.css` breakpoints, `useKeyboardInset` |
| 11 | Minimal / low clutter | ✅ | Hidden AI chrome on chats (`nexa.css`) |

## Design requirements (frontend)

Premium, readable, security-oriented visual system. See [DESIGN.md](./DESIGN.md).

| # | Principle | Status | Key files |
|---|-----------|--------|-----------|
| 1 | Premium product feel | ✅ | `tokens.css` shadows, `design-system.css` |
| 2 | Readability | ✅ | Line heights, contrast, bubble max-width |
| 3 | Lots of spacing | ✅ | `--panel-pad`, conv/header padding |
| 4 | Subtle shadows | ✅ | `--shadow-subtle` / `--shadow-md` |
| 5 | Rounded corners | ✅ | `--radius-*` on panels & bubbles |
| 6 | Clean typography | ✅ | Inter + Outfit, tracking tokens |
| 7 | Microinteractions | ✅ | `motion.css` hover/press |
| 8 | Elegant icons | ✅ | `Icons.tsx` stroke 1.5 |
| 9 | Security branding | ✅ | `--secure-teal`, tagline, shield pills |

## Performance & scale

Distributed realtime and caching for high concurrency. See [PERFORMANCE.md](./PERFORMANCE.md).

| # | Requirement | Status | Notes |
|---|-------------|--------|-------|
| 1 | Millions of users | 🟡 | Partitioned DB schema + K8s HPA (target) |
| 2 | High concurrent WebSockets | ✅ | Horizontal ws-gateway, 50k conn/node cap |
| 3 | Realtime sync | ✅ | `after_seq` + WS events + sync cache |
| 4 | Low-latency delivery | ✅ | Redis pub/sub per node |
| 5 | Distributed infrastructure | ✅ | Microservices + Redis bus |
| 6 | Failover | 🟡 | Retry stream; DR runbook in [DEVOPS.md](./DEVOPS.md) |
| 7 | Horizontal scaling | ✅ | Multi-conn registry SET + `fanout_event` |
| 8 | Caching layer | ✅ | `RedisCache`, sync TTL, rate limits |
| 9 | Optimized DB queries | 🟡 | Indexes/partitions in DATABASE_SCHEMA |

## DevOps & platform

| Item | Status | Notes |
|------|--------|-------|
| CI/CD (GitHub Actions) | ✅ | `.github/workflows/ci.yml`, `security.yml`, `deploy-staging.yml` |
| Local CI | ✅ | `make ci-local` |
| Smoke tests | ✅ | `tests/smoke/` |
| Unit tests | ✅ | `tests/unit/`, Vitest in `frontend/web` |
| Integration tests | ✅ | `tests/integration/` |
| WebSocket tests | ✅ | `tests/websocket/` |
| Security tests | ✅ | `tests/security/` + `security.yml` |
| Load tests | ✅ | `tests/load/locustfile.py`, `make test-load` |
| E2E tests | ✅ | `tests/e2e/` Playwright |
| Dependabot | ✅ | `.github/dependabot.yml` |
| SAST / image scan | ✅ | Bandit, Trivy, CodeQL in `security.yml` |
| Staging / prod env templates | ✅ | `.env.staging.example`, `.env.prod.example` |
| Prometheus + Grafana | ✅ | Optional compose profile |
| OpenTelemetry + Jaeger | ✅ | Shared `setup_observability`, optional profile |
| ELK logging (optional) | ✅ | `logging` profile + Filebeat stub |
| Postgres backups | ✅ | `scripts/backup-postgres.sh`, `make backup-db` |
| DR runbook | ✅ | [DEVOPS.md](./DEVOPS.md) |
| K8s manifests (base) | 🟡 | `infrastructure/k8s/` — api-gateway sample |

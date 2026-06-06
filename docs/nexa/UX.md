# Nexa — UX / UI

Minimalist messenger layout: **Telegram three-panel** structure with **Apple-style** motion, glass surfaces, and mobile-first behavior.

## Layout (`/app/chats`)

| Zone | Component | Notes |
|------|-----------|--------|
| Left | `ChatLeftPanel` + `ChatSidebar` | Chat list, category filters, list search, compact app nav |
| Center | `chat-main` | Header, messages, floating composer |
| Right | `ProfilePanel` | Desktop: `⌘I` / header; mobile: drawer |

On the chats route, **global `TopNav` and `SideNav` are not mounted** (single rail, no duplicate search or branding). Other app routes keep the top bar + side rail.

`ResizableChatShell` persists sidebar/profile widths. On viewports ≤768px, list ↔ conversation slide; profile uses a glass drawer.

## Search

| Context | Entry |
|---------|--------|
| Chat list | Search field in `ChatLeftPanel` |
| Active thread | Header search icon or `⌘K` → `MessageSearchPanel` (keyword + smart search) |

There is no always-visible in-thread filter bar; keyword filtering lives in the search panel.

## Style tokens

- Glass: `--glass-bg`, `--glass-border`, `--glass-blur` in `tokens.css`
- Motion: `motion.css` (tap feedback, fade-up, reduced-motion)
- Chat polish: `ux-ui.css` (floating composer, panel transitions) — loaded last in `global.css`

## Interactions

| Action | Shortcut |
|--------|----------|
| Search (list or in-chat) | `⌘K` / `Ctrl+K` |
| Focus composer | `⌘N` / `Ctrl+N` |
| Settings | `⌘,` / `Ctrl+,` |
| Toggle profile | `⌘I` / `Ctrl+I` |
| Close panels / back | `Esc` |

Drag & drop: `ChatDropZone` on the message list. Context menus: `ChatContextMenu`, `MessageContextMenu`.

## Verify (demo)

1. Demo login → `/app/chats` — three columns on desktop (profile closed by default; open via header or `⌘I`). No duplicate top/side global nav.
2. Send a message — composer floats above the thread with glass blur; attach / voice / call actions work in demo.
3. `⌘K` focuses list search with no chat open, or opens in-chat search when a thread is active; `Esc` closes overlays.

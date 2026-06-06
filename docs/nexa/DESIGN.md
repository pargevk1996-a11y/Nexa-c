# Nexa — Design requirements

Premium messenger aesthetic: **readable**, **spacious**, **subtle depth**, **rounded**, with **security-first** branding (not flashy crypto neon).

## Design logic

| Principle | Implementation |
|-----------|----------------|
| Premium product feel | Soft shadows (`--shadow-subtle` / `--shadow-md`), glass panels, restrained glow |
| Readability | `--leading-relaxed`, brighter `--text-muted`, bubble `max-width`, `optimizeLegibility` |
| Lots of spacing | `--panel-pad`, `--space-7`–`9`, conv item + header padding in `design-system.css` |
| Subtle shadows | Replaced heavy glow stack in `tokens.css` |
| Rounded corners | `--radius-lg` / `--radius-2xl` on panels, composer, bubbles |
| Clean typography | Inter + Outfit; `--tracking-tight` on headings; `--font-mono` for codes/UID |
| Microinteractions | `motion.css` — press scale, hover bubble shadow, conv item hover |
| Elegant icons | SVG `strokeWidth="1.5"`, icon scale on hover (`design-system.css`) |
| Security branding | `--secure-teal`, shield pills, tagline in `brand.ts` |

## Source files

- `frontend/web/src/styles/tokens.css` — palette, spacing, shadows, type scale
- `frontend/web/src/styles/design-system.css` — global application
- `frontend/web/src/styles/motion.css` — animations
- `frontend/web/src/styles/ux-ui.css` — chat shell / composer
- `frontend/web/src/config/brand.ts` — name, tagline, logo

## Verify

1. Open `/app/chats` (demo) — notice looser list rows, softer panel shadows, readable bubbles.
2. Hover a conversation and a message bubble — light shadow lift.
3. Auth `/login` — wordmark spacing + tagline; icons feel thinner and crisp.

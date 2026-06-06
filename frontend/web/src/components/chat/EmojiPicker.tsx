import { useEffect, useRef, useState, type RefObject } from "react";
import { EMOJI_CATEGORIES, type EmojiCategory } from "@/data/emojiCategories";
import { DEMO_GIFS, type DemoGif, type DemoSticker } from "@/data/mockMedia";
import { useStickers } from "@/hooks/useStickers";
import { IconGif, IconSmile, IconSticker } from "@/components/icons/Icons";

type PickerSection = "emoji" | "gif" | "sticker";

interface EmojiPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (emoji: string) => void;
  onGifSelect?: (gif: DemoGif) => void;
  onStickerSelect?: (sticker: DemoSticker) => void;
  anchorRef: RefObject<HTMLElement | null>;
  initialSection?: PickerSection;
  allowGif?: boolean;
  allowStickers?: boolean;
}

const SECTIONS: {
  id: PickerSection;
  label: string;
  Icon?: typeof IconSmile;
  iconEmoji?: string;
}[] = [
  { id: "emoji", label: "Emoji", Icon: IconSmile },
  { id: "gif", label: "GIF", Icon: IconGif },
  { id: "sticker", label: "Stickers", Icon: IconSticker },
];

export function EmojiPicker({
  open,
  onClose,
  onSelect,
  onGifSelect,
  onStickerSelect,
  anchorRef,
  initialSection = "emoji",
  allowGif = true,
  allowStickers = true,
}: EmojiPickerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [section, setSection] = useState<PickerSection>(initialSection);
  const [categoryId, setCategoryId] = useState<string>(EMOJI_CATEGORIES[0].id);
  const [query, setQuery] = useState("");
  const { allStickers } = useStickers();

  const visibleSections = SECTIONS.filter((s) => {
    if (s.id === "gif") return allowGif && onGifSelect;
    if (s.id === "sticker") return allowStickers && onStickerSelect;
    return true;
  });

  const active: EmojiCategory =
    EMOJI_CATEGORIES.find((c) => c.id === categoryId) ?? EMOJI_CATEGORIES[0];

  const filteredEmoji = query.trim()
    ? EMOJI_CATEGORIES.flatMap((c) => c.emojis).filter((e) => e.includes(query))
    : active.emojis;

  const filteredGifs = query.trim()
    ? DEMO_GIFS.filter((g) => g.title.toLowerCase().includes(query.toLowerCase()))
    : DEMO_GIFS;

  const filteredStickers = query.trim()
    ? allStickers.filter((s) => s.label.toLowerCase().includes(query.toLowerCase()))
    : allStickers;

  useEffect(() => {
    if (open) setSection(initialSection);
  }, [open, initialSection]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSection("emoji");
      return;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(t) &&
        anchorRef.current &&
        !anchorRef.current.contains(t)
      ) {
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return (
    <div className="emoji-picker" ref={panelRef} role="dialog" aria-label="Emoji, GIF and stickers">
      <div className="emoji-picker__search">
        <input
          type="search"
          className="field__input field__input--search"
          placeholder={
            section === "gif"
              ? "Search GIF…"
              : section === "sticker"
                ? "Search stickers…"
                : "Search emoji…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search"
        />
      </div>

      <div className="emoji-picker__body">
        {section === "emoji" ? (
          <>
            {!query.trim() ? (
              <div className="emoji-picker__tabs" role="tablist" aria-label="Emoji categories">
                {EMOJI_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    role="tab"
                    aria-selected={cat.id === categoryId}
                    aria-label={cat.label}
                    className={`emoji-picker__tab ${cat.id === categoryId ? "emoji-picker__tab--active" : ""}`}
                    onClick={() => setCategoryId(cat.id)}
                  >
                    {cat.icon}
                  </button>
                ))}
              </div>
            ) : null}
            <div
              className="emoji-picker__grid"
              role="listbox"
              aria-label={query ? "Search results" : active.label}
            >
              {filteredEmoji.map((emoji, i) => (
                <button
                  key={`${emoji}-${i}`}
                  type="button"
                  className="emoji-picker__item"
                  onClick={() => onSelect(emoji)}
                  aria-label={`Insert ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
              {filteredEmoji.length === 0 ? (
                <p className="emoji-picker__empty">No emoji found</p>
              ) : null}
            </div>
          </>
        ) : null}

        {section === "gif" ? (
          <div className="emoji-picker__gif-grid" role="listbox" aria-label="GIFs">
            {filteredGifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                className="emoji-picker__gif"
                onClick={() => {
                  onGifSelect?.(gif);
                  onClose();
                }}
                aria-label={gif.title}
              >
                <img src={gif.previewUrl} alt="" loading="lazy" />
                <span>{gif.title}</span>
              </button>
            ))}
            {filteredGifs.length === 0 ? (
              <p className="emoji-picker__empty">No GIFs found</p>
            ) : null}
          </div>
        ) : null}

        {section === "sticker" ? (
          <div className="emoji-picker__sticker-grid" role="listbox" aria-label="Stickers">
            {filteredStickers.map((st) => (
              <button
                key={st.id}
                type="button"
                className="emoji-picker__sticker"
                onClick={() => {
                  onStickerSelect?.(st);
                  onClose();
                }}
                aria-label={st.label}
              >
                <img
                  src={st.imageUrl}
                  alt=""
                  className="emoji-picker__sticker-img"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
            {filteredStickers.length === 0 ? (
              <p className="emoji-picker__empty">No stickers found</p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="emoji-picker__sections" role="tablist" aria-label="Picker type">
        {visibleSections.map((s) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={section === s.id}
            className={`emoji-picker__section ${section === s.id ? "emoji-picker__section--active" : ""}`}
            onClick={() => {
              setSection(s.id);
              setQuery("");
            }}
            title={s.label}
          >
            {s.Icon ? <s.Icon size={18} /> : s.iconEmoji}
            <span className="emoji-picker__section-label">{s.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

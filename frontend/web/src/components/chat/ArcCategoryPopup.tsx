import { createPortal } from "react-dom";
import type { ChatCategory } from "@/utils/chatTypes";
import { CHAT_CATEGORIES } from "@/utils/chatTypes";

const CAT_SHORT: Record<string, string> = {
  all: "ALL",
  private: "Chats",
  groups: "Groups",
  channels: "Chan.",
};

// Base arc positions relative to button centre (px), R = 80.
// Direction is auto-detected at open time from button's screen position.
const ARC_UP: { x: number; y: number }[] = [
  { x: -69, y: -40 }, // 150°
  { x: -40, y: -69 }, // 120°
  { x:  40, y: -69 }, //  60°
  { x:  69, y: -40 }, //  30°
];
const ARC_RIGHT: { x: number; y: number }[] = [
  { x: 51, y: -61 }, //  50°
  { x: 77, y: -23 }, //  17°
  { x: 77, y:  23 }, // -17°
  { x: 51, y:  61 }, // -50°
];
// Mobile bottom-nav: straight vertical column directly above the button
const VERTICAL_UP: { x: number; y: number }[] = [
  { x: 0, y:  -65 },
  { x: 0, y: -130 },
  { x: 0, y: -195 },
  { x: 0, y: -260 },
];

function CatIcon({ id }: { id: string }) {
  if (id === "all") return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
  if (id === "private") return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
  if (id === "groups") return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3"/>
      <circle cx="17" cy="9" r="2.5"/>
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/>
      <path d="M18 14c2 0 4 1.3 4 4"/>
    </svg>
  );
  if (id === "channels") return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 8.5a10 10 0 0 1 0 7"/>
      <path d="M18.4 10a5 5 0 0 1 0 4"/>
      <path d="M3 11v2l11 5V6L3 11z"/>
    </svg>
  );
  return null;
}

interface Props {
  rect: DOMRect;
  activeCategory: ChatCategory;
  hoveredId?: string | null;
  onSelect: (cat: ChatCategory) => void;
  onClose: () => void;
}

export function ArcCategoryPopup({ rect, activeCategory, hoveredId, onSelect, onClose }: Props) {
  const isMobileBottomNav =
    window.innerWidth <= 768 && rect.top > window.innerHeight * 0.55;
  const direction: "up" | "right" = rect.bottom > window.innerHeight * 0.55 ? "up" : "right";
  const base = isMobileBottomNav ? VERTICAL_UP : direction === "up" ? ARC_UP : ARC_RIGHT;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const half = 26; // half of 52px circle

  // Shift the entire arc horizontally if items would clip off screen edges
  let shiftX = 0;
  if (!isMobileBottomNav && direction === "up") {
    const margin = 10;
    const minLeft = Math.min(...base.map(p => cx - half + p.x));
    const maxRight = Math.max(...base.map(p => cx + half + p.x));
    if (minLeft < margin) shiftX = margin - minLeft;
    else if (maxRight > window.innerWidth - margin) shiftX = window.innerWidth - margin - maxRight;
  }

  const positions = shiftX !== 0 ? base.map(p => ({ x: p.x + shiftX, y: p.y })) : base;

  return createPortal(
    <>
      <div className="arc-cat-backdrop" onClick={onClose} />
      {CHAT_CATEGORIES.map((cat, i) => {
        const pos = positions[i];
        const isActive = cat.id === activeCategory;
        const isHovered = hoveredId === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            data-arc-cat-id={cat.id}
            className={[
              "arc-cat-item",
              isActive ? "arc-cat-item--active" : "",
              isHovered && !isActive ? "arc-cat-item--hovered" : "",
            ].filter(Boolean).join(" ")}
            style={{
              left: cx - half,
              top: cy - half,
              "--ax": `${pos.x}px`,
              "--ay": `${pos.y}px`,
              animationDelay: `${i * 50}ms`,
            } as React.CSSProperties}
            onClick={() => { onSelect(cat.id as ChatCategory); onClose(); }}
          >
            <CatIcon id={cat.id} />
            <span className="arc-cat-item__label">{CAT_SHORT[cat.id] ?? cat.label}</span>
          </button>
        );
      })}
    </>,
    document.body,
  );
}

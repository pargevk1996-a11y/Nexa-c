import { memo, useCallback, useRef, useState } from "react";
import type { Conversation } from "@/types";
import type { ChatMenuAction } from "@/components/chat/ChatContextMenu";
import { ChatContextMenu } from "@/components/chat/ChatContextMenu";
import { Avatar } from "@/components/ui/Avatar";
import { ChatTypeBadge } from "@/components/chat/ChatTypeBadge";
import { resolveChatType, SAVED_MESSAGES_ID } from "@/utils/chatTypes";

// ── Inline micro-icons ───────────────────────────────────────────────────────

function IcoLock() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="11" width="18" height="11" rx="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  );
}
function IcoMute() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M5.889 16H2a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1h3.889l5.294-4.332A.5.5 0 0 1 12 4.02V11.5L5.889 16z"/>
      <line x1="1" y1="1" x2="23" y2="23" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}
function IcoPin() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.363 3.256c.782-.782 2.046-.782 2.828 0l2.553 2.553c.782.782.782 2.046 0 2.828L17.5 11.88a1 1 0 0 1-.316.212l-3.534 1.413-2.12 2.12a1 1 0 0 1-1.415-1.414l.707-.707-2.828-2.829-.707.707a1 1 0 0 1-1.415-1.414l2.121-2.121 1.413-3.535a1 1 0 0 1 .212-.316l3.745-3.74z"/>
      <path d="M3 21l4.5-4.5" strokeLinecap="round" strokeWidth="2" stroke="currentColor" fill="none"/>
    </svg>
  );
}
function IcoCheckCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12"/>
      <polyline points="15 6 9 17 4 12" opacity="0.45"/>
    </svg>
  );
}
function IcoCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}
function IcoArchive() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="21 8 21 21 3 21 3 8"/>
      <rect x="1" y="3" width="22" height="5"/>
      <line x1="10" y1="12" x2="14" y2="12"/>
    </svg>
  );
}
function IcoTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14H6L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4h6v2"/>
    </svg>
  );
}
function IcoMuteAction() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M11 5 6 9H2v6h4l5 4V5z"/>
      <line x1="23" y1="9" x2="17" y2="15"/>
      <line x1="17" y1="9" x2="23" y2="15"/>
    </svg>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ChatConvItemProps {
  conversation: Conversation;
  isActive: boolean;
  draft?: string;
  onSelect: (id: string) => void;
  onAction: (c: Conversation, action: ChatMenuAction) => void;
  tabIndex?: number;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export const ChatConvItem = memo(function ChatConvItem({
  conversation: c,
  isActive,
  draft,
  onSelect,
  onAction,
  tabIndex = 0,
  onKeyDown,
}: ChatConvItemProps) {
  const type = resolveChatType(c);
  const isSaved = c.id === SAVED_MESSAGES_ID;
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  // Refs for direct DOM swipe manipulation (avoids per-pixel re-renders)
  const wrapRef = useRef<HTMLDivElement>(null);
  const touch = useRef({
    startX: 0,
    startY: 0,
    curX: 0,
    tracking: false,
    decided: false,
    isHoriz: false,
  });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ariaLabel = [
    c.name,
    c.typing ? "typing" : null,
    draft ? "has draft" : null,
    c.unread > 0 ? `${c.unread} unread` : null,
    c.isSecret || c.isSuperSecret ? "end-to-end encrypted" : null,
    c.online && type !== "channel" ? "online" : null,
    (c as any).muted ? "muted" : null,
    c.pinned ? "pinned" : null,
  ]
    .filter(Boolean)
    .join(", ");

  // ── Swipe via direct DOM transforms ────────────────────────────────────────

  const applySwipeX = (dx: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const clamped = Math.max(-120, Math.min(120, dx));
    el.style.transform = `translateX(${clamped}px)`;
    const leftBg = el.querySelector<HTMLElement>(".ci-swipe-bg--left");
    const rightBg = el.querySelector<HTMLElement>(".ci-swipe-bg--right");
    if (leftBg) {
      leftBg.style.opacity = clamped > 0 ? String(Math.min(clamped / 80, 1)) : "0";
      leftBg.classList.toggle("ci-swipe-bg--primed", clamped >= 80);
    }
    if (rightBg) {
      rightBg.style.opacity = clamped < 0 ? String(Math.min(-clamped / 80, 1)) : "0";
      rightBg.classList.toggle("ci-swipe-bg--primed", clamped <= -80);
    }
  };

  const resetSwipe = (commit?: "archive" | "delete") => {
    const el = wrapRef.current;
    if (el) {
      el.style.transition = "transform 200ms ease-out";
      el.style.transform = "translateX(0)";
      setTimeout(() => {
        if (el) el.style.transition = "";
      }, 220);
      const leftBg = el.querySelector<HTMLElement>(".ci-swipe-bg--left");
      const rightBg = el.querySelector<HTMLElement>(".ci-swipe-bg--right");
      if (leftBg) { leftBg.style.opacity = "0"; leftBg.classList.remove("ci-swipe-bg--primed"); }
      if (rightBg) { rightBg.style.opacity = "0"; rightBg.classList.remove("ci-swipe-bg--primed"); }
    }
    if (commit === "archive") onAction(c, { type: c.archived ? "unarchive" : "archive" });
    if (commit === "delete") onAction(c, { type: "delete", scope: "me" });
  };

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    touch.current = { startX: t.clientX, startY: t.clientY, curX: t.clientX, tracking: true, decided: false, isHoriz: false };
    longPressTimer.current = setTimeout(() => {
      if (!touch.current.isHoriz) setMenu({ x: t.clientX, y: t.clientY });
    }, 480);
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touch.current.tracking || e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touch.current.startX;
    const dy = t.clientY - touch.current.startY;

    if (!touch.current.decided && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      touch.current.decided = true;
      touch.current.isHoriz = Math.abs(dx) > Math.abs(dy) * 1.5;
      if (touch.current.isHoriz) {
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      }
    }

    if (touch.current.isHoriz) {
      touch.current.curX = t.clientX;
      applySwipeX(dx);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onTouchEnd = useCallback(() => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!touch.current.tracking) return;
    touch.current.tracking = false;
    if (!touch.current.isHoriz) return;
    const dx = touch.current.curX - touch.current.startX;
    if (dx >= 80) resetSwipe("archive");
    else if (dx <= -80) resetSwipe("delete");
    else resetSwipe();
  }, [c, onAction]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Context menu ──────────────────────────────────────────────────────────

  const openContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const muted = (c as any).muted as boolean | undefined;
  const lastStatus = (c as any).lastMessageStatus as "sent" | "delivered" | "read" | undefined;

  return (
    <div
      className="ci-wrap"
      ref={wrapRef}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Swipe reveal backgrounds */}
      <div className="ci-swipe-bg ci-swipe-bg--left" aria-hidden>
        <IcoArchive />
        <span>{c.archived ? "Unarchive" : "Archive"}</span>
      </div>
      <div className="ci-swipe-bg ci-swipe-bg--right" aria-hidden>
        <IcoTrash />
        <span>Delete</span>
      </div>

      <button
        type="button"
        className={[
          "chat-conv-item",
          isActive ? "chat-conv-item--active" : "",
          type === "secret" ? "chat-conv-item--secret" : "",
          type === "channel" ? "chat-conv-item--channel" : "",
          c.archived ? "chat-conv-item--archived" : "",
          c.hidden ? "chat-conv-item--hidden" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => onSelect(c.id)}
        onContextMenu={openContextMenu}
        aria-label={ariaLabel}
        aria-current={isActive ? "page" : undefined}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
      >
        {/* Avatar + muted overlay */}
        <div className="ci-av">
          <Avatar
            name={c.name}
            online={c.online && type !== "channel"}
          />
          {muted ? (
            <span className="ci-av__muted" aria-hidden>
              <IcoMute />
            </span>
          ) : null}
        </div>

        {/* Body */}
        <div className="chat-conv-item__body">
          <div className="chat-conv-item__name">
            <ChatTypeBadge conversation={c} />
            {!isSaved && (c.isSecret || c.isSuperSecret) ? (
              <span className="ci-e2e" aria-hidden>
                <IcoLock />
              </span>
            ) : null}
            <span className="privacy-no-copy">{c.name}</span>
            {c.username ? (
              <span className="chat-conv-item__username">@{c.username}</span>
            ) : null}
            {c.memberCount && c.memberCount > 0 ? (
              <span className="chat-conv-item__members">{c.memberCount.toLocaleString()}</span>
            ) : null}
          </div>

          <div
            className={`chat-conv-item__preview${c.typing ? " chat-conv-item__preview--typing" : ""}`}
          >
            {c.typing ? (
              <>
                typing
                <span className="chat-conv-item__typing-dots" aria-hidden>
                  <span /><span /><span />
                </span>
              </>
            ) : draft ? (
              <>
                <span className="chat-conv-item__draft">Draft:</span>
                {" "}{draft}
              </>
            ) : (
              c.lastMessage
            )}
          </div>
        </div>

        {/* Meta */}
        <div className="chat-conv-item__meta">
          <span className="chat-conv-item__time">{c.lastAt}</span>
          {c.unread > 0 ? (
            <span className={`chat-unread${muted ? " chat-unread--muted" : ""}`} aria-label={`${c.unread} unread`}>
              {c.unread > 99 ? "99+" : c.unread}
            </span>
          ) : lastStatus === "read" ? (
            <span className="ci-receipt ci-receipt--read"><IcoCheckCheck /></span>
          ) : lastStatus === "delivered" ? (
            <span className="ci-receipt ci-receipt--delivered"><IcoCheckCheck /></span>
          ) : lastStatus === "sent" ? (
            <span className="ci-receipt"><IcoCheck /></span>
          ) : null}
          {c.pinned ? (
            <span className="ci-pin" aria-hidden><IcoPin /></span>
          ) : null}
        </div>

        {/* Desktop hover quick actions */}
        <div className="ci-hover-actions" aria-hidden>
          <button
            type="button"
            className="ci-hover-btn"
            title={c.archived ? "Unarchive" : "Archive"}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onAction(c, { type: c.archived ? "unarchive" : "archive" }); }}
          >
            <IcoArchive />
          </button>
          {!isSaved && (
            <button
              type="button"
              className="ci-hover-btn"
              title="Mute"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); /* mute not yet on backend — fire hide as fallback */ onAction(c, { type: "hide" }); }}
            >
              <IcoMuteAction />
            </button>
          )}
          {!isSaved && (
            <button
              type="button"
              className="ci-hover-btn ci-hover-btn--danger"
              title="Delete"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onAction(c, { type: "delete", scope: "me" }); }}
            >
              <IcoTrash />
            </button>
          )}
        </div>
      </button>

      {menu ? (
        <ChatContextMenu
          conversation={c}
          position={menu}
          onClose={() => setMenu(null)}
          onAction={(action) => { onAction(c, action); setMenu(null); }}
        />
      ) : null}
    </div>
  );
});

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSettings } from "@/store/SettingsContext";
import { NavLink, useNavigate } from "react-router-dom";
import {
  IconBell,
  IconCalls,
  IconChats,
  IconContacts,
  IconProfile,
  IconSearch,
  IconSettings,
  IconX,
} from "@/components/icons/Icons";
import { useLock } from "@/store/LockContext";

/* ── FAB speed-dial ─────────────────────────────────────────────────────── */
function CategoryIcon({ id }: { id: string }) {
  if (id === "all") return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  );
  if (id === "groups") return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3"/><circle cx="17" cy="9" r="2.5"/>
      <path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><path d="M18 14c2 0 4 1.3 4 4"/>
    </svg>
  );
  if (id === "private") return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
  if (id === "channels") return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 8.5a10 10 0 0 1 0 7M18.4 10a5 5 0 0 1 0 4"/>
      <path d="M3 11v2l11 5V6L3 11z"/>
    </svg>
  );
  return null;
}

function FabSpeedDial({ onContact, onGroup, onChannel }: {
  onContact: () => void;
  onGroup: () => void;
  onChannel: () => void;
}) {
  const [open, setOpen] = useState(false);

  const options = [
    {
      label: "Add contact",
      onClick: onContact,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
          <line x1="19" y1="8" x2="19" y2="14" />
          <line x1="16" y1="11" x2="22" y2="11" />
        </svg>
      ),
    },
    {
      label: "Create group",
      onClick: onGroup,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      label: "Create channel",
      onClick: onChannel,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="2"/>
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49"/>
          <path d="M7.76 16.24a6 6 0 0 1 0-8.49"/>
          <path d="M20.07 3.93a10 10 0 0 1 0 16.14"/>
          <path d="M3.93 20.07a10 10 0 0 1 0-16.14"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="chat-fab-wrap">
      {/* Blur backdrop */}
      {open && (
        <div
          className="chat-fab-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      {/* Speed-dial row */}
      <div className={`chat-fab-options${open ? " chat-fab-options--open" : ""}`} aria-hidden={!open}>
        {options.map((opt, i) => (
          <button
            key={opt.label}
            type="button"
            className="chat-fab-option"
            style={{ transitionDelay: open ? `${i * 45}ms` : `${(options.length - 1 - i) * 30}ms` }}
            tabIndex={open ? 0 : -1}
            onClick={() => { setOpen(false); opt.onClick(); }}
            aria-label={opt.label}
          >
            <span className="chat-fab-option__icon">{opt.icon}</span>
            <span className="chat-fab-option__label">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Main FAB */}
      <button
        type="button"
        className={`chat-fab-btn${open ? " chat-fab-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close" : "New conversation"}
        aria-expanded={open}
      >
        <svg
          className="chat-fab-btn__icon"
          width="22" height="22" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
    </div>
  );
}
import { features } from "@/features/registry";
import { LogoThemeToggle } from "@/components/layout/LogoThemeToggle";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ArcCategoryPopup } from "@/components/chat/ArcCategoryPopup";
import { getCachedSession } from "@/api/auth";
import { listIncomingRequests } from "@/api/contacts";
import {
  CHAT_CATEGORIES,
  sortChatList,
  type ChatCategory,
  type ChatFolderId,
} from "@/utils/chatTypes";
import type { Conversation } from "@/types";
import type { ChatMenuAction } from "@/components/chat/ChatContextMenu";


function ChatsCycleButton({
  category,
  onCategoryChange,
}: {
  category: ChatCategory;
  onCategoryChange: (c: ChatCategory) => void;
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  const [hoveredArcId, setHoveredArcId] = useState<string | null>(null);
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchActiveRef = useRef(false);
  const popupOpenRef = useRef(false); // mirrors popupOpen for use in callbacks
  const activeArcItemRef = useRef<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const buttonRectRef = useRef<DOMRect | null>(null);

  const ids = useMemo(() => CHAT_CATEGORIES.map((c) => c.id), []);

  const cancelTimer = useCallback(() => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
  }, []);

  const closePopup = useCallback(() => {
    popupOpenRef.current = false;
    activeArcItemRef.current = null;
    setHoveredArcId(null);
    setPopupOpen(false);
  }, []);

  const startHoldTimer = useCallback(() => {
    cancelTimer();
    holdRef.current = setTimeout(() => {
      holdRef.current = null;
      if (buttonRef.current) {
        buttonRectRef.current = buttonRef.current.getBoundingClientRect();
      }
      popupOpenRef.current = true;
      setPopupOpen(true);
      navigator.vibrate?.(25);
    }, 900);
  }, [cancelTimer]);

  // ── Mobile touch ─────────────────────────────────────────────────────────
  const handleTouchStart = useCallback(() => {
    touchActiveRef.current = true;
    startHoldTimer();
  }, [startHoldTimer]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (popupOpenRef.current) {
      // Detect which arc circle is under the finger
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const arcEl = el?.closest?.("[data-arc-cat-id]");
      const id = arcEl?.getAttribute?.("data-arc-cat-id") ?? null;
      if (id !== activeArcItemRef.current) {
        activeArcItemRef.current = id;
        setHoveredArcId(id);
      }
      return;
    }
    cancelTimer();
  }, [cancelTimer]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (popupOpenRef.current) {
      // Release while popup open → select hovered item (if any) and close
      const selectedId = activeArcItemRef.current;
      closePopup();
      setTimeout(() => { touchActiveRef.current = false; }, 500);
      if (selectedId) onCategoryChange(selectedId as ChatCategory);
      return;
    }
    const wasQuickTap = holdRef.current !== null;
    cancelTimer();
    setTimeout(() => { touchActiveRef.current = false; }, 500);
    if (!wasQuickTap) return;
    e.preventDefault();
    const idx = ids.indexOf(category);
    onCategoryChange(ids[(idx + 1) % ids.length]);
  }, [closePopup, cancelTimer, ids, category, onCategoryChange]);

  // ── Desktop mouse ─────────────────────────────────────────────────────────
  const handleMouseDown = useCallback(() => {
    if (touchActiveRef.current) return;
    startHoldTimer();
  }, [startHoldTimer]);

  const handleMouseLeave = useCallback(() => {
    if (!touchActiveRef.current) cancelTimer();
  }, [cancelTimer]);

  const handleClick = useCallback(() => {
    if (touchActiveRef.current) return;
    if (holdRef.current === null) return;
    cancelTimer();
    const idx = ids.indexOf(category);
    onCategoryChange(ids[(idx + 1) % ids.length]);
  }, [cancelTimer, ids, category, onCategoryChange]);

  const catLabel = CAT_LABEL[category] ?? "ALL";

  return (
    <div className="chat-nav-cat-wrap">
      {popupOpen && buttonRectRef.current && (
        <ArcCategoryPopup
          rect={buttonRectRef.current}
          activeCategory={category}
          hoveredId={hoveredArcId}
          onSelect={onCategoryChange}
          onClose={closePopup}
        />
      )}
      <button
        ref={buttonRef}
        type="button"
        className={`chat-left-panel__app-nav-item chat-left-panel__app-nav-item--always-active${popupOpen ? " chat-left-panel__app-nav-item--active" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onClick={handleClick}
        aria-label={`Filter: ${catLabel}`}
        aria-haspopup="menu"
        aria-expanded={popupOpen}
      >
        <span className="chat-left-panel__nav-icon-wrap">
          <IconChats size={18} />
        </span>
        <span>{catLabel}</span>
      </button>
    </div>
  );
}

interface ChatLeftPanelProps {
  loading?: boolean;
  savedConversation: Conversation | null;
  conversations: Conversation[];
  hiddenConversations: Conversation[];
  archivedConversations: Conversation[];
  activeId: string | null;
  search: string;
  onSearchChange: (q: string) => void;
  category: ChatCategory;
  onCategoryChange: (c: ChatCategory) => void;
  folder: ChatFolderId | "all";
  onFolderChange: (f: ChatFolderId | "all") => void;
  onSelect: (id: string) => void;
  onChatMenuAction: (conversation: Conversation, action: ChatMenuAction) => void;
  onCreateGroup: () => void;
  drafts: Record<string, string>;
}

const APP_NAV = [
  { to: "/app/contacts", label: "Contacts", Icon: IconContacts },
  { to: "/app/calls", label: "Calls", Icon: IconCalls },
  { to: "/app/profile", label: "Profile", Icon: IconProfile },
  { to: "/app/settings", label: "Settings", Icon: IconSettings },
] as const;

const CAT_LABEL: Record<string, string> = {
  all: "ALL",
  private: "Chats",
  groups: "Groups",
  channels: "Channels",
};

export function ChatLeftPanel({
  loading,
  savedConversation,
  conversations,
  hiddenConversations,
  archivedConversations,
  activeId,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  folder,
  onFolderChange: _onFolderChange,
  onSelect,
  onChatMenuAction,
  onCreateGroup,
  drafts,
}: ChatLeftPanelProps) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { lockSession } = useLock();
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const openSearch = () => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const closeSearch = () => {
    setSearchOpen(false);
    onSearchChange("");
  };

  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    const s = getCachedSession();
    if (!s?.user?.id || s?.demoMode) return;
    listIncomingRequests()
      .then((list) => setPendingRequestCount(list.length))
      .catch(() => {});
  }, []);

  // Two-finger horizontal swipe cycles the All / Groups / Channels filter.
  // Disabled when showNavButtons is on (pills are visible instead).
  useEffect(() => {
    if (typeof window === "undefined" || settings.showNavButtons) return;
    let startX = 0;
    let lastX = 0;
    let two = false;
    const mid = (e: TouchEvent) => (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const onStart = (e: TouchEvent) => {
      // Don't react to gestures that happen inside an open chat — the chat has
      // its own two-finger gesture (the scheduler), and category cycling here
      // must not be triggered by it.
      if (window.innerWidth > 768 || (e.target as HTMLElement | null)?.closest(".chat-main")) {
        two = false;
        return;
      }
      two = e.touches.length === 2;
      if (two) startX = lastX = mid(e);
    };
    const onMove = (e: TouchEvent) => {
      if (two && e.touches.length === 2) lastX = mid(e);
    };
    const onEnd = () => {
      if (!two) return;
      two = false;
      const dx = lastX - startX;
      if (Math.abs(dx) < 50) return;
      const ids = CHAT_CATEGORIES.map((c) => c.id);
      const idx = ids.indexOf(category);
      const next = ((dx < 0 ? idx + 1 : idx - 1) + ids.length) % ids.length;
      onCategoryChange(ids[next]);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [category, onCategoryChange, settings.showNavButtons]);

  const effectiveSearch = search;

  const pinned = useMemo(
    () => sortChatList(conversations.filter((c) => c.pinned), drafts),
    [conversations, drafts],
  );
  const regular = useMemo(
    () => sortChatList(conversations.filter((c) => !c.pinned), drafts),
    [conversations, drafts],
  );

  return (
    <aside className="chat-left-panel glass-panel" aria-label="Chat list">
      {/* Faint NEXA logo + wordmark watermark behind the chat list */}
      <div className="chat-left-panel__watermark" aria-hidden>
        <span className="chat-left-panel__watermark-mark" />
        <span className="chat-left-panel__watermark-text">NEXA</span>
      </div>
      <header className="chat-left-panel__head">
        <div className={`chat-left-panel__title-row${searchOpen ? " chat-left-panel__title-row--searching" : ""}`}>
          {/* Mobile: icon button that opens the search field */}
          <button
            type="button"
            className="chat-left-panel__search-toggle"
            onClick={openSearch}
            aria-label="Search chats"
          >
            <IconSearch size={20} />
          </button>

          {/* Search field — always in DOM for controlled value; CSS shows/hides per breakpoint */}
          <label className="chat-left-panel__search">
            <IconSearch size={18} className="chat-left-panel__search-icon" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search chats"
              onBlur={(e) => {
                // If focus moved to the close button let its onClick handle it;
                // otherwise, collapse back to icon when the field is empty
                // (covers: keyboard dismissed, tapped outside, etc.).
                if (e.relatedTarget?.classList.contains("chat-left-panel__search-close")) return;
                if (!search) closeSearch();
              }}
            />
            {/* Mobile close button — inside the field, right side */}
            <button
              type="button"
              className="chat-left-panel__search-close"
              onClick={closeSearch}
              aria-label="Close search"
            >
              <IconX size={16} />
            </button>
          </label>

          <div className="chat-left-panel__head-actions">
            {/* Saved Messages shortcut — right of search, left of the bell. */}
            <button
              type="button"
              className="chat-left-panel__head-btn chat-left-panel__head-btn--saved"
              onClick={() => savedConversation && onSelect(savedConversation.id)}
              aria-label="Saved Messages"
              title="Saved Messages"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            <button
              type="button"
              className="chat-left-panel__head-btn"
              aria-label="Notifications"
              title="Notifications"
            >
              <IconBell size={18} />
            </button>
            <button
              type="button"
              className="chat-left-panel__head-btn"
              aria-label="Lock"
              title="Lock"
              onClick={() => void lockSession()}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </button>
            {/* Logo (day/night toggle) sits to the RIGHT of the lock button. */}
            <LogoThemeToggle size={30} className="chat-left-panel__head-logo" />
          </div>
        </div>
      </header>


      <ChatSidebar
        loading={loading}
        savedConversation={savedConversation}
        pinnedConversations={pinned}
        conversations={regular}
        archivedConversations={archivedConversations}
        hiddenConversations={hiddenConversations}
        activeId={activeId}
        search={effectiveSearch}
        category={category}
        folder={folder}
        onSelect={onSelect}
        onChatMenuAction={onChatMenuAction}
        drafts={drafts}
      />

      <div className="chat-left-panel__fab-zone">
        <FabSpeedDial
          onContact={() => navigate("/app/contacts")}
          onGroup={onCreateGroup}
          onChannel={() => navigate("/app/contacts?v=channel")}
        />
      </div>

      <nav className="chat-left-panel__app-nav" aria-label="App">
        <ChatsCycleButton
          category={category}
          onCategoryChange={onCategoryChange}
        />
        {APP_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `chat-left-panel__app-nav-item ${isActive ? "chat-left-panel__app-nav-item--active" : ""}`
            }
            title={item.label}
          >
            <span className="chat-left-panel__nav-icon-wrap">
              <item.Icon size={18} />
              {item.label === "Contacts" && pendingRequestCount > 0 && (
                <span className="chat-left-panel__nav-badge">{pendingRequestCount}</span>
              )}
            </span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

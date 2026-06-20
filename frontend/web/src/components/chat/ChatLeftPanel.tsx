import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  IconBell,
  IconCalls,
  IconChats,
  IconContacts,
  IconLock,
  IconProfile,
  IconSearch,
  IconSettings,
  IconX,
} from "@/components/icons/Icons";

/* ── FAB speed-dial ─────────────────────────────────────────────────────── */
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
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.9 9.77 19.79 19.79 0 0 1 1.88 1.2 2 2 0 0 1 3.86.02h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 7.91a16 16 0 0 0 6.08 6.08l1.25-1.25a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
          <line x1="16" y1="2" x2="22" y2="2" />
          <line x1="19" y1="-1" x2="19" y2="5" />
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
import { useLock } from "@/store/LockContext";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
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
import { StoryPeek } from "@/components/stories/StoryPeek";

interface ChatLeftPanelProps {
  loading?: boolean;
  savedConversation: Conversation | null;
  conversations: Conversation[];
  hiddenConversations: Conversation[];
  activeId: string | null;
  search: string;
  onSearchChange: (q: string) => void;
  category: ChatCategory;
  onCategoryChange: (c: ChatCategory) => void;
  folder: ChatFolderId | "all";
  onFolderChange: (f: ChatFolderId | "all") => void;
  pinUnlocked: boolean;
  onSelect: (id: string) => void;
  onChatMenuAction: (conversation: Conversation, action: ChatMenuAction) => void;
  onCreateGroup: () => void;
  drafts: Record<string, string>;
}

const APP_NAV = [
  { to: "/app/chats", label: "Chats", Icon: IconChats },
  { to: "/app/contacts", label: "Contacts", Icon: IconContacts },
  { to: "/app/calls", label: "Calls", Icon: IconCalls },
  { to: "/app/profile", label: "Profile", Icon: IconProfile },
  { to: "/app/settings", label: "Settings", Icon: IconSettings },
] as const;

export function ChatLeftPanel({
  loading,
  savedConversation,
  conversations,
  hiddenConversations,
  activeId,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  folder,
  onFolderChange: _onFolderChange,
  pinUnlocked,
  onSelect,
  onChatMenuAction,
  onCreateGroup,
  drafts,
}: ChatLeftPanelProps) {
  const navigate = useNavigate();
  const { lock } = useLock();
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
  // When the in-list "+ create" row scrolls up under the search, surface a
  // compact "+" next to the search so the create action stays reachable.
  const [showHeadAdd, setShowHeadAdd] = useState(false);

  useEffect(() => {
    const s = getCachedSession();
    if (!s?.user?.id || s?.demoMode) return;
    listIncomingRequests()
      .then((list) => setPendingRequestCount(list.length))
      .catch(() => {});
  }, []);

  // Two-finger horizontal swipe cycles the All / Groups / Channels filter
  // (the visible pills are hidden on mobile).
  useEffect(() => {
    if (typeof window === "undefined") return;
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
      const next = dx < 0 ? idx + 1 : idx - 1;
      if (next >= 0 && next < ids.length) onCategoryChange(ids[next]);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [category, onCategoryChange]);

  // Reveal the header "+" once the list is scrolled and the create row goes
  // under the search block.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>(".chat-left-panel .chat-conversations");
    if (!el) return;
    const onScroll = () => setShowHeadAdd(el.scrollTop > 8);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [category]);

  const effectiveSearch = pinUnlocked && search.startsWith("#") ? "" : search;

  const allConversations = useMemo(
    () => (pinUnlocked ? [...conversations, ...hiddenConversations] : conversations),
    [conversations, hiddenConversations, pinUnlocked],
  );

  const pinned = useMemo(
    () => sortChatList(allConversations.filter((c) => c.pinned), drafts),
    [allConversations, drafts],
  );
  const regular = useMemo(
    () => sortChatList(allConversations.filter((c) => !c.pinned), drafts),
    [allConversations, drafts],
  );

  // Context-aware create action per category (drives both the "+" head button
  // and the create row at the top of the list).
  const createMeta =
    category === "groups"
      ? { label: "Create group", onClick: onCreateGroup }
      : category === "channels"
        ? { label: "Create channel", onClick: onCreateGroup }
        : { label: "Add contact", onClick: () => navigate("/app/contacts") };

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
            {/* Category-aware create "+" — appears once the in-list create row
                scrolls under the search. */}
            {showHeadAdd ? (
              <button
                type="button"
                className="chat-left-panel__head-btn chat-left-panel__head-add"
                onClick={createMeta.onClick}
                aria-label={createMeta.label}
                title={createMeta.label}
              >
                +
              </button>
            ) : null}
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
            {/* Manual screen lock — moved here from the removed top bar. */}
            <button
              type="button"
              className="chat-left-panel__head-btn"
              onClick={() => lock("pin_required")}
              aria-label="Lock screen"
              title="Lock screen (PIN required to unlock)"
            >
              <IconLock size={18} />
            </button>
            {/* Logo (day/night toggle) sits to the RIGHT of the lock. */}
            <LogoThemeToggle size={30} className="chat-left-panel__head-logo" />
            <StoryPeek />
          </div>
        </div>
      </header>

      <nav className="chat-folders chat-folders--categories" aria-label="Filter chats">
        {CHAT_CATEGORIES.map((c) => {
          const active = category === c.id;
          const addTitle =
            c.id === "channels" ? "New channel" : c.id === "groups" ? "New group" : "Find contact";
          return (
            <span key={c.id} className="chat-folder-wrap">
              <button
                type="button"
                className={`chat-folder-pill ${active ? "chat-folder-pill--active" : ""}`}
                onClick={() => onCategoryChange(c.id)}
              >
                {c.label}
              </button>
              {active ? (
                <button
                  type="button"
                  className="chat-folder-add"
                  title={addTitle}
                  aria-label={addTitle}
                  onClick={() => (c.id === "all" ? navigate("/app/contacts") : onCreateGroup())}
                >
                  +
                </button>
              ) : null}
            </span>
          );
        })}
      </nav>

      <ChatSidebar
        loading={loading}
        createMeta={createMeta}
        savedConversation={savedConversation}
        pinnedConversations={pinned}
        conversations={regular}
        archivedConversations={[]}
        hiddenConversations={[]}
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

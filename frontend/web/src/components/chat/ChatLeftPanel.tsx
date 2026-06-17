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
} from "@/components/icons/Icons";
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

  const [pendingRequestCount, setPendingRequestCount] = useState(0);

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
  return (
    <aside className="chat-left-panel glass-panel" aria-label="Chat list">
      {/* Faint NEXA logo + wordmark watermark behind the chat list */}
      <div className="chat-left-panel__watermark" aria-hidden>
        <span className="chat-left-panel__watermark-mark" />
        <span className="chat-left-panel__watermark-text">NEXA</span>
      </div>
      <header className="chat-left-panel__head">
        <div className="chat-left-panel__title-row">
          <label className="chat-left-panel__search">
            <IconSearch size={18} className="chat-left-panel__search-icon" />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              aria-label="Search chats"
            />
          </label>
          <div className="chat-left-panel__head-actions">
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

import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  IconCalls,
  IconChats,
  IconContacts,
  IconProfile,
  IconSearch,
  IconSettings,
} from "@/components/icons/Icons";
import { features } from "@/features/registry";
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
  const searchRef = useRef<HTMLInputElement>(null);

  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    const s = getCachedSession();
    if (!s?.user?.id || s?.demoMode) return;
    listIncomingRequests()
      .then((list) => setPendingRequestCount(list.length))
      .catch(() => {});
  }, []);

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
            <StoryPeek />
            <button
              type="button"
              className="chat-left-panel__add-btn"
              onClick={() => navigate("/app/contacts")}
              title="Add contact"
              aria-label="Add contact"
            >
              +
            </button>
          </div>
        </div>
      </header>

      <nav className="chat-folders chat-folders--categories" aria-label="Filter chats">
        {CHAT_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chat-folder-pill ${category === c.id ? "chat-folder-pill--active" : ""}`}
            onClick={() => onCategoryChange(c.id)}
          >
            {c.label}
          </button>
        ))}
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

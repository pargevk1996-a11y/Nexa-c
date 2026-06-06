import { useMemo, useRef } from "react";
import { Link, NavLink } from "react-router-dom";
import { useProfileOptional } from "@/store/ProfileContext";
import { displayName, presenceLine } from "@/utils/presenceText";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import {
  IconCalls,
  IconChats,
  IconContacts,
  IconSearch,
  IconSettings,
} from "@/components/icons/Icons";
import { features } from "@/features/registry";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { Avatar } from "@/components/ui/Avatar";
import { getCachedSession } from "@/api/auth";
import {
  CHAT_CATEGORIES,
  sortChatList,
  type ChatCategory,
  type ChatFolderId,
} from "@/utils/chatTypes";
import type { Conversation } from "@/types";
import type { ChatMenuAction } from "@/components/chat/ChatContextMenu";

interface ChatLeftPanelProps {
  loading?: boolean;
  savedConversation: Conversation | null;
  conversations: Conversation[];
  archivedConversations: Conversation[];
  hiddenConversations: Conversation[];
  activeId: string | null;
  search: string;
  onSearchChange: (q: string) => void;
  category: ChatCategory;
  onCategoryChange: (c: ChatCategory) => void;
  folder: ChatFolderId | "all";
  onFolderChange: (f: ChatFolderId | "all") => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  showHidden: boolean;
  onToggleHidden: () => void;
  archivedCount: number;
  hiddenCount: number;
  onSelect: (id: string) => void;
  onChatMenuAction: (conversation: Conversation, action: ChatMenuAction) => void;
  onCreateGroup: () => void;
}

const APP_NAV = [
  { to: "/app/chats", label: "Chats", Icon: IconChats },
  { to: "/app/contacts", label: "Contacts", Icon: IconContacts },
  { to: "/app/calls", label: "Calls", Icon: IconCalls },
  { to: "/app/settings", label: "Settings", Icon: IconSettings },
] as const;

export function ChatLeftPanel({
  loading,
  savedConversation,
  conversations,
  archivedConversations,
  hiddenConversations,
  activeId,
  search,
  onSearchChange,
  category,
  onCategoryChange,
  folder,
  onFolderChange: _onFolderChange,
  showArchived,
  onToggleArchived,
  showHidden,
  onToggleHidden,
  archivedCount,
  hiddenCount,
  onSelect,
  onChatMenuAction,
  onCreateGroup,
}: ChatLeftPanelProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const session = getCachedSession();
  const myProfile = useProfileOptional()?.profile;
  const meLabel = myProfile ? displayName(myProfile) : session?.user.username ?? "You";
  const mePresence = myProfile ? presenceLine(myProfile) : "Online";

  const pinned = useMemo(
    () => sortChatList(conversations.filter((c) => c.pinned)),
    [conversations],
  );
  const regular = useMemo(
    () => sortChatList(conversations.filter((c) => !c.pinned)),
    [conversations],
  );
  return (
    <aside className="chat-left-panel glass-panel" aria-label="Chat list">
      <header className="chat-left-panel__head">
        <div className="chat-left-panel__title-row">
          <LogoAnimation size={112} />
        </div>
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

      <div className="chat-left-panel__toggles">
        {archivedCount > 0 ? (
          <button
            type="button"
            className="chat-sidebar__archived"
            onClick={onToggleArchived}
            aria-expanded={showArchived}
          >
            <span className="chat-sidebar__archived-icon" aria-hidden>
              📦
            </span>
            {showArchived ? "Hide archived" : "Archived"}
            <span className="chat-sidebar__archived-count">{archivedCount}</span>
          </button>
        ) : null}
        {hiddenCount > 0 ? (
          <button type="button" className="chat-left-panel__archived-toggle" onClick={onToggleHidden}>
            {showHidden ? "Hide hidden chats" : `Hidden (${hiddenCount})`}
          </button>
        ) : null}
      </div>

      <ChatSidebar
        loading={loading}
        savedConversation={savedConversation}
        pinnedConversations={pinned}
        conversations={regular}
        archivedConversations={showArchived ? archivedConversations : []}
        hiddenConversations={showHidden ? hiddenConversations : []}
        activeId={activeId}
        search={search}
        category={category}
        folder={folder}
        onSelect={onSelect}
        onChatMenuAction={onChatMenuAction}
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
            <item.Icon size={18} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <footer className="chat-left-panel__footer">
        <Link to="/app/profile" className="chat-left-panel__profile">
          <Avatar
            name={meLabel}
            size="sm"
            online={myProfile?.is_online}
            avatarUrl={myProfile?.avatar_url}
            animatedUrl={myProfile?.animated_avatar_url}
            avatarKind={myProfile?.avatar_kind}
          />
          <div className="chat-left-panel__profile-text">
            <span className="chat-left-panel__profile-name">{meLabel}</span>
            <span className="chat-left-panel__profile-hint">{mePresence}</span>
          </div>
        </Link>
      </footer>
    </aside>
  );
}

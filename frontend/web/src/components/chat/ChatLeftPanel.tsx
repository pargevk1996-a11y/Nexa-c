import { useMemo, useRef } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
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
  const session = getCachedSession();
  const myProfile = useProfileOptional()?.profile;
  const meLabel = myProfile ? displayName(myProfile) : session?.user.username ?? "You";
  const mePresence = myProfile ? presenceLine(myProfile) : "Online";

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
      <header className="chat-left-panel__head">
        <div className="chat-left-panel__title-row">
          <LogoAnimation size={44} />
          <span className="chat-left-panel__wordmark">NEXA</span>
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

import { memo, useCallback, useMemo, useState } from "react";
import type { ChatMenuAction } from "@/components/chat/ChatContextMenu";
import { ChatContextMenu } from "@/components/chat/ChatContextMenu";
import { ChatTypeBadge } from "@/components/chat/ChatTypeBadge";
import type { Conversation } from "@/types";
import { conversationMatchesSearch } from "@/utils/userSearch";
import type { ChatCategory, ChatFolderId } from "@/utils/chatTypes";
import {
  matchesCategory,
  matchesFolder,
  resolveChatType,
  SAVED_MESSAGES_ID,
  sortChatList,
} from "@/utils/chatTypes";
import { Avatar } from "@/components/ui/Avatar";
import { ChatSidebarSkeleton } from "./ChatSidebarSkeleton";

export type { ChatCategory, ChatFolderId };

interface ChatSidebarProps {
  loading?: boolean;
  savedConversation: Conversation | null;
  pinnedConversations: Conversation[];
  conversations: Conversation[];
  archivedConversations: Conversation[];
  hiddenConversations: Conversation[];
  activeId: string | null;
  search: string;
  category: ChatCategory;
  folder: ChatFolderId | "all";
  onSelect: (id: string) => void;
  onChatMenuAction: (conversation: Conversation, action: ChatMenuAction) => void;
  drafts: Record<string, string>;
  /** Category-aware create entry pinned at the top of the scrollable list. */
  createMeta?: { label: string; onClick: () => void };
}

interface MenuState {
  conversation: Conversation;
  x: number;
  y: number;
}

// memo: the section item lists are useMemo-stable and the handlers are
// useCallback-stable, so opening the context menu (sidebar `menu` state) no
// longer re-renders every conversation button.
const ConvList = memo(function ConvList({
  items,
  activeId,
  onSelect,
  onContextMenu,
  drafts,
}: {
  items: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (c: Conversation, e: React.MouseEvent) => void;
  drafts: Record<string, string>;
}) {
  if (items.length === 0) return null;
  return (
    <>
      {items.map((c) => {
        const type = resolveChatType(c);
        return (
          <button
            key={c.id}
            type="button"
            className={`chat-conv-item ${activeId === c.id ? "chat-conv-item--active" : ""} ${type === "secret" ? "chat-conv-item--secret" : ""} ${type === "channel" ? "chat-conv-item--channel" : ""} ${c.archived ? "chat-conv-item--archived" : ""} ${c.hidden ? "chat-conv-item--hidden" : ""}`}
            onClick={() => onSelect(c.id)}
            onContextMenu={(e) => onContextMenu(c, e)}
          >
            <Avatar name={c.name} online={c.online && type !== "channel"} />
            <div className="chat-conv-item__body">
              <div className="chat-conv-item__name">
                <ChatTypeBadge conversation={c} />
                {c.pinned ? <span className="chat-conv-item__pin" aria-hidden>📌</span> : null}
                {c.favorite ? <span className="chat-conv-item__fav" aria-hidden>★</span> : null}
                <span className="privacy-no-copy">{c.name}</span>
                {c.username ? (
                  <span className="chat-conv-item__username">@{c.username}</span>
                ) : null}
                {c.memberCount && c.memberCount > 0 ? (
                  <span className="chat-conv-item__members">{c.memberCount.toLocaleString()}</span>
                ) : null}
              </div>
              <div
                className={`chat-conv-item__preview ${c.typing ? "chat-conv-item__preview--typing" : ""}`}
              >
                {c.typing ? (
                  <>
                    typing
                    <span className="chat-conv-item__typing-dots" aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                  </>
                ) : drafts[c.id] ? (
                  <>
                    <span className="chat-conv-item__draft">Draft:</span>
                    {" "}{drafts[c.id]}
                  </>
                ) : (
                  c.lastMessage
                )}
              </div>
            </div>
            <div className="chat-conv-item__meta">
              <span className="chat-conv-item__time">{c.lastAt}</span>
              {c.unread > 0 ? (
                <span className="chat-unread" aria-label={`${c.unread} unread`}>
                  {c.unread > 99 ? "99+" : c.unread}
                </span>
              ) : null}
            </div>
          </button>
        );
      })}
    </>
  );
});

function applyFilters(
  list: Conversation[],
  category: ChatCategory,
  folder: ChatFolderId | "all",
  search: string,
  drafts: Record<string, string>,
) {
  return sortChatList(
    list
      .filter((c) => c.id !== SAVED_MESSAGES_ID)
      .filter((c) => matchesCategory(c, category))
      .filter((c) => matchesFolder(c, folder))
      .filter((c) => conversationMatchesSearch(c, search)),
    drafts,
  );
}

export function ChatSidebar({
  loading = false,
  savedConversation,
  pinnedConversations,
  conversations,
  archivedConversations,
  hiddenConversations,
  activeId,
  search,
  category,
  folder,
  onSelect,
  onChatMenuAction,
  drafts,
  createMeta,
}: ChatSidebarProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);

  const showSaved =
    savedConversation &&
    (category === "all" || category === "saved") &&
    conversationMatchesSearch(savedConversation, search);

  const pinned = useMemo(
    () => applyFilters(pinnedConversations, category, folder, search, drafts),
    [pinnedConversations, category, folder, search, drafts],
  );
  const regular = useMemo(
    () => applyFilters(conversations, category, folder, search, drafts),
    [conversations, category, folder, search, drafts],
  );
  const archived = useMemo(
    () => applyFilters(archivedConversations, category, folder, search, drafts),
    [archivedConversations, category, folder, search, drafts],
  );
  const hidden = useMemo(
    () => applyFilters(hiddenConversations, category, folder, search, drafts),
    [hiddenConversations, category, folder, search, drafts],
  );

  const openMenu = useCallback((conversation: Conversation, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ conversation, x: e.clientX, y: e.clientY });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const empty =
    !loading &&
    pinned.length === 0 &&
    regular.length === 0 &&
    archived.length === 0 &&
    hidden.length === 0;

  return (
    <aside className="chat-sidebar">
      <nav className="chat-conversations" aria-label="Chats">
        {loading ? (
          <ChatSidebarSkeleton />
        ) : empty ? (
          <p className="chat-sidebar__empty">
            {search.trim() ? "No matches" : "No chats in this category"}
          </p>
        ) : (
          <>
            {/* Saved Messages no longer listed here — opened via the header
                bookmark button next to search. */}
            {pinned.length > 0 ? (
              <section className="chat-sidebar__section">
                <h3 className="chat-sidebar__section-title">Pinned</h3>
                <ConvList items={pinned} activeId={activeId} onSelect={onSelect} onContextMenu={openMenu} drafts={drafts} />
              </section>
            ) : null}
            {regular.length > 0 ? (
              <section className="chat-sidebar__section">
                {pinned.length > 0 || showSaved ? (
                  <h3 className="chat-sidebar__section-title">Chats</h3>
                ) : null}
                <ConvList items={regular} activeId={activeId} onSelect={onSelect} onContextMenu={openMenu} drafts={drafts} />
              </section>
            ) : null}
            {archived.length > 0 ? (
              <section className="chat-sidebar__section">
                <h3 className="chat-sidebar__section-title">Archived</h3>
                <ConvList items={archived} activeId={activeId} onSelect={onSelect} onContextMenu={openMenu} drafts={drafts} />
              </section>
            ) : null}
            {hidden.length > 0 ? (
              <section className="chat-sidebar__section">
                <h3 className="chat-sidebar__section-title">Hidden</h3>
                <ConvList items={hidden} activeId={activeId} onSelect={onSelect} onContextMenu={openMenu} drafts={drafts} />
              </section>
            ) : null}
          </>
        )}
      </nav>
      {menu ? (
        <ChatContextMenu
          conversation={menu.conversation}
          position={{ x: menu.x, y: menu.y }}
          onClose={closeMenu}
          onAction={(action) => onChatMenuAction(menu.conversation, action)}
        />
      ) : null}
    </aside>
  );
}

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMenuAction } from "@/components/chat/ChatContextMenu";
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
import { ChatSidebarSkeleton } from "./ChatSidebarSkeleton";
import { ChatConvItem } from "./ChatConvItem";

export type { ChatCategory, ChatFolderId };

// ── Props ────────────────────────────────────────────────────────────────────

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
  createMeta?: { label: string; onClick: () => void };
}

// ── Undo snackbar ─────────────────────────────────────────────────────────────

interface PendingDelete {
  conversation: Conversation;
  timerId: ReturnType<typeof setTimeout>;
}

function UndoSnackbar({ name, onUndo }: { name: string; onUndo: () => void }) {
  return (
    <div className="ci-snackbar" role="status" aria-live="polite">
      <span>Deleted <strong>{name}</strong></span>
      <button type="button" className="ci-snackbar__undo" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}

// ── Keyboard-navigable list ───────────────────────────────────────────────────

const ConvList = memo(function ConvList({
  items,
  activeId,
  onSelect,
  onAction,
  drafts,
  focusIdx,
  setFocusIdx,
  baseIdx,
  totalCount,
}: {
  items: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAction: (c: Conversation, action: ChatMenuAction) => void;
  drafts: Record<string, string>;
  focusIdx: number;
  setFocusIdx: (i: number) => void;
  baseIdx: number;
  totalCount: number;
}) {
  if (items.length === 0) return null;

  return (
    <>
      {items.map((c, i) => {
        const globalIdx = baseIdx + i;
        return (
          <ChatConvItem
            key={c.id}
            conversation={c}
            isActive={activeId === c.id}
            draft={drafts[c.id]}
            onSelect={onSelect}
            onAction={onAction}
            tabIndex={focusIdx === globalIdx ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setFocusIdx(Math.min(focusIdx + 1, totalCount - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setFocusIdx(Math.max(focusIdx - 1, 0));
              } else if (e.key === "Enter") {
                onSelect(c.id);
              }
            }}
          />
        );
      })}
    </>
  );
});

// ── Filters ───────────────────────────────────────────────────────────────────

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

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ search, category }: { search: string; category: ChatCategory }) {
  const isSearch = search.trim().length > 0;
  return (
    <div className="ci-empty" role="status">
      <div className="ci-empty__icon" aria-hidden>
        {isSearch ? (
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.35">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
        ) : (
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.3">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </div>
      <p className="ci-empty__title">
        {isSearch ? "No matches" : category === "all" ? "No chats yet" : `No ${category} here`}
      </p>
      {!isSearch && category === "all" ? (
        <p className="ci-empty__hint">Start a conversation to see it here</p>
      ) : null}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

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
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const listRef = useRef<HTMLElement>(null);

  // Focus the right button when focusIdx changes
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const btns = el.querySelectorAll<HTMLButtonElement>(".chat-conv-item");
    btns[focusIdx]?.focus();
  }, [focusIdx]);

  // Intercept delete to show undo snackbar
  const handleAction = useCallback(
    (c: Conversation, action: ChatMenuAction) => {
      if (action.type === "delete") {
        // Cancel any existing pending delete first
        if (pendingDelete) {
          clearTimeout(pendingDelete.timerId);
          onChatMenuAction(pendingDelete.conversation, { type: "delete", scope: "me" });
        }
        const timerId = setTimeout(() => {
          onChatMenuAction(c, action);
          setPendingDelete(null);
        }, 5000);
        setPendingDelete({ conversation: c, timerId });
      } else {
        onChatMenuAction(c, action);
      }
    },
    [pendingDelete, onChatMenuAction],
  );

  const handleUndo = useCallback(() => {
    if (!pendingDelete) return;
    clearTimeout(pendingDelete.timerId);
    setPendingDelete(null);
  }, [pendingDelete]);

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

  // Filter out pending-delete item from rendered lists
  const pendingId = pendingDelete?.conversation.id;
  const filterPending = (list: Conversation[]) =>
    pendingId ? list.filter((c) => c.id !== pendingId) : list;

  const fp = filterPending(pinned);
  const fr = filterPending(regular);
  const fa = filterPending(archived);
  const fh = filterPending(hidden);
  const totalCount = fp.length + fr.length + fa.length + fh.length;

  const empty = !loading && fp.length === 0 && fr.length === 0 && fa.length === 0 && fh.length === 0;

  return (
    <aside className="chat-sidebar">
      <nav
        className="chat-conversations"
        aria-label="Chats"
        ref={listRef}
        data-no-section-swipe
        onKeyDown={(e) => {
          if (e.key === "Escape") (document.activeElement as HTMLElement)?.blur();
        }}
      >
        {createMeta ? (
          <button type="button" className="chat-create-row" onClick={createMeta.onClick}>
            <span className="chat-create-row__avatar" aria-hidden>+</span>
            <span className="chat-create-row__label">{createMeta.label}</span>
          </button>
        ) : null}

        {loading ? (
          <ChatSidebarSkeleton />
        ) : empty ? (
          <EmptyState search={search} category={category} />
        ) : (
          <>
            {fp.length > 0 ? (
              <section className="chat-sidebar__section">
                <h3 className="chat-sidebar__section-title">Pinned</h3>
                <ConvList
                  items={fp} activeId={activeId} onSelect={onSelect} onAction={handleAction}
                  drafts={drafts} focusIdx={focusIdx} setFocusIdx={setFocusIdx}
                  baseIdx={0} totalCount={totalCount}
                />
              </section>
            ) : null}
            {fr.length > 0 ? (
              <section className="chat-sidebar__section">
                {fp.length > 0 || showSaved ? <h3 className="chat-sidebar__section-title">Chats</h3> : null}
                <ConvList
                  items={fr} activeId={activeId} onSelect={onSelect} onAction={handleAction}
                  drafts={drafts} focusIdx={focusIdx} setFocusIdx={setFocusIdx}
                  baseIdx={fp.length} totalCount={totalCount}
                />
              </section>
            ) : null}
            {fa.length > 0 ? (
              <section className="chat-sidebar__section">
                <h3 className="chat-sidebar__section-title">Archived</h3>
                <ConvList
                  items={fa} activeId={activeId} onSelect={onSelect} onAction={handleAction}
                  drafts={drafts} focusIdx={focusIdx} setFocusIdx={setFocusIdx}
                  baseIdx={fp.length + fr.length} totalCount={totalCount}
                />
              </section>
            ) : null}
            {fh.length > 0 ? (
              <section className="chat-sidebar__section">
                <h3 className="chat-sidebar__section-title">Hidden</h3>
                <ConvList
                  items={fh} activeId={activeId} onSelect={onSelect} onAction={handleAction}
                  drafts={drafts} focusIdx={focusIdx} setFocusIdx={setFocusIdx}
                  baseIdx={fp.length + fr.length + fa.length} totalCount={totalCount}
                />
              </section>
            ) : null}
          </>
        )}
      </nav>

      {/* Undo snackbar */}
      {pendingDelete ? (
        <UndoSnackbar name={pendingDelete.conversation.name} onUndo={handleUndo} />
      ) : null}
    </aside>
  );
}

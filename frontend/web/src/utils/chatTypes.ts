import type { Conversation } from "@/types";

export type ChatType =
  | "private"
  | "secret"
  | "group"
  | "supergroup"
  | "channel"
  | "saved";

export type ChatCategory =
  | "all"
  | "private"
  | "secret"
  | "groups"
  | "channels"
  | "saved";

export type ChatFolderId = "personal" | "work" | "groups" | "channels" | "unread";

export const SAVED_MESSAGES_ID = "saved";

export const CHAT_CATEGORIES: { id: ChatCategory; label: string }[] = [
  { id: "all",      label: "All" },
  { id: "groups",   label: "Groups" },
  { id: "channels", label: "Channels" },
];

export const CHAT_FOLDERS: { id: ChatFolderId; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "work", label: "Work" },
  { id: "groups", label: "Teams" },
  { id: "channels", label: "Channels" },
];

const TYPE_META: Record<
  ChatType,
  { label: string; short: string; icon: string; className: string }
> = {
  private: { label: "Private chat", short: "Private", icon: "💬", className: "chat-type--private" },
  secret: { label: "Secret chat", short: "Secret", icon: "🔒", className: "chat-type--secret" },
  group: { label: "Group", short: "Group", icon: "👥", className: "chat-type--group" },
  supergroup: { label: "Supergroup", short: "Super", icon: "👥", className: "chat-type--supergroup" },
  channel: { label: "Channel", short: "Channel", icon: "📢", className: "chat-type--channel" },
  saved: { label: "Saved Messages", short: "Saved", icon: "🔖", className: "chat-type--saved" },
};

export function resolveChatType(c: Conversation): ChatType {
  if (c.id === SAVED_MESSAGES_ID || c.chatType === "saved") return "saved";
  if (c.isSecret || c.chatType === "secret") return "secret";
  if (c.chatType === "channel" || c.isChannel) return "channel";
  if (c.chatType === "supergroup" || c.isSupergroup) return "supergroup";
  if (c.chatType === "group" || c.isGroup) return "group";
  if (c.chatType === "private") return "private";
  return "private";
}

export function getChatTypeMeta(c: Conversation) {
  return TYPE_META[resolveChatType(c)];
}

export function matchesCategory(c: Conversation, category: ChatCategory): boolean {
  const type = resolveChatType(c);
  switch (category) {
    case "all":
      return type !== "saved";
    case "private":
      return type === "private";
    case "secret":
      return type === "secret";
    case "groups":
      return type === "group" || type === "supergroup";
    case "channels":
      return type === "channel";
    case "saved":
      return type === "saved";
    default:
      return true;
  }
}

export function matchesFolder(c: Conversation, folder: ChatFolderId | "all"): boolean {
  if (folder === "all") return true;
  if (folder === "unread") return c.unread > 0;
  if (folder === "channels") return resolveChatType(c) === "channel";
  if (folder === "groups")
    return resolveChatType(c) === "group" || resolveChatType(c) === "supergroup";
  return c.folderId === folder || (folder === "personal" && !c.folderId && resolveChatType(c) === "private");
}

export function canSendMessages(c: Conversation): boolean {
  const type = resolveChatType(c);
  if (type === "channel") return c.canPost !== false && c.isChannelAdmin === true;
  if (type === "saved") return true;
  return true;
}

/** Default: channels are broadcast — only admins post unless canPost is set */
export function isBroadcastChannel(c: Conversation): boolean {
  return resolveChatType(c) === "channel" && c.canPost !== true;
}

/** Sidebar order: draft first, then newest lastAtTs, then name (pinned split handled by caller). */
export function sortChatList(items: Conversation[], drafts: Record<string, string> = {}): Conversation[] {
  return [...items].sort((a, b) => {
    const da = drafts[a.id] ? 1 : 0;
    const db = drafts[b.id] ? 1 : 0;
    if (da !== db) return db - da;
    const ta = a.lastAtTs ?? 0;
    const tb = b.lastAtTs ?? 0;
    if (ta !== tb) return tb - ta;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

export function createSavedMessagesConversation(): Conversation {
  return {
    id: SAVED_MESSAGES_ID,
    uid: "SAVED",
    name: "Saved Messages",
    lastMessage: "Notes, links, and forwards to yourself",
    lastAt: "Now",
    unread: 0,
    online: false,
    chatType: "saved",
    pinned: false,
  };
}

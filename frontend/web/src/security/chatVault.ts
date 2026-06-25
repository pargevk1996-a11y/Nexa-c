import type { Conversation, Message } from "@/types";

type MessageStatus = NonNullable<Message["status"]>;
import { getSecureItem, setSecureItem } from "./secureStorage";
import { storageKeys } from "./storageKeys";

export interface SerializedMessageMutations {
  hiddenForMe: string[];
  deletedForAll: string[];
  recalled: string[];
  edits: Record<string, string>;
  editedAt: Record<string, string>;
  ephemeralConsumed: string[];
  reactionOverrides: Record<string, { reactions: Record<string, number>; myReaction?: string }>;
  pinnedByConversation: Record<string, string | null>;
  statusOverrides: Record<string, MessageStatus>;
  clearedConversations: string[];
}

export interface ChatVaultPayload {
  version: 1;
  conversations: Conversation[];
  extraMessages: Record<string, Message[]>;
  mutations: SerializedMessageMutations;
  hiddenChatIds: string[];
  activeId: string | null;
}

export function emptySerializedMutations(): SerializedMessageMutations {
  return {
    hiddenForMe: [],
    deletedForAll: [],
    recalled: [],
    edits: {},
    editedAt: {},
    ephemeralConsumed: [],
    reactionOverrides: {},
    pinnedByConversation: {},
    statusOverrides: {},
    clearedConversations: [],
  };
}

export async function loadChatVault(userId: string): Promise<ChatVaultPayload | null> {
  return getSecureItem<ChatVaultPayload>(storageKeys.chatVault(userId), userId);
}

export async function saveChatVault(userId: string, payload: ChatVaultPayload): Promise<void> {
  await setSecureItem(storageKeys.chatVault(userId), userId, payload);
}

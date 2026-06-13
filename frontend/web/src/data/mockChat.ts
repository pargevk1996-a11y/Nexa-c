import type { Conversation, Message } from "@/types";
import { createSavedMessagesConversation } from "@/utils/chatTypes";

// "Saved Messages" is a real per-user feature (self-chat), not demo data.
export const SAVED_CONVERSATION = createSavedMessagesConversation();

// No seeded demo users/conversations — the chat list is populated only from
// real data fetched from the backend. Saved Messages is injected separately
// via ensureSavedInList() in ChatContext, so this stays empty.
export const MOCK_CONVERSATIONS: Conversation[] = [];

// No seeded demo messages.
export const MOCK_MESSAGES: Record<string, Message[]> = {};

import { apiFetch } from "./client";

export interface Conversation {
  id: string;
  type: "dm" | "group" | "channel";
  title: string | null;
  last_message: Message | null;
  unread_count: number;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  content_type: string;
  seq: number;
  created_at: string;
}

export async function listConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>("/chat/conversations");
}

export async function listMessages(conversationId: string, limit = 30): Promise<Message[]> {
  return apiFetch<Message[]>(`/chat/conversations/${conversationId}/messages?limit=${limit}`);
}

export async function sendMessage(conversationId: string, body: string): Promise<Message> {
  return apiFetch<Message>(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      client_msg_id: Math.random().toString(36).slice(2),
      body,
      content_type: "text",
    }),
  });
}

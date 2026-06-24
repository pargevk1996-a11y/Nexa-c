import { apiFetch } from "./client";

export interface ApiConversation {
  id: string;
  type: string;
  title: string | null;
  description?: string | null;
  slug?: string | null;
  is_public: boolean;
  verified?: boolean;
  parent_id?: string | null;
  member_count: number;
  last_message_preview: string | null;
  unread_count: number;
  pinned_message_ids: string[];
  my_role?: string | null;
  peer_user_id?: string | null;
  member_ids?: string[];
  is_locked?: boolean;
  hidden?: boolean;
}

export interface ApiMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  seq: number;
  body: string;
  content_type: string;
  reply_to_id: string | null;
  forward_from_id: string | null;
  forward_blocked: boolean;
  media_id: string | null;
  e2ee_envelope: Record<string, unknown> | null;
  /** Populated client-side after decrypting e2ee_envelope — never sent by server. */
  media_key?: string;
  expires_at: string | null;
  edited_at: string | null;
  deleted_for_everyone_at: string | null;
  reactions: Record<string, string[]>;
  created_at: string;
  delivered_to: string[];
  read_by: string[];
  silent?: boolean;
  thread_root_id?: string | null;
  thread_reply_count?: number;
}

export interface SyncResponse {
  conversation_id: string;
  after_seq: number;
  latest_seq: number;
  messages: ApiMessage[];
  sync_required: boolean;
}

export async function listConversations(): Promise<ApiConversation[]> {
  return apiFetch<ApiConversation[]>("/chat/conversations");
}

export async function createConversation(body: {
  type: string;
  title?: string;
  member_ids?: string[];
}): Promise<ApiConversation> {
  return apiFetch<ApiConversation>("/chat/conversations", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listMessages(
  conversationId: string,
  params?: { before_seq?: number; after_seq?: number; limit?: number },
): Promise<ApiMessage[]> {
  const q = new URLSearchParams();
  if (params?.before_seq != null) q.set("before_seq", String(params.before_seq));
  if (params?.after_seq != null) q.set("after_seq", String(params.after_seq));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const qs = q.toString();
  return apiFetch<ApiMessage[]>(`/chat/conversations/${conversationId}/messages${qs ? `?${qs}` : ""}`);
}

export async function syncConversation(
  conversationId: string,
  afterSeq: number,
): Promise<SyncResponse> {
  return apiFetch<SyncResponse>(
    `/chat/conversations/${conversationId}/sync?after_seq=${afterSeq}`,
  );
}

export async function sendMessageRest(
  conversationId: string,
  body: {
    client_msg_id: string;
    body: string;
    content_type?: string;
    thread_root_id?: string;
    media_id?: string;
    reply_to_id?: string;
    e2ee_envelope?: Record<string, unknown>;
  },
): Promise<ApiMessage> {
  return apiFetch<ApiMessage>(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function apiDeleteMessage(messageId: string, forEveryone: boolean): Promise<void> {
  await apiFetch(`/chat/messages/${messageId}?for_everyone=${forEveryone}`, { method: "DELETE" });
}

export async function markMessageDelivered(messageId: string): Promise<void> {
  await apiFetch(`/chat/messages/${messageId}/delivered`, { method: "POST" });
}

export async function markConversationRead(
  conversationId: string,
  upToSeq: number,
): Promise<void> {
  await apiFetch(`/chat/conversations/${conversationId}/read`, {
    method: "POST",
    body: JSON.stringify({ up_to_seq: upToSeq }),
  });
}

// ── Scheduled ("send later") messages ───────────────────────────────────────
export interface ScheduledMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  content_type: string;
  reply_to_id: string | null;
  scheduled_at: string | null;
  status: string;
}

export async function createScheduledMessage(
  conversationId: string,
  body: { body: string; scheduled_at: string; content_type?: string; reply_to_id?: string },
): Promise<ScheduledMessage> {
  return apiFetch<ScheduledMessage>(`/chat/conversations/${conversationId}/scheduled`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function listScheduledMessages(conversationId: string): Promise<ScheduledMessage[]> {
  return apiFetch<ScheduledMessage[]>(`/chat/conversations/${conversationId}/scheduled`);
}

export async function cancelScheduledMessage(scheduledId: string): Promise<void> {
  await apiFetch(`/chat/scheduled/${scheduledId}`, { method: "DELETE" });
}

export async function setConversationHidden(conversationId: string, hidden: boolean): Promise<void> {
  await apiFetch(`/chat/conversations/${conversationId}/hidden`, {
    method: "PATCH",
    body: JSON.stringify({ hidden }),
  });
}

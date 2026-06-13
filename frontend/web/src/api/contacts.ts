import { apiFetch } from "./client";

export interface BlockedUser {
  user_id: string;
  display_name: string | null;
  blocked_at: string;
  reason: string | null;
}

export interface ContactRequest {
  id: string;
  from_user_id: string;
  to_user_id: string;
  status: "pending" | "accepted" | "declined";
  conversation_id: string | null;
  created_at: string;
  resolved_at: string | null;
}

export type ContactStatus = "none" | "pending_sent" | "pending_received" | "contacts";

export interface ContactStatusResponse {
  status: ContactStatus;
  request_id: string | null;
  conversation_id: string | null;
}

export async function listBlockedUsers(): Promise<BlockedUser[]> {
  return apiFetch<BlockedUser[]>("/contacts/blocks");
}

export async function blockUser(userId: string, reason?: string): Promise<BlockedUser> {
  return apiFetch<BlockedUser>("/contacts/blocks", {
    method: "POST",
    body: JSON.stringify({ user_id: userId, reason }),
  });
}

export async function unblockUser(userId: string): Promise<void> {
  await apiFetch(`/contacts/blocks/${encodeURIComponent(userId)}`, { method: "DELETE" });
}

export async function sendContactRequest(
  toUserId: string,
  fromUsername: string = "",
): Promise<ContactRequest> {
  return apiFetch<ContactRequest>("/contacts/requests", {
    method: "POST",
    body: JSON.stringify({ to_user_id: toUserId, from_username: fromUsername }),
  });
}

export async function listIncomingRequests(): Promise<ContactRequest[]> {
  return apiFetch<ContactRequest[]>("/contacts/requests/incoming");
}

export async function listOutgoingRequests(): Promise<ContactRequest[]> {
  return apiFetch<ContactRequest[]>("/contacts/requests/outgoing");
}

export async function acceptContactRequest(requestId: string): Promise<ContactRequest> {
  return apiFetch<ContactRequest>(`/contacts/requests/${encodeURIComponent(requestId)}/accept`, {
    method: "PATCH",
  });
}

export async function declineContactRequest(requestId: string): Promise<ContactRequest> {
  return apiFetch<ContactRequest>(`/contacts/requests/${encodeURIComponent(requestId)}/decline`, {
    method: "PATCH",
  });
}

export async function cancelContactRequest(requestId: string): Promise<ContactRequest> {
  return apiFetch<ContactRequest>(`/contacts/requests/${encodeURIComponent(requestId)}/cancel`, {
    method: "PATCH",
  });
}

export async function getContactStatus(userId: string): Promise<ContactStatusResponse> {
  return apiFetch<ContactStatusResponse>(`/contacts/status/${encodeURIComponent(userId)}`);
}

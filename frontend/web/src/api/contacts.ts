import { apiFetch } from "./client";

export interface BlockedUser {
  user_id: string;
  display_name: string | null;
  blocked_at: string;
  reason: string | null;
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

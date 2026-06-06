import { apiFetch } from "./client";

export type SpaceType =
  | "private_group"
  | "public_group"
  | "channel"
  | "broadcast"
  | "community"
  | "supergroup";

export interface SpaceSettings {
  slow_mode_seconds: number;
  anti_spam_enabled: boolean;
  auto_mod_level: number;
  join_requires_verification: boolean;
  comments_enabled: boolean;
  invite_only: boolean;
}

export interface SpaceDetail {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  slug: string | null;
  is_public: boolean;
  verified: boolean;
  parent_id: string | null;
  member_count: number;
  settings: SpaceSettings;
  pinned_message_ids: string[];
  my_role: string | null;
  channel_ids: string[];
}

export interface PublicSpace {
  id: string;
  type: string;
  title: string | null;
  description: string | null;
  slug: string | null;
  verified: boolean;
  member_count: number;
}

export async function discoverSpaces(type?: SpaceType): Promise<PublicSpace[]> {
  const q = type ? `?type=${type}` : "";
  return apiFetch<PublicSpace[]>(`/chat/spaces/discover${q}`);
}

export async function createSpace(body: {
  type: SpaceType;
  title: string;
  description?: string;
  slug?: string;
  is_public?: boolean;
  parent_id?: string;
  member_ids?: string[];
  verified?: boolean;
  settings?: Partial<SpaceSettings>;
}): Promise<SpaceDetail> {
  return apiFetch<SpaceDetail>("/chat/spaces", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getSpace(spaceId: string): Promise<SpaceDetail> {
  return apiFetch<SpaceDetail>(`/chat/spaces/${spaceId}`);
}

export async function joinSpace(spaceId: string): Promise<SpaceDetail> {
  return apiFetch<SpaceDetail>(`/chat/spaces/${spaceId}/join`, { method: "POST" });
}

export async function updateSpaceSettings(
  spaceId: string,
  settings: Partial<SpaceSettings>,
): Promise<SpaceDetail> {
  return apiFetch<SpaceDetail>(`/chat/spaces/${spaceId}/settings`, {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

export async function banMember(spaceId: string, userId: string, reason?: string): Promise<void> {
  await apiFetch(`/chat/spaces/${spaceId}/moderation/ban`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, reason }),
  });
}

export async function setSlowMode(spaceId: string, seconds: number): Promise<SpaceDetail> {
  return updateSpaceSettings(spaceId, { slow_mode_seconds: seconds });
}

export async function getThread(messageId: string) {
  return apiFetch<import("./chat").ApiMessage[]>(`/chat/messages/${messageId}/thread`);
}

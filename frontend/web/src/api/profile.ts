import { apiFetch } from "./client";
import type { AvatarKind, ProfilePrivacy, PublicProfile, UserProfile } from "@/types/profile";

export async function fetchMyProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/me");
}

export async function bootstrapProfile(username: string, nickname?: string): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/bootstrap", {
    method: "POST",
    body: JSON.stringify({ username, nickname: nickname ?? undefined }),
  });
}

export async function clearMyAvatar(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/me/avatar", { method: "DELETE" });
}

/** Account-wide manual screen-lock flag (server is the source of truth so the
 *  lock follows the account across every device/browser/OS). Only the STATE is
 *  stored server-side — never the PIN. */
export async function fetchScreenLock(): Promise<boolean> {
  const r = await apiFetch<{ locked: boolean }>("/users/me/screen-lock");
  return r.locked;
}

export async function setScreenLock(locked: boolean): Promise<void> {
  await apiFetch("/users/me/screen-lock", {
    method: "PUT",
    body: JSON.stringify({ locked }),
  });
}

export async function fetchProfileByUsername(username: string): Promise<PublicProfile> {
  const handle = username.replace(/^\$/, "");
  return apiFetch<PublicProfile>(`/users/by-username/${encodeURIComponent(handle)}`);
}

export async function updateMyProfile(
  patch: Partial<{
    username: string;
    nickname: string;
    bio: string;
    status_text: string;
    avatar_url: string | null;
    animated_avatar_url: string | null;
    avatar_kind: AvatarKind;
    privacy: ProfilePrivacy;
  }>,
): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/me", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export async function fetchPublicProfile(userId: string): Promise<PublicProfile> {
  return apiFetch<PublicProfile>(`/users/${userId}`);
}

export async function searchProfiles(query: string): Promise<PublicProfile[]> {
  return apiFetch<PublicProfile[]>(`/users/search?q=${encodeURIComponent(query)}`);
}

export async function updatePresence(isOnline: boolean, statusText?: string): Promise<UserProfile> {
  return apiFetch<UserProfile>("/users/presence", {
    method: "POST",
    body: JSON.stringify({ is_online: isOnline, status_text: statusText }),
  });
}

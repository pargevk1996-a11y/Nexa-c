export type VerificationBadge = "none" | "verified" | "official" | "bot";
export type AvatarKind = "initial" | "image" | "animated";

export interface ProfilePrivacy {
  show_last_seen: boolean;
  show_online_status: boolean;
  show_bio: boolean;
  show_status_text: boolean;
  show_avatar: boolean;
  allow_search_by_username: boolean;
  /** When true, only uid and username are visible to others — overrides all other privacy fields */
  secure_mode?: boolean;
}

export interface UserProfile {
  id: string;
  username: string;
  nickname: string;
  uid: string;
  bio: string;
  status_text: string;
  avatar_url: string | null;
  animated_avatar_url: string | null;
  avatar_kind: AvatarKind;
  is_online: boolean;
  last_seen_at: string | null;
  verification_badge: VerificationBadge;
  /** Phone number in E.164 format, e.g. +14155552671 */
  phone_number?: string | null;
  /** ISO-8601 account/profile creation timestamp. */
  created_at?: string | null;
  privacy?: ProfilePrivacy;
}

export type PublicProfile = Omit<UserProfile, "privacy">;

export const DEFAULT_PROFILE_PRIVACY: ProfilePrivacy = {
  show_last_seen: true,
  show_online_status: true,
  show_bio: true,
  show_status_text: true,
  show_avatar: true,
  allow_search_by_username: true,
  secure_mode: false,
};

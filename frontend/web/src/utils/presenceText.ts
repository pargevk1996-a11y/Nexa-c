export function formatLastSeen(iso: string | null | undefined): string {
  if (!iso) return "Last seen recently";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Last seen recently";
  const diffMs = Date.now() - then.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "Last seen just now";
  if (mins < 60) return `Last seen ${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  return `Last seen ${then.toLocaleDateString()}`;
}

export function presenceLine(profile: {
  is_online: boolean;
  last_seen_at?: string | null;
  status_text?: string;
}): string {
  if (profile.is_online) {
    return profile.status_text?.trim() || "Online";
  }
  return formatLastSeen(profile.last_seen_at);
}

export function displayName(profile: { nickname?: string; username: string }): string {
  const nick = profile.nickname?.trim();
  return nick || profile.username;
}

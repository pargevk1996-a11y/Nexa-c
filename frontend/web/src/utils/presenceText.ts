// `nowMs` is injectable so a 1s ticker can drive a live-updating counter.
export function formatLastSeen(iso: string | null | undefined, nowMs: number = Date.now()): string {
  if (!iso) return "Last seen recently";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "Last seen recently";
  const secs = Math.max(0, Math.floor((nowMs - then.getTime()) / 1000));
  if (secs < 60) return `Last seen ${secs}s ago`;
  const mins = Math.floor(secs / 60);
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

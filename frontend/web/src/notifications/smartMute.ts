import type { NotificationPreferences } from "./types";

export interface SmartMuteInput {
  globalPrefs: NotificationPreferences | null;
  chatPrefs: NotificationPreferences | null;
  /** Local quick mute from vault */
  chatMuted?: boolean;
  mentionUserIds?: string[];
  currentUserId?: string;
  silent?: boolean;
}

function parseTime(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function inQuietHours(now: Date, start: string | null, end: string | null): boolean {
  const s = parseTime(start);
  const e = parseTime(end);
  if (s === null || e === null) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s <= e) return cur >= s && cur < e;
  return cur >= s || cur < e;
}

function isTimedMuteActive(until: string | null): boolean {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

/** Whether a visible/sound notification should fire on this device. */
export function shouldShowNotification(input: SmartMuteInput): { allow: boolean; reason: string } {
  if (input.silent) {
    return { allow: true, reason: "silent" };
  }

  const g = input.globalPrefs;
  const c = input.chatPrefs;

  const muteAll = Boolean(c?.mute_all || g?.mute_all || input.chatMuted);
  const mentionsOnly = Boolean(c?.mentions_only || g?.mentions_only);
  const muteUntil = c?.mute_until || g?.mute_until || null;

  if (muteAll && !mentionsOnly) {
    return { allow: false, reason: "muted" };
  }

  if (isTimedMuteActive(muteUntil) && !mentionsOnly) {
    return { allow: false, reason: "mute_until" };
  }

  const quiet =
    Boolean(c?.quiet_hours_enabled || g?.quiet_hours_enabled) &&
    inQuietHours(
      new Date(),
      c?.quiet_hours_start ?? g?.quiet_hours_start ?? null,
      c?.quiet_hours_end ?? g?.quiet_hours_end ?? null,
    );

  if (quiet) {
    const mentioned =
      input.currentUserId &&
      input.mentionUserIds?.some(
        (id) => id === input.currentUserId || id.toLowerCase() === input.currentUserId?.toLowerCase(),
      );
    if (!mentioned && !mentionsOnly) {
      return { allow: false, reason: "quiet_hours" };
    }
    if (mentionsOnly && !mentioned) {
      return { allow: false, reason: "mentions_only" };
    }
  }

  if (muteAll || isTimedMuteActive(muteUntil)) {
    const mentioned =
      input.currentUserId &&
      input.mentionUserIds?.some((id) => id === input.currentUserId);
    if (mentionsOnly && !mentioned) {
      return { allow: false, reason: "mentions_only" };
    }
  }

  return { allow: true, reason: "ok" };
}

export function extractMentions(text: string): string[] {
  const out: string[] = [];
  const re = /@([a-zA-Z0-9_]{2,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

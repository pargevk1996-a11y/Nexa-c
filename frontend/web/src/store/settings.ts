import { getSecureItem, setSecureItem } from "@/security/secureStorage";
import { storageKeys } from "@/security/storageKeys";

export type ThemeMode = "dark" | "light" | "system";
export type FontSize = "small" | "medium" | "large";
export type StoryPhotoDurationSec = 15 | 30 | 45 | 60;

export const STORY_PHOTO_DURATION_OPTIONS: StoryPhotoDurationSec[] = [15, 30, 45, 60];

export interface AppSettings {
  theme: ThemeMode;
  fontSize: FontSize;
  compactChat: boolean;
  enterToSend: boolean;
  soundEnabled: boolean;
  desktopNotifications: boolean;
  pushNotifications: boolean;
  mobileNotifications: boolean;
  notificationGrouping: boolean;
  smartMuteMentionsOnly: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  readReceipts: boolean;
  lastSeenVisible: boolean;
  twoFactorReminder: boolean;
  biometricEnabled: boolean;
  macNativeNotifications: boolean;
  macMenuBarIcon: boolean;
  showOnlineStatus: boolean;
  /** Allow OS / browser screenshots (requires signature to enable) */
  allowScreenshots: boolean;
  /** How long photo stories stay on screen before advancing */
  storyPhotoDurationSec: StoryPhotoDurationSec;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  fontSize: "medium",
  compactChat: false,
  enterToSend: true,
  soundEnabled: true,
  desktopNotifications: true,
  pushNotifications: true,
  mobileNotifications: true,
  notificationGrouping: true,
  smartMuteMentionsOnly: false,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "08:00",
  readReceipts: true,
  lastSeenVisible: true,
  twoFactorReminder: true,
  biometricEnabled: false,
  macNativeNotifications: true,
  macMenuBarIcon: true,
  showOnlineStatus: true,
  allowScreenshots: false,
  storyPhotoDurationSec: 15,
};

const LEGACY_STORAGE_KEY = "securechat_settings";

function normalizeStoryDuration(sec: unknown): StoryPhotoDurationSec {
  if (sec === 15 || sec === 30 || sec === 45 || sec === 60) return sec;
  return 15;
}

function normalizeSettings(parsed: Partial<AppSettings> & Record<string, unknown>): AppSettings {
  const { pinEnabled: _pin, pinAutoLockMinutes: _pinLock, ...rest } = parsed;
  return {
    ...DEFAULT_SETTINGS,
    ...(rest as Partial<AppSettings>),
    storyPhotoDurationSec: normalizeStoryDuration(parsed.storyPhotoDurationSec),
  };
}

export async function loadSettings(userId: string): Promise<AppSettings> {
  const stored = await getSecureItem<AppSettings>(storageKeys.settings(userId), userId);
  if (stored) return normalizeSettings({ ...stored });

  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = normalizeSettings(JSON.parse(legacy) as Partial<AppSettings>);
      await saveSettings(userId, parsed);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return parsed;
    }
  } catch {
    /* ignore */
  }

  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(userId: string, settings: AppSettings): Promise<void> {
  await setSecureItem(storageKeys.settings(userId), userId, settings);
}

/**
 * Device-wide theme preference (plain localStorage, NOT per-user) so the
 * light / dark choice is identical everywhere: home screen, auth, and the
 * logged-in app — a guest who picks light still sees light after logging in.
 */
const GLOBAL_THEME_KEY = "nexa-theme";

export function getGlobalTheme(): ThemeMode {
  try {
    const v = localStorage.getItem(GLOBAL_THEME_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_SETTINGS.theme;
}

export function setGlobalTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(GLOBAL_THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
  applyTheme(theme);
}

/** Resolve a theme mode to whether the effective look is light. */
export function isLightTheme(theme: ThemeMode = getGlobalTheme()): boolean {
  if (theme === "system") {
    return !window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return theme === "light";
}

let themeTransitionTimer: ReturnType<typeof setTimeout> | undefined;

export function applyTheme(theme: ThemeMode): void {
  const root = document.documentElement;
  const resolved =
    theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : theme;

  root.dataset.theme = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === "light" ? "#f0f2fa" : "#050508";
  root.classList.add("theme-transition");
  if (themeTransitionTimer) clearTimeout(themeTransitionTimer);
  themeTransitionTimer = setTimeout(() => {
    root.classList.remove("theme-transition");
  }, 320);
}

export function applyFontSize(size: FontSize): void {
  const map = { small: "16px", medium: "17px", large: "18px" };
  document.documentElement.style.fontSize = map[size];
}

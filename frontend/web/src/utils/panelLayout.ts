import { getSecureItem, setSecureItem } from "@/security/secureStorage";
import { storageKeys } from "@/security/storageKeys";

const LEGACY_STORAGE_KEY = "securechat-panel-widths";

export interface PanelWidths {
  sidebar: number;
  profile: number;
}

export const PANEL_DEFAULTS: PanelWidths = {
  sidebar: 384,
  profile: 300,
};

export const PANEL_LIMITS = {
  sidebar: { min: 260, max: 560 },
  profile: { min: 200, max: 420 },
  mainMin: 280,
};

/** Gaps + resize handles between sidebar, main, and profile (must match CSS). */
export const PANEL_CHROME_PX = 4 * 6 + 2 * 6;

export async function loadPanelWidths(userId: string): Promise<PanelWidths> {
  const stored = await getSecureItem<PanelWidths>(storageKeys.panelLayout(userId), userId);
  if (stored) {
    return {
      sidebar: clamp(stored.sidebar, PANEL_LIMITS.sidebar.min, PANEL_LIMITS.sidebar.max),
      profile: clamp(stored.profile, PANEL_LIMITS.profile.min, PANEL_LIMITS.profile.max),
    };
  }

  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<PanelWidths>;
      const widths = {
        sidebar: clamp(
          parsed.sidebar ?? PANEL_DEFAULTS.sidebar,
          PANEL_LIMITS.sidebar.min,
          PANEL_LIMITS.sidebar.max,
        ),
        profile: clamp(
          parsed.profile ?? PANEL_DEFAULTS.profile,
          PANEL_LIMITS.profile.min,
          PANEL_LIMITS.profile.max,
        ),
      };
      await savePanelWidths(userId, widths);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return widths;
    }
  } catch {
    /* ignore */
  }

  return { ...PANEL_DEFAULTS };
}

export async function savePanelWidths(userId: string, widths: PanelWidths): Promise<void> {
  await setSecureItem(storageKeys.panelLayout(userId), userId, widths);
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

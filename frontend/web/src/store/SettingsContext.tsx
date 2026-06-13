import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getCachedSession } from "@/api/auth";
import { setScreenshotAllowed } from "@/security/screenshotPolicy";
import {
  applyFontSize,
  applyTheme,
  DEFAULT_SETTINGS,
  getGlobalTheme,
  loadSettings,
  saveSettings,
  setGlobalTheme,
  type AppSettings,
} from "./settings";

interface SettingsContextValue {
  settings: AppSettings;
  update: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
  resetAll: () => void;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const userId = getCachedSession()?.user.id;
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...DEFAULT_SETTINGS,
    theme: getGlobalTheme(),
  }));

  useEffect(() => {
    if (!userId) {
      setSettings({ ...DEFAULT_SETTINGS, theme: getGlobalTheme() });
      applyTheme(getGlobalTheme());
      applyFontSize(DEFAULT_SETTINGS.fontSize);
      setScreenshotAllowed(DEFAULT_SETTINGS.allowScreenshots);
      return;
    }
    void loadSettings(userId).then((loaded) => {
      // Theme is a device-wide preference — keep the choice the user already
      // made (e.g. on the home screen) instead of the per-account value.
      setSettings({ ...loaded, theme: getGlobalTheme() });
      applyTheme(getGlobalTheme());
      applyFontSize(loaded.fontSize);
      setScreenshotAllowed(loaded.allowScreenshots);
    });
  }, [userId]);

  useEffect(() => {
    applyTheme(settings.theme);
    applyFontSize(settings.fontSize);
    document.documentElement.dataset.compact = settings.compactChat ? "true" : "false";
  }, [settings.theme, settings.fontSize, settings.compactChat]);

  useEffect(() => {
    if (settings.theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = () => applyTheme("system");
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, [settings.theme]);

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
      // Theme is device-wide: persist it globally so it stays consistent
      // across the home screen, auth, and every account on this device.
      if (key === "theme") {
        setGlobalTheme(value as AppSettings["theme"]);
      }
      if (!userId) {
        if (key === "theme") {
          setSettings((prev) => ({ ...prev, theme: value as AppSettings["theme"] }));
        }
        return;
      }
      setSettings((prev) => {
        const next = { ...prev, [key]: value };
        if (key === "allowScreenshots") {
          setScreenshotAllowed(Boolean(value));
        }
        void saveSettings(userId, next);
        return next;
      });
    },
    [userId],
  );

  const resetAll = useCallback(() => {
    if (!userId) return;
    const defaults = { ...DEFAULT_SETTINGS };
    setSettings(defaults);
    setScreenshotAllowed(defaults.allowScreenshots);
    void saveSettings(userId, defaults);
  }, [userId]);

  const value = useMemo(() => ({ settings, update, resetAll }), [settings, update, resetAll]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}

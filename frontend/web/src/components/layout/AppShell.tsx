import { Suspense, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { CallProvider } from "@/calls/CallProvider";
import { GlobalCallUi } from "@/components/calls/GlobalCallUi";
import { ChatProvider } from "@/store/ChatContext";
import { ProfileProvider } from "@/store/ProfileContext";
import { SettingsProvider } from "@/store/SettingsContext";

import { AmbientBackground } from "./AmbientBackground";
import { SideNav } from "./SideNav";
import { LogoThemeToggle } from "./LogoThemeToggle";
import { OfflineBanner } from "./OfflineBanner";
import { BRAND_NAME } from "@/config/brand";
import { useSectionSwipe } from "@/hooks/useSectionSwipe";
import { useScreenshotPrevention } from "@/hooks/useScreenshotPrevention";
import { useSettings } from "@/store/SettingsContext";

// Warm the secondary route chunks once the shell is interactive so switching
// sections never pays a cold network fetch.
function prefetchSecondaryRoutes() {
  void import("@/pages/ContactsPage");
  void import("@/pages/CallsPage");

  void import("@/pages/SettingsPage");
  void import("@/pages/ProfilePage");
}

// Apply data-perf="low" when the network is known to be slow or the user has
// opted into reduced data. CSS keys off this to disable heavy effects.
function applyPerfMode() {
  const conn = (navigator as Navigator & { connection?: {
    effectiveType?: string; saveData?: boolean;
  } }).connection;
  const slow = conn?.saveData || /^(slow-2g|2g)$/.test(conn?.effectiveType ?? "");
  if (slow) document.documentElement.dataset.perf = "low";
}

function AppShellInner() {
  const location = useLocation();
  const navigate = useNavigate();
  const isChats = location.pathname.startsWith("/app/chats");
  const { settings } = useSettings();

  useSectionSwipe(!settings.showNavButtons);
  useScreenshotPrevention();

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => prefetchSecondaryRoutes());
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetchSecondaryRoutes, 1500);
    return () => window.clearTimeout(id);
  }, []);

  // Lite-mode: set data-perf="low" once and watch connection changes.
  useEffect(() => {
    applyPerfMode();
    const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
    conn?.addEventListener("change", applyPerfMode);
    return () => conn?.removeEventListener("change", applyPerfMode);
  }, []);

  // Global keyboard shortcuts (documented in ThemeSettingsSection).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName ?? "";
      const inInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      // ⌘K / Ctrl+K → focus the chat search field (skip when already typing)
      if (e.key === "k" && !inInput) {
        e.preventDefault();
        const input = document.querySelector<HTMLInputElement>(
          ".chat-left-panel__search input",
        );
        if (input) {
          input.focus();
          input.select();
        } else {
          navigate("/app/chats");
        }
        return;
      }

      // ⌘, / Ctrl+, → Settings
      if (e.key === ",") {
        e.preventDefault();
        navigate("/app/settings");
        return;
      }
    }

    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [navigate]);

  const shellClass = [
    "app-shell",
    isChats ? "app-shell--nexa-chats" : "",
    settings.showNavButtons ? "app-shell--show-nav" : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={shellClass}>
      <GlobalCallUi />
      <AmbientBackground />
      <OfflineBanner />
      <div className="app-brand" aria-label={BRAND_NAME}>
        <LogoThemeToggle size={48} className="app-brand__logo" />
        <span className="app-brand__text">{BRAND_NAME}</span>
      </div>
      <div className="app-shell__frame">
        <SideNav />
        <div className="app-shell__body" id="main-content">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <SettingsProvider>
      <CallProvider>
        <ChatProvider>
          <ProfileProvider>
            <AppShellInner />
          </ProfileProvider>
        </ChatProvider>
      </CallProvider>
    </SettingsProvider>
  );
}

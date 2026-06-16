import { Suspense, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { CallProvider } from "@/calls/CallProvider";
import { GlobalCallUi } from "@/components/calls/GlobalCallUi";
import { ChatProvider } from "@/store/ChatContext";
import { ProfileProvider } from "@/store/ProfileContext";
import { SettingsProvider } from "@/store/SettingsContext";
import { SocialProvider } from "@/store/SocialContext";
import { AmbientBackground } from "./AmbientBackground";
import { SideNav } from "./SideNav";
import { TopNav } from "./TopNav";

// Warm the secondary route chunks once the shell is interactive so switching
// sections never pays a cold network fetch. Purely a cache warm-up — Vite
// dedupes these against the real navigation import, and it has no visual effect.
function prefetchSecondaryRoutes() {
  void import("@/pages/ContactsPage");
  void import("@/pages/CallsPage");
  void import("@/pages/PostsPage");
  void import("@/pages/SettingsPage");
  void import("@/pages/ProfilePage");
}

function AppShellInner() {
  const location = useLocation();
  const isChats = location.pathname.startsWith("/app/chats");

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(() => prefetchSecondaryRoutes());
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(prefetchSecondaryRoutes, 1500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className={`app-shell ${isChats ? "app-shell--nexa-chats" : ""}`}>
      <GlobalCallUi />
      <AmbientBackground />
      {/* Same top block on every section, including Chats. */}
      <TopNav />
      <div className="app-shell__frame">
        {/* Unified left rail on every section (desktop). On mobile it collapses
            to the bottom bar for non-chat sections and is hidden on Chats, which
            keeps its own in-panel bottom nav. */}
        <SideNav />
        <div className="app-shell__body">
          {/* Suspense lives here, not above the shell, so loading a lazy page
              chunk only shows a fallback in the content area — TopNav / SideNav
              stay mounted and visible instead of the whole app blanking out. */}
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
      <SocialProvider>
        <CallProvider>
          <ChatProvider>
            <ProfileProvider>
              <AppShellInner />
            </ProfileProvider>
          </ChatProvider>
        </CallProvider>
      </SocialProvider>
    </SettingsProvider>
  );
}

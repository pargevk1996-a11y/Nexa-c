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

function AppShellInner() {
  const location = useLocation();
  const isChats = location.pathname.startsWith("/app/chats");

  return (
    <div className={`app-shell ${isChats ? "app-shell--nexa-chats" : ""}`}>
      <GlobalCallUi />
      <AmbientBackground />
      {/* Same top block on every section, including Chats. */}
      <TopNav />
      <div className="app-shell__frame">
        {!isChats ? <SideNav /> : null}
        <div className="app-shell__body">
          <Outlet />
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

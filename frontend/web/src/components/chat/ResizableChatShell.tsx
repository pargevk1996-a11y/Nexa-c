import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import { getCachedSession } from "@/api/auth";
import {
  loadPanelWidths,
  PANEL_CHROME_PX,
  PANEL_DEFAULTS,
  PANEL_LIMITS,
  savePanelWidths,
  type PanelWidths,
} from "@/utils/panelLayout";

interface ProfileRenderOptions {
  onClose?: () => void;
}

interface ResizableChatShellProps {
  className?: string;
  sidebar: ReactNode;
  main: ReactNode;
  renderProfile: (options: ProfileRenderOptions) => ReactNode;
  profileOpen?: boolean;
  onProfileClose?: () => void;
}

export function ResizableChatShell({
  className = "",
  sidebar,
  main,
  renderProfile,
  profileOpen = false,
  onProfileClose,
}: ResizableChatShellProps) {
  const userId = getCachedSession()?.user.id;
  // Left chat list = 38% of the browser width (responsive).
  const sidebar38 = () =>
    Math.round((typeof window !== "undefined" ? window.innerWidth : 1280) * 0.38);
  const [widths, setWidths] = useState<PanelWidths>(() => ({
    ...PANEL_DEFAULTS,
    sidebar: sidebar38(),
  }));
  const manualSidebar = useRef(false);
  const widthsRef = useRef(widths);
  const [wideLayout, setWideLayout] = useState(
    () => typeof window !== "undefined" && window.innerWidth > 1024,
  );

  useEffect(() => {
    widthsRef.current = widths;
  }, [widths]);

  useEffect(() => {
    if (!userId) return;
    // Keep the sidebar at 38% of the viewport; only restore the saved profile width.
    void loadPanelWidths(userId).then((w) =>
      setWidths((prev) => ({ ...prev, profile: w.profile })),
    );
  }, [userId]);

  useEffect(() => {
    function onResize() {
      setWideLayout(window.innerWidth > 1024);
      if (!manualSidebar.current) {
        setWidths((prev) => ({ ...prev, sidebar: sidebar38() }));
      }
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!profileOpen || wideLayout) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onProfileClose?.();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [profileOpen, wideLayout, onProfileClose]);

  const saveNow = useCallback(() => {
    if (!userId) return;
    void savePanelWidths(userId, widthsRef.current);
  }, [userId]);

  const resizeSidebar = useCallback((delta: number) => {
    manualSidebar.current = true; // user took over → stop auto-tracking 38%
    setWidths((prev) => {
      const shell = document.querySelector(".chat-shell--resizable");
      const shellW = shell?.clientWidth ?? window.innerWidth;
      const profileW = wideLayout ? prev.profile : 0;
      const chrome = wideLayout ? PANEL_CHROME_PX : PANEL_CHROME_PX / 2;
      const maxSidebar = shellW - profileW - chrome - PANEL_LIMITS.mainMin;
      const sidebar = Math.min(
        PANEL_LIMITS.sidebar.max,
        Math.max(PANEL_LIMITS.sidebar.min, Math.min(prev.sidebar + delta, maxSidebar)),
      );
      return { ...prev, sidebar };
    });
  }, [wideLayout]);

  const resizeProfile = useCallback((delta: number) => {
    setWidths((prev) => {
      const shell = document.querySelector(".chat-shell--resizable");
      const shellW = shell?.clientWidth ?? window.innerWidth;
      const maxProfile = shellW - prev.sidebar - PANEL_CHROME_PX - PANEL_LIMITS.mainMin;
      const profile = Math.min(
        PANEL_LIMITS.profile.max,
        Math.max(PANEL_LIMITS.profile.min, Math.min(prev.profile - delta, maxProfile)),
      );
      return { ...prev, profile };
    });
  }, []);

  const shellClass = [
    "chat-shell",
    "chat-shell--resizable",
    profileOpen && wideLayout ? "chat-shell--profile-open" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const profileDrawer =
    !wideLayout && profileOpen ? (
      <div className="chat-profile-drawer" role="dialog" aria-modal="true" aria-label="Contact profile">
        <button
          type="button"
          className="chat-profile-drawer__backdrop"
          onClick={onProfileClose}
          aria-label="Close profile"
        />
        <div className="chat-profile-drawer__panel">
          {renderProfile({ onClose: onProfileClose })}
        </div>
      </div>
    ) : null;

  return (
    <>
      <div
        className={shellClass}
        style={
          {
            "--chat-sidebar-w": `${widths.sidebar}px`,
            "--chat-profile-w": wideLayout ? `${widths.profile}px` : "0px",
          } as React.CSSProperties
        }
      >
        <div className="chat-shell__panel chat-shell__panel--sidebar">{sidebar}</div>
        {wideLayout ? (
          <ResizeHandle ariaLabel="Resize chat list" onDrag={resizeSidebar} onDragEnd={saveNow} />
        ) : null}
        <div className="chat-shell__panel chat-shell__panel--main">{main}</div>
        {wideLayout && profileOpen ? (
          <>
            <ResizeHandle
              ariaLabel="Resize profile panel"
              onDrag={resizeProfile}
              onDragEnd={saveNow}
            />
            <div className="chat-shell__panel chat-shell__panel--profile">
              {renderProfile({})}
            </div>
          </>
        ) : null}
      </div>
      {profileDrawer ? createPortal(profileDrawer, document.body) : null}
    </>
  );
}

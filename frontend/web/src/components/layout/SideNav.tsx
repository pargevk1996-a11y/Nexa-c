import { useCallback, useMemo, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  IconCalls,
  IconChats,
  IconContacts,
  IconProfile,
  IconSettings,
} from "@/components/icons/Icons";
import { LogoThemeToggle } from "@/components/layout/LogoThemeToggle";
import { ArcCategoryPopup } from "@/components/chat/ArcCategoryPopup";
import { useChatOptional } from "@/store/ChatContext";
import { CHAT_CATEGORIES } from "@/utils/chatTypes";

// ── Inline secondary-view icons ──────────────────────────────────────────────
function IconBlocked({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
    </svg>
  );
}

function IconMissedCall({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.42 19.42 0 0 1 4.9 10.72 19.79 19.79 0 0 1 1.88 2.18A2 2 0 0 1 3.86.02h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L7.91 7.91" />
      <line x1="23" y1="1" x2="17" y2="7" />
      <polyline points="17 1 17 7 23 7" />
    </svg>
  );
}

// ── Toggle nav item (Contacts / Calls) — desktop second-click shows secondary view
function ToggleNavItem({ primaryTo, secondaryParam, primaryLabel, secondaryLabel, PrimaryIcon, SecondaryIcon, badge }: {
  primaryTo: string;
  secondaryParam: string;
  primaryLabel: string;
  secondaryLabel: string;
  PrimaryIcon: typeof IconChats;
  SecondaryIcon: typeof IconBlocked;
  badge?: number;
}) {
  const location = useLocation();
  const navigate = useNavigate();

  const onPrimaryPath = location.pathname === primaryTo;
  const paramKey = secondaryParam.split("=")[0];
  const paramVal = secondaryParam.split("=")[1];
  const secondaryActive = onPrimaryPath && new URLSearchParams(location.search).get(paramKey) === paramVal;
  const isActive = onPrimaryPath;

  function handleClick() {
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 768;
    if (!onPrimaryPath) {
      navigate(primaryTo);
    } else if (!secondaryActive) {
      navigate(`${primaryTo}?${secondaryParam}`);
    } else {
      navigate(primaryTo);
    }
  }

  const label = secondaryActive ? secondaryLabel : primaryLabel;

  return (
    <button
      type="button"
      className={[
        "side-nav__item",
        isActive && !secondaryActive ? "side-nav__item--active" : "",
        secondaryActive ? "side-nav__item--secondary" : "",
      ].join(" ").trim()}
      onClick={handleClick}
      title={label}
      aria-label={label}
      aria-current={isActive ? "page" : undefined}
    >
      <span className={`side-nav__icon${secondaryActive ? " side-nav__icon--red" : ""}`}>
        {secondaryActive ? <SecondaryIcon size={20} /> : <PrimaryIcon size={20} />}
      </span>
      <span className="side-nav__label">{label}</span>
      {badge && badge > 0 ? (
        <span className="side-nav__badge" aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </button>
  );
}

function NavItem({ to, label, Icon, badge }: {
  to: string; label: string; Icon: typeof IconChats; badge?: number;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `side-nav__item ${isActive ? "side-nav__item--active" : ""}`}
      title={label}
    >
      <span className="side-nav__icon"><Icon size={20} /></span>
      <span className="side-nav__label">{label}</span>
      {badge && badge > 0 ? (
        <span className="side-nav__badge" aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span>
      ) : null}
    </NavLink>
  );
}

const CAT_LABEL: Record<string, string> = {
  all: "ALL",
  private: "Chats",
  groups: "Groups",
  channels: "Channels",
};

// "Chats" nav item that cycles ALL→Chats→Groups→Channels on repeated tap
// and opens an arc-circle popup on 900ms hold (slide to item, release to select).
function ChatsNavItem({ badge }: { badge?: number }) {
  const location = useLocation();
  const navigate = useNavigate();
  const chat = useChatOptional();
  const activeCategory = chat?.activeCategory ?? "all";
  const setActiveCategory = chat?.setActiveCategory;

  const isOnChats = location.pathname.startsWith("/app/chats");
  const ids = useMemo(() => CHAT_CATEGORIES.map((c) => c.id), []);

  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [hoveredArcId, setHoveredArcId] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const buttonRectRef = useRef<DOMRect | null>(null);
  const touchActiveRef = useRef(false);
  const popupOpenRef = useRef(false);
  const activeArcItemRef = useRef<string | null>(null);

  const cancelTimer = useCallback(() => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null; }
  }, []);

  const closePopup = useCallback(() => {
    popupOpenRef.current = false;
    activeArcItemRef.current = null;
    setHoveredArcId(null);
    setPopupOpen(false);
  }, []);

  const startHoldTimer = useCallback(() => {
    cancelTimer();
    holdRef.current = setTimeout(() => {
      holdRef.current = null;
      if (buttonRef.current) {
        buttonRectRef.current = buttonRef.current.getBoundingClientRect();
      }
      popupOpenRef.current = true;
      setPopupOpen(true);
      navigator.vibrate?.(25);
    }, 900);
  }, [cancelTimer]);

  const cycle = useCallback(() => {
    if (!isOnChats) { navigate("/app/chats"); return; }
    if (!setActiveCategory) return;
    const idx = ids.indexOf(activeCategory);
    setActiveCategory(ids[(idx + 1) % ids.length]);
  }, [isOnChats, navigate, ids, activeCategory, setActiveCategory]);

  const handleTouchStart = useCallback(() => {
    touchActiveRef.current = true;
    startHoldTimer();
  }, [startHoldTimer]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (popupOpenRef.current) {
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const arcEl = el?.closest?.("[data-arc-cat-id]");
      const id = arcEl?.getAttribute?.("data-arc-cat-id") ?? null;
      if (id !== activeArcItemRef.current) {
        activeArcItemRef.current = id;
        setHoveredArcId(id);
      }
      return;
    }
    cancelTimer();
  }, [cancelTimer]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (popupOpenRef.current) {
      const selectedId = activeArcItemRef.current;
      closePopup();
      setTimeout(() => { touchActiveRef.current = false; }, 500);
      if (selectedId) {
        if (!isOnChats) navigate("/app/chats");
        setActiveCategory?.(selectedId as typeof activeCategory);
      }
      return;
    }
    const wasQuickTap = holdRef.current !== null;
    cancelTimer();
    setTimeout(() => { touchActiveRef.current = false; }, 500);
    if (!wasQuickTap) return;
    e.preventDefault();
    cycle();
  }, [closePopup, cancelTimer, cycle, isOnChats, navigate, setActiveCategory]);

  const handleMouseDown = useCallback(() => {
    if (touchActiveRef.current) return;
    startHoldTimer();
  }, [startHoldTimer]);

  const handleMouseLeave = useCallback(() => {
    if (!touchActiveRef.current) cancelTimer();
  }, [cancelTimer]);

  const handleClick = useCallback(() => {
    if (touchActiveRef.current) return;
    if (holdRef.current === null) return;
    cancelTimer();
    cycle();
  }, [cancelTimer, cycle]);

  const label = isOnChats ? (CAT_LABEL[activeCategory] ?? "ALL") : "Chats";

  return (
    <div style={{ position: "relative" }}>
      {popupOpen && buttonRectRef.current && (
        <ArcCategoryPopup
          rect={buttonRectRef.current}
          activeCategory={activeCategory}
          hoveredId={hoveredArcId}
          onSelect={(cat) => {
            if (!isOnChats) navigate("/app/chats");
            setActiveCategory?.(cat);
          }}
          onClose={closePopup}
        />
      )}
      <button
        ref={buttonRef}
        type="button"
        className={`side-nav__item${isOnChats ? " side-nav__item--active" : ""}`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchMove}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={popupOpen}
      >
        <span className="side-nav__icon"><IconChats size={20} /></span>
        <span className="side-nav__label">{label}</span>
        {badge && badge > 0 ? (
          <span className="side-nav__badge" aria-label={`${badge} unread`}>{badge > 99 ? "99+" : badge}</span>
        ) : null}
      </button>
    </div>
  );
}


export function SideNav() {
  const unread = useChatOptional()?.getUnreadTotal() ?? 0;

  return (
    <nav className="side-nav" aria-label="Main">
      <div className="side-nav__group side-nav__group--main">
        <div className="side-nav__brand">
          <LogoThemeToggle size={46} className="side-nav__brand-logo" />
        </div>
        <ChatsNavItem badge={unread} />
        <ToggleNavItem
          primaryTo="/app/contacts"
          secondaryParam="v=blocked"
          primaryLabel="Contacts"
          secondaryLabel="Blocked"
          PrimaryIcon={IconContacts}
          SecondaryIcon={IconBlocked}
        />
        <ToggleNavItem
          primaryTo="/app/calls"
          secondaryParam="v=missed"
          primaryLabel="Calls"
          secondaryLabel="Missed"
          PrimaryIcon={IconCalls}
          SecondaryIcon={IconMissedCall}
        />
        <NavItem to="/app/profile" label="Profile" Icon={IconProfile} />
      </div>
      <div className="side-nav__group side-nav__group--bottom">
        <NavItem to="/app/settings" label="Settings" Icon={IconSettings} />
      </div>
    </nav>
  );
}

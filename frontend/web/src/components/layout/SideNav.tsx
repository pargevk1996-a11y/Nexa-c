import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  IconCalls,
  IconChats,
  IconContacts,
  IconProfile,
  IconSettings,
} from "@/components/icons/Icons";
import { LogoThemeToggle } from "@/components/layout/LogoThemeToggle";
import { useChatOptional } from "@/store/ChatContext";

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
    } else if (!secondaryActive && !isMobile) {
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
        isActive ? "side-nav__item--active" : "",
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

export function SideNav() {
  const unread = useChatOptional()?.getUnreadTotal() ?? 0;

  return (
    <nav className="side-nav" aria-label="Main">
      <div className="side-nav__group side-nav__group--main">
        <div className="side-nav__brand">
          <LogoThemeToggle size={46} className="side-nav__brand-logo" />
        </div>
        <NavItem to="/app/chats" label="Chats" Icon={IconChats} badge={unread} />
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

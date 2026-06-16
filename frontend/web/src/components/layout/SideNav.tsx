import { NavLink } from "react-router-dom";
import {
  IconCalls,
  IconChats,
  IconContacts,
  IconProfile,
  IconSettings,
} from "@/components/icons/Icons";
import { useChatOptional } from "@/store/ChatContext";

// Settings is rendered separately (pinned to the bottom-left on desktop), so the
// primary sections live here and Settings is appended in its own bottom group.
const NAV = [
  { to: "/app/chats", label: "Chats", Icon: IconChats },
  { to: "/app/contacts", label: "Contacts", Icon: IconContacts },
  { to: "/app/calls", label: "Calls", Icon: IconCalls },
  { to: "/app/profile", label: "Profile", Icon: IconProfile },
] as const;

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
        {NAV.map((item) => (
          <NavItem key={item.to} {...item} badge={item.to === "/app/chats" ? unread : undefined} />
        ))}
      </div>
      {/* Settings — separate bottom group (pinned bottom-left on desktop; inline
          in the bottom bar on mobile). */}
      <div className="side-nav__group side-nav__group--bottom">
        <NavItem to="/app/settings" label="Settings" Icon={IconSettings} />
      </div>
    </nav>
  );
}

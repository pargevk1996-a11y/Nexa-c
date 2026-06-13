import { NavLink } from "react-router-dom";
import {
  IconCalls,
  IconChats,
  IconContacts,
  IconProfile,
  IconSettings,
} from "@/components/icons/Icons";
import { useChatOptional } from "@/store/ChatContext";

const NAV = [
  { to: "/app/chats", label: "Chats", Icon: IconChats },
  { to: "/app/contacts", label: "Contacts", Icon: IconContacts },
  { to: "/app/calls", label: "Calls", Icon: IconCalls },
  { to: "/app/profile", label: "Profile", Icon: IconProfile },
  { to: "/app/settings", label: "Settings", Icon: IconSettings },
] as const;

export function SideNav() {
  const unread = useChatOptional()?.getUnreadTotal() ?? 0;

  return (
    <nav className="side-nav" aria-label="Main">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `side-nav__item ${isActive ? "side-nav__item--active" : ""}`
          }
          title={item.label}
        >
          <span className="side-nav__icon">
            <item.Icon size={20} />
          </span>
          <span className="side-nav__label">{item.label}</span>
          {item.to === "/app/chats" && unread > 0 ? (
            <span className="side-nav__badge" aria-label={`${unread} unread`}>
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

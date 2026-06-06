import { NavLink } from "react-router-dom";
import {
  IconChats,
  IconPosts,
  IconSettings,
  IconStories,
} from "@/components/icons/Icons";
import { useChat } from "@/store/ChatContext";

const NAV = [
  { to: "/app/chats", label: "Chats", Icon: IconChats },
  { to: "/app/stories", label: "Stories", Icon: IconStories },
  { to: "/app/posts", label: "Posts", Icon: IconPosts },
  { to: "/app/settings", label: "Settings", Icon: IconSettings },
] as const;

export function MainNav() {
  let unread = 0;
  try {
    unread = useChat().getUnreadTotal();
  } catch {
    /* outside ChatProvider */
  }

  return (
    <nav className="main-nav" aria-label="Main">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `main-nav__item ${isActive ? "main-nav__item--active" : ""}`
          }
          title={item.label}
        >
          <span className="main-nav__icon">
            <item.Icon size={22} />
          </span>
          <span className="main-nav__label">{item.label}</span>
          {item.to === "/app/chats" && unread > 0 ? (
            <span className="main-nav__badge" aria-label={`${unread} unread messages`}>
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

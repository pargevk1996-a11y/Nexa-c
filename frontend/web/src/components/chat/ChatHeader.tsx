import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { IconButton } from "@/components/ui/IconButton";
import {
  IconChevronLeft,
  IconPhone,
  IconProfile,
  IconSearch,
  IconShield,
  IconVideo,
} from "@/components/icons/Icons";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { displayName } from "@/utils/presenceText";
import { resolveChatType } from "@/utils/chatTypes";
import type { Conversation } from "@/types";
import type { CallType } from "@/types";

/** Compact "time since last seen": 60s / 10m / 2h / 3d / 1y. */
function shortAgo(iso?: string | null, nowMs = Date.now()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 365) return `${d}d`;
  return `${Math.floor(d / 365)}y`;
}

interface ChatHeaderProps {
  conversation: Conversation;
  onStartCall: (type: CallType) => void;
  onOpenProfile?: () => void;
  onOpenSearch?: () => void;
  onBack?: () => void;
  isSuperSecret?: boolean;
  onToggleSuperSecret?: () => void;
}

export function ChatHeader({
  conversation,
  onStartCall,
  onOpenProfile,
  onOpenSearch,
  onBack,
  isSuperSecret = false,
  onToggleSuperSecret,
}: ChatHeaderProps) {
  const chatType = resolveChatType(conversation);
  const isSecret = chatType === "secret";
  const isChannel = chatType === "channel";
  const isSaved = chatType === "saved";
  const { profile: peer } = usePublicProfile(conversation.peerUserId);
  const title = isSaved ? conversation.name : peer ? displayName(peer) : conversation.name;
  const online = conversation.online ?? peer?.is_online ?? false;

  // Live 1s ticker (only while offline) so the compact "last seen" stays current.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (online) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [online]);
  const lastSeenShort = online ? "" : shortAgo(peer?.last_seen_at, nowMs);

  const showCalls = !isSecret && !isChannel && !isSaved;
  const showSuperSecretToggle = !isChannel && !isSaved && onToggleSuperSecret;

  // The avatar is pinned top-right. Tapping it "rolls" (spins) and fans out a
  // minimalist row of action buttons (search / secure / call / video / profile)
  // to its left. Closes on outside click or Escape.
  const [open, setOpen] = useState(false);
  const hubRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (hubRef.current && !hubRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const run = (fn?: () => void) => {
    setOpen(false);
    fn?.();
  };

  return (
    <header className={`chat-header ${isChannel ? "chat-header--channel" : ""}`}>
      {onBack ? (
        <IconButton
          label="Back to chats"
          variant="ghost"
          className="chat-header__back"
          onClick={onBack}
        >
          <IconChevronLeft size={22} />
        </IconButton>
      ) : null}

      <div className={`chat-header__hub ${open ? "chat-header__hub--open" : ""}`} ref={hubRef}>
        <div className="chat-header__hub-actions" role="menu">
          {onOpenSearch ? (
            <button
              type="button"
              className="chat-header__hub-btn"
              onClick={() => run(onOpenSearch)}
              aria-label="Search in chat"
            >
              <IconSearch size={20} />
            </button>
          ) : null}
          {showSuperSecretToggle ? (
            <button
              type="button"
              className={`chat-header__hub-btn ${isSuperSecret ? "chat-header__hub-btn--on" : ""}`}
              onClick={() => run(onToggleSuperSecret)}
              aria-label="Secure chat"
            >
              <IconShield size={20} />
            </button>
          ) : null}
          {showCalls ? (
            <>
              <button
                type="button"
                className="chat-header__hub-btn"
                onClick={() => run(() => onStartCall("audio"))}
                aria-label="Call"
              >
                <IconPhone size={20} />
              </button>
              <button
                type="button"
                className="chat-header__hub-btn"
                onClick={() => run(() => onStartCall("video"))}
                aria-label="Video call"
              >
                <IconVideo size={20} />
              </button>
            </>
          ) : null}
          <button
            type="button"
            className="chat-header__hub-btn"
            onClick={() => run(onOpenProfile)}
            aria-label="Profile"
          >
            <IconProfile size={20} />
          </button>
        </div>
        <div className="chat-header__hub-av">
          <button
            type="button"
            className="chat-header__hub-avatar"
            onClick={() => setOpen((o) => !o)}
            aria-label={`${title} — actions`}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <Avatar
              name={title}
              size="lg"
              avatarUrl={peer?.avatar_url}
              animatedUrl={peer?.animated_avatar_url}
              avatarKind={peer?.avatar_kind}
            />
          </button>
          {!isChannel && !isSaved ? (
            <span
              className={`chat-header__presence ${online ? "chat-header__presence--on" : ""}`}
              title={online ? "Online" : "Last seen"}
            >
              {online ? "" : lastSeenShort}
            </span>
          ) : null}
        </div>
      </div>
    </header>
  );
}

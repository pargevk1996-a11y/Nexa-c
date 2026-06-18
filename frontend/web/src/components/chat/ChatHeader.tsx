import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
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
import { displayName, formatLastSeen } from "@/utils/presenceText";
import { ChatTypeBadge } from "@/components/chat/ChatTypeBadge";
import { isBroadcastChannel, resolveChatType } from "@/utils/chatTypes";
import type { Conversation } from "@/types";
import type { CallType } from "@/types";

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
  const isGroupLike = chatType === "group" || chatType === "supergroup";
  const isSaved = chatType === "saved";
  const broadcast = isBroadcastChannel(conversation);
  const { profile: peer } = usePublicProfile(conversation.peerUserId);
  const title = isSaved ? conversation.name : peer ? displayName(peer) : conversation.name;
  // Prefer the live, periodically-refreshed conversation.online (kept fresh by
  // ChatContext's presence poll) over the process-lifetime cached peer profile,
  // whose is_online would otherwise stay frozen green after the peer goes offline.
  const online = conversation.online ?? peer?.is_online ?? false;

  // Live 1s ticker while offline so the "last seen Ns ago" counter updates in
  // real time. Disabled when online (nothing to count) to avoid needless renders.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (online) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [online]);

  const statusLine = (() => {
    if (isSaved) return "Saved messages";
    if (isChannel) {
      const subs =
        conversation.memberCount != null
          ? `${conversation.memberCount.toLocaleString()} subscribers`
          : "Channel";
      return broadcast ? `Broadcast · ${subs}` : subs;
    }
    if (isGroupLike && conversation.memberCount) {
      return `${conversation.memberCount.toLocaleString()} members`;
    }
    if (conversation.typing) return "typing…";
    // Online → always the green "Online" label (same live source as the dot);
    // offline → the poll-refreshed last-seen time.
    if (online) return "Online";
    if (peer) return formatLastSeen(peer.last_seen_at, nowMs);
    return "Offline";
  })();

  // Green text + dot only for a real one-to-one online peer (not channels/typing).
  const showOnline = online && !conversation.typing && !isChannel;

  const showCalls = !isSecret && !isChannel && !isSaved;
  const showSuperSecretToggle = !isChannel && !isSaved && onToggleSuperSecret;

  // Tap the avatar → a popup with the chat functions (search / secure chat /
  // call / video / profile). Closes on outside click or Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);
  const runAndClose = (fn?: () => void) => {
    setMenuOpen(false);
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
      <div className="chat-header__id" ref={menuRef}>
        <div className="chat-header__avatar-wrap">
        <button
          type="button"
          className="chat-header__profile-trigger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={`${title} — chat actions`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Avatar
            name={title}
            online={online && !isChannel}
            size="lg"
            avatarUrl={peer?.avatar_url}
            animatedUrl={peer?.animated_avatar_url}
            avatarKind={peer?.avatar_kind}
          />
        </button>
        {menuOpen ? (
          <div className="chat-header__popup" role="menu">
            {onOpenSearch ? (
              <button
                type="button"
                role="menuitem"
                className="chat-header__popup-item"
                onClick={() => runAndClose(onOpenSearch)}
              >
                <IconSearch size={18} />
                <span>Search</span>
              </button>
            ) : null}
            {showSuperSecretToggle ? (
              <button
                type="button"
                role="menuitem"
                className="chat-header__popup-item"
                onClick={() => runAndClose(onToggleSuperSecret)}
              >
                <IconShield size={18} />
                <span>{isSuperSecret ? "SecureChat: on" : "Secure chat"}</span>
              </button>
            ) : null}
            {showCalls ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className="chat-header__popup-item"
                  onClick={() => runAndClose(() => onStartCall("audio"))}
                >
                  <IconPhone size={18} />
                  <span>Call</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="chat-header__popup-item"
                  onClick={() => runAndClose(() => onStartCall("video"))}
                >
                  <IconVideo size={18} />
                  <span>Video call</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              role="menuitem"
              className="chat-header__popup-item"
              onClick={() => runAndClose(onOpenProfile)}
            >
              <IconProfile size={18} />
              <span>Profile</span>
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        className="chat-header__profile-trigger chat-header__info"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <h3 className="chat-header__title-row">
          {isSecret ? (
            <span className="chat-header__secret-badge" title="Secret chat">
              Secret
            </span>
          ) : null}
          {isSuperSecret ? (
            <span className="chat-header__supersecret-badge" title="SecureChat mode active" aria-hidden>
              🔒
            </span>
          ) : null}
          {chatType !== "private" ? (
            <ChatTypeBadge conversation={conversation} variant="pill" />
          ) : null}
          <span className="privacy-no-copy">{title}</span>
          {peer ? <VerificationBadge badge={peer.verification_badge} /> : null}
        </h3>
        <p className={`chat-header__status-line ${showOnline ? "chat-header__status-line--online" : ""}`}>
          <span className={showOnline ? "chat-header__online-dot" : ""} />
          {statusLine}
        </p>
      </button>
      </div>
      <div className="chat-header__actions">
        {onOpenSearch ? (
          <IconButton label="Search in chat" variant="ghost" onClick={onOpenSearch}>
            <IconSearch size={20} />
          </IconButton>
        ) : null}
        {showCalls ? (
          <>
            <IconButton
              label="Voice call"
              variant="ghost"
              onClick={() => onStartCall("audio")}
            >
              <IconPhone size={20} />
            </IconButton>
            <IconButton label="Video call" variant="ghost" onClick={() => onStartCall("video")}>
              <IconVideo size={20} />
            </IconButton>
          </>
        ) : null}
        {showSuperSecretToggle ? (
          <button
            type="button"
            className={`chat-header__secure-btn ${isSuperSecret ? "chat-header__secure-btn--on" : ""}`}
            onClick={onToggleSuperSecret}
            title={isSuperSecret ? "SecureChat ON — tap to disable" : "Enable SecureChat mode"}
            aria-pressed={isSuperSecret}
          >
            <IconShield size={16} />
            <span>SecureChat</span>
          </button>
        ) : null}
        <IconButton
          label="Chat menu"
          variant="ghost"
          className="chat-header__menu-btn"
          onClick={() => onOpenProfile?.()}
        >
          <span className="chat-header__menu-icon" aria-hidden>
            ⋮
          </span>
        </IconButton>
      </div>
    </header>
  );
}

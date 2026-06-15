import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
import { IconButton } from "@/components/ui/IconButton";
import {
  IconChevronLeft,
  IconPhone,
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
      <button
        type="button"
        className="chat-header__profile-trigger"
        onClick={() => onOpenProfile?.()}
        aria-label={`View ${title} profile`}
      >
        <Avatar
          name={title}
          online={online && !isChannel}
          size="md"
          avatarUrl={peer?.avatar_url}
          animatedUrl={peer?.animated_avatar_url}
          avatarKind={peer?.avatar_kind}
        />
      </button>
      <button
        type="button"
        className="chat-header__profile-trigger chat-header__info"
        onClick={() => onOpenProfile?.()}
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

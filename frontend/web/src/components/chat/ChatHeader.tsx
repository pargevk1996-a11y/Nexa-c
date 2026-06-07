import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
import { IconButton } from "@/components/ui/IconButton";
import {
  IconChevronLeft,
  IconMoon,
  IconPhone,
  IconSearch,
  IconShield,
  IconSun,
  IconVideo,
} from "@/components/icons/Icons";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { useSettings } from "@/store/SettingsContext";
import type { ThemeMode } from "@/store/settings";
import { displayName, presenceLine } from "@/utils/presenceText";
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
  const { settings, update } = useSettings();
  const [isDark, setIsDark] = useState(true);
  const chatType = resolveChatType(conversation);
  const isSecret = chatType === "secret";
  const isChannel = chatType === "channel";
  const isGroupLike = chatType === "group" || chatType === "supergroup";
  const isSaved = chatType === "saved";
  const broadcast = isBroadcastChannel(conversation);
  const { profile: peer } = usePublicProfile(conversation.peerUserId);
  const title = isSaved ? conversation.name : peer ? displayName(peer) : conversation.name;
  const online = peer?.is_online ?? conversation.online;

  useEffect(() => {
    const dark =
      settings.theme === "dark" ||
      (settings.theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    setIsDark(dark);
  }, [settings.theme]);

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
    if (peer) return presenceLine(peer);
    return online ? "online" : "offline";
  })();

  const showCalls = !isSecret && !isChannel && !isSaved;
  const showSuperSecretToggle = !isChannel && !isSaved && onToggleSuperSecret;

  const themeCycle: ThemeMode[] = ["dark", "light", "system"];

  function cycleTheme() {
    const idx = themeCycle.indexOf(settings.theme);
    const next = themeCycle[(idx + 1) % themeCycle.length];
    update("theme", next);
  }

  const themeLabel =
    settings.theme === "system" ? "System theme" : isDark ? "Light mode" : "Dark mode";

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
        <p className="chat-header__status-line">
          <span className={online && !conversation.typing ? "chat-header__online-dot" : ""} />
          {statusLine}
        </p>
      </button>
      <div className="chat-header__actions">
        {onOpenSearch ? (
          <IconButton label="Search in chat" variant="ghost" onClick={onOpenSearch}>
            <IconSearch size={20} />
          </IconButton>
        ) : null}
        <IconButton label={themeLabel} variant="ghost" onClick={cycleTheme}>
          {settings.theme === "system" ? (
            <span className="chat-header__theme-sys" aria-hidden>
              ◐
            </span>
          ) : isDark ? (
            <IconSun size={20} />
          ) : (
            <IconMoon size={20} />
          )}
        </IconButton>
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
        <IconButton label="Chat menu" variant="ghost" onClick={() => onOpenProfile?.()}>
          <span className="chat-header__menu-icon" aria-hidden>
            ⋮
          </span>
        </IconButton>
      </div>
    </header>
  );
}

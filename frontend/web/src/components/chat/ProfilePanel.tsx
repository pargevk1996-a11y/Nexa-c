import { useMemo, useState } from "react";
import { useNotificationPrefs } from "@/hooks/useNotificationPrefs";
import { Link } from "react-router-dom";
import {
  IconImage,
  IconMore,
  IconSearch,
  IconSettings,
  IconX,
} from "@/components/icons/Icons";
import { VerificationBadge } from "@/components/profile/VerificationBadge";
import { Avatar } from "@/components/ui/Avatar";
import { usePublicProfile } from "@/hooks/usePublicProfile";
import { displayName, presenceLine } from "@/utils/presenceText";
import type { Conversation, Message } from "@/types";

type ProfileSection = "media" | "members" | "pinned" | "settings" | null;

interface ProfilePanelProps {
  conversation: Conversation | null;
  messages?: Message[];
  onClose?: () => void;
}

function Toggle({
  label,
  defaultOn = false,
  onChange,
}: {
  label: string;
  defaultOn?: boolean;
  onChange?: (on: boolean) => void;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="profile-panel__toggle-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={`profile-panel__toggle ${on ? "profile-panel__toggle--on" : ""}`}
        onClick={() => {
          setOn((v) => {
            const next = !v;
            onChange?.(next);
            return next;
          });
        }}
      >
        <span className="profile-panel__toggle-knob" />
      </button>
    </div>
  );
}

const MEDIA_PLACEHOLDERS = ["🖼️", "🎬", "📎", "🎵", "📷", "📄"];

export function ProfilePanel({ conversation, messages = [], onClose }: ProfilePanelProps) {
  const { chatPrefs, updateChat, live } = useNotificationPrefs(conversation?.id ?? null);
  const [section, setSection] = useState<ProfileSection>(null);

  const sharedMedia = useMemo(
    () => messages.filter((m) => m.kind === "file" && !m.recalled),
    [messages],
  );

  const pinnedMessages = useMemo(
    () => messages.filter((m) => !m.recalled && m.text.length > 0).slice(0, 6),
    [messages],
  );

  const linksAndFiles = useMemo(
    () =>
      messages.filter(
        (m) =>
          !m.recalled &&
          (m.kind === "file" || /https?:\/\//i.test(m.text)),
      ),
    [messages],
  );

  if (!conversation) {
    return (
      <aside className="profile-panel profile-panel--empty glass-panel">
        <p>Select a conversation to view profile details</p>
      </aside>
    );
  }

  const isSecret = Boolean(conversation.isSecret);
  const isGroup = Boolean(conversation.isGroup);
  const { profile: peer } = usePublicProfile(conversation.peerUserId);
  const title = peer ? displayName(peer) : conversation.name;
  const memberNames = isGroup
    ? ["You", conversation.name, "Alex", "Maria"].filter((n, i, a) => a.indexOf(n) === i)
    : [conversation.name];

  return (
    <aside className="profile-panel">
      {onClose ? (
        <button
          type="button"
          className="profile-panel__close"
          onClick={onClose}
          aria-label="Close profile"
        >
          <IconX size={20} />
        </button>
      ) : null}

      <div className="profile-panel__scroll">
        <div className="profile-panel__hero">
          <div className="profile-panel__hero-glow" aria-hidden />
          <div className="profile-panel__avatar-wrap">
            <Avatar
              name={title}
              online={peer?.is_online ?? conversation.online}
              size="lg"
              avatarUrl={peer?.avatar_url}
              animatedUrl={peer?.animated_avatar_url}
              avatarKind={peer?.avatar_kind}
            />
          </div>
          <h2 className="profile-panel__name profile-panel__display-name privacy-no-copy">
            {title}
            {peer ? <VerificationBadge badge={peer.verification_badge} /> : null}
          </h2>
          {!isSecret && peer?.username ? (
            <p className="profile-panel__uid privacy-no-copy">${peer.username}</p>
          ) : !isSecret ? (
            <p className="profile-panel__uid privacy-no-copy">{conversation.uid}</p>
          ) : null}
          {peer?.bio ? <p className="profile-panel__bio">{peer.bio}</p> : null}
          {peer?.status_text && (peer.is_online || peer.status_text) ? (
            <p className="profile-panel__status-text">{peer.status_text}</p>
          ) : null}
          <p className="profile-panel__status">
            <span className="profile-panel__status-dot" aria-hidden />
            {peer ? presenceLine(peer) : conversation.online ? "Online" : "Last seen recently"}
            {isSecret ? " · Secret chat" : null}
          </p>
        </div>

        <div className="profile-panel__actions">
          {conversation.peerUserId ? (
            <Link to={`/app/user/${conversation.peerUserId}`} className="profile-panel__action-btn">
              <IconSettings size={18} />
              Profile
            </Link>
          ) : null}
          <button
            type="button"
            className={`profile-panel__action-btn ${section === "media" ? "profile-panel__action-btn--active" : ""}`}
            onClick={() => setSection((s) => (s === "media" ? null : "media"))}
          >
            <IconImage size={18} />
            Media
          </button>
          <button type="button" className="profile-panel__action-btn" aria-label="Search in chat">
            <IconSearch size={18} />
            Search
          </button>
          <button
            type="button"
            className={`profile-panel__action-btn ${section === "settings" ? "profile-panel__action-btn--active" : ""}`}
            onClick={() => setSection((s) => (s === "settings" ? null : "settings"))}
          >
            <IconMore size={18} />
            More
          </button>
        </div>

        {section === "media" ? (
          <div className="profile-panel__section">
            <h3 className="profile-panel__section-title">Shared media</h3>
            {sharedMedia.length === 0 ? (
              <div className="profile-panel__media-grid">
                {MEDIA_PLACEHOLDERS.map((emoji, i) => (
                  <button key={i} type="button" className="profile-panel__media-thumb" aria-label="Media">
                    {emoji}
                  </button>
                ))}
              </div>
            ) : (
              <ul className="profile-panel__file-list">
                {sharedMedia.map((m) => (
                  <li key={m.id} className="profile-panel__file-item">
                    {m.fileName ?? m.text}
                  </li>
                ))}
              </ul>
            )}
            <h3 className="profile-panel__section-title">Links & files</h3>
            {linksAndFiles.length === 0 ? (
              <p className="profile-panel__muted">No links or files yet</p>
            ) : (
              <ul className="profile-panel__file-list">
                {linksAndFiles.map((m) => (
                  <li key={m.id} className="profile-panel__file-item">
                    {m.fileName ?? m.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {section === "members" && isGroup ? (
          <div className="profile-panel__section">
            <h3 className="profile-panel__section-title">Members ({memberNames.length})</h3>
            <ul className="profile-panel__members">
              {memberNames.map((name) => (
                <li key={name} className="profile-panel__member">
                  <Avatar name={name} size="sm" />
                  <span>{name}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {section === "pinned" ? (
          <div className="profile-panel__section">
            <h3 className="profile-panel__section-title">Pinned messages</h3>
            {pinnedMessages.length === 0 ? (
              <p className="profile-panel__muted">No pinned messages in this chat</p>
            ) : (
              <ul className="profile-panel__pinned-list">
                {pinnedMessages.map((m) => (
                  <li key={m.id} className="profile-panel__pinned-item">
                    <span className="profile-panel__pinned-text">{m.text}</span>
                    <span className="profile-panel__pinned-time">{m.sentAt}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {section === "settings" ? (
          <div className="profile-panel__settings">
            <h3 className="profile-panel__section-title">Notifications</h3>
            <Toggle
              label="Mute notifications"
              defaultOn={chatPrefs?.mute_all ?? false}
              onChange={(on) => {
                if (live) void updateChat({ mute_all: on });
              }}
            />
            <Toggle
              label="Mentions only while muted"
              defaultOn={chatPrefs?.mentions_only ?? false}
              onChange={(on) => {
                if (live) void updateChat({ mentions_only: on });
              }}
            />
            <Toggle
              label="Message notifications"
              defaultOn={chatPrefs?.desktop_enabled ?? true}
              onChange={(on) => {
                if (live) void updateChat({ desktop_enabled: on, push_enabled: on });
              }}
            />
            <Toggle
              label="Preview in notification"
              defaultOn={chatPrefs?.preview ?? true}
              onChange={(on) => {
                if (live) void updateChat({ preview: on });
              }}
            />
            {!isSecret ? <Toggle label="Block user" /> : null}
            {isGroup ? (
              <button
                type="button"
                className="profile-panel__settings-link profile-panel__settings-link--btn"
                onClick={() => setSection("members")}
              >
                View members
              </button>
            ) : null}
            <Link to="/app/settings" className="profile-panel__settings-link">
              Open app settings
            </Link>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

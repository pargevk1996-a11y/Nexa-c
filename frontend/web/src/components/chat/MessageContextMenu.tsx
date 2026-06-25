import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useContextMenuDismiss } from "@/hooks/useContextMenuDismiss";
import { features } from "@/features/registry";
import type { Message } from "@/types";
import { canRecallMessage, isMessageViewedByPeer } from "@/utils/messageStatus";

export type MessageMenuAction =
  | { type: "copy" }
  | { type: "reply" }
  | { type: "forward" }
  | { type: "edit" }
  | { type: "recall" }
  | { type: "delete"; scope: "me" | "everyone" }
  | { type: "select" }
  | { type: "pin" }
  | { type: "unpin" }
  | { type: "react"; emoji: string };

const QUICK_REACT = ["👍", "❤️", "😂", "🔥", "🎉"];
const MORE_REACT = [
  "👍", "❤️", "😂", "🔥", "🎉", "😮", "😢", "🥰", "🙏", "👏", "💯", "✅",
  "😍", "🤯", "😎", "🤝", "🙌", "👌", "💪", "😅", "🤔", "🥳", "😴", "🤩",
];

interface MessageContextMenuProps {
  message: Message;
  isGroup: boolean;
  isSecret?: boolean;
  isSuperSecret?: boolean;
  isPinned?: boolean;
  isChannelAdmin?: boolean;
  position: { x: number; y: number };
  onAction: (action: MessageMenuAction) => void;
  onClose: () => void;
}

interface MenuItem {
  id: string;
  label: string;
  action?: MessageMenuAction;
  danger?: boolean;
  children?: { id: string; label: string; action: MessageMenuAction }[];
}

function buildMenuItems(
  message: Message,
  isGroup: boolean,
  isSecret: boolean,
  isSuperSecret: boolean,
  isPinned: boolean,
  isChannelAdmin: boolean,
): MenuItem[] {
  if (message.recalled || message.deleted) {
    return [
      {
        id: "delete-me-only",
        label: "Delete for me",
        action: { type: "delete", scope: "me" },
        danger: true,
      },
      { id: "select", label: "Select", action: { type: "select" } },
    ];
  }

  const isText = message.kind === "text";
  const isOwn = message.outgoing;
  const viewedByPeer = isMessageViewedByPeer(message.status);
  const canRecall = canRecallMessage(message);
  const items: MenuItem[] = [];

  if (!message.recalled && !message.ephemeral) {
    // In broadcast channel don't show Reply/Forward — it's a one-way announcement feed.
    if (!isChannelAdmin) {
      items.push({ id: "reply", label: "Reply", action: { type: "reply" } });
    }
    if (!isSecret && !isSuperSecret && !isChannelAdmin) {
      items.push({ id: "forward", label: "Forward", action: { type: "forward" } });
    }
    if (features.chat.pins && !isChannelAdmin) {
      items.push({
        id: isPinned ? "unpin" : "pin",
        label: isPinned ? "Unpin" : "Pin",
        action: isPinned ? { type: "unpin" } : { type: "pin" },
      });
    }
  }

  if (isText && !isSecret && !isSuperSecret && !message.ephemeral) {
    items.push({ id: "copy", label: "Copy", action: { type: "copy" } });
  }

  // Channel admin can always edit their own messages (no "edited" marker will appear — backend handles that).
  if (isOwn && isText && !isSecret && !isSuperSecret && !message.ephemeral) {
    items.push({ id: "edit", label: "Edit", action: { type: "edit" } });
  }

  // Own messages: always offer delete for everyone (channel admins too).
  // Keep "Undo send" as a separate fast option when still within recall window.
  if (isOwn || isChannelAdmin) {
    if (canRecall) {
      items.push({ id: "recall", label: "Undo send", action: { type: "recall" }, danger: true });
    }
    const forEveryoneLabel = isChannelAdmin || isGroup ? "Delete for everyone" : "Delete for both";
    items.push({
      id: "delete",
      label: "Delete",
      children: [
        { id: "delete-me", label: "Delete for me", action: { type: "delete", scope: "me" } },
        { id: "delete-all", label: forEveryoneLabel, action: { type: "delete", scope: "everyone" } },
      ],
    });
  } else {
    // Incoming message — can only delete from own view.
    items.push({
      id: "delete-me-only",
      label: "Delete for me",
      action: { type: "delete", scope: "me" },
      danger: true,
    });
  }

  items.push({ id: "select", label: "Select", action: { type: "select" } });
  return items;
}

export function MessageContextMenu({
  message,
  isGroup,
  isSecret,
  isSuperSecret,
  isPinned,
  isChannelAdmin,
  position,
  onAction,
  onClose,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState(position);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reactExpanded, setReactExpanded] = useState(false);
  const items = buildMenuItems(message, isGroup, Boolean(isSecret), Boolean(isSuperSecret), Boolean(isPinned), Boolean(isChannelAdmin));

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    if (x + rect.width > window.innerWidth - pad) {
      x = window.innerWidth - rect.width - pad;
    }
    if (y + rect.height > window.innerHeight - pad) {
      y = window.innerHeight - rect.height - pad;
    }
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    setCoords({ x, y });
  }, [position, deleteOpen, reactExpanded, items.length]);

  useContextMenuDismiss(menuRef, onClose);

  function run(action: MessageMenuAction) {
    onAction(action);
    onClose();
  }

  return createPortal(
    <>
      <div
        className="msg-context-menu__scrim"
        aria-hidden
        onClick={onClose}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div
        ref={menuRef}
        className="msg-context-menu"
        style={{ left: coords.x, top: coords.y }}
        role="menu"
        onContextMenu={(e) => e.preventDefault()}
      >
      {features.chat.reactions && !message.recalled && !message.ephemeral ? (
        <div className="msg-context-menu__react-wrap">
          <div className="msg-context-menu__react" role="group" aria-label="Quick reactions">
            {QUICK_REACT.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="msg-context-menu__react-btn"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => run({ type: "react", emoji })}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className={`msg-context-menu__react-more ${reactExpanded ? "msg-context-menu__react-more--open" : ""}`}
              aria-label="More reactions"
              aria-expanded={reactExpanded}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setReactExpanded((o) => !o)}
            >
              ⌄
            </button>
          </div>
          {reactExpanded ? (
            <div className="msg-context-menu__react-grid" role="group" aria-label="More reactions">
              {MORE_REACT.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="msg-context-menu__react-btn"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => run({ type: "react", emoji })}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {items.map((item) => {
        if (item.children) {
          return (
            <div key={item.id} className="msg-context-menu__group">
              <button
                type="button"
                className="msg-context-menu__item msg-context-menu__item--sub"
                role="menuitem"
                aria-expanded={deleteOpen}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setDeleteOpen((o) => !o)}
              >
                {item.label}
                <span className="msg-context-menu__chevron" aria-hidden>
                  ›
                </span>
              </button>
              {deleteOpen ? (
                <div className="msg-context-menu__sub" role="group">
                  {item.children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      className="msg-context-menu__item msg-context-menu__item--sub-item"
                      role="menuitem"
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => run(child.action)}
                    >
                      {child.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={`msg-context-menu__item ${item.danger ? "msg-context-menu__item--danger" : ""}`}
            role="menuitem"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => item.action && run(item.action)}
          >
            {item.label}
          </button>
        );
      })}
      </div>
    </>,
    document.body,
  );
}

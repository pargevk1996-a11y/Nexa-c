import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useContextMenuDismiss } from "@/hooks/useContextMenuDismiss";
import type { Conversation } from "@/types";
import { resolveChatType, SAVED_MESSAGES_ID } from "@/utils/chatTypes";
import { CHAT_FOLDERS } from "@/utils/chatTypes";

export type ChatMenuAction =
  | { type: "pin" }
  | { type: "unpin" }
  | { type: "hide" }
  | { type: "unhide" }
  | { type: "archive" }
  | { type: "unarchive" }
  | { type: "set_folder"; folderId: Conversation["folderId"] }
  | { type: "clear_chat" }
  | { type: "delete"; scope: "me" | "both" }
  | { type: "mute" }
  | { type: "unmute" }
  | { type: "remove_contact" }
  | { type: "block" }
  | { type: "verify_safety" };

interface ChatContextMenuProps {
  conversation: Conversation;
  position: { x: number; y: number };
  onAction: (action: ChatMenuAction) => void;
  onClose: () => void;
}

export function ChatContextMenu({
  conversation,
  position,
  onAction,
  onClose,
}: ChatContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState(position);
  const type = resolveChatType(conversation);
  const isSaved = conversation.id === SAVED_MESSAGES_ID;
  const isDm = type === "private" || type === "secret";
  const isBroadcast = type === "channel" && !conversation.isChannelAdmin;

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const pad = 8;
    const rect = el.getBoundingClientRect();
    let x = position.x;
    let y = position.y;
    if (x + rect.width > window.innerWidth - pad) x = window.innerWidth - rect.width - pad;
    if (y + rect.height > window.innerHeight - pad) y = window.innerHeight - rect.height - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    setCoords({ x, y });
  }, [position]);

  useContextMenuDismiss(menuRef, onClose);

  function run(action: ChatMenuAction) {
    onAction(action);
    onClose();
  }

  const items: { label: string; action: ChatMenuAction; danger?: boolean }[] = [];

  if (!isSaved) {
    if (conversation.pinned) {
      items.push({ label: "Unpin chat", action: { type: "unpin" } });
    } else {
      items.push({ label: "Pin chat", action: { type: "pin" } });
    }
  }
  if (!isSaved) {
    if (conversation.hidden) {
      items.push({ label: "Unhide", action: { type: "unhide" } });
    } else {
      items.push({ label: "Make invisible", action: { type: "hide" } });
    }
    if (conversation.archived) {
      items.push({ label: "Unarchive", action: { type: "unarchive" } });
    } else {
      items.push({ label: "Archive chat", action: { type: "archive" } });
    }
    for (const f of CHAT_FOLDERS) {
      items.push({
        label: `Move to ${f.label}`,
        action: { type: "set_folder", folderId: f.id },
      });
    }
  }
  if (isBroadcast) {
    // Broadcast channel: users can only mute, not delete or leave.
    if (conversation.muted) {
      items.push({ label: "Unmute notifications", action: { type: "unmute" } });
    } else {
      items.push({ label: "Mute notifications", action: { type: "mute" } });
    }
  } else if (!isSaved) {
    items.push(
      { label: "Clear chat", action: { type: "clear_chat" }, danger: true },
      { label: "Delete for me", action: { type: "delete", scope: "me" }, danger: true },
      {
        label: isDm ? "Delete for both" : "Delete for everyone",
        action: { type: "delete", scope: "both" },
        danger: true,
      },
    );
  }
  if (isDm && !isSaved) {
    items.push(
      { label: "Verify safety numbers", action: { type: "verify_safety" } },
      { label: "Remove from contacts", action: { type: "remove_contact" } },
      { label: "Block user", action: { type: "block" }, danger: true },
    );
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
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`msg-context-menu__item ${item.danger ? "msg-context-menu__item--danger" : ""}`}
            role="menuitem"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => run(item.action)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}

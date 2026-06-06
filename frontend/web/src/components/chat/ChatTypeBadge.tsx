import type { Conversation } from "@/types";
import { getChatTypeMeta } from "@/utils/chatTypes";

interface ChatTypeBadgeProps {
  conversation: Conversation;
  variant?: "inline" | "pill";
}

export function ChatTypeBadge({ conversation, variant = "inline" }: ChatTypeBadgeProps) {
  const meta = getChatTypeMeta(conversation);
  if (variant === "inline") {
    return (
      <span className={`chat-type-badge chat-type-badge--inline ${meta.className}`} title={meta.label}>
        {meta.icon}
      </span>
    );
  }
  return (
    <span className={`chat-type-badge chat-type-badge--pill ${meta.className}`} title={meta.label}>
      {meta.short}
    </span>
  );
}

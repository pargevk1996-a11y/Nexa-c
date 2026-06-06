import type { Conversation } from "@/types";

interface ChatTypingBarProps {
  conversation: Conversation | null;
}

export function ChatTypingBar({ conversation }: ChatTypingBarProps) {
  if (!conversation?.typing) return null;

  const label = conversation.isGroup
    ? "Someone is typing"
    : `${conversation.name} is typing`;

  return (
    <div className="chat-typing-bar" role="status" aria-live="polite">
      <span className="chat-typing-bar__dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      <span className="chat-typing-bar__label">{label}</span>
    </div>
  );
}

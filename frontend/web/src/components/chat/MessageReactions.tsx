const QUICK = ["👍", "❤️", "😂", "🔥", "✨"];

interface MessageReactionsProps {
  messageId: string;
  reactions?: Record<string, number>;
  myReaction?: string;
  onToggleReaction?: (emoji: string) => void;
}

export function MessageReactions({
  messageId,
  reactions = {},
  myReaction,
  onToggleReaction,
}: MessageReactionsProps) {
  const entries = Object.entries(reactions).filter(([, n]) => n > 0);

  function toggle(emoji: string) {
    onToggleReaction?.(emoji);
  }

  if (entries.length === 0) {
    return (
      <div className="chat-reactions" data-message-id={messageId}>
        <button
          type="button"
          className="chat-reaction-add"
          aria-label="Add reaction"
          onClick={() => toggle(QUICK[0])}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="chat-reactions" data-message-id={messageId}>
      {entries.map(([emoji, count]) => (
        <button
          key={emoji}
          type="button"
          className={`chat-reaction ${myReaction === emoji ? "chat-reaction--mine" : ""}`}
          onClick={() => toggle(emoji)}
        >
          {emoji} {count > 1 ? count : null}
        </button>
      ))}
      <button
        type="button"
        className="chat-reaction-add"
        aria-label="Add reaction"
        onClick={() => toggle(QUICK[Math.floor(Math.random() * QUICK.length)])}
      >
        +
      </button>
    </div>
  );
}

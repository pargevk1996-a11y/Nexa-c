import { FormattedMessageText } from "@/components/chat/FormattedMessageText";
import { IconX } from "@/components/icons/Icons";
import type { Message } from "@/types";
import { replySnippet } from "@/utils/messageLayout";

interface PinnedMessagesBarProps {
  message: Message;
  peerName: string;
  onUnpin: () => void;
  onJump?: () => void;
}

export function PinnedMessagesBar({ message, peerName, onUnpin, onJump }: PinnedMessagesBarProps) {
  const preview =
    message.kind === "poll" || message.kind === "quiz"
      ? message.poll?.question ?? message.quiz?.question ?? "Poll"
      : message.recalled
        ? "Message recalled"
        : replySnippet(message, peerName);

  return (
    <div className="pinned-bar" role="region" aria-label="Pinned message">
      <button type="button" className="pinned-bar__body" onClick={onJump}>
        <span className="pinned-bar__label">Pinned</span>
        <span className="pinned-bar__text">
          {message.kind === "text" && !message.recalled ? (
            <FormattedMessageText text={preview} className="formatted-msg formatted-msg--compact" />
          ) : (
            preview
          )}
        </span>
      </button>
      <button type="button" className="pinned-bar__unpin" onClick={onUnpin} aria-label="Unpin message">
        <IconX size={16} />
      </button>
    </div>
  );
}

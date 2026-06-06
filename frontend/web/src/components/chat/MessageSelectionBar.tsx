interface MessageSelectionBarProps {
  count: number;
  isGroup: boolean;
  /** False when selection mixes incoming and outgoing (or only incoming) */
  showDeleteForEveryone: boolean;
  onCancel: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}

export function MessageSelectionBar({
  count,
  isGroup,
  showDeleteForEveryone,
  onCancel,
  onDeleteForMe,
  onDeleteForEveryone,
}: MessageSelectionBarProps) {
  if (count === 0) return null;

  const forEveryoneLabel = isGroup ? "Delete for everyone" : "Delete for both";

  return (
    <div className="msg-selection-bar" role="toolbar" aria-label="Selected messages">
      <span className="msg-selection-bar__count">{count} selected</span>
      <div className="msg-selection-bar__actions">
        <button type="button" className="msg-selection-bar__btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="msg-selection-bar__btn" onClick={onDeleteForMe}>
          Delete for me
        </button>
        {showDeleteForEveryone ? (
          <button
            type="button"
            className="msg-selection-bar__btn msg-selection-bar__btn--danger"
            onClick={onDeleteForEveryone}
          >
            {forEveryoneLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

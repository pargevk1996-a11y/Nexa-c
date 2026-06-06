interface SmartReplyBarProps {
  suggestions: string[];
  loading?: boolean;
  onPick: (text: string) => void;
}

export function SmartReplyBar({ suggestions, loading, onPick }: SmartReplyBarProps) {
  if (!suggestions.length && !loading) return null;

  return (
    <div className="smart-reply-bar" role="group" aria-label="Smart reply suggestions">
      <span className="smart-reply-bar__label">Suggestions</span>
      <div className="smart-reply-bar__chips">
        {loading && !suggestions.length ? (
          <span className="smart-reply-bar__loading">Thinking…</span>
        ) : null}
        {suggestions.map((s) => (
          <button key={s} type="button" className="smart-reply-bar__chip" onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

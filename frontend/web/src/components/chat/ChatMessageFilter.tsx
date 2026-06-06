import { IconFilter, IconX } from "@/components/icons/Icons";
import { features } from "@/features/registry";

interface ChatMessageFilterProps {
  value: string;
  onChange: (value: string) => void;
}

export function ChatMessageFilter({ value, onChange }: ChatMessageFilterProps) {
  if (!features.chat.search) return null;

  return (
    <div className="chat-msg-filter" role="search">
      <IconFilter size={16} aria-hidden />
      <input
        type="search"
        className="chat-msg-filter__input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter messages in this chat…"
        aria-label="Filter messages by keyword"
      />
      {value ? (
        <button
          type="button"
          className="chat-msg-filter__clear"
          onClick={() => onChange("")}
          aria-label="Clear filter"
        >
          <IconX size={14} />
        </button>
      ) : null}
    </div>
  );
}

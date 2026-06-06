import { FormEvent, useMemo, useState } from "react";
import { searchMessages, type SearchHit } from "@/api/ai";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { IconX } from "@/components/icons/Icons";
import { messageMatchesKeyword } from "@/utils/messageFormat";
import { features } from "@/features/registry";

interface MessageSearchPanelProps {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  messages: Array<{ id: string; text: string; sentAt: string }>;
  keywordFilter?: string;
  onKeywordFilterChange?: (value: string) => void;
}

export function MessageSearchPanel({
  open,
  onClose,
  conversationId,
  messages,
  keywordFilter = "",
  onKeywordFilterChange,
}: MessageSearchPanelProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"smart" | "keyword" | "semantic">("smart");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  const localKeywordHits = useMemo(() => {
    const q = keywordFilter.trim();
    if (!q) return [];
    return messages
      .filter((m) => messageMatchesKeyword(m.text, q))
      .slice(0, 25)
      .map((m) => ({
        id: m.id,
        text: m.text,
        score: 1,
        match_type: "keyword" as const,
      }));
  }, [keywordFilter, messages]);

  if (!open) return null;

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) {
      setHits([]);
      return;
    }
    setLoading(true);
    try {
      const res = await searchMessages({
        query: q,
        conversation_id: conversationId ?? undefined,
        messages: messages.map((m) => ({ id: m.id, text: m.text, sent_at: m.sentAt })),
        mode,
        limit: 25,
      });
      setHits(res.hits);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="message-search-panel" role="dialog" aria-label="Search messages">
      <header className="message-search-panel__head">
        <h3>Search in chat</h3>
        <IconButton label="Close search" variant="ghost" onClick={onClose}>
          <IconX size={18} />
        </IconButton>
      </header>
      {features.chat.search ? (
        <div className="message-search-panel__keyword-bar">
          <input
            className="field__input"
            type="search"
            value={keywordFilter}
            onChange={(e) => onKeywordFilterChange?.(e.target.value)}
            placeholder="Filter messages in this chat…"
            aria-label="Keyword filter"
          />
          {localKeywordHits.length > 0 ? (
            <ul className="message-search-panel__keyword-hits">
              {localKeywordHits.map((hit) => (
                <li key={hit.id} className="message-search-panel__hit">
                  <span className="message-search-panel__score">Keyword · local</span>
                  <p>{hit.text}</p>
                </li>
              ))}
            </ul>
          ) : keywordFilter.trim() ? (
            <p className="message-search-panel__empty">No local keyword matches</p>
          ) : null}
        </div>
      ) : null}
      <form className="message-search-panel__form" onSubmit={runSearch}>
        <input
          className="field__input"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Smart, keyword, or semantic search…"
          autoFocus
        />
        <select
          className="field__input message-search-panel__mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as typeof mode)}
          aria-label="Search mode"
        >
          <option value="smart">Smart</option>
          <option value="semantic">Semantic</option>
          <option value="keyword">Keyword</option>
        </select>
        <Button type="submit" disabled={loading || !query.trim()}>
          {loading ? "Searching…" : "Search"}
        </Button>
      </form>
      <ul className="message-search-panel__results">
        {hits.length === 0 && query.trim() && !loading ? (
          <li className="message-search-panel__empty">No matches</li>
        ) : null}
        {hits.map((hit) => (
          <li key={hit.id} className="message-search-panel__hit">
            <span className="message-search-panel__score">
              {Math.round(hit.score * 100)}% · {hit.match_type}
            </span>
            <p>{hit.text}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}

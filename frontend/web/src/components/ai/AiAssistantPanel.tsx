import { FormEvent, useState } from "react";
import { assistantChat, summarizeChat, type AiChatMessage, type ContextMessage } from "@/api/ai";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { IconX } from "@/components/icons/Icons";

interface AiAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  conversationId: string | null;
  contextMessages: ContextMessage[];
}

export function AiAssistantPanel({
  open,
  onClose,
  conversationId,
  contextMessages,
}: AiAssistantPanelProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  if (!open) return null;

  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await assistantChat({ messages: next, conversation_id: conversationId ?? undefined });
      setMessages([...next, { role: "assistant", content: res.reply }]);
    } catch {
      setMessages([
        ...next,
        { role: "assistant", content: "AI assistant is unavailable. Check ai-service and AI_API_KEY." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function runSummarize() {
    if (!contextMessages.length || loading) return;
    setLoading(true);
    try {
      const res = await summarizeChat({
        conversation_id: conversationId ?? undefined,
        messages: contextMessages.slice(-50),
      });
      setSummary(res.summary);
    } catch {
      setSummary("Could not summarize this chat.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="ai-assistant-panel" role="dialog" aria-label="AI assistant">
      <header className="ai-assistant-panel__head">
        <h3>Nexa AI</h3>
        <IconButton label="Close assistant" variant="ghost" onClick={onClose}>
          <IconX size={18} />
        </IconButton>
      </header>
      <div className="ai-assistant-panel__actions">
        <Button type="button" variant="secondary" disabled={loading} onClick={() => void runSummarize()}>
          Summarize chat
        </Button>
      </div>
      {summary ? (
        <div className="ai-assistant-panel__summary">
          <strong>Summary</strong>
          <p>{summary}</p>
        </div>
      ) : null}
      <div className="ai-assistant-panel__thread">
        {messages.length === 0 ? (
          <p className="ai-assistant-panel__hint">Ask anything about this conversation or request a draft reply.</p>
        ) : (
          messages.map((m, i) => (
            <div key={`${m.role}-${i}`} className={`ai-assistant-panel__msg ai-assistant-panel__msg--${m.role}`}>
              {m.content}
            </div>
          ))
        )}
      </div>
      <form className="ai-assistant-panel__composer" onSubmit={send}>
        <input
          className="field__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Nexa AI…"
          disabled={loading}
        />
        <Button type="submit" disabled={loading || !input.trim()}>
          Send
        </Button>
      </form>
    </aside>
  );
}

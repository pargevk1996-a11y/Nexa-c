import type { Message } from "@/types";

export interface MessageReplyRef {
  id: string;
  text: string;
  senderLabel: string;
}

export type MessageRow =
  | { type: "date"; key: string; label: string }
  | {
      type: "message";
      key: string;
      message: Message;
      grouped: boolean;
      showTail: boolean;
    };

/** Bucket messages by calendar day for separators (demo uses time-only strings). */
function dateLabelForMessage(message: Message, index: number): string {
  const t = message.sentAt.toLowerCase();
  if (t.includes("yesterday")) return "Yesterday";
  if (
    t.includes("mon") ||
    t.includes("tue") ||
    t.includes("wed") ||
    t.includes("thu") ||
    t.includes("fri") ||
    t.includes("sat") ||
    t.includes("sun")
  ) {
    return message.sentAt;
  }
  return index === 0 ? "Today" : "Today";
}

function shouldGroupWithPrevious(prev: Message | undefined, current: Message): boolean {
  if (!prev || prev.recalled || current.recalled) return false;
  if (prev.outgoing !== current.outgoing) return false;
  if (prev.kind !== current.kind) return false;
  if (prev.ephemeral || current.ephemeral) return false;
  return true;
}

/**
 * Build the flat row list (messages + date dividers) for the virtualized list.
 *
 * `inverted` controls the visual order:
 *  - false (default): chronological — oldest first (index 0), newest last; the
 *    newest message sits at the BOTTOM.
 *  - true: reversed — newest first (index 0), oldest last; the newest message
 *    sits at the TOP and scrolling DOWN reveals older messages.
 *
 * Grouping flags (`grouped` / `showTail`) are computed against the same
 * chronological neighbours in both modes, so bubbles group identically; only
 * the emission order and each day's divider placement change. In inverted mode
 * a day's divider is emitted just ABOVE that day's newest message.
 */
export function buildMessageRows(messages: Message[], inverted = false): MessageRow[] {
  const rows: MessageRow[] = [];
  let lastDate = "";

  const start = inverted ? messages.length - 1 : 0;
  const step = inverted ? -1 : 1;
  for (let i = start; i >= 0 && i < messages.length; i += step) {
    const m = messages[i];
    const label = dateLabelForMessage(m, i);
    if (label !== lastDate) {
      rows.push({ type: "date", key: `date-${label}-${i}`, label });
      lastDate = label;
    }

    const prev = messages[i - 1];
    const next = messages[i + 1];
    const grouped = shouldGroupWithPrevious(prev, m);
    const nextGrouped = next ? shouldGroupWithPrevious(m, next) : false;

    rows.push({
      type: "message",
      key: m.id,
      message: m,
      grouped,
      showTail: !nextGrouped,
    });
  }

  return rows;
}

export function replySnippet(message: Message, peerName: string): string {
  if (message.recalled) return "Message deleted";
  if (message.kind === "voice") return "Voice message";
  if (message.kind === "video") return message.videoNote ? "Video message" : "Video";
  if (message.kind === "sticker") return message.text || "Sticker";
  if (message.kind === "gif") return message.text ? `GIF: ${message.text}` : "GIF";
  if (message.kind === "file") {
    if (message.fileCategory === "image") return "Photo";
    return message.fileName ?? message.text;
  }
  const text = message.text.trim();
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function replySenderLabel(message: Message, peerName: string): string {
  return message.outgoing ? "You" : peerName;
}

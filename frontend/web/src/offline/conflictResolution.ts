import type { Message } from "@/types";

function messageOrderKey(m: Message): number {
  if (typeof m.seq === "number") return m.seq;
  const pending = m.id.startsWith("pending-") ? 1 : 0;
  const t = Date.parse(m.sentAt);
  return (Number.isNaN(t) ? 0 : t) * 10 + pending;
}

function compareMessages(a: Message, b: Message): number {
  return messageOrderKey(a) - messageOrderKey(b);
}

/**
 * Merge cached local timeline with server sync result.
 * - Server rows win on same `id`
 * - Outgoing `pending-*` rows stay until server replaces them
 */
export function mergeConversationMessages(cached: Message[], incoming: Message[]): Message[] {
  const merged = new Map<string, Message>();

  for (const m of incoming) {
    merged.set(m.id, m);
  }

  for (const m of cached) {
    if (m.id.startsWith("pending-")) {
      if (!merged.has(m.id)) merged.set(m.id, m);
      continue;
    }
    if (!merged.has(m.id)) merged.set(m.id, m);
  }

  return [...merged.values()].sort(compareMessages);
}

/**
 * Resolve duplicate optimistic + server message after REST/WS ack.
 */
export function replacePendingWithServer(
  list: Message[],
  clientMsgId: string,
  serverMessage: Message,
): Message[] {
  const pendingId = `pending-${clientMsgId}`;
  const idx = list.findIndex((m) => m.id === pendingId);
  if (idx < 0) {
    if (list.some((m) => m.id === serverMessage.id)) return list;
    return [...list, serverMessage].sort(compareMessages);
  }
  const next = [...list];
  next[idx] = serverMessage;
  return next.sort(compareMessages);
}

/** Pick newer conversation list (prefer remote when online sync succeeded). */
export function mergeConversationLists(
  local: Conversation[],
  remote: Conversation[],
): Conversation[] {
  const map = new Map<string, Conversation>();
  for (const c of local) map.set(c.id, c);
  for (const c of remote) {
    const prev = map.get(c.id);
    map.set(c.id, prev ? { ...prev, ...c } : c);
  }
  return [...map.values()];
}

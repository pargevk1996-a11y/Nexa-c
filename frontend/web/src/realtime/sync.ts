import { syncConversation, type ApiMessage } from "@/api/chat";

const SEQ_KEY = "nexa:sync:seq:";

export function getLastSeq(conversationId: string): number {
  const raw = localStorage.getItem(`${SEQ_KEY}${conversationId}`);
  return raw ? Number(raw) : 0;
}

export function setLastSeq(conversationId: string, seq: number): void {
  localStorage.setItem(`${SEQ_KEY}${conversationId}`, String(seq));
}

export async function catchUpConversation(
  conversationId: string,
): Promise<ApiMessage[]> {
  const after = getLastSeq(conversationId);
  const page = await syncConversation(conversationId, after);
  for (const m of page.messages) {
    if (m.seq > after) setLastSeq(conversationId, m.seq);
  }
  if (page.sync_required) {
    const more = await catchUpConversation(conversationId);
    return [...page.messages, ...more];
  }
  return page.messages;
}

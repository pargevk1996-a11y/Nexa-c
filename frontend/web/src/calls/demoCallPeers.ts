import type { Conversation } from "@/types";

const DEMO_PEER_BY_CONV: Record<string, string> = {
  c1: "demo-peer-alex",
  c2: "demo-peer-maria",
};

const DEMO_LABELS: Record<string, string> = {
  "demo-peer-alex": "Alex",
  "demo-peer-maria": "Maria",
  u1: "Sam",
  u2: "Jordan",
  u3: "Riley",
};

type CallPeerSource = Pick<
  Conversation,
  "id" | "name" | "isGroup" | "peerUserId" | "memberIds"
>;

/** Resolve callable peer IDs and display labels for demo mode. */
export function resolveDemoCallPeers(
  conversation: CallPeerSource,
  meId?: string,
): { peerIds: string[]; labels: Record<string, string> } {
  const labels: Record<string, string> = {};
  let rawIds: string[] = [];

  if (conversation.isGroup) {
    rawIds = conversation.memberIds ?? ["demo-peer-1", "demo-peer-2", "demo-peer-3"];
  } else if (conversation.peerUserId) {
    rawIds = [conversation.peerUserId];
  } else {
    const fallback = DEMO_PEER_BY_CONV[conversation.id];
    rawIds = fallback ? [fallback] : [`demo-peer-${conversation.id}`];
  }

  const peerIds = meId ? rawIds.filter((id) => id !== meId) : rawIds;
  for (const id of peerIds) {
    labels[id] = DEMO_LABELS[id] ?? conversation.name;
  }
  return { peerIds, labels };
}

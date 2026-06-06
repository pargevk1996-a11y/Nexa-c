import type { Conversation } from "@/types";

export function parseUserSearchQuery(raw: string): { mode: "username" | "general"; term: string } {
  const trimmed = raw.trim();
  if (trimmed.startsWith("$")) {
    return { mode: "username", term: trimmed.slice(1).toLowerCase() };
  }
  return { mode: "general", term: trimmed.toLowerCase() };
}

export function conversationMatchesSearch(c: Conversation, raw: string): boolean {
  const { mode, term } = parseUserSearchQuery(raw);
  if (!term) return true;

  const username = (c.username ?? "").toLowerCase();
  const name = c.name.toLowerCase();
  const uid = c.uid.toLowerCase();

  if (mode === "username") {
    return username.includes(term) || username === term;
  }

  return (
    name.includes(term) ||
    uid.includes(term) ||
    username.includes(term) ||
    (term.startsWith("$") && username.includes(term.slice(1)))
  );
}

export function formatUsernameSearchHint(): string {
  return "$username";
}

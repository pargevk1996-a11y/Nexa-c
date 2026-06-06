import { apiFetch } from "./client";

export interface AiChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ContextMessage {
  sender: string;
  text: string;
}

export interface SearchHit {
  id: string;
  text: string;
  score: number;
  sent_at?: string | null;
  match_type: string;
}

export async function assistantChat(body: {
  messages: AiChatMessage[];
  conversation_id?: string;
}): Promise<{ reply: string; provider: string }> {
  return apiFetch("/ai/assistant/chat", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function suggestReplies(body: {
  conversation_id?: string;
  recent_messages: ContextMessage[];
}): Promise<{ suggestions: string[] }> {
  return apiFetch("/ai/reply/suggest", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function transcribeAudio(body: {
  audio_base64: string;
  audio_format?: string;
  language?: string;
}): Promise<{ text: string; language?: string | null; provider: string }> {
  return apiFetch("/ai/transcribe", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function translateText(body: {
  text: string;
  source_lang?: string;
  target_lang?: string;
}): Promise<{ text: string; source_lang?: string | null; target_lang: string; provider: string }> {
  return apiFetch("/ai/translate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function searchMessages(body: {
  query: string;
  conversation_id?: string;
  messages: Array<{ id: string; text: string; sent_at?: string }>;
  mode?: "keyword" | "semantic" | "smart";
  limit?: number;
}): Promise<{ hits: SearchHit[]; provider: string }> {
  return apiFetch("/ai/search", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function summarizeChat(body: {
  conversation_id?: string;
  messages: ContextMessage[];
  max_length?: number;
}): Promise<{ summary: string; bullet_points: string[]; provider: string }> {
  return apiFetch("/ai/summarize", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",", 2)[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

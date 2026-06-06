import { apiFetch } from "./client";
import type { DemoSticker } from "@/data/mockMedia";

export interface ApiSticker {
  id: string;
  emoji: string;
  url: string;
  alt: string;
}

export interface ApiStickerPack {
  id: string;
  name: string;
  thumbnail: string;
  stickers: ApiSticker[];
}

export interface ApiStickerPackSummary {
  id: string;
  name: string;
  thumbnail: string;
  count: number;
}

export async function fetchStickerPacks(): Promise<ApiStickerPackSummary[]> {
  return apiFetch<ApiStickerPackSummary[]>("/emoji/stickers/packs");
}

export async function fetchStickerPack(packId: string): Promise<ApiStickerPack> {
  return apiFetch<ApiStickerPack>(`/emoji/stickers/packs/${packId}`);
}

export function apiStickerToDemo(s: ApiSticker): DemoSticker {
  return { id: s.id, label: s.alt, imageUrl: s.url };
}

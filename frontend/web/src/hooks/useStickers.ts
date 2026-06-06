import { useEffect, useState } from "react";
import { DEMO_STICKERS, type DemoSticker } from "@/data/mockMedia";
import { fetchStickerPack, fetchStickerPacks, apiStickerToDemo } from "@/api/stickers";

interface StickerPack {
  id: string;
  name: string;
  stickers: DemoSticker[];
}

interface UseStickersResult {
  packs: StickerPack[];
  allStickers: DemoSticker[];
  loading: boolean;
}

const _cache: StickerPack[] | null = null;

export function useStickers(): UseStickersResult {
  const [packs, setPacks] = useState<StickerPack[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const summaries = await fetchStickerPacks();
        const loaded: StickerPack[] = await Promise.all(
          summaries.map(async (s) => {
            const pack = await fetchStickerPack(s.id);
            return { id: s.id, name: s.name, stickers: pack.stickers.map(apiStickerToDemo) };
          }),
        );
        if (!cancelled) {
          setPacks(loaded);
          setLoading(false);
        }
      } catch {
        // Fall back to bundled demo stickers on API failure
        if (!cancelled) {
          setPacks([{ id: "demo", name: "Stickers", stickers: DEMO_STICKERS }]);
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const allStickers = packs.flatMap((p) => p.stickers);

  return { packs, allStickers, loading };
}

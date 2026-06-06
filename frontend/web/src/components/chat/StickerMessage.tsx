import type { Message } from "@/types";

interface StickerMessageProps {
  message: Message;
}

/** Large sticker bubble (Telegram-style — image dominates, minimal chrome). */
export function StickerMessage({ message }: StickerMessageProps) {
  const src = message.previewUrl ?? message.fileUrl;
  if (!src) return null;

  return (
    <div className="sticker-msg" role="img" aria-label={message.text || "Sticker"}>
      <img src={src} alt="" className="sticker-msg__img" loading="lazy" decoding="async" />
    </div>
  );
}

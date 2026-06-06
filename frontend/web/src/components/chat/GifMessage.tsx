import type { Message } from "@/types";

interface GifMessageProps {
  message: Message;
}

export function GifMessage({ message }: GifMessageProps) {
  const src = message.previewUrl ?? message.fileUrl;
  if (!src) return null;

  return (
    <div className="gif-msg">
      <img src={src} alt={message.text || "GIF"} className="gif-msg__img" loading="lazy" />
      {message.text ? <span className="gif-msg__label">{message.text}</span> : null}
    </div>
  );
}

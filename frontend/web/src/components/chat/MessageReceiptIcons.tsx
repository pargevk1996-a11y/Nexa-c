import type { Message } from "@/types";

interface MessageReceiptIconsProps {
  status?: Message["status"];
  /** When false, only show sent/sending (privacy). */
  showDetailedReceipts?: boolean;
}

export function MessageReceiptIcons({
  status,
  showDetailedReceipts = true,
}: MessageReceiptIconsProps) {
  if (!status || status === "failed") return null;

  const effective =
    !showDetailedReceipts && (status === "delivered" || status === "read")
      ? "sent"
      : status;

  if (effective === "sending") {
    return (
      <span className="msg-receipt msg-receipt--sending" aria-label="Sending">
        <span className="msg-receipt__clock" />
      </span>
    );
  }

  if (effective === "sent") {
    return (
      <span className="msg-receipt msg-receipt--sent" aria-label="Sent">
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
          <path
            d="M3 8.5L6.5 12L13 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  const isRead = effective === "read";
  const cls = `msg-receipt ${isRead ? "msg-receipt--read" : "msg-receipt--delivered"}`;
  const label = isRead ? "Read" : "Delivered";

  return (
    <span className={cls} aria-label={label}>
      <svg width="16" height="14" viewBox="0 0 18 14" aria-hidden>
        <path
          d="M1 7L4.5 10.5L10 4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M6 7L9.5 10.5L17 2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

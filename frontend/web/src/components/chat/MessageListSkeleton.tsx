import { Skeleton } from "@/components/ui/Skeleton";

const ROWS = [
  { out: false, w: "58%" },
  { out: true, w: "48%" },
  { out: false, w: "72%" },
  { out: true, w: "64%" },
  { out: false, w: "44%" },
  { out: true, w: "38%" },
];

export function MessageListSkeleton() {
  return (
    <div className="chat-messages-skeleton" aria-busy="true" aria-label="Loading messages">
      {ROWS.map((row, i) => (
        <div
          key={i}
          className={`chat-messages-skeleton__row ${row.out ? "chat-messages-skeleton__row--out" : "chat-messages-skeleton__row--in"}`}
        >
          <Skeleton width={row.w} height="2.75rem" rounded="lg" />
        </div>
      ))}
    </div>
  );
}

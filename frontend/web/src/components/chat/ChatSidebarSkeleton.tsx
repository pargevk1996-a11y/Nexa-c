import { Skeleton } from "@/components/ui/Skeleton";

export function ChatSidebarSkeleton() {
  return (
    <div className="chat-sidebar-skeleton" aria-busy="true" aria-label="Loading conversations">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className="chat-sidebar-skeleton__row">
          <Skeleton width={44} height={44} rounded="full" />
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            <Skeleton width={`${55 + (i % 3) * 12}%`} height="0.85rem" />
            <Skeleton width={`${70 - (i % 4) * 10}%`} height="0.7rem" rounded="sm" />
          </div>
        </div>
      ))}
    </div>
  );
}

import { useOfflineStore } from "@/store/zustand/offlineStore";

export function OfflineBanner() {
  const offline = useOfflineStore((s) => s.offlineMode);
  const syncing = useOfflineStore((s) => s.syncing);

  if (!offline && !syncing) return null;

  return (
    <div
      className={`offline-banner${syncing && !offline ? " offline-banner--syncing" : ""}`}
      role="status"
      aria-live="polite"
    >
      {offline ? (
        <>
          <span className="offline-banner__dot" aria-hidden />
          No connection — messages will send when you're back online
        </>
      ) : (
        <>
          <span className="offline-banner__spinner" aria-hidden />
          Syncing…
        </>
      )}
    </div>
  );
}

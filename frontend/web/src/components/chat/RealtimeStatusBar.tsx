import type { RealtimeConnectionState } from "@/realtime/types";

interface RealtimeStatusBarProps {
  state: RealtimeConnectionState;
  offlineQueueCount?: number;
  offlineMode?: boolean;
  syncing?: boolean;
}

const LABELS: Record<RealtimeConnectionState, string> = {
  connected: "Live",
  reconnecting: "Reconnecting…",
  offline: "Offline",
  demo: "Local preview",
};

export function RealtimeStatusBar({
  state,
  offlineQueueCount = 0,
  offlineMode = false,
  syncing = false,
}: RealtimeStatusBarProps) {
  const label =
    syncing ? "Syncing…" : offlineMode ? "Offline — cached chats" : LABELS[state];
  return (
    <div
      className={`realtime-status realtime-status--${offlineMode ? "offline" : state}`}
      role="status"
      aria-live="polite"
    >
      <span className="realtime-status__dot" aria-hidden />
      <span>{label}</span>
      {offlineQueueCount > 0 ? (
        <span className="realtime-status__queue">{offlineQueueCount} queued</span>
      ) : null}
    </div>
  );
}

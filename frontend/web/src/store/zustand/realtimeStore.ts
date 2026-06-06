import { create } from "zustand";
import type { RealtimeConnectionState } from "@/realtime/types";

export interface RealtimeStoreState {
  connectionState: RealtimeConnectionState;
  offlineQueueCount: number;
  setConnectionState: (state: RealtimeConnectionState) => void;
  setOfflineQueueCount: (count: number) => void;
}

export const useRealtimeStore = create<RealtimeStoreState>((set) => ({
  connectionState: "offline",
  offlineQueueCount: 0,
  setConnectionState: (connectionState) => set({ connectionState }),
  setOfflineQueueCount: (offlineQueueCount) => set({ offlineQueueCount }),
}));

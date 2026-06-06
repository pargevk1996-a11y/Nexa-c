import { create } from "zustand";

export interface OfflineStoreState {
  offlineMode: boolean;
  syncing: boolean;
  lastSyncAt: number | null;
  setOfflineMode: (on: boolean) => void;
  setSyncing: (on: boolean) => void;
  setLastSyncAt: (ts: number | null) => void;
}

export const useOfflineStore = create<OfflineStoreState>((set) => ({
  offlineMode: typeof navigator !== "undefined" ? !navigator.onLine : false,
  syncing: false,
  lastSyncAt: null,
  setOfflineMode: (offlineMode) => set({ offlineMode }),
  setSyncing: (syncing) => set({ syncing }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
}));

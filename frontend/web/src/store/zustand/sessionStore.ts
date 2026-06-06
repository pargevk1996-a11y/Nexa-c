import { create } from "zustand";

export interface SessionStoreState {
  userId: string | null;
  demoMode: boolean;
  hydrated: boolean;
  setSession: (userId: string | null, demoMode: boolean) => void;
  clear: () => void;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  userId: null,
  demoMode: false,
  hydrated: false,
  setSession: (userId, demoMode) => set({ userId, demoMode, hydrated: true }),
  clear: () => set({ userId: null, demoMode: false, hydrated: false }),
}));

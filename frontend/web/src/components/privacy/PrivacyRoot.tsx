import { type ReactNode } from "react";
import { usePrivacyGuard } from "@/hooks/usePrivacyGuard";
import { LockProvider } from "@/store/LockContext";
import { LockOverlay } from "./LockOverlay";

export function PrivacyRoot({ children }: { children: ReactNode }) {
  usePrivacyGuard();
  return (
    <LockProvider>
      <LockOverlay />
      {children}
    </LockProvider>
  );
}

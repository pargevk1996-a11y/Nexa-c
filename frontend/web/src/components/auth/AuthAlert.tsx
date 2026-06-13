import type { ReactNode } from "react";

type AuthAlertVariant = "error" | "success" | "info";

interface AuthAlertProps {
  variant?: AuthAlertVariant;
  children: ReactNode;
}

/**
 * Single, standardized feedback surface for every auth form (BUG-012).
 *
 * Errors are announced assertively (`role="alert"` interrupts the screen
 * reader); success / info are announced politely via `role="status"`. This
 * guarantees consistent live-region semantics everywhere instead of each page
 * hand-rolling a bare `<div className="auth-alert">` (BUG-011).
 */
export function AuthAlert({ variant = "error", children }: AuthAlertProps) {
  if (children == null || children === "") return null;
  const isError = variant === "error";
  return (
    <div
      className={`auth-alert auth-alert--${variant}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
    >
      {children}
    </div>
  );
}

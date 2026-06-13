import type { ReactNode } from "react";
import { BRAND_NAME } from "@/config/brand";

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps) {
  const isBrandTitle = title === BRAND_NAME;
  return (
    <div className="auth-card">
      <header className="auth-card__header">
        {/* Stable id so a wrapping dialog can reference it via aria-labelledby (BUG-009). */}
        <h2 id="auth-card-title" className={isBrandTitle ? "auth-card__title--brand" : undefined}>
          {title}
        </h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </header>
      {children}
    </div>
  );
}

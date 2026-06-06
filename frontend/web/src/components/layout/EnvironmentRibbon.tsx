import { getCachedSession } from "@/api/auth";

/**
 * Subtle top ribbon when running in local preview (demo) or non-production app env.
 * Production builds should not show this unless explicitly in preview mode.
 */
export function EnvironmentRibbon() {
  const session = getCachedSession();
  if (!session?.demoMode) return null;

  return (
    <div className="env-ribbon" role="status" aria-live="polite">
      <span className="env-ribbon__dot" aria-hidden />
      <span className="env-ribbon__label">Local preview</span>
      <span className="env-ribbon__hint">Sample data · calls use local preview engine</span>
    </div>
  );
}

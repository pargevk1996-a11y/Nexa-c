import type { VerificationBadge as Badge } from "@/types/profile";

const LABELS: Record<Exclude<Badge, "none">, string> = {
  verified: "Verified",
  official: "Official",
  bot: "Bot",
};

export function VerificationBadge({ badge }: { badge: Badge }) {
  if (badge === "none") return null;
  return (
    <span className={`verify-badge verify-badge--${badge}`} title={LABELS[badge]}>
      {badge === "verified" ? "✓" : badge === "official" ? "★" : "🤖"}
    </span>
  );
}

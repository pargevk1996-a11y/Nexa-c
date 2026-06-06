import type { VerificationBadge } from "@/types/profile";
import { VerificationBadge as Badge } from "./VerificationBadge";

const ITEMS: { badge: Exclude<VerificationBadge, "none">; desc: string }[] = [
  { badge: "verified", desc: "Identity confirmed" },
  { badge: "official", desc: "Official NEXA account" },
  { badge: "bot", desc: "Automated account" },
];

export function ProfileBadgeLegend() {
  return (
    <ul className="profile-badge-legend">
      {ITEMS.map((item) => (
        <li key={item.badge} className="profile-badge-legend__item">
          <Badge badge={item.badge} />
          <span>{item.desc}</span>
        </li>
      ))}
    </ul>
  );
}

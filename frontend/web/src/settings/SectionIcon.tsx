import {
  IconProfile,
  IconShield,
  IconLock,
  IconBell,
  IconPhone,
  IconChats,
  IconSettings,
  IconX,
} from "@/components/icons/Icons";
import type { SettingsSectionId } from "./types";

interface SectionIconProps {
  id: SettingsSectionId;
  size?: number;
}

export function SectionIcon({ id, size = 20 }: SectionIconProps) {
  switch (id) {
    case "account":
      return <IconProfile size={size} />;
    case "privacy":
    case "security":
      return <IconShield size={size} />;
    case "sessions":
    case "devices":
      return <IconLock size={size} />;
    case "blocked":
      return <IconX size={size} />;
    case "notifications":
      return <IconBell size={size} />;
    case "calls":
      return <IconPhone size={size} />;
    case "appearance":
      return <IconChats size={size} />;
    case "danger":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      );
    case "storage":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4.03 3-9 3S3 13.66 3 12" />
          <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
        </svg>
      );
    case "accessibility":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="4" r="2" />
          <path d="M6 8h12M12 8v5M9 21l3-8 3 8" />
        </svg>
      );
    case "help":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <circle cx="12" cy="17" r=".5" fill="currentColor" />
        </svg>
      );
    case "advanced":
      return <IconSettings size={size} />;
  }
}

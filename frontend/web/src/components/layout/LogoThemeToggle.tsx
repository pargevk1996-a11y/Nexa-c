import { useState } from "react";
import { LogoAnimation } from "@/components/auth/LogoAnimation";
import { getGlobalTheme, isLightTheme, setGlobalTheme } from "@/store/settings";

interface Props {
  /** Rendered size of the animated mark in px. */
  size?: number;
  className?: string;
}

/**
 * The animated brand logo doubling as the day/night switch — 1:1 with the home
 * screen: it radiates the same golden sun + rays in day mode and the glowing
 * mesh at night, and clicking it toggles the global theme. Reused everywhere a
 * logo appears in the app chrome (top nav, chats list) so the control is
 * identical on every surface, device and OS.
 */
export function LogoThemeToggle({ size = 84, className }: Props) {
  const [light, setLight] = useState<boolean>(() => isLightTheme());

  function toggleDayNight() {
    const next = isLightTheme(getGlobalTheme()) ? "dark" : "light";
    setGlobalTheme(next);
    setLight(next === "light");
  }

  return (
    <button
      type="button"
      className={`logo-toggle ${className ?? ""}`}
      onClick={toggleDayNight}
      aria-label={light ? "Switch to night" : "Switch to day"}
      title={light ? "Click the logo — switch to night" : "Click the logo — switch to day"}
    >
      <span className="logo-toggle__rays" aria-hidden />
      <LogoAnimation size={size} />
    </button>
  );
}

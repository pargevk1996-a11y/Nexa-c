import type { ButtonHTMLAttributes, ReactNode } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  variant?: "default" | "primary" | "ghost";
  active?: boolean;
}

export function IconButton({
  label,
  children,
  variant = "default",
  active,
  className = "",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn--${variant} ${active ? "icon-btn--active" : ""} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...rest}
    >
      {children}
    </button>
  );
}

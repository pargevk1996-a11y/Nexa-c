import type { CSSProperties, HTMLAttributes } from "react";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  rounded?: "sm" | "md" | "lg" | "full";
}

const radiusMap = {
  sm: "var(--radius-sm)",
  md: "var(--radius-md)",
  lg: "var(--radius-lg)",
  full: "var(--radius-full)",
};

export function Skeleton({
  width,
  height,
  rounded = "md",
  className = "",
  style,
  ...rest
}: SkeletonProps) {
  const merged: CSSProperties = {
    width,
    height,
    borderRadius: radiusMap[rounded],
    ...style,
  };

  return (
    <div
      className={`skeleton ${className}`.trim()}
      aria-hidden
      style={merged}
      {...rest}
    />
  );
}

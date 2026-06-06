import type { ReactNode } from "react";

interface SettingRowProps {
  title: string;
  description?: string;
  children?: ReactNode;
}

export function SettingRow({ title, description, children }: SettingRowProps) {
  return (
    <div className="setting-row">
      <div className="setting-row__text">
        <div className="setting-row__title">{title}</div>
        {description ? <div className="setting-row__desc">{description}</div> : null}
      </div>
      {children ? <div className="setting-row__control">{children}</div> : null}
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? "toggle--on" : ""}`}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
  );
}

import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, id, className = "", ...rest }: InputProps) {
  const inputId = id ?? rest.name;
  return (
    <div className={`field ${error ? "field--error" : ""} ${className}`.trim()}>
      {label ? (
        <label className="auth-form__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input id={inputId} className="field__input" {...rest} />
      {hint && !error ? <p className="field__hint">{hint}</p> : null}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

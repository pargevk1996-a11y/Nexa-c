import { useId, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, id, className = "", placeholder, ...rest }: InputProps) {
  // Stable fallback id guarantees the <label htmlFor> ↔ <input id> association
  // even when callers pass neither `id` nor `name` (BUG-002).
  const reactId = useId();
  const inputId = id ?? rest.name ?? reactId;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  // The floating-label CSS keys off `:placeholder-shown`, so every field needs a
  // non-empty placeholder. A single space keeps the label correctly anchored when
  // empty and only floats (uppercase) once focused/filled (BUG-020).
  const resolvedPlaceholder = placeholder ?? " ";

  return (
    <div className={`field ${error ? "field--error" : ""} ${className}`.trim()}>
      {label ? (
        <label className="auth-form__label" htmlFor={inputId}>
          {label}
        </label>
      ) : null}
      <input
        id={inputId}
        className="field__input"
        placeholder={resolvedPlaceholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(" ") || undefined}
        {...rest}
      />
      {hint && !error ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <span className="field__error" id={errorId} role="alert" aria-live="assertive">
          {error}
        </span>
      ) : null}
    </div>
  );
}

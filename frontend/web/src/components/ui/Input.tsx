import { forwardRef, useId, type InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  function Input({ label, error, hint, id, className = "", placeholder, ...rest }, ref) {
    const reactId = useId();
    const inputId = id ?? rest.name ?? reactId;
    const hintId  = hint  ? `${inputId}-hint`  : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const resolvedPlaceholder = placeholder ?? " ";

    return (
      <div className={`field ${error ? "field--error" : ""} ${className}`.trim()}>
        {label ? (
          <label className="auth-form__label" htmlFor={inputId}>
            {label}
          </label>
        ) : null}
        <input
          ref={ref}
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
  },
);

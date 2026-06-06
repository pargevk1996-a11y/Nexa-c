import { useState, type InputHTMLAttributes } from "react";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  error?: string;
  hint?: string;
}

export function PasswordInput({ label, error, hint, id, className = "", ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  const inputId = id ?? rest.name;

  return (
    <div className={`field field--password ${error ? "field--error" : ""} ${className}`.trim()}>
      <label className="auth-form__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="field__password-wrap">
        <input
          id={inputId}
          className="field__input field__input--password"
          type={visible ? "text" : "password"}
          {...rest}
        />
        <button
          type="button"
          className="field__password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          tabIndex={-1}
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
      {hint && !error ? <p className="field__hint">{hint}</p> : null}
      {error ? (
        <span className="field__error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12M15 15C13.35 16.35 11.15 17 9 17C5 17 2 12 2 12M22 12C22 12 19 19 12 19C10.55 19 9.2 18.65 8 18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

const VIOLATION_MESSAGES: Record<string, string> = {
  too_short: "Use at least 8 characters.",
  too_long: "Password is too long (maximum 128 characters).",
  missing_uppercase: "Add at least one capital letter (A–Z).",
  missing_lowercase: "Add at least one lowercase letter (a–z).",
  missing_digit: "Add at least one number (0–9).",
  missing_special: "Add at least one symbol (for example ! @ # $).",
};

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_HINT = "At least 8 characters (any characters allowed).";

/** Client-side check aligned with auth-service password policy. */
export function validateClientPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return VIOLATION_MESSAGES.too_short;
  }
  return null;
}

export function formatPasswordErrors(details?: string[]): string {
  if (!details?.length) {
    return "Please check the password requirements below.";
  }
  return details.map((d) => VIOLATION_MESSAGES[d] ?? d).join(" ");
}

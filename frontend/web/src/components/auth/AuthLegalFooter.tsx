import { Link } from "react-router-dom";

interface AuthLegalFooterProps {
  className?: string;
}

/**
 * Trust / legal links required on every public auth surface (BUG-023).
 * Shared so Privacy Policy and Terms stay consistent and discoverable
 * across the landing page, sign-in, and sign-up flows.
 */
export function AuthLegalFooter({ className = "" }: AuthLegalFooterProps) {
  return (
    <nav className={`auth-legal ${className}`.trim()} aria-label="Legal">
      <Link to="/privacy">Privacy Policy</Link>
      <span aria-hidden="true">·</span>
      <Link to="/terms">Terms of Service</Link>
    </nav>
  );
}

import { Link } from "react-router-dom";

interface AuthLegalFooterProps {
  className?: string;
}

export function AuthLegalFooter({ className = "" }: AuthLegalFooterProps) {
  return (
    <nav className={`auth-legal ${className}`.trim()} aria-label="Legal">
      <span className="auth-legal__copy">© 2026 NEXA</span>
      <span aria-hidden="true">·</span>
      <Link to="/privacy">Privacy Policy</Link>
      <span aria-hidden="true">·</span>
      <Link to="/terms">Terms of Service</Link>
      <span aria-hidden="true">·</span>
      <Link to="/license">AGPL-3.0</Link>
    </nav>
  );
}

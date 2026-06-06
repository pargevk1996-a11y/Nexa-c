/** Guest auth pages — login/register must never be covered by the privacy shield. */
const GUEST_AUTH_SEGMENTS =
  /^\/(login(?:\/qr)?|register|forgot-password|reset-password|verify-email|oauth\/callback)(?:\/|$)/;

export function isGuestAuthPath(pathname = window.location.pathname): boolean {
  if (!pathname || pathname === "/") return true;
  return GUEST_AUTH_SEGMENTS.test(pathname);
}

export function applyGuestAuthDocumentFlag(pathname = window.location.pathname): void {
  document.documentElement.dataset.guestAuth = isGuestAuthPath(pathname) ? "true" : "false";
}

import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/useSession";
import { getActiveUserId } from "@/security/sessionCache";

export function ProtectedRoute() {
  const session = useSession();
  if (!session) {
    // Do NOT bounce to /login on a transient null. useSession() re-reads the
    // encrypted session on every window focus; a momentary decrypt/storage
    // hiccup (device key warming) would otherwise navigate the user to the
    // landing page mid-session — the "constantly kicked to home" bug. The
    // active-uid pointer survives such hiccups (see refreshSessionCache), so if
    // it's present the user IS signed in: hold the route and let the session
    // rehydrate. Only redirect when there is genuinely no account on this device.
    if (getActiveUserId()) return null;
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}

import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/useSession";

export function GuestRoute() {
  const session = useSession();
  if (session) return <Navigate to="/app/chats" replace />;
  return <Outlet />;
}

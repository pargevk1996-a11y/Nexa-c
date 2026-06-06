import { Navigate, Outlet } from "react-router-dom";
import { useSession } from "@/hooks/useSession";

export function ProtectedRoute() {
  const session = useSession();
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

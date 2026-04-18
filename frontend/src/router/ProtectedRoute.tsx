import { Navigate, Outlet } from "react-router"
import { useAppSelector } from "@/store"

/** Wrap any route that requires authentication. Redirects to /sign-in if not authed. */
const ProtectedRoute = () => {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)

  if (!isAuthenticated) {
    return <Navigate to="/sign-in" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
import { lazy, Suspense } from "react"
import { createBrowserRouter, Navigate } from "react-router"

import { Spinner } from "@/components/loaders/Spinners"

const SignIn = lazy(() => import("../components/features/auth/SignIn"))
const SignUp = lazy(() => import("../components/features/auth/SignUp"))
const ChatPage = lazy(() => import("../components/features/chat/ChatPage"))

const AuthLayout = lazy(() => import("../components/layouts/AuthLayout"))
const ProtectedRoute = lazy(() => import("./ProtectedRoute"))

const wrap = (el: React.ReactNode) => (
  <Suspense fallback={<Spinner />}>{el}</Suspense>
)

const router = createBrowserRouter([
  // Public auth routes
  {
    path: "/",
    element: wrap(<AuthLayout />),
    children: [
      { index: true, element: <Navigate to="sign-in" replace /> },
      { path: "sign-in", element: wrap(<SignIn />) },
      { path: "sign-up", element: wrap(<SignUp />) },
    ],
  },
  {
    element: wrap(<ProtectedRoute />),
    children: [
      { path: "/chat", element: wrap(<ChatPage />) },
    ],
  },

  // Fallback
  { path: "*", element: <Navigate to="/sign-in" replace /> },
])

export default router

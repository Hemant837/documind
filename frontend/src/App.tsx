import { useEffect } from "react"
import { RouterProvider } from "react-router"

import router from "./router"
import { Toaster } from "@/components/ui/sonner"
import { useAppDispatch, useAppSelector } from "@/store"
import { clearAuth } from "@/store/authSlice"
import api from "@/lib/axios"

function AuthInitializer() {
  const dispatch = useAppDispatch()
  const isAuthenticated = useAppSelector((s) => s.auth.isAuthenticated)

  useEffect(() => {
    if (!isAuthenticated) return
    api.get("/auth/me").catch((err) => {
      if (err?.response?.status === 401) {
        dispatch(clearAuth())
      }
    })
  }, []) // only on mount — verifies token is still valid

  return null
}

const App = () => {
  return (
    <>
      <AuthInitializer />
      <RouterProvider router={router} />
      <Toaster richColors position="top-right" />
    </>
  )
}

export default App

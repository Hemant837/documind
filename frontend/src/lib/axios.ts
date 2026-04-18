import axios from "axios"
import { store } from "@/store"
import { clearAuth } from "../store/authSlice"

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

export const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true,
})

// Attach JWT token from Redux store to every request
api.interceptors.request.use((config) => {
  const token = store.getState().auth.token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle 401 globally — clear auth and redirect to sign-in
// Skip auth routes: a failed login/register returns 401/409 and should be handled by the form, not redirected
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string = error.config?.url ?? ""
    if (error.response?.status === 401 && !url.includes("/auth/")) {
      store.dispatch(clearAuth())
      window.location.href = "/sign-in"
    }
    return Promise.reject(error)
  }
)

export function getApiError(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (axios.isAxiosError(error)) {
    const detail = error.response?.data?.detail
    if (typeof detail === "string") return detail
  }
  return fallback
}

export default api

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "react-router"
import { useGoogleLogin } from "@react-oauth/google"

import api from "@/lib/axios"
import {
  authResponseSchema,
  type SignInFormData,
  type SignUpFormData,
  type AuthResponse,
} from "../schemas/auth"
import { useAppDispatch } from "@/store"
import { setAuth, clearAuth } from "@/store/authSlice"

// ─── API Functions ────────────────────────────────────────────────────────────

async function signIn(data: SignInFormData): Promise<AuthResponse> {
  // FastAPI OAuth2PasswordRequestForm expects form-encoded body
  const formData = new URLSearchParams()
  formData.append("username", data.email)
  formData.append("password", data.password)

  const res = await api.post("/auth/login", formData, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  })
  return authResponseSchema.parse(res.data)
}

async function signUp(data: SignUpFormData): Promise<AuthResponse> {
  const { confirm_password, ...body } = data
  const res = await api.post("/auth/register", body)
  return authResponseSchema.parse(res.data)
}

async function googleAuth(googleAccessToken: string): Promise<AuthResponse> {
  const res = await api.post("/auth/google", { token: googleAccessToken })
  return authResponseSchema.parse(res.data)
}

async function signOut(): Promise<void> {
  await api.post("/auth/logout")
}

// ─── TanStack Query Mutations ─────────────────────────────────────────────────

export function useSignIn() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: signIn,
    onSuccess: (data) => {
      dispatch(setAuth(data))
      navigate("/chat", { replace: true })
    },
  })
}

export function useSignUp() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  return useMutation({
    mutationFn: signUp,
    onSuccess: (data) => {
      dispatch(setAuth(data))
      navigate("/chat", { replace: true })
    },
  })
}

export function useGoogleAuth() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const mutation = useMutation({
    mutationFn: googleAuth,
    onSuccess: (data) => {
      dispatch(setAuth(data))
      navigate("/chat", { replace: true })
    },
  })

  // useGoogleLogin gives us the Google OAuth flow;
  // on success we exchange the Google access token with our FastAPI backend
  const login = useGoogleLogin({
    onSuccess: (tokenResponse) => {
      mutation.mutate(tokenResponse.access_token)
    },
    onError: (error) => {
      console.error("Google login error:", error)
    },
  })

  return { login, ...mutation }
}

export function useSignOut() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: signOut,
    onSettled: () => {
      dispatch(clearAuth())
      queryClient.clear()
      navigate("/sign-in", { replace: true })
    },
  })
}

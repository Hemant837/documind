import { createSlice, type PayloadAction } from "@reduxjs/toolkit"
import type { AuthResponse } from "@/schemas/auth"

interface User {
  id: string
  email: string
  full_name: string
  avatar_url?: string | null
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
}

const TOKEN_KEY = "jswitch_token"
const USER_KEY = "jswitch_user"

function userFromToken(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]))
    if (!payload.sub || !payload.email) return null
    return {
      id: payload.sub,
      email: payload.email,
      full_name: payload.name ?? null,
      avatar_url: payload.picture ?? null,
    }
  } catch {
    return null
  }
}

const _token = localStorage.getItem(TOKEN_KEY)
const _userJson = localStorage.getItem(USER_KEY)

const initialState: AuthState = {
  user: _userJson ? JSON.parse(_userJson) : _token ? userFromToken(_token) : null,
  token: _token,
  isAuthenticated: !!_token,
}

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuth(state, action: PayloadAction<AuthResponse>) {
      state.user = action.payload.user
      state.token = action.payload.access_token
      state.isAuthenticated = true
      localStorage.setItem(TOKEN_KEY, action.payload.access_token)
      localStorage.setItem(USER_KEY, JSON.stringify(action.payload.user))
    },
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload
      state.isAuthenticated = true
      localStorage.setItem(TOKEN_KEY, action.payload)
    },
    clearAuth(state) {
      state.user = null
      state.token = null
      state.isAuthenticated = false
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    },
  },
})

export const { setAuth, setToken, clearAuth } = authSlice.actions
export default authSlice.reducer
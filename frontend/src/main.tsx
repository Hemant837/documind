import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { Provider as ReduxProvider } from "react-redux"
import { GoogleOAuthProvider } from "@react-oauth/google"

import App from "./App.tsx"
import { ErrorBoundary } from "@/components/ErrorBoundary"
import { ThemeProvider } from "@/components/theme-provider.tsx"
import { store } from "./store"
import "./index.css"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 1000 * 60 * 5,
    },
  },
})

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
  <StrictMode>
    <ThemeProvider>
      <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
        <ReduxProvider store={store}>
          <QueryClientProvider client={queryClient}>
            <App />
          </QueryClientProvider>
        </ReduxProvider>
      </GoogleOAuthProvider>
    </ThemeProvider>
  </StrictMode>
  </ErrorBoundary>
)

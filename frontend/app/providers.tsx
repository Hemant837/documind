"use client";
// app/providers.tsx
// ------------------
// Wraps the app with Redux and TanStack Query providers.
// Kept separate from layout.tsx so layout can stay a server component.

import { ReactNode } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { store } from "./store";

// QueryClient is created outside the component so it isn't recreated on re-renders
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Don't refetch on window focus — avoids surprising re-fetches mid-conversation
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ReduxProvider store={store}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ReduxProvider>
  );
}

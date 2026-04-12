// hooks/useSessions.ts
// ---------------------
// Fetches the list of past conversations from GET /chat/history.
// Also exports useSessionHistory for loading a specific session's messages.

import { useQuery } from "@tanstack/react-query";
import api from "../lib/axios";
import { Message } from "./useChat";

export interface Session {
  session_id: string;
  message_count: number;
  started_at: string;
}

export const SESSIONS_KEY = ["sessions"];

export function useSessions() {
  return useQuery<Session[]>({
    queryKey: SESSIONS_KEY,
    queryFn: async () => {
      const { data } = await api.get("/chat/history");
      return data;
    },
  });
}

// Fetches all messages for a specific session.
// Only enabled when a sessionId is provided — used when restoring a past chat.
export function useSessionHistory(sessionId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["history", sessionId],
    queryFn: async () => {
      const { data } = await api.get(`/chat/history/${sessionId}`);
      return data;
    },
    enabled: !!sessionId,
  });
}

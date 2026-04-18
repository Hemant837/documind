import { useInfiniteQuery, useQuery } from "@tanstack/react-query"

import api from "../lib/axios"
import type { Message } from "./useChat"

export interface Session {
  session_id: string
  message_count: number
  started_at: string
  title: string | null
}

export const SESSIONS_KEY = ["sessions"]
const PAGE_SIZE = 20

export function useSessions() {
  return useInfiniteQuery<Session[]>({
    queryKey: SESSIONS_KEY,
    queryFn: async ({ pageParam }) => {
      const { data } = await api.get(
        `/chat/history?limit=${PAGE_SIZE}&offset=${pageParam}`
      )
      return data
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length < PAGE_SIZE) return undefined
      return allPages.flat().length
    },
  })
}

export function useSessionHistory(sessionId: string | null) {
  return useQuery<Message[]>({
    queryKey: ["history", sessionId],
    queryFn: async () => {
      const { data } = await api.get(`/chat/history/${sessionId}`)
      return data
    },
    enabled: !!sessionId,
  })
}

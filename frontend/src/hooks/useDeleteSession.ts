import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import api from "../lib/axios"
import { SESSIONS_KEY } from "./useSessions"

export function useDeleteSession() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, string>({
    mutationFn: async (sessionId: string) => {
      await api.delete(`/chat/history/${sessionId}`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY })
      toast.success("Conversation deleted")
    },
    onError: () => {
      toast.error("Failed to delete conversation")
    },
  })
}

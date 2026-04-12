// hooks/useDeleteSession.ts
// --------------------------
// Calls DELETE /chat/history/{session_id} and invalidates the sessions list.
// The component is responsible for switching away from the deleted session
// if it was the active one.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import api from "../lib/axios";
import { SESSIONS_KEY } from "./useSessions";

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (sessionId: string) => {
      await api.delete(`/chat/history/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      toast.success("Conversation deleted");
    },
    onError: () => {
      toast.error("Failed to delete conversation");
    },
  });
}

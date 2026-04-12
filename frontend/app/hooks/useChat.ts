// hooks/useChat.ts
// -----------------
// Sends a question to POST /chat and manages the local message thread.
//
// Why manage messages locally instead of always fetching from /history?
//   Fetching after every message adds a round-trip and causes a flash.
//   We optimistically append messages to local state for instant UI updates,
//   and only fetch from the server when restoring a past session.

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import api from "../lib/axios";
import { SESSIONS_KEY } from "./useSessions";

export interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AskPayload {
  question: string;
  session_id: string;
  doc_ids: string[] | null;
}

interface AskResponse {
  question: string;
  answer: string;
  session_id: string;
}

export function useChat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);

  const mutation = useMutation<AskResponse, Error, AskPayload>({
    mutationFn: async (payload) => {
      const { data } = await api.post("/chat/", payload);
      return data;
    },
    onSuccess: (data, variables) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: variables.question },
        { role: "assistant", content: data.answer },
      ]);
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError: (error: any) => {
      // 404 means no docs uploaded or no content found — show as info, not error
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;
      if (status === 404) {
        toast.info("No results", { description: detail });
      } else {
        toast.error("Something went wrong", {
          description: detail ?? "Failed to get a response. Please try again.",
        });
      }
    },
  });

  // Called when user restores a past session — replaces local messages
  // with the full history fetched from the server.
  function loadMessages(history: Message[]) {
    setMessages(history);
  }

  function clearMessages() {
    setMessages([]);
  }

  return { messages, loadMessages, clearMessages, mutation };
}

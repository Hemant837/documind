// Handles the streaming SSE chat endpoint.
//
// Why native fetch instead of axios?
//   Axios doesn't support ReadableStream — it buffers the entire response.
//   Native fetch gives us direct access to response.body as a ReadableStream
//   which we can read chunk by chunk as tokens arrive.
//
// Stream protocol (matches what the backend yields):
//   "data: <token>"          → append to the in-progress message
//   "data: [SOURCES]<json>"  → parse and store citation sources
//   "data: [ERROR]<msg>"     → surface as a toast error
//   "data: [DONE]"           → move in-progress message to completed messages
//
// State:
//   messages        — completed message pairs (user + assistant with sources)
//   streamingContent — the assistant's in-progress token buffer (shown live)
//   isStreaming      — true while waiting for or reading the stream

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { SESSIONS_KEY } from "./useSessions";

export interface Source {
  file_name: string;
  page: string;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: Source[]; // only present on assistant messages
}

interface SendPayload {
  question: string;
  session_id: string;
  doc_ids: string[] | null;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function useStreamingChat() {
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>("");
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(
    async (payload: SendPayload) => {
      if (isStreaming) return;

      // Append user message immediately for instant feedback
      setMessages((prev) => [
        ...prev,
        { role: "user", content: payload.question },
      ]);
      setStreamingContent("");
      setIsStreaming(true);

      try {
        const response = await fetch(`${API_BASE}/chat/stream`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let tokenBuffer = "";
        let sources: Source[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode incoming bytes and split on SSE line boundaries
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6); // strip "data: "

            if (payload === "[DONE]") {
              // Stream finished — move buffered content to completed messages
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: tokenBuffer, sources },
              ]);
              setStreamingContent("");
              queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
              break;
            }

            if (payload.startsWith("[ERROR]")) {
              const msg = payload.slice(7);
              // 404-style messages are info, others are errors
              if (
                msg.toLowerCase().includes("could not find") ||
                msg.toLowerCase().includes("no documents")
              ) {
                toast.info("No results", { description: msg });
              } else {
                toast.error("Something went wrong", { description: msg });
              }
              setStreamingContent("");
              // Remove the optimistic user message on error
              setMessages((prev) => prev.slice(0, -1));
              break;
            }

            if (payload.startsWith("[SOURCES]")) {
              // Parse source citations — rendered as chips below the message
              try {
                sources = JSON.parse(payload.slice(9));
              } catch {
                sources = [];
              }
              continue;
            }

            // Regular token — append to the live buffer
            tokenBuffer += payload;
            setStreamingContent(tokenBuffer);
          }
        }
      } catch (err: any) {
        toast.error("Connection error", {
          description: "Could not reach the server. Is the backend running?",
        });
        // Remove optimistic user message
        setMessages((prev) => prev.slice(0, -1));
        setStreamingContent("");
      } finally {
        setIsStreaming(false);
      }
    },
    [isStreaming, queryClient],
  );

  function loadMessages(history: Message[]) {
    setMessages(history);
    setStreamingContent("");
  }

  function clearMessages() {
    setMessages([]);
    setStreamingContent("");
  }

  return {
    messages,
    streamingContent, // the live in-progress token buffer
    isStreaming,
    sendMessage,
    loadMessages,
    clearMessages,
  };
}

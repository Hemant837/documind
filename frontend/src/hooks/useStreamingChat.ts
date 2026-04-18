import { useState, useCallback, useRef } from "react"
import { toast } from "sonner"
import { useQueryClient } from "@tanstack/react-query"

import { SESSIONS_KEY } from "./useSessions"
import { store } from "../store"

export interface Source {
  file_name: string
  page: string
}

export interface Message {
  role: "user" | "assistant"
  content: string
  sources?: Source[]
}

interface SendPayload {
  question: string
  session_id: string
  doc_ids: string[] | null
}

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000"

export function useStreamingChat() {
  const queryClient = useQueryClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [streamingContent, setStreamingContent] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const sendMessage = useCallback(
    async (payload: SendPayload) => {
      if (isStreaming) return

      setMessages((prev) => [
        ...prev,
        { role: "user", content: payload.question },
      ])
      setStreamingContent("")
      setIsStreaming(true)

      const controller = new AbortController()
      abortControllerRef.current = controller

      const token = store.getState().auth.token
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      }
      if (token) headers["Authorization"] = `Bearer ${token}`

      // Declared outside try so catch can access partial content on abort
      let tokenBuffer = ""
      let sources: Source[] = []

      try {
        const response = await fetch(`${API_BASE}/chat/stream`, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        })

        if (response.status === 401) {
          toast.error("Session expired", { description: "Please sign in again." })
          setMessages((prev) => prev.slice(0, -1))
          setStreamingContent("")
          setIsStreaming(false)
          return
        }

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() ?? ""

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)

            if (data === "[DONE]") {
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: tokenBuffer, sources },
              ])
              setStreamingContent("")
              queryClient.invalidateQueries({ queryKey: SESSIONS_KEY })
              break
            }

            if (data.startsWith("[ERROR]")) {
              const msg = data.slice(7)
              if (
                msg.toLowerCase().includes("could not find") ||
                msg.toLowerCase().includes("no documents")
              ) {
                toast.info("No results", { description: msg })
              } else {
                toast.error("Something went wrong", { description: msg })
              }
              setStreamingContent("")
              setMessages((prev) => prev.slice(0, -1))
              break
            }

            if (data.startsWith("[SOURCES]")) {
              try { sources = JSON.parse(data.slice(9)) } catch { sources = [] }
              continue
            }

            if (data.startsWith("[TITLE]")) {
              queryClient.invalidateQueries({ queryKey: SESSIONS_KEY })
              continue
            }

            try {
              tokenBuffer += JSON.parse(data)
            } catch {
              tokenBuffer += data
            }
            setStreamingContent(tokenBuffer)
          }
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          // User stopped generation — keep whatever partial response arrived
          if (tokenBuffer) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: tokenBuffer, sources },
            ])
          } else {
            setMessages((prev) => prev.slice(0, -1))
          }
          setStreamingContent("")
          return
        }
        toast.error("Connection error", {
          description: "Could not reach the server. Is the backend running?",
        })
        setMessages((prev) => prev.slice(0, -1))
        setStreamingContent("")
      } finally {
        setIsStreaming(false)
        abortControllerRef.current = null
      }
    },
    [isStreaming, queryClient]
  )

  function loadMessages(history: Message[]) {
    setMessages(history)
    setStreamingContent("")
  }

  function clearMessages() {
    setMessages([])
    setStreamingContent("")
  }

  return {
    messages,
    streamingContent,
    isStreaming,
    sendMessage,
    stopStreaming,
    loadMessages,
    clearMessages,
  }
}

import { useState, useEffect } from "react"
import { Suspense } from "react"

import { useAppDispatch, useAppSelector } from "@/store"
import { newSession, setSession, clearDocIds } from "@/store/chatSlice"
import { useStreamingChat } from "@/hooks/useStreamingChat"
import { useSessionHistory } from "@/hooks/useSessions"
import { Sidebar } from "@/components/sidebar/Sidebar"
import ChatWindow from "./ChatWindow"
import { ChatInput } from "./ChatInput"
import { Spinner } from "@/components/loaders/Spinners"

export default function ChatPage() {
  const dispatch = useAppDispatch()
  const sessionId = useAppSelector((s) => s.chat.sessionId)
  const selectedDocIds = useAppSelector((s) => s.chat.selectedDocIds)

  // ID of the past session whose history we want to fetch; null = no fetch
  const [historySessionId, setHistorySessionId] = useState<string | null>(null)

  const {
    messages,
    streamingContent,
    isStreaming,
    sendMessage,
    stopStreaming,
    loadMessages,
    clearMessages,
  } = useStreamingChat()

  const { data: historyData } = useSessionHistory(historySessionId)

  // When history arrives, populate the chat window then clear the fetch trigger
  useEffect(() => {
    if (historyData && historySessionId) {
      loadMessages(historyData)
      setHistorySessionId(null)
    }
  }, [historyData, historySessionId, loadMessages])

  function handleNewChat() {
    dispatch(newSession())
    dispatch(clearDocIds())
    clearMessages()
    setHistorySessionId(null)
  }

  function handleSelectSession(id: string) {
    dispatch(setSession(id))
    clearMessages()
    setHistorySessionId(id)
  }

  function handleSend(question: string) {
    sendMessage({
      question,
      session_id: sessionId,
      doc_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
    })
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Suspense fallback={<Spinner />}>
        <Sidebar onNewChat={handleNewChat} onSelectSession={handleSelectSession} />
      </Suspense>

      <main className="relative flex flex-1 flex-col overflow-hidden">
        <ChatWindow
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
        />
        <ChatInput onSend={handleSend} onStop={stopStreaming} isLoading={isStreaming} />
      </main>
    </div>
  )
}

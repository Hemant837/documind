"use client";

// Root page. Wires the full layout together:
//   [Sidebar] | [ChatWindow + ChatInput]
//
// useStreamingChat replaces useChat — it handles the SSE stream,
// token buffering, source parsing, and history persistence.

import { useCallback } from "react";

import { Sidebar } from "./components/Sidebar";
import { ChatWindow } from "./components/ChatWindow";
import { ChatInput } from "./components/ChatInput";
import { useStreamingChat } from "./hooks/useStreamingChat";
import { useAppSelector } from "./store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function Home() {
  const sessionId = useAppSelector((s) => s.chat.sessionId);
  const selectedDocIds = useAppSelector((s) => s.chat.selectedDocIds);

  const {
    messages,
    streamingContent,
    isStreaming,
    sendMessage,
    loadMessages,
    clearMessages,
  } = useStreamingChat();

  // When user clicks a past session: fetch its full history and load it
  const handleSelectSession = useCallback(
    async (id: string) => {
      const res = await fetch(`${API_BASE}/chat/history/${id}`);
      if (res.ok) {
        const history = await res.json();
        loadMessages(history);
      }
    },
    [loadMessages],
  );

  function handleNewChat() {
    clearMessages();
  }

  function handleSend(question: string) {
    sendMessage({
      question,
      session_id: sessionId,
      doc_ids: selectedDocIds.length > 0 ? selectedDocIds : null,
    });
  }

  return (
    <div className="flex h-screen bg-white text-neutral-900 antialiased relative">
      <Sidebar
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
      />

      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatWindow
          messages={messages}
          streamingContent={streamingContent}
          isStreaming={isStreaming}
        />
        <ChatInput onSend={handleSend} isLoading={isStreaming} />
      </main>
    </div>
  );
}

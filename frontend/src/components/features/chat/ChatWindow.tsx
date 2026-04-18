import { useEffect, useRef } from "react"
import { Loader2, BookOpen } from "lucide-react"

import { MessageBubble } from "./MessageBubble"
import type { Message } from "@/hooks/useStreamingChat"

interface Props {
  messages: Message[]
  streamingContent: string
  isStreaming: boolean
}

const ChatWindow = ({ messages, streamingContent, isStreaming }: Props) => {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, streamingContent, isStreaming])

  const isEmpty = !messages.length && !isStreaming

  if (isEmpty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-muted-foreground">
        <div className="flex items-center justify-center rounded-full bg-muted p-4">
          <BookOpen className="h-7 w-7" />
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-sm font-medium text-foreground">Ask anything about your documents</p>
          <p className="text-xs">Upload a PDF from the sidebar, then ask a question.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
      {/* Completed messages */}
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}

      {/* Live streaming bubble — shown while tokens are arriving */}
      {isStreaming && streamingContent && (
        <MessageBubble
          message={{ role: "assistant", content: streamingContent }}
          isStreaming
        />
      )}

      {/* Waiting indicator — shown before first token arrives */}
      {isStreaming && !streamingContent && (
        <div className="flex justify-start">
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-4 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking...
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

export default ChatWindow

"use client";

// Renders the full message thread including the live streaming bubble.
//
// Two types of content:
//   1. messages       — completed turns from useStreamingChat state
//   2. streamingContent — the in-progress assistant buffer shown live
//
// The streaming bubble is rendered as a fake Message so MessageBubble
// can handle it with the isStreaming flag (shows blinking cursor, no chips).

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";

import { MessageBubble } from "./MessageBubble";
import { Message } from "../hooks/useStreamingChat";

interface Props {
  messages: Message[];
  streamingContent: string;
  isStreaming: boolean;
}

export function ChatWindow({ messages, streamingContent, isStreaming }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isStreaming]);

  const isEmpty = !messages.length && !isStreaming;

  if (isEmpty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-neutral-400">
        <p className="text-sm">Ask a question about your documents.</p>
        <p className="text-xs">Upload a PDF from the sidebar to get started.</p>
      </div>
    );
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
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-2.5 text-sm text-neutral-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking...
          </div>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}

"use client";

// Renders a single chat message.
// User messages: right-aligned plain text.
// Assistant messages: left-aligned markdown + optional source citation chips.
//
// Source chips show filename + page number and appear below the answer.
// They're intentionally subtle — small, muted, non-interactive — so they
// don't distract from the answer itself.

import { FileText } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";
import { Message, Source } from "../hooks/useStreamingChat";

interface Props {
  message: Message;
  // isStreaming is true for the in-progress assistant bubble so we can
  // show a blinking cursor at the end of the text
  isStreaming?: boolean;
}

function SourceChips({ sources }: { sources: Source[] }) {
  if (!sources.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {sources.map((s, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-white px-2 py-0.5 text-xs text-neutral-500"
        >
          <FileText className="h-3 w-3 shrink-0" />
          <span className="max-w-40 truncate">{s.file_name}</span>
          {s.page && s.page !== "unknown" && (
            <span className="text-neutral-400">p.{s.page}</span>
          )}
        </span>
      ))}
    </div>
  );
}

export function MessageBubble({ message, isStreaming }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-neutral-900 text-white rounded-br-sm"
            : "bg-neutral-100 text-neutral-800 rounded-bl-sm",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <>
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code({ className, children, ...props }) {
                  const isBlock = className?.includes("language-");
                  return isBlock ? (
                    <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-800 p-3 text-xs text-neutral-100">
                      <code {...props}>{children}</code>
                    </pre>
                  ) : (
                    <code
                      className="rounded bg-neutral-200 px-1 py-0.5 text-xs text-neutral-800"
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                p({ children }) {
                  return <p className="mb-2 last:mb-0">{children}</p>;
                },
                ul({ children }) {
                  return (
                    <ul className="mb-2 list-disc pl-4 last:mb-0">
                      {children}
                    </ul>
                  );
                },
                ol({ children }) {
                  return (
                    <ol className="mb-2 list-decimal pl-4 last:mb-0">
                      {children}
                    </ol>
                  );
                },
                strong({ children }) {
                  return (
                    <strong className="font-semibold text-neutral-900">
                      {children}
                    </strong>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>

            {/* Blinking cursor shown while the stream is still coming in */}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-neutral-400" />
            )}

            {/* Source chips — only on completed messages that have sources */}
            {!isStreaming && message.sources && (
              <SourceChips sources={message.sources} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

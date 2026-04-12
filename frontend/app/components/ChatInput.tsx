"use client";
// components/ChatInput.tsx
// -------------------------
// Textarea + send button at the bottom of the chat.
// Reads session_id and selectedDocIds from Redux and sends them with every request.
// Shift+Enter adds a newline; Enter alone submits.

import { useState, useRef, KeyboardEvent } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAppSelector } from "../store";

interface Props {
  onSend: (question: string) => void;
  isLoading: boolean;
}

export function ChatInput({ onSend, isLoading }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedDocIds = useAppSelector((s) => s.chat.selectedDocIds);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || isLoading) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height after clearing
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  // Auto-grow the textarea as the user types
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  }

  return (
    <div className="border-t border-neutral-100 bg-white px-6 py-4">
      {/* Scope indicator */}
      {selectedDocIds.length > 0 && (
        <p className="mb-2 text-xs text-blue-500">
          Searching {selectedDocIds.length} selected document
          {selectedDocIds.length > 1 ? "s" : ""}
        </p>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
          rows={1}
          disabled={isLoading}
          className="max-h-40 flex-1 resize-none rounded-xl border-neutral-200 bg-neutral-50 text-sm focus-visible:ring-1 focus-visible:ring-neutral-300"
        />
        <Button
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading}
          size="icon"
          className="h-9 w-9 shrink-0 rounded-xl bg-neutral-900 hover:bg-neutral-700"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

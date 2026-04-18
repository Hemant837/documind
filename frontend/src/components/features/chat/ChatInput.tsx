import { useState, useRef, type KeyboardEvent } from "react"
import { Send, Square } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useAppSelector } from "../../../store"

interface Props {
  onSend: (question: string) => void
  onStop: () => void
  isLoading: boolean
}

export function ChatInput({ onSend, onStop, isLoading }: Props) {
  const [value, setValue] = useState("")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const selectedDocIds = useAppSelector((s) => s.chat.selectedDocIds)

  function handleSubmit() {
    const trimmed = value.trim()
    if (!trimmed || isLoading) return
    onSend(trimmed)
    setValue("")
    if (textareaRef.current) textareaRef.current.style.height = "auto"
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value)
    e.target.style.height = "auto"
    e.target.style.height = `${e.target.scrollHeight}px`
  }

  return (
    <div className="border-t border-border bg-background px-6 py-4">
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
          className="max-h-40 flex-1 resize-none rounded-xl border-border bg-muted text-sm focus-visible:ring-1 focus-visible:ring-ring"
        />
        {isLoading ? (
          <Button
            onClick={onStop}
            size="icon"
            variant="outline"
            title="Stop generating"
            className="h-9 w-9 shrink-0 rounded-xl hover:border-destructive/40 hover:text-destructive"
          >
            <Square className="h-4 w-4 fill-current" />
          </Button>
        ) : (
          <Button
            onClick={handleSubmit}
            disabled={!value.trim()}
            size="icon"
            className="h-9 w-9 shrink-0 rounded-xl bg-primary hover:bg-primary/90"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

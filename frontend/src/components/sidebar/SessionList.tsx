import { useState } from "react"
import { MessageSquare, Trash2, Loader2 } from "lucide-react"

import { useSessions } from "../../hooks/useSessions"
import { useDeleteSession } from "../../hooks/useDeleteSession"
import { useAppDispatch, useAppSelector } from "../../store"
import { setSession, newSession } from "../../store/chatSlice"
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog"
import { cn } from "@/lib/utils"

interface Props {
  onSelectSession: (sessionId: string) => void
  onNewChat: () => void
}

type PendingDelete = { id: string; title: string | null }

function formatDate(iso: string) {
  const date = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
  )
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"
  if (diffDays < 7) return `${diffDays} days ago`
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function SessionList({ onSelectSession, onNewChat }: Props) {
  const dispatch = useAppDispatch()
  const activeSessionId = useAppSelector((s) => s.chat.sessionId)
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useSessions()
  const deleteMutation = useDeleteSession()
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)

  const sessions = data?.pages.flat() ?? []

  function confirmDelete() {
    if (!pendingDelete) return
    const { id } = pendingDelete
    setPendingDelete(null)
    deleteMutation.mutate(id, {
      onSuccess: () => {
        if (id === activeSessionId) {
          dispatch(newSession())
          onNewChat()
        }
      },
    })
  }

  if (isLoading) {
    return <p className="px-2 text-xs text-muted-foreground">Loading history...</p>
  }

  if (!sessions.length) {
    return (
      <p className="px-2 text-xs text-muted-foreground">No past conversations.</p>
    )
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          History
        </span>
        <ul className="flex flex-col gap-0.5">
          {sessions.map((session) => {
            const isActive = session.session_id === activeSessionId
            const isDeleting =
              deleteMutation.isPending &&
              deleteMutation.variables === session.session_id

            return (
              // group on li so the delete button shows on hover of the whole row
              <li key={session.session_id} className="group relative">
                {/* Session selection button — pr-7 leaves room for the delete button */}
                <button
                  onClick={() => {
                    dispatch(setSession(session.session_id))
                    onSelectSession(session.session_id)
                  }}
                  disabled={isDeleting}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 pr-7 text-left text-xs transition-colors",
                    isActive
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/50",
                    isDeleting && "opacity-50"
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">
                      {session.title ?? formatDate(session.started_at)}
                    </span>
                    <span className="text-muted-foreground">
                      {session.title && (
                        <span className="mr-1">
                          {formatDate(session.started_at)} ·{" "}
                        </span>
                      )}
                      {session.message_count} message
                      {session.message_count !== 1 ? "s" : ""}
                    </span>
                  </span>
                </button>

                {/* Delete button — sibling of session button, not inside it */}
                <button
                  onClick={() => setPendingDelete({ id: session.session_id, title: session.title })}
                  disabled={isDeleting}
                  title="Delete conversation"
                  className={cn(
                    "absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5",
                    "text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100",
                    isDeleting && "opacity-50"
                  )}
                >
                  {isDeleting
                    ? <Loader2 className="h-3 w-3 animate-spin" />
                    : <Trash2 className="h-3 w-3" />
                  }
                </button>
              </li>
            )
          })}
        </ul>

        {hasNextPage && (
          <button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="flex items-center justify-center gap-1.5 px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {isFetchingNextPage ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </div>

      <DeleteConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => { if (!open) setPendingDelete(null) }}
        onConfirm={confirmDelete}
        title="Delete conversation?"
        description={
          pendingDelete?.title ? (
            <>
              <span className="font-medium text-foreground">"{pendingDelete.title}"</span> and
              all its messages will be permanently deleted.
            </>
          ) : (
            "This conversation and all its messages will be permanently deleted."
          )
        }
      />
    </>
  )
}

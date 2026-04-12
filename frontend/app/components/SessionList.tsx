"use client";
// components/SessionList.tsx
// ---------------------------
// Lists past conversations in the sidebar.
// Clicking a session loads its history and switches the active session.
// Hovering a session reveals a trash icon to delete it.
// If the active session is deleted, a new session is started automatically.

import { MessageSquare, Trash2 } from "lucide-react";

import { useSessions } from "../hooks/useSessions";
import { useDeleteSession } from "..//hooks/useDeleteSession";
import { useAppDispatch, useAppSelector } from "../store";
import { setSession, newSession } from "../store/chatSlice";
import { cn } from "@/lib/utils";

interface Props {
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor(
    (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SessionList({ onSelectSession, onNewChat }: Props) {
  const dispatch = useAppDispatch();
  const activeSessionId = useAppSelector((s) => s.chat.sessionId);
  const { data: sessions, isLoading } = useSessions();
  const deleteMutation = useDeleteSession();

  function handleDelete(e: React.MouseEvent, sessionId: string) {
    // Stop click from bubbling up to the session button beneath it
    e.stopPropagation();
    deleteMutation.mutate(sessionId, {
      onSuccess: () => {
        // If the user deleted the currently active session, start fresh
        if (sessionId === activeSessionId) {
          dispatch(newSession());
          onNewChat();
        }
      },
    });
  }

  if (isLoading) {
    return <p className="px-2 text-xs text-neutral-400">Loading history...</p>;
  }

  if (!sessions?.length) {
    return (
      <p className="px-2 text-xs text-neutral-400">No past conversations.</p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="px-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        History
      </span>
      <ul className="flex flex-col gap-0.5">
        {sessions.map((session) => {
          const isActive = session.session_id === activeSessionId;
          const isDeleting =
            deleteMutation.isPending &&
            deleteMutation.variables === session.session_id;

          return (
            <li key={session.session_id}>
              {/* group enables the hover:opacity-100 on the trash icon */}
              <button
                onClick={() => {
                  dispatch(setSession(session.session_id));
                  onSelectSession(session.session_id);
                }}
                disabled={isDeleting}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                  isActive
                    ? "bg-neutral-100 text-neutral-900 font-medium"
                    : "text-neutral-600 hover:bg-neutral-50",
                  isDeleting && "opacity-50",
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-neutral-400" />

                {/* Session label — takes all remaining space */}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">
                    {formatDate(session.started_at)}
                  </span>
                  <span className="text-neutral-400">
                    {session.message_count} message
                    {session.message_count !== 1 ? "s" : ""}
                  </span>
                </span>

                {/* Trash icon — hidden until row is hovered */}
                <span
                  role="button"
                  onClick={(e) => handleDelete(e, session.session_id)}
                  className={cn(
                    "opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded",
                    "hover:text-red-500 text-neutral-400",
                  )}
                  title="Delete conversation"
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

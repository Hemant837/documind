"use client";
// components/Sidebar.tsx
// -----------------------
// Desktop: fixed left panel (w-64)
// Mobile:  hidden, slides in as Sheet drawer when hamburger is tapped

import { useState } from "react";
import { PlusCircle, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import { DocumentList } from "./DocumentList";
import { SessionList } from "./SessionList";
import { useAppDispatch } from "../store";
import { newSession, clearDocIds } from "../store/chatSlice";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

interface Props {
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
}

// Inner content shared between desktop aside and mobile Sheet
function SidebarContent({
  onNewChat,
  onSelectSession,
  onClose,
}: Props & { onClose?: () => void }) {
  const dispatch = useAppDispatch();

  function handleNewChat() {
    dispatch(newSession());
    dispatch(clearDocIds());
    onNewChat();
    onClose?.();
  }

  function handleSelectSession(id: string) {
    onSelectSession(id);
    onClose?.();
  }

  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <div className="px-1">
        <span className="text-sm font-semibold tracking-tight text-neutral-800">
          DocuMind
        </span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 text-xs font-normal text-neutral-600"
        onClick={handleNewChat}
      >
        <PlusCircle className="h-3.5 w-3.5" />
        New Chat
      </Button>

      <DocumentList />

      <Separator className="bg-neutral-100" />

      <div className="flex-1 overflow-y-auto">
        <SessionList
          onSelectSession={handleSelectSession}
          onNewChat={onNewChat}
        />
      </div>
    </div>
  );
}

export function Sidebar({ onNewChat, onSelectSession }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Desktop: always-visible left panel */}
      <aside className="hidden md:flex h-full w-64 shrink-0 flex-col border-r border-neutral-100 bg-white">
        <SidebarContent
          onNewChat={onNewChat}
          onSelectSession={onSelectSession}
        />
      </aside>

      {/* Mobile: hamburger + Sheet drawer */}
      <div className="md:hidden absolute top-3 left-3 z-20">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-neutral-600"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <SidebarContent
              onNewChat={onNewChat}
              onSelectSession={onSelectSession}
              onClose={() => setOpen(false)}
            />
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

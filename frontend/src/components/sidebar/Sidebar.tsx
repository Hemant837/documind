import { useState } from "react"
import { PlusCircle, Menu, GalleryVerticalEnd } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

import { DocumentList } from "../../components/sidebar/DocumentList"
import { SessionList } from "../../components/sidebar/SessionList"
import { useAppDispatch } from "../../store"
import { newSession, clearDocIds } from "../../store/chatSlice"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { UserMenu } from "../../components/sidebar/UserMenu"

interface Props {
  onNewChat: () => void
  onSelectSession: (sessionId: string) => void
}

// Inner content shared between desktop aside and mobile Sheet
function SidebarContent({
  onNewChat,
  onSelectSession,
  onClose,
}: Props & { onClose?: () => void }) {
  const dispatch = useAppDispatch()

  function handleNewChat() {
    dispatch(newSession())
    dispatch(clearDocIds())
    onNewChat()
    onClose?.()
  }

  function handleSelectSession(id: string) {
    onSelectSession(id)
    onClose?.()
  }

  return (
    <div className="flex h-full flex-col gap-4 px-3 py-4">
      <div className="flex items-center gap-2 px-1">
        <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <GalleryVerticalEnd className="size-3.5" />
        </div>
        <span className="text-sm font-semibold tracking-tight">DocuMind</span>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full justify-start gap-2 text-xs font-normal text-muted-foreground"
        onClick={handleNewChat}
      >
        <PlusCircle className="h-3.5 w-3.5" />
        New Chat
      </Button>

      <DocumentList />

      <Separator />

      <div className="flex-1 overflow-y-auto">
        <SessionList
          onSelectSession={handleSelectSession}
          onNewChat={onNewChat}
        />
      </div>
    </div>
  )
}

export function Sidebar({ onNewChat, onSelectSession }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* Desktop: always-visible left panel */}
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
        <SidebarContent
          onNewChat={onNewChat}
          onSelectSession={onSelectSession}
        />
        <UserMenu />
      </aside>

      {/* Mobile: hamburger + Sheet drawer */}
      <div className="absolute top-3 left-3 z-20 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground"
                aria-label="Open menu"
              />
            }
          >
            <Menu className="h-5 w-5" />
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
            <UserMenu />
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}

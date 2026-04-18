import { useState } from "react"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAppSelector } from "../../store"
import { useSignOut } from "../../hooks/useAuth"

export function UserMenu() {
  const user = useAppSelector((s) => s.auth.user)
  const signOut = useSignOut()
  const [imgFailed, setImgFailed] = useState(false)

  if (!user) return null

  const initials =
    user.full_name?.[0]?.toUpperCase() ??
    user.email?.[0]?.toUpperCase() ??
    "U"

  return (
    <div className="flex items-center gap-2.5 border-t border-border px-3 py-3">
      {/* Avatar */}
      {user.avatar_url && !imgFailed ? (
        <img
          src={user.avatar_url}
          alt={user.full_name ?? "User"}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-7 w-7 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {initials}
        </div>
      )}

      {/* Name + email */}
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-xs font-medium text-foreground">
          {user.full_name ?? "User"}
        </span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>

      {/* Sign out */}
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-foreground"
        onClick={() => signOut.mutate()}
        disabled={signOut.isPending}
        title="Sign out"
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

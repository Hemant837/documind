import { Loader2 } from "lucide-react"

export const Spinner = () => {
  return (
    <div className="flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  )
}

export const SpinnerWithText = ({ text = "Loading..." }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-2">
      <Loader2 className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  )
}

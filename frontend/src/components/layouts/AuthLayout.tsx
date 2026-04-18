import { Outlet } from "react-router"
import { GalleryVerticalEnd } from "lucide-react"
import { Suspense } from "react"

import { Spinner } from "../loaders/Spinners"

const AuthLayout = () => {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <a href="#" className="flex items-center gap-2 self-center font-medium">
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <GalleryVerticalEnd className="size-4" />
          </div>
          Documind
        </a>
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </div>
    </div>
  )
}

export default AuthLayout

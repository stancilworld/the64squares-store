"use client"

import { usePathname } from "next/navigation"

export function PreviewExit() {
  const path = usePathname()
  return (
    <a href={`/api/preview/exit?path=${encodeURIComponent(path || "/")}`} className="font-semibold underline underline-offset-2">
      Exit preview
    </a>
  )
}

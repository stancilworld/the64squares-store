"use client"

import { useEffect } from "react"
import { track } from "@/lib/tracking/engine"

// A search in the shop (the words typed in the search box).
export function TrackSearch({ q, results }: { q: string; results?: number }) {
  useEffect(() => {
    if (q) track("Search", { search: q, results: results ?? null })
  }, [q, results])
  return null
}

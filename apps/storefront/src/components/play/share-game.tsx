"use client"

import { useState } from "react"

// "Share" under a finished game: the phone's share sheet where there is one, otherwise the
// link is copied. The link opens the game review, which anyone can watch.
export function ShareGame({ id, text }: { id: string; text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="g-btn"
      onClick={async () => {
        const url = `${window.location.origin}/play/analysis/${id}?utm_source=share&utm_medium=game`
        if (navigator.share) {
          try {
            await navigator.share({ title: "My game on The 64 Squares", text, url })
            return
          } catch {
            // Closed the share sheet, or not allowed: copy instead.
          }
        }
        navigator.clipboard?.writeText(`${text} ${url}`).then(
          () => setCopied(true),
          () => {}
        )
      }}
    >
      {copied ? "Link copied" : "Share"}
    </button>
  )
}

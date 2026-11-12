"use client"

import { useState } from "react"
import { openSignIn } from "@/components/account/sign-in-dialog"

export function SignInButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={openSignIn} className="g-btn g-btn-primary h-[50px] px-6 text-[16px]">
      {label}
    </button>
  )
}

export function CopyLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // The link is selectable in the box.
    }
  }
  return (
    <div className="flex items-stretch gap-2">
      <input readOnly value={link} aria-label="Your invite link" onFocus={(e) => e.currentTarget.select()} className="min-w-0 flex-1 rounded-lg border border-[var(--g-line)] bg-[var(--g-panel-2)] px-3 text-[14px] text-white/85" />
      <button type="button" onClick={copy} className="g-btn g-btn-primary shrink-0 px-4">
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  )
}

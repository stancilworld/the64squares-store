"use client"

import Link from "next/link"
import { useState, useSyncExternalStore } from "react"
import type { SiteNavigation } from "@/lib/data"
import { CloseIcon } from "./icons"

const COLOURS: Record<SiteNavigation["announcement"]["colour"], string> = {
  black: "bg-black text-white",
  red: "bg-love text-white",
  yellow: "bg-[#f6c445] text-black",
  blue: "bg-[#7fb2e5] text-black",
}

// A short message strip above the header (admin → Website → Menu & footer). Shows only
// between its start and end dates; a shopper who closes it doesn't see that message again.
const noop = () => () => {}

// Whether the message should be up right now (a plain function, so the clock is read
// outside React's render rules).
export const isLive = (a: SiteNavigation["announcement"], now: number) =>
  a.enabled &&
  !!a.text.trim() &&
  (!a.starts_at || new Date(a.starts_at).getTime() <= now) &&
  (!a.ends_at || new Date(a.ends_at).getTime() > now)

export function AnnouncementBar({ a }: { a: SiteNavigation["announcement"] }) {
  const key = `stancil_announcement_${a.text}`
  // Dates and "closed" are checked in the browser (the page itself is cached).
  const live = useSyncExternalStore(noop, () => isLive(a, Date.now()), () => false)
  const [closedNow, setClosedNow] = useState(false)
  if (!live || closedNow) return null
  let closedBefore = false
  try {
    closedBefore = a.dismissible && localStorage.getItem(key) === "1"
  } catch {}
  if (closedBefore) return null
  const external = /^https?:\/\//.test(a.href)
  return (
    <div className={`relative ${COLOURS[a.colour] ?? COLOURS.black}`} role="region" aria-label="Announcement" data-announcement>
      <p className="mx-auto max-w-[1440px] px-10 py-[8px] text-center text-[13px] leading-[18px] lg:py-[10px] lg:text-[15px]">
        {a.text}
        {a.href && (
          <>
            {" "}
            {external ? (
              <a href={a.href} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
                {a.link_label || "Learn more"}
              </a>
            ) : (
              <Link href={a.href} className="font-semibold underline underline-offset-2">
                {a.link_label || "Learn more"}
              </Link>
            )}
          </>
        )}
      </p>
      {a.dismissible && (
        <button
          type="button"
          aria-label="Close announcement"
          onClick={() => {
            try {
              localStorage.setItem(key, "1")
            } catch {}
            setClosedNow(true)
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 opacity-80 hover:opacity-100"
        >
          <CloseIcon className="h-[14px] w-[14px]" />
        </button>
      )}
    </div>
  )
}

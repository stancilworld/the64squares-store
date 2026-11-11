"use client"

import { useState } from "react"
import { SITE_URL } from "@/lib/site"
import { FacebookIcon, LinkIcon, WhatsAppIcon } from "./icons"

const XIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
    <path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.9-6.3L5.3 21H2.2l7.3-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z" />
  </svg>
)

// Share this page (Website → Site features → Share buttons).
export function ShareButtons({ path, title, className = "" }: { path: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const url = `${SITE_URL}${path}`
  const tagged = (source: string) => `${url}${url.includes("?") ? "&" : "?"}utm_source=${source}&utm_medium=share`
  const link = "grid h-10 w-10 place-items-center rounded-full border border-rule hover:border-black"
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="mr-1 text-[14px] text-muted">Share</span>
      <a href={`https://wa.me/?text=${encodeURIComponent(`${title} ${tagged("whatsapp")}`)}`} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp" className={link}>
        <WhatsAppIcon className="h-[18px] w-[18px]" />
      </a>
      <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tagged("facebook"))}`} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook" className={link}>
        <FacebookIcon className="h-[18px] w-[18px]" />
      </a>
      <a href={`https://x.com/intent/post?text=${encodeURIComponent(title)}&url=${encodeURIComponent(tagged("x"))}`} target="_blank" rel="noopener noreferrer" aria-label="Share on X" className={link}>
        <XIcon className="h-[16px] w-[16px]" />
      </a>
      <button
        type="button"
        aria-label={copied ? "Link copied" : "Copy link"}
        onClick={() =>
          navigator.clipboard?.writeText(url).then(
            () => setCopied(true),
            () => {}
          )
        }
        className={link}
      >
        <LinkIcon className="h-[18px] w-[18px]" />
      </button>
      {copied && (
        <span className="text-[13px] text-muted" role="status">
          Copied
        </span>
      )}
    </div>
  )
}

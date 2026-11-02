import Link from "next/link"
import type { ReactNode } from "react"

// Renders text typed in the admin with light formatting, without ever injecting HTML:
// blank lines split paragraphs, "## " makes a heading, "- " makes a bullet point,
// and **bold**, *italic* and [text](url) work inside a line.

const INLINE = /(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)\s]+\))/g

const safeHref = (url: string) =>
  /^(https?:\/\/|mailto:|tel:|\/)/i.test(url) ? url : null

function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/)
    if (link) {
      const href = safeHref(link[2])
      if (!href) {
        return link[1]
      }
      return href.startsWith("/") ? (
        <Link key={i} href={href} className="underline underline-offset-4">
          {link[1]}
        </Link>
      ) : (
        <a key={i} href={href} className="underline underline-offset-4" rel="noopener noreferrer" target={href.startsWith("http") ? "_blank" : undefined}>
          {link[1]}
        </a>
      )
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>
    }
    return part
  })
}

export function RichText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  return (
    <div className={className}>
      {blocks.map((block, i) => {
        if (block.startsWith("## ")) {
          return (
            <h2 key={i} className="mt-[1.6em] text-[1.25em] font-semibold first:mt-0">
              {inline(block.slice(3))}
            </h2>
          )
        }
        const lines = block.split("\n")
        if (lines.every((l) => /^\s*-\s+/.test(l))) {
          return (
            <ul key={i} className="mt-[1lh] list-disc space-y-1 pl-6 first:mt-0">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*-\s+/, ""))}</li>
              ))}
            </ul>
          )
        }
        return (
          <p key={i} className="mt-[1lh] first:mt-0">
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

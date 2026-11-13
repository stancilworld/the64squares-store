import type { Metadata } from "next"
import Link from "next/link"
import { Suspense } from "react"
import { PanelHeader } from "@/components/play-shell/nav"
import { RichText } from "@/components/rich-text"
import { getSitePage } from "@/lib/data"
import { seoMetadata } from "@/lib/seo"
import { Loading } from "../loading-text"

export const generateMetadata = (): Promise<Metadata> =>
  seoMetadata({ path: "/play/rules", title: "Rule book", description: "The rules of chess, how play works on The 64 Squares, tournament rules and the fair-play policy." })

// The rule book's chapters are help pages edited in Website → Help pages.
const CHAPTERS = [
  { handle: "chess-rules", label: "Rules of chess", about: "Pieces, check, castling, draws" },
  { handle: "playing-guide", label: "Playing here", about: "Time controls, ratings, XP, passes" },
  { handle: "tournament-rules", label: "Tournaments", about: "Formats, check-in, prizes" },
  { handle: "fair-play", label: "Fair play", about: "What's allowed and what isn't" },
] as const

const chapterHref = (h: string) => (h === CHAPTERS[0].handle ? "/play/rules" : `/play/rules?ch=${h}`)

async function Chapter({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { ch } = await searchParams
  const current = CHAPTERS.find((c) => c.handle === ch) ?? CHAPTERS[0]
  const page = await getSitePage(current.handle)
  const i = CHAPTERS.indexOf(current)
  const next = CHAPTERS[i + 1]
  return (
    <div className="rule-book mt-4">
      <nav aria-label="Rule book chapters" className="rule-toc">
        {CHAPTERS.map((c) => (
          <Link key={c.handle} href={chapterHref(c.handle)} scroll={false} aria-current={c === current ? "page" : undefined} className="rule-toc-item">
            <span className="rule-toc-label">{c.label}</span>
            <span className="rule-toc-about">{c.about}</span>
          </Link>
        ))}
      </nav>
      <article className="g-panel rule-page">
        {page ? (
          <>
            <h2 className="rule-page-title">{page.title}</h2>
            <RichText text={page.body} className="rule-text" />
          </>
        ) : (
          <p className="g-muted">This chapter hasn&apos;t been published yet.</p>
        )}
        {next && (
          <Link href={chapterHref(next.handle)} className="g-btn g-btn-ghost mt-8">
            Next: {next.label}
          </Link>
        )}
      </article>
    </div>
  )
}

export default function RulesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <PanelHeader title="Rule book" />
      <Suspense fallback={<Loading />}>
        <Chapter searchParams={searchParams} />
      </Suspense>
    </div>
  )
}

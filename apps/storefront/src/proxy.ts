import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server"

// Redirects made in the admin (SEO → Redirects): an old address sends visitors and Google to
// the new one. The list is fetched from the store and kept for 60 seconds.

type Redirect = { from: string; to: string; permanent: boolean }

const BACKEND = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
const KEY = process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY || ""
let cache: { at: number; map: Map<string, Redirect> } | null = null
let loading: Promise<Map<string, Redirect>> | null = null

const load = async () => {
  if (cache && Date.now() - cache.at < 60_000) return cache.map
  if (!loading) {
    loading = fetch(`${BACKEND}/store/seo/redirects`, { headers: { "x-publishable-api-key": KEY }, signal: AbortSignal.timeout(2000) })
      .then((r) => (r.ok ? r.json() : { redirects: [] }))
      .then((d: { redirects?: Redirect[] }) => {
        const map = new Map((d.redirects ?? []).map((r) => [r.from, r]))
        cache = { at: Date.now(), map }
        return map
      })
      // If the store can't be reached, keep using the last list (or none) and try again soon.
      .catch(() => {
        cache = { at: Date.now() - 45_000, map: cache?.map ?? new Map() }
        return cache.map
      })
      .finally(() => {
        loading = null
      })
  }
  return loading
}

const norm = (p: string) => (p.replace(/\/+$/, "") || "/").toLowerCase()

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const map = await load()
  if (!map.size) return NextResponse.next()
  const from = norm(request.nextUrl.pathname)
  const r = map.get(from)
  if (!r) return NextResponse.next()
  const target = r.to.startsWith("/") ? new URL(r.to, request.nextUrl.origin) : new URL(r.to)
  // Keep any campaign tags (?utm_…) on the way through.
  if (r.to.startsWith("/")) for (const [k, v] of request.nextUrl.searchParams) if (!target.searchParams.has(k)) target.searchParams.set(k, v)
  event.waitUntil(
    fetch(`${BACKEND}/store/seo/redirects`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-publishable-api-key": KEY },
      body: JSON.stringify({ from }),
    }).catch(() => {})
  )
  return NextResponse.redirect(target, r.permanent ? 308 : 307)
}

export const config = {
  // Pages only: not Next's own files, the API, or files with an extension (pictures, fonts…).
  matcher: ["/((?!_next/|api/|.*\\.[a-zA-Z0-9]{2,5}$).*)"],
}

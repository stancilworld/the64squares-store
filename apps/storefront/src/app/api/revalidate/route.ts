import { timingSafeEqual } from "node:crypto"
import { revalidateTag } from "next/cache"

// The backend asks for fresh data after staff change something in the admin (adverts for
// now), so the change shows on the next visit instead of after the cache runs out. Signed
// with the secret the backend and website share (T64_PREVIEW_SECRET).
const TAGS = new Set(["showcase"])

export async function POST(request: Request) {
  const secret = process.env.T64_PREVIEW_SECRET ?? ""
  const got = request.headers.get("x-t64-secret") ?? ""
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 })
  }
  const body = (await request.json().catch(() => ({}))) as { tags?: unknown }
  const tags = (Array.isArray(body.tags) ? body.tags : []).filter((t): t is string => typeof t === "string" && TAGS.has(t))
  for (const t of tags) revalidateTag(t, { expire: 0 })
  return Response.json({ revalidated: tags })
}

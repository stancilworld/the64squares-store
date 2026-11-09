// A simple per-address limit for the event collector, so nobody can flood the Event
// Manager or the ad platforms with made-up events.
const hits = new Map<string, number[]>()

export const overLimit = (key: string, max: number, windowMs: number) => {
  const now = Date.now()
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  list.push(now)
  hits.set(key, list)
  if (hits.size > 10_000) hits.clear()
  return list.length > max
}

// Requests must come from the shop's own website (STORE_CORS), not another site.
export const fromStore = (origin: string | undefined) => {
  if (!origin) return true // same-origin and server-side requests send no Origin
  const allowed = (process.env.STORE_CORS || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean)
  return allowed.some((a) => {
    if (a === origin) return true
    // STORE_CORS may hold patterns like /\.example\.com$/
    if (a.startsWith("/") && a.endsWith("/")) {
      try {
        return new RegExp(a.slice(1, -1)).test(origin)
      } catch {
        return false
      }
    }
    return false
  })
}

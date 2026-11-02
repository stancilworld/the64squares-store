// Passes chat requests to the Medusa server, with the visitor's address (set by nginx) so
// the server can slow down robots.
const BACKEND = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")

export async function forward(request: Request, path: string, body: unknown) {
  const ip = request.headers.get("x-real-ip")
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        ...(ip ? { "x-real-ip": ip } : {}),
      },
      body: JSON.stringify(body),
      cache: "no-store",
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json }
  } catch {
    return { ok: false, status: 502, json: { message: "I can't reach the shop just now. Please try again in a minute." } }
  }
}

export const reply = (r: { ok: boolean; status: number; json: Record<string, unknown> }) =>
  Response.json({ ok: r.ok, ...r.json }, { status: r.ok ? 200 : r.status < 500 ? r.status : 502 })

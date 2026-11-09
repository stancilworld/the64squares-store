// Passes the website's tracking requests to the Medusa server, with the visitor's address
// and browser (set by nginx), only for requests made by this website's own pages.
const BACKEND = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")

export const sameSite = (request: Request) => {
  const site = request.headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return false
  const origin = request.headers.get("origin")
  if (!origin) return true
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") || request.headers.get("host"))
  } catch {
    return false
  }
}

export async function toBackend(request: Request, path: string, init: { method: "GET" | "POST"; body?: string }) {
  const ip = request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || ""
  try {
    const res = await fetch(`${BACKEND}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        "user-agent": request.headers.get("user-agent") ?? "",
        ...(ip ? { "x-real-ip": ip } : {}),
      },
      body: init.body,
      cache: "no-store",
    })
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json", "cache-control": "no-store" } })
  } catch {
    return Response.json({ message: "The shop can't be reached just now." }, { status: 502 })
  }
}

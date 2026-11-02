// Forwards Contact page messages to the Medusa server, with the visitor's address (set by
// nginx) so the server can stop floods. Field errors come back as { errors: { id: text } }.
const BACKEND = (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { answers?: unknown; website?: unknown } | null
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, message: "Something went wrong. Please try again." }, { status: 400 })
  }
  const ip = request.headers.get("x-real-ip")
  try {
    const res = await fetch(`${BACKEND}/store/contact`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        ...(ip ? { "x-real-ip": ip } : {}),
      },
      body: JSON.stringify({ answers: body.answers ?? {}, website: body.website ?? "" }),
      cache: "no-store",
    })
    const json = await res.json().catch(() => ({}))
    return Response.json({ ok: res.ok, ...json }, { status: res.ok ? 200 : res.status < 500 ? res.status : 502 })
  } catch {
    return Response.json({ ok: false, message: "We couldn't send that just now. Please try again in a minute." }, { status: 502 })
  }
}

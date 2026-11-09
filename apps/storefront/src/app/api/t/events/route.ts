import { sameSite, toBackend } from "../forward"

// Shop events from the website's pages → Medusa (/store/marketing/events).
export async function POST(request: Request) {
  if (!sameSite(request)) return Response.json({ message: "Not allowed." }, { status: 403 })
  const body = await request.text()
  if (body.length > 64_000) return Response.json({ message: "Too large." }, { status: 413 })
  return toBackend(request, "/store/marketing/events", { method: "POST", body })
}

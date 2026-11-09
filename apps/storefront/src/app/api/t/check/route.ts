import { sameSite, toBackend } from "../forward"

// A tag test's result → Medusa (/store/marketing/check).
export async function POST(request: Request) {
  if (!sameSite(request)) return Response.json({ message: "Not allowed." }, { status: 403 })
  const body = await request.text()
  if (body.length > 8_000) return Response.json({ message: "Too large." }, { status: 413 })
  return toBackend(request, "/store/marketing/check", { method: "POST", body })
}

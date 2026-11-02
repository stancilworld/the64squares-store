import { sdk } from "@/lib/medusa"

// Forwards newsletter sign-ups to the Medusa server.
export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({ email: "" }))
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: "invalid" }, { status: 400 })
  }
  try {
    await sdk.client.fetch("/store/newsletter", {
      method: "POST",
      body: { email, source: "website" },
    })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 502 })
  }
}

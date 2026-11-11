import { sdk } from "@/lib/medusa"

// "Stop these emails" (the link in automatic emails).
export async function POST(request: Request) {
  const { email, sig } = await request.json().catch(() => ({}))
  if (typeof email !== "string" || typeof sig !== "string") return Response.json({ ok: false }, { status: 400 })
  try {
    await sdk.client.fetch("/store/unsubscribe", { method: "POST", body: { email, sig } })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }
}

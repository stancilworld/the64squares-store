import { sdk } from "@/lib/medusa"

// "Email me when it's back": forwarded to the store.
export async function POST(request: Request) {
  const { email, variant_id } = await request.json().catch(() => ({}))
  if (typeof email !== "string" || typeof variant_id !== "string") return Response.json({ ok: false }, { status: 400 })
  try {
    await sdk.client.fetch("/store/stock-alerts", { method: "POST", body: { email, variant_id } })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }
}

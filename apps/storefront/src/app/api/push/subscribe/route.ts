import { sdk } from "@/lib/medusa"

// A browser that allowed notifications (or, with "remove", turned them off).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { endpoint?: string; keys?: unknown; remove?: boolean } | null
  if (!body?.endpoint) return Response.json({ ok: false }, { status: 400 })
  try {
    await sdk.client.fetch(body.remove ? "/store/push/unsubscribe" : "/store/push/subscribe", {
      method: "POST",
      body: body.remove ? { endpoint: body.endpoint } : { endpoint: body.endpoint, keys: body.keys },
    })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }
}

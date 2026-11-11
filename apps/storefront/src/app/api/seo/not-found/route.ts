import { sdk } from "@/lib/medusa"

// The "page not found" screen reports the address here, for the admin's SEO → Not found list.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { path?: string; referrer?: string } | null
  if (body?.path && typeof body.path === "string") {
    await sdk.client
      .fetch("/store/seo/not-found", { method: "POST", body: { path: body.path.slice(0, 300), referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 300) : null } })
      .catch(() => {})
  }
  return new Response(null, { status: 204 })
}

import { sdk } from "@/lib/medusa"

// Whether the website offers notifications, and its public key.
export async function GET() {
  try {
    return Response.json(await sdk.client.fetch("/store/push"))
  } catch {
    return Response.json({ enabled: false })
  }
}

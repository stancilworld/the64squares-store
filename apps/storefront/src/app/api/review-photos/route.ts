import { getToken } from "@/lib/auth"
import { sdk } from "@/lib/medusa"

// Photos for the signed-in shopper's review, passed on to the store (which shrinks and keeps them).
export async function POST(request: Request) {
  const token = await getToken()
  if (!token) return Response.json({ message: "Please sign in first." }, { status: 401 })
  const body = await request.json().catch(() => null)
  try {
    const r = await sdk.client.fetch<{ photos: { url: string; sig: string }[] }>("/store/account/reviews/photos", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      body,
    })
    return Response.json(r)
  } catch (e) {
    return Response.json({ message: (e as { message?: string })?.message || "The photos couldn't be added." }, { status: 400 })
  }
}

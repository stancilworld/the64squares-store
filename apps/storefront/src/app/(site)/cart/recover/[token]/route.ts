import { NextResponse } from "next/server"
import { addToCart, getCart } from "@/lib/cart"
import { sdk } from "@/lib/medusa"

type Recovered = { completed: boolean; items: { variant_id: string; quantity: number; engraving: string | null }[] }

// The link in an abandoned-cart reminder: puts what was left at checkout back in the cart
// (skipping what's already there), then opens the cart.
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const back = (q: string) => NextResponse.redirect(new URL(`/cart${q}`, request.url))
  if (!/^cart_[A-Z0-9]+\.[\w-]{10,40}$/.test(token)) return back("")
  let data: Recovered
  try {
    data = await sdk.client.fetch<Recovered>(`/store/marketing/recover/${encodeURIComponent(token)}`)
  } catch {
    return back("")
  }
  if (data.completed || !data.items.length) return back("")
  const have = new Set((await getCart())?.items?.map((i) => `${i.variant_id}|${(i.metadata as { engraving?: string } | null)?.engraving ?? ""}`) ?? [])
  for (const i of data.items) {
    if (have.has(`${i.variant_id}|${i.engraving ?? ""}`)) continue
    try {
      await addToCart(i.variant_id, i.quantity, i.engraving, !!i.engraving)
    } catch {
      // Sold out or removed since: the rest still goes back.
    }
  }
  return back("?restored=1")
}

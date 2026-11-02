import { getProductCards } from "@/lib/data"
import type { ChatProduct } from "@/lib/types"
import { forward, reply } from "./forward"

// One chat message → the bot's answer. Products come back as handles; they're filled in
// here from the shop's product cards (same prices and pictures as the shop).
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return Response.json({ ok: false, message: "Please type a question." }, { status: 400 })
  const r = await forward(request, "/store/chatbot", { session: body.session, text: body.text, history: body.history, page: body.page })
  const answer = r.json.reply as { products?: string[] } | undefined
  if (r.ok && answer?.products?.length) {
    const cards = await getProductCards().catch(() => [])
    const byHandle = new Map(cards.map((c) => [c.handle, c]))
    const products: ChatProduct[] = answer.products
      .map((h) => byHandle.get(h))
      .filter((c): c is NonNullable<typeof c> => !!c)
      .map((c) => ({ handle: c.handle, title: c.title, thumbnail: c.thumbnail, price: c.price }))
    r.json.reply = { ...answer, products }
  }
  return reply(r)
}

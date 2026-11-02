import { forward, reply } from "../forward"

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  return reply(await forward(request, "/store/chatbot/track", { session: body?.session, order: body?.order, contact: body?.contact }))
}

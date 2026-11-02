import { forward, reply } from "../forward"

export async function POST(request: Request) {
  const b = (await request.json().catch(() => null)) as Record<string, unknown> | null
  return reply(
    await forward(request, "/store/chatbot/handover", {
      session: b?.session,
      name: b?.name,
      email: b?.email,
      phone: b?.phone,
      message: b?.message,
      website: b?.website ?? "",
    })
  )
}

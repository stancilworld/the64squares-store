import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { CONTENT_MODULE } from "../../../../modules/content"
import type ContentModuleService from "../../../../modules/content/service"

type Msg = { role: "user" | "bot"; text: string; source?: string; at: string }

// GET /admin/chatbot/chats?offset=&q=&filter=all|ai|handed_over|unanswered
// Past chats, newest first, with what most people ask.
export const GET = async (req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  const content: ContentModuleService = req.scope.resolve(CONTENT_MODULE)
  const offset = Math.max(Number(req.query.offset) || 0, 0)
  const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase().slice(0, 100) : ""
  const filter = typeof req.query.filter === "string" ? req.query.filter : "all"
  const rows = (await content.listChatSessions({} as never, { take: 2000, order: { last_at: "DESC" } })) as Record<string, any>[]
  const shaped = rows.map((r) => {
    const msgs = (r.messages ?? []) as Msg[]
    const asked = msgs.filter((m) => m.role === "user")
    return {
      id: r.id as string,
      last_at: r.last_at as string,
      created_at: r.created_at as string,
      page: r.page as string | null,
      count: asked.length,
      first: asked[0]?.text ?? "",
      last: msgs[msgs.length - 1]?.text ?? "",
      ai_count: r.ai_count as number,
      handed_over: !!r.handed_over,
      unanswered: msgs.some((m) => m.source === "fallback"),
      text: msgs.map((m) => m.text).join(" ").toLowerCase(),
    }
  })
  const pick = shaped
    .filter((s) => s.count > 0 || s.handed_over)
    .filter((s) => !q || s.text.includes(q))
    .filter((s) => (filter === "ai" ? s.ai_count > 0 : filter === "handed_over" ? s.handed_over : filter === "unanswered" ? s.unanswered : true))
  // Questions the bot couldn't answer, most recent first: ideas for new answers.
  const missed: { text: string; at: string }[] = []
  for (const r of rows) {
    const msgs = (r.messages ?? []) as Msg[]
    msgs.forEach((m, i) => {
      if (m.source === "fallback" && msgs[i - 1]?.role === "user") missed.push({ text: msgs[i - 1].text, at: m.at })
    })
    if (missed.length >= 20) break
  }
  const week = Date.now() - 7 * 86_400_000
  res.json({
    chats: pick.slice(offset, offset + 30).map(({ text, ...s }) => (void text, s)),
    count: pick.length,
    offset,
    limit: 30,
    stats: {
      week: shaped.filter((s) => s.count > 0 && new Date(s.last_at).getTime() > week).length,
      handed_over: shaped.filter((s) => s.handed_over && new Date(s.last_at).getTime() > week).length,
      ai: shaped.filter((s) => s.ai_count > 0 && new Date(s.last_at).getTime() > week).length,
    },
    missed: missed.slice(0, 20),
  })
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { countConfirmed, publicTournament, TOURNAMENT_FIELDS } from "../../../lib/tournaments"

// GET /store/tournaments: published tournaments (and cancelled or finished ones, so past
// events stay visible). Upcoming first, soonest first; then past ones, newest first.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament",
    fields: TOURNAMENT_FIELDS,
    filters: { status: ["published", "cancelled", "completed"] } as never,
  })
  const counts = await countConfirmed(req.scope, data.map((t) => t.id))
  const now = Date.now()
  const all = data.map((t) => publicTournament(t, counts.get(t.id) ?? 0))
  const ends = (t: Record<string, any>) => new Date(t.ends_at ?? t.starts_at).getTime()
  const upcoming = all
    .filter((t) => t.status === "published" && ends(t) >= now)
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const past = all
    .filter((t) => !upcoming.includes(t))
    .sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
  res.set("Cache-Control", "no-store")
  res.json({ upcoming, past })
}

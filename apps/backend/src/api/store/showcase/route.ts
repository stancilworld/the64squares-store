import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { PLACEMENTS, publicShowcase } from "../../../lib/showcase"

// GET /store/showcase?placement=play_hero: the window's adverts (live, or starting within a
// week) and its default screen.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const want = String(req.query.placement ?? "play_hero")
  const placement = PLACEMENTS.some((p) => p.key === want) ? want : "play_hero"
  res.json(await publicShowcase(req.scope, placement))
}

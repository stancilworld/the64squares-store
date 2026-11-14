import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { callGame } from "../../../lib/tournament-admin"

// GET /admin/online: who is connected to Play right now, from the game server.
export const GET = async (_req: AuthenticatedMedusaRequest, res: MedusaResponse) => {
  res.json(await callGame("/internal/online"))
}

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { FORMAT_LABELS } from "../../../../lib/tournaments"

// GET /store/certificates/:no: checks a tournament certificate (the QR code on it opens
// this). Shows only what's printed on the certificate.
export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const no = String(req.params.no ?? "").toUpperCase()
  if (!/^T64-\d{4}-[A-Z0-9]{6}$/.test(no)) return res.status(404).json({ message: "Certificate not found" })
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament_registration",
    fields: ["id", "player_name", "city", "final_rank", "score", "review", "status", "certificate_no", "tournament.id", "tournament.title", "tournament.handle", "tournament.format", "tournament.time_control", "tournament.starts_at", "tournament.results_final_at", "tournament.results_at"],
    filters: { certificate_no: no } as never,
  })
  const r = data[0]
  if (!r?.tournament || r.status !== "confirmed" || r.review === "disqualified") return res.status(404).json({ message: "Certificate not found" })
  const { data: field } = await query.graph({
    entity: "tournament_registration",
    fields: ["id"],
    filters: { tournament_id: r.tournament.id, status: "confirmed", final_rank: { $ne: null } } as never,
  })
  const t = r.tournament
  res.json({
    certificate: {
      number: r.certificate_no,
      player_name: r.player_name,
      city: r.city ?? null,
      rank: r.final_rank,
      score: r.score,
      players: field.length,
      final: !!t.results_final_at,
      issued_at: t.results_at ?? t.starts_at,
      tournament: { title: t.title, handle: t.handle, format: FORMAT_LABELS[t.format] ?? t.format, time_control: t.time_control, starts_at: t.starts_at },
    },
  })
}

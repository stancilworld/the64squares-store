import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { nudgeGameServer } from "../../../../../lib/tournament-admin"
import { messagePlayers, tournamentLink } from "../../../../../lib/tournament-notify"
import { finalizeAndTell } from "../../../../../lib/tournament-results"
import { TOURNAMENT_FIELDS } from "../../../../../lib/tournaments"
import { updateTournamentWorkflow } from "../../../../../workflows/tournament"
import { cancelTournamentWorkflow, fixTournamentGameWorkflow } from "../../../../../workflows/tournament-results"
import type { TournamentControlBodyType } from "../../../validators"

type Row = Record<string, any>

// POST /admin/tournaments/:id/control: run a live online tournament: start it now, pause
// and resume pairing, call it off (every pass handed back), correct a game's result, make
// the results final, or message the players.
export const POST = async (req: AuthenticatedMedusaRequest<TournamentControlBodyType>, res: MedusaResponse) => {
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "tournament", fields: TOURNAMENT_FIELDS, filters: { id: req.params.id } })
  const t = data[0] as Row | undefined
  if (!t) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Tournament not found")
  const b = req.validatedBody
  const by = req.auth_context.actor_id

  if (b.action === "start_now") {
    if (t.status !== "published") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "Publish the tournament first.")
    if (new Date(t.starts_at).getTime() <= Date.now()) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "It has already started.")
    const length = t.ends_at ? new Date(t.ends_at).getTime() - new Date(t.starts_at).getTime() : null
    const now = new Date()
    const { result } = await updateTournamentWorkflow(req.scope).run({
      input: { id: t.id, data: { starts_at: now, ends_at: length ? new Date(now.getTime() + length) : t.ends_at, registration_closes_at: null } },
    })
    return res.json({ tournament: result, message: "Started. Players who checked in are being paired." })
  }
  if (b.action === "pause" || b.action === "resume") {
    const { result } = await updateTournamentWorkflow(req.scope).run({ input: { id: t.id, data: { paused: b.action === "pause" } } })
    await nudgeGameServer(req.scope, t.id)
    return res.json({ tournament: result, message: b.action === "pause" ? "Paused: no new games start. Games being played carry on." : "Resumed." })
  }
  if (b.action === "cancel") {
    const { result } = await cancelTournamentWorkflow(req.scope).run({ input: { id: t.id, reason: b.reason } })
    await messagePlayers(req.scope, t, result.players.map((p) => ({ ...p, player_name: p.name })), `${t.title} is cancelled`, `${b.reason}\n\nYour Tournament Pass is back in your account.`)
    await nudgeGameServer(req.scope, t.id)
    return res.json({ tournament: result.tournament, message: `Cancelled. ${result.refunded} pass${result.refunded === 1 ? "" : "es"} returned and ${result.players.length} player${result.players.length === 1 ? "" : "s"} told.` })
  }
  if (b.action === "fix_result") {
    await fixTournamentGameWorkflow(req.scope).run({ input: { tournament_id: t.id, round: b.round, board: b.board, game_no: b.game_no, result: b.result, note: b.note, by } })
    return res.json({ message: "Result corrected. Standings update in a few seconds." })
  }
  if (b.action === "finalize") {
    await finalizeAndTell(req.scope, t.id, !!b.force)
    return res.json({ message: "Results are final. Prize winners were asked for their address." })
  }
  // message
  const { data: regs } = await query.graph({ entity: "tournament_registration", fields: ["id", "player_name", "email", "phone", "checked_in_at"], filters: { tournament_id: t.id, status: "confirmed" } as never })
  const to = b.only_checked_in ? regs.filter((r) => r.checked_in_at) : regs
  const sent = await messagePlayers(req.scope, t, to as Row[], b.subject, b.body)
  res.json({ message: `Sent to ${to.length} player${to.length === 1 ? "" : "s"} (${sent.emailed} by email, ${sent.whatsapped} by WhatsApp).`, link: tournamentLink(t.handle) })
}

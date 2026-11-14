import { createStep, createWorkflow, StepResponse, transform, WorkflowResponse } from "@medusajs/framework/workflows-sdk"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import { randomBytes } from "node:crypto"
import { TOURNAMENT_MODULE } from "../modules/tournament"
import type TournamentModuleService from "../modules/tournament/service"
import { PASS_MODULE } from "../modules/pass"
import type PassModuleService from "../modules/pass/service"
import type { PassChange } from "./passes"

// What happens when an online tournament ends (placings, certificates, passes, the
// fair-play review of the prize winners) or is called off (every pass handed back).

type Row = Record<string, any>
type C = { resolve: (k: string) => unknown }

const tsvc = (c: C) => c.resolve(TOURNAMENT_MODULE) as TournamentModuleService
const psvc = (c: C) => c.resolve(PASS_MODULE) as PassModuleService

const certificateNo = () => {
  const d = new Date()
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const tail = [...randomBytes(6)].map((b) => abc[b % abc.length]).join("")
  return `T64-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}-${tail}`
}

const restoreFields = ["id", "final_rank", "score", "review", "review_note", "prize_title", "prize_status", "certificate_no", "status"] as const
const snapshot = (r: Row) => Object.fromEntries(restoreFields.map((k) => [k, r[k] ?? null]))

// ---------------------------------------------------------------- passes in bulk

// Several pass changes at once; each one with a ref happens once per player.
export const grantPassesStep = createStep(
  "grant-passes",
  async (input: PassChange[], { container }) => {
    const s = psvc(container)
    const made: string[] = []
    for (const p of input) {
      if (!p.delta) continue
      if (p.ref) {
        const [done] = await s.listPassEntries({ customer_id: p.customer_id, ref: p.ref }, { take: 1 })
        if (done) continue
      }
      const e = await s.createPassEntries({ customer_id: p.customer_id, delta: p.delta, reason: p.reason, ref: p.ref ?? null, note: p.note ?? null, created_by: p.created_by ?? null })
      made.push(e.id)
    }
    return new StepResponse({ granted: made.length }, made)
  },
  async (made, { container }) => {
    if (made?.length) await psvc(container).deletePassEntries(made)
  }
)

// ---------------------------------------------------------------- results

export type FinalPlace = { customer_id: string; rank: number; score: number; completed: boolean }

export type ResultsInput = { tournament_id: string; places: FinalPlace[]; completed_passes: number }

const recordTournamentResultsStep = createStep(
  "record-tournament-results",
  async (input: ResultsInput, { container }) => {
    const s = tsvc(container)
    const t = (await s.retrieveTournament(input.tournament_id)) as Row
    const regs = (await s.listTournamentRegistrations({ tournament_id: t.id, status: "confirmed" }, { take: 10000 })) as Row[]
    const byCustomer = new Map(regs.map((r) => [r.customer_id as string, r]))
    const prizes = (Array.isArray(t.prize_list) ? t.prize_list : []) as { title?: string }[]
    // The prize places (at least the top three) wait for the fair-play review.
    const reviewTop = Math.max(3, prizes.length)
    const before: Row[] = []
    const passes: PassChange[] = []
    for (const p of input.places) {
      const r = byCustomer.get(p.customer_id)
      if (!r) continue
      before.push(snapshot(r))
      const prize = prizes[p.rank - 1]?.title ?? null
      await s.updateTournamentRegistrations({
        id: r.id,
        final_rank: p.rank,
        score: p.score,
        review: p.rank <= reviewTop ? (r.review ?? "pending") : null,
        prize_title: prize,
        prize_status: prize ? (r.prize_status ?? "due") : null,
        certificate_no: t.certificates === false ? r.certificate_no : (r.certificate_no ?? certificateNo()),
      } as never)
      // Free-entry tournaments give no passes for finishing.
      if (p.completed && input.completed_passes > 0 && t.entry !== "free") {
        passes.push({ customer_id: p.customer_id, delta: input.completed_passes, reason: "completed", ref: `completed:${t.id}`, note: t.title })
      }
    }
    const prevT = { id: t.id, status: t.status, results_at: t.results_at ?? null }
    await s.updateTournaments({ id: t.id, status: "completed", results_at: t.results_at ?? new Date() } as never)
    return new StepResponse({ tournament_id: t.id, placed: before.length, passes }, { regs: before, t: prevT })
  },
  async (undo, { container }) => {
    if (!undo) return
    const s = tsvc(container)
    for (const r of undo.regs) await s.updateTournamentRegistrations(r as never)
    await s.updateTournaments(undo.t as never)
  }
)

export const recordTournamentResultsWorkflow = createWorkflow("record-tournament-results", (input: ResultsInput) => {
  const done = recordTournamentResultsStep(input)
  const granted = grantPassesStep(transform({ done }, ({ done }) => done.passes))
  return new WorkflowResponse(transform({ done, granted }, ({ done, granted }) => ({ tournament_id: done.tournament_id, placed: done.placed, passes: granted.granted })))
})

// ---------------------------------------------------------------- calling it off

const cancelTournamentStep = createStep(
  "cancel-tournament",
  async (input: { id: string; reason: string }, { container }) => {
    const s = tsvc(container)
    const t = (await s.retrieveTournament(input.id)) as Row
    if (t.status === "completed") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "This tournament has finished. Its results can't be cancelled.")
    const regs = (await s.listTournamentRegistrations({ tournament_id: t.id, status: "confirmed" }, { take: 10000 })) as Row[]
    for (const r of regs) await s.updateTournamentRegistrations({ id: r.id, status: "cancelled" } as never)
    await s.updateTournaments({ id: t.id, status: "cancelled", cancel_reason: input.reason } as never)
    const refunds: PassChange[] = regs
      .filter((r) => r.pass_entry_id)
      .map((r) => ({ customer_id: r.customer_id, delta: Math.max(1, Number(t.pass_cost ?? 1)), reason: "refund", ref: `refund:${r.pass_entry_id}`, note: t.title }))
    return new StepResponse(
      { tournament: t, players: regs.map((r) => ({ id: r.id, email: r.email, phone: r.phone, name: r.player_name })), refunds },
      { t: { id: t.id, status: t.status, cancel_reason: t.cancel_reason ?? null }, regs: regs.map((r) => r.id) }
    )
  },
  async (undo, { container }) => {
    if (!undo) return
    const s = tsvc(container)
    for (const id of undo.regs) await s.updateTournamentRegistrations({ id, status: "confirmed" } as never)
    await s.updateTournaments(undo.t as never)
  }
)

export const cancelTournamentWorkflow = createWorkflow("cancel-tournament", (input: { id: string; reason: string }) => {
  const done = cancelTournamentStep(input)
  const refunded = grantPassesStep(transform({ done }, ({ done }) => done.refunds))
  return new WorkflowResponse(transform({ done, refunded }, ({ done, refunded }) => ({ players: done.players, tournament: done.tournament, refunded: refunded.granted })))
})

// ---------------------------------------------------------------- after the event

export type ResultUpdate = {
  id: string
  review?: "pending" | "cleared" | "disqualified"
  review_note?: string | null
  prize_title?: string | null
  prize_status?: "due" | "address" | "shipped" | "delivered" | null
  prize_tracking?: string | null
  prize_address?: Record<string, string> | null
}

// Staff record the fair-play review or a prize's delivery; a winner sends their address.
const updateRegistrationResultStep = createStep(
  "update-registration-result",
  async (input: ResultUpdate, { container }) => {
    const s = tsvc(container)
    const prev = (await s.retrieveTournamentRegistration(input.id)) as Row
    const data: Row = { id: input.id }
    for (const k of ["review", "review_note", "prize_title", "prize_status", "prize_tracking", "prize_address"] as const) {
      if (input[k] !== undefined) data[k] = input[k]
    }
    // A disqualified player loses their prize.
    if (input.review === "disqualified") {
      data.prize_status = null
      data.prize_title = null
    }
    const r = await s.updateTournamentRegistrations(data as never)
    const undo = Object.fromEntries(Object.keys(data).map((k) => [k, prev[k] ?? null]))
    return new StepResponse(r as Row, undo)
  },
  async (undo, { container }) => {
    if (undo) await tsvc(container).updateTournamentRegistrations(undo as never)
  }
)

export const updateRegistrationResultWorkflow = createWorkflow("update-registration-result", (input: ResultUpdate) => {
  return new WorkflowResponse(updateRegistrationResultStep(input))
})

// The fair-play review is done: results become final and winners are asked for an address.
const finalizeTournamentResultsStep = createStep(
  "finalize-tournament-results",
  async (input: { id: string; force?: boolean }, { container }) => {
    const s = tsvc(container)
    const t = (await s.retrieveTournament(input.id)) as Row
    if (t.results_final_at) return new StepResponse({ tournament: t, newly: false }, null)
    if (t.status !== "completed") throw new MedusaError(MedusaError.Types.NOT_ALLOWED, "The tournament hasn't finished yet.")
    const regs = (await s.listTournamentRegistrations({ tournament_id: t.id }, { take: 10000 })) as Row[]
    const pending = regs.filter((r) => r.review === "pending")
    if (pending.length && !input.force) {
      throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `${pending.length} player${pending.length === 1 ? " is" : "s are"} still waiting for the fair-play review.`)
    }
    const changed: Row[] = []
    for (const r of pending) {
      await s.updateTournamentRegistrations({ id: r.id, review: "cleared" } as never)
      changed.push({ id: r.id, review: "pending" })
    }
    for (const r of regs) {
      if (r.prize_title && r.prize_status === "due" && r.review !== "disqualified") {
        await s.updateTournamentRegistrations({ id: r.id, prize_status: "address" } as never)
        changed.push({ id: r.id, prize_status: "due" })
      }
    }
    const updated = await s.updateTournaments({ id: t.id, results_final_at: new Date() } as never)
    return new StepResponse({ tournament: updated as Row, newly: true }, { id: t.id, regs: changed })
  },
  async (undo, { container }) => {
    if (!undo) return
    const s = tsvc(container)
    for (const r of undo.regs) await s.updateTournamentRegistrations(r as never)
    await s.updateTournaments({ id: undo.id, results_final_at: null } as never)
  }
)

export const finalizeTournamentResultsWorkflow = createWorkflow("finalize-tournament-results", (input: { id: string; force?: boolean }) => {
  return new WorkflowResponse(finalizeTournamentResultsStep(input))
})

// ---------------------------------------------------------------- correcting a game

export type FixGameInput = { tournament_id: string; round: number; board: number; game_no: number; result: "1-0" | "0-1" | "1/2-1/2"; note: string; by: string }

// Staff correct one game's result (with a reason). The game server re-scores the event.
const fixTournamentGameStep = createStep(
  "fix-tournament-game",
  async (input: FixGameInput, { container }) => {
    const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as { raw: (sql: string, b?: unknown[]) => Promise<{ rows: Row[] }> }
    const { rows } = await pg.raw(
      "select result, fixed_by, fix_note from play.t_game where tournament_id = ? and round = ? and board = ? and game_no = ?",
      [input.tournament_id, input.round, input.board, input.game_no]
    )
    const prev = rows[0]
    if (!prev) throw new MedusaError(MedusaError.Types.NOT_FOUND, "That game wasn't found.")
    await pg.raw("update play.t_game set result = ?, fixed_by = ?, fix_note = ?, ended_at = coalesce(ended_at, now()) where tournament_id = ? and round = ? and board = ? and game_no = ?", [
      input.result,
      input.by,
      input.note,
      input.tournament_id,
      input.round,
      input.board,
      input.game_no,
    ])
    await pg.raw("insert into play.t_refresh (tournament_id) values (?) on conflict do nothing", [input.tournament_id])
    return new StepResponse({ ok: true }, { ...input, prev })
  },
  async (undo, { container }) => {
    if (!undo) return
    const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as { raw: (sql: string, b?: unknown[]) => Promise<unknown> }
    await pg.raw("update play.t_game set result = ?, fixed_by = ?, fix_note = ? where tournament_id = ? and round = ? and board = ? and game_no = ?", [
      undo.prev.result,
      undo.prev.fixed_by,
      undo.prev.fix_note,
      undo.tournament_id,
      undo.round,
      undo.board,
      undo.game_no,
    ])
  }
)

export const fixTournamentGameWorkflow = createWorkflow("fix-tournament-game", (input: FixGameInput) => {
  return new WorkflowResponse(fixTournamentGameStep(input))
})

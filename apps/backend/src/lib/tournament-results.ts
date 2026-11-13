import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { cancelTournamentWorkflow, type FinalPlace, finalizeTournamentResultsWorkflow, recordTournamentResultsWorkflow } from "../workflows/tournament-results"
import { buildMail } from "./automations"
import { sendEmail, storeUrl } from "./emails"
import { loadPassRules } from "./passes"
import { sendTournamentWhatsApp, tournamentLink } from "./tournament-notify"

// Turns finished online tournaments into results: placings, certificates and passes for
// everyone who played, the fair-play review for prize winners, and the messages that go
// with them. Run by the tournament-results job every few minutes.

type Row = Record<string, any>
type Pg = { raw: (q: string, b?: unknown[]) => Promise<{ rows: Row[] }> }

const ARENA_GRACE_MS = 3 * 60_000
// Demo events (apps/game/src/seed-demo.ts) are left exactly as they were made.
const NOT_DEMO = "'trn\\_demo\\_%'"
// Prizes are announced after the fair-play review; with nothing left to review this long
// after the end, the results are made final automatically.
export const REVIEW_HOURS = 48

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"]
  const v = n % 100
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`
}

export const certificateLink = (no: string) => `${storeUrl()}/certificates/${no}`

const hasPlayTables = async (pg: Pg) => {
  const { rows } = await pg.raw("select to_regclass('play.t_final') as f, to_regclass('play.arena_player') as a, to_regclass('play.t_state') as s")
  return { final: !!rows[0]?.f, arena: !!rows[0]?.a, state: !!rows[0]?.s }
}

// Swiss and knockout placings written by the game server; arena placings from its table.
const placesFor = async (pg: Pg, t: Row): Promise<FinalPlace[]> => {
  if (t.format === "arena") {
    const { rows } = await pg.raw(
      `select player_id, score, games from play.arena_player where tournament_id = ? and games > 0
        order by score desc, wins desc, games asc, joined_at asc`,
      [t.id]
    )
    return rows.map((r, i) => ({ customer_id: r.player_id, rank: i + 1, score: Number(r.score), completed: true }))
  }
  const { rows } = await pg.raw(
    `select f.player_id, f.rank, f.score, (w.player_id is null) as stayed
       from play.t_final f left join play.t_withdrawn w on w.tournament_id = f.tournament_id and w.player_id = f.player_id
      where f.tournament_id = ? order by f.rank`,
    [t.id]
  )
  return rows.map((r) => ({ customer_id: r.player_id, rank: Number(r.rank), score: Number(r.score), completed: !!r.stayed }))
}

const tell = async (c: MedusaContainer, r: Row, t: Row, kind: string, subject: string, heading: string, body: string, button: string, link: string, coupon = "") => {
  const first = String(r.player_name ?? "").split(" ")[0] || "there"
  const mail = buildMail({ enabled: true, subject, heading, body: `Hi {name},\n\n${body}`, button_label: button, coupon_code: coupon }, { name: first, link })
  if (r.email) await sendEmail(c, r.email, kind, mail)
  await sendTournamentWhatsApp(c, r.phone, [first, t.title, subject, link])
}

export const processTournamentResults = async (c: MedusaContainer) => {
  const pg = c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg
  const have = await hasPlayTables(pg)
  if (!have.state) return { recorded: 0, cancelled: 0, finalized: 0 }
  const rules = await loadPassRules(c)
  let recorded = 0
  let cancelled = 0
  let finalized = 0

  // 1. Events the game server called off: too few players checked in.
  const { rows: low } = await pg.raw(
    `select t.id, s.note from tournament t join play.t_state s on s.tournament_id = t.id
      where t.deleted_at is null and t.status = 'published' and s.phase = 'cancelled_low' and t.id not like ${NOT_DEMO}`
  )
  for (const r of low) {
    const { result } = await cancelTournamentWorkflow(c).run({ input: { id: r.id, reason: `Not enough players checked in (${r.note ?? "too few"}).` } })
    cancelled++
    for (const p of result.players) {
      await tell(c, { ...p, player_name: p.name }, result.tournament, "tournament-cancelled", `${result.tournament.title} was called off`, "Not enough players this time", `Too few players checked in, so ${result.tournament.title} didn't start. Your Tournament Pass is back in your account for the next one.`, "Find another tournament", `${storeUrl()}/play/tournaments`)
    }
  }

  // 2. Finished events, and finished events whose results staff corrected since.
  const { rows: due } = await pg.raw(
    `select t.* from tournament t
       left join play.t_state s on s.tournament_id = t.id
      where t.deleted_at is null and t.mode = 'online' and t.results_final_at is null and t.id not like ${NOT_DEMO}
        and (
          (t.status = 'published' and t.format in ('swiss','round_robin','knockout') and s.phase = 'finished')
          or (t.status = 'published' and t.format = 'arena' and coalesce(t.ends_at, t.starts_at + interval '1 hour') < now() - interval '${ARENA_GRACE_MS / 1000} seconds')
          or (t.status = 'completed' and t.results_at > now() - interval '7 days')
        )`
  )
  for (const t of due) {
    if (t.format !== "arena" && !have.final) continue
    if (t.format === "arena" && !have.arena) continue
    const places = await placesFor(pg, t)
    if (t.status === "completed") {
      // Already recorded: only redo it if a correction changed a placing.
      const { rows: now } = await pg.raw("select customer_id, final_rank from tournament_registration where tournament_id = ? and status = 'confirmed' and deleted_at is null and final_rank is not null", [t.id])
      const was = new Map(now.map((r) => [r.customer_id, Number(r.final_rank)]))
      if (places.length === was.size && places.every((p) => was.get(p.customer_id) === p.rank)) continue
      await recordTournamentResultsWorkflow(c).run({ input: { tournament_id: t.id, places, completed_passes: rules.completed } })
      continue
    }
    if (!places.length && t.format === "arena") {
      // Nobody played: nothing to give out.
      await cancelTournamentWorkflow(c).run({ input: { id: t.id, reason: "Nobody played." } })
      cancelled++
      continue
    }
    await recordTournamentResultsWorkflow(c).run({ input: { tournament_id: t.id, places, completed_passes: rules.completed } })
    recorded++
    const { rows: regs } = await pg.raw(
      "select * from tournament_registration where tournament_id = ? and status = 'confirmed' and deleted_at is null and final_rank is not null",
      [t.id]
    )
    const link = tournamentLink(t.handle)
    for (const r of regs) {
      const lines = [`You finished ${ordinal(Number(r.final_rank))} of ${regs.length} in ${t.title}.`]
      if (r.prize_title) lines.push(`That's a prize place: ${r.prize_title}. Prizes are confirmed after the fair-play review, within ${REVIEW_HOURS} hours, and we'll ask for your delivery address then.`)
      if (r.certificate_no) lines.push(`Your certificate is ready: ${certificateLink(r.certificate_no)}`)
      if (t.coupon_code) lines.push(`As a thank-you for playing, here's a code for the shop.`)
      lines.push("Every game is saved: replay them from the tournament page.")
      await tell(c, r, t, "tournament-result", `Your result in ${t.title}`, `${ordinal(Number(r.final_rank))} place`, lines.join("\n\n"), "See the results", link, t.coupon_code ?? "")
    }
  }

  // 3. Results become final once the review is done (or the review window has passed
  //    with nothing waiting); winners are asked for their address.
  const { rows: ready } = await pg.raw(
    `select t.id from tournament t
      where t.deleted_at is null and t.status = 'completed' and t.results_final_at is null and t.results_at is not null
        and t.results_at < now() - interval '${REVIEW_HOURS} hours'
        and not exists (select 1 from tournament_registration r where r.tournament_id = t.id and r.review = 'pending' and r.deleted_at is null)`
  )
  for (const r of ready) {
    await finalizeAndTell(c, r.id)
    finalized++
  }
  return { recorded, cancelled, finalized }
}

// Final results: tell each prize winner to send their address.
export const finalizeAndTell = async (c: MedusaContainer, id: string, force = false) => {
  const { result } = await finalizeTournamentResultsWorkflow(c).run({ input: { id, force } })
  if (!result.newly) return result
  const pg = c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg
  const t = result.tournament
  const { rows: winners } = await pg.raw("select * from tournament_registration where tournament_id = ? and prize_status = 'address' and deleted_at is null", [id])
  for (const r of winners) {
    await tell(
      c,
      r,
      t,
      "tournament-prize",
      `You won ${r.prize_title}`,
      "Congratulations!",
      `The fair-play review is done and your ${ordinal(Number(r.final_rank))} place in ${t.title} is confirmed. You've won: ${r.prize_title}.\n\nTell us where to send it, and we'll post it to you.`,
      "Add your delivery address",
      `${storeUrl()}/play/my-tournaments`
    )
  }
  return result
}

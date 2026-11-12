import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { PASS_MODULE } from "../modules/pass"
import type PassModuleService from "../modules/pass/service"
import { changePassesWorkflow } from "../workflows/passes"
import { indiaDay, indiaWeek, loadPassRules } from "./passes"

// Gives the Tournament Passes players have earned (run by jobs/tournament-passes.ts).
// Each award has a ref, so running this again never gives a pass twice.

type Pg = { raw: (q: string, b?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

export const awardEarnedPasses = async (c: MedusaContainer) => {
  const rules = await loadPassRules(c)
  const passes: PassModuleService = c.resolve(PASS_MODULE)
  const pg = c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg
  const give = (customer_id: string, reason: "welcome" | "games" | "puzzles" | "referral", ref: string, note?: string, delta = 1) =>
    changePassesWorkflow(c).run({ input: { customer_id, delta, reason, ref, note: note ?? null } }).then(() => 1, () => 0)
  let given = 0
  const today = indiaDay()

  // Welcome: every customer with an account gets one (also those who joined before passes).
  if (rules.welcome > 0) {
    const have = new Set((await passes.listPassEntries({ reason: "welcome" }, { select: ["customer_id"], take: 1_000_000 })).map((e) => e.customer_id))
    const customers = await c.resolve(Modules.CUSTOMER).listCustomers({ has_account: true }, { select: ["id"], take: 1_000_000 })
    for (const cu of customers) if (!have.has(cu.id)) given += await give(cu.id, "welcome", "welcome", undefined, rules.welcome)
  }

  // Rated games against real players (not the computer, not House Players).
  let games: Record<string, unknown>[] = []
  try {
    games = (
      await pg.raw(
        `select p.id as player_id, count(*)::int as n
           from play.game g, lateral (values (g.white_id), (g.black_id)) as p(id)
          where g.rated and g.status = 'finished' and g.white_id like 'cus\\_%' and g.black_id like 'cus\\_%'
          group by 1`
      )
    ).rows
  } catch {
    // The game server hasn't created its tables yet.
  }
  if (rules.games_per_pass > 0 && games.length) {
    const earned = new Map<string, { total: number; today: number }>()
    for (const e of await passes.listPassEntries({ reason: "games" }, { select: ["customer_id", "ref"], take: 1_000_000 })) {
      const cur = earned.get(e.customer_id) ?? { total: 0, today: 0 }
      cur.total++
      if (e.ref?.startsWith(`games:${today}`)) cur.today++
      earned.set(e.customer_id, cur)
    }
    for (const r of games) {
      const id = String(r.player_id)
      const due = Math.floor(Number(r.n) / rules.games_per_pass)
      const have = earned.get(id) ?? { total: 0, today: 0 }
      for (let k = have.today; k < rules.games_daily_max && have.total + (k - have.today) < due; k++) {
        given += await give(id, "games", `games:${today}:${k + 1}`, `${Number(r.n)} rated games`)
      }
    }
  }

  // Solved puzzles on each of the last N days (India time), once a week.
  if (rules.puzzle_streak_days > 0 && rules.puzzle_pass > 0) {
    try {
      const { rows } = await pg.raw(
        `select player_id, count(distinct (created_at at time zone 'Asia/Kolkata')::date)::int as days
           from play.puzzle_attempt
          where solved and player_id like 'cus\\_%' and created_at >= now() - (? || ' days')::interval
          group by 1`,
        [String(rules.puzzle_streak_days)]
      )
      const week = indiaWeek()
      for (const r of rows) if (Number(r.days) >= rules.puzzle_streak_days) given += await give(String(r.player_id), "puzzles", `puzzles:${week}`, `${rules.puzzle_streak_days}-day puzzle streak`, rules.puzzle_pass)
    } catch {
      // No puzzle tables yet.
    }
  }
  // A friend they invited made an account and finished a game against a real player.
  if (rules.referral > 0 && rules.referral_monthly_max > 0) {
    try {
      const { rows } = await pg.raw(
        `select c.id as friend, c.metadata->>'t64_referred_by' as inviter, coalesce(c.first_name, '') as name
           from customer c
          where c.deleted_at is null and c.has_account and c.metadata->>'t64_referred_by' like 'cus\\_%'
            and exists (select 1 from play.game g where g.status = 'finished' and g.white_id like 'cus\\_%' and g.black_id like 'cus\\_%'
                          and (g.white_id = c.id or g.black_id = c.id))`
      )
      const month = today.slice(0, 7)
      const thisMonth = new Map<string, number>()
      for (const e of await passes.listPassEntries({ reason: "referral" }, { select: ["customer_id", "note", "created_at"], take: 1_000_000 })) {
        if (indiaDay(new Date(e.created_at)).startsWith(month)) thisMonth.set(e.customer_id, (thisMonth.get(e.customer_id) ?? 0) + 1)
      }
      for (const r of rows) {
        const inviter = String(r.inviter)
        const ref = `referral:${r.friend}`
        if ((await passes.listPassEntries({ customer_id: inviter, ref }, { take: 1 })).length) continue
        if ((thisMonth.get(inviter) ?? 0) >= rules.referral_monthly_max) continue
        const got = await give(inviter, "referral", ref, `${String(r.name) || "A friend"} joined and played`, rules.referral)
        if (got) thisMonth.set(inviter, (thisMonth.get(inviter) ?? 0) + 1)
        given += got
      }
    } catch {
      // No game tables yet.
    }
  }
  return given
}

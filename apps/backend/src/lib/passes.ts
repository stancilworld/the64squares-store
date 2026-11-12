import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { PASS_MODULE } from "../modules/pass"
import type PassModuleService from "../modules/pass/service"

// Tournament Passes: how players earn them (adjustable in admin → Tournaments → Passes).
// Passes are never sold, can't be transferred and have no cash value.

export const PASS_RULES_KEY = "pass_rules"

export type PassRules = {
  welcome: number
  // 1 pass for every `games_per_pass` rated games against real players, at most `games_daily_max` a day.
  games_per_pass: number
  games_daily_max: number
  // 1 pass for solving the daily puzzle `puzzle_streak_days` days in a row, once a week.
  puzzle_streak_days: number
  puzzle_pass: number
  // A friend who registers and plays.
  referral: number
  referral_monthly_max: number
  // Finishing a tournament without leaving early.
  completed: number
}

export const DEFAULT_PASS_RULES: PassRules = {
  welcome: 1,
  games_per_pass: 10,
  games_daily_max: 1,
  puzzle_streak_days: 7,
  puzzle_pass: 1,
  referral: 1,
  referral_monthly_max: 5,
  completed: 1,
}

export const loadPassRules = async (c: MedusaContainer): Promise<PassRules> => {
  const content: ContentModuleService = c.resolve(CONTENT_MODULE)
  return { ...DEFAULT_PASS_RULES, ...(((await content.getSettingValue(PASS_RULES_KEY)) as Partial<PassRules> | null) ?? {}) }
}

export const REASON_LABELS: Record<string, string> = {
  welcome: "Welcome pass",
  games: "Played rated games",
  puzzles: "Daily puzzle streak",
  referral: "Invited a friend",
  completed: "Finished a tournament",
  admin: "Given by The 64 Squares",
  join: "Used to join a tournament",
  refund: "Returned",
  removed: "Removed by The 64 Squares",
}

export const passWallet = async (c: MedusaContainer, customerId: string) => {
  const s: PassModuleService = c.resolve(PASS_MODULE)
  const entries = await s.listPassEntries({ customer_id: customerId }, { order: { created_at: "DESC" }, take: 100 })
  // Joining and refunds note the tournament's id: show its name instead.
  const ids = [...new Set(entries.map((e) => e.note).filter((n): n is string => !!n && /^trn_\w+$/.test(n)))]
  const titles = new Map<string, string>()
  if (ids.length) {
    const { data } = await c.resolve(ContainerRegistrationKeys.QUERY).graph({ entity: "tournament", fields: ["id", "title"], filters: { id: ids } })
    for (const t of data) titles.set(t.id, t.title)
  }
  return {
    balance: await s.balanceOf(customerId),
    history: entries.map((e) => ({ id: e.id, delta: e.delta, reason: e.reason, label: REASON_LABELS[e.reason] ?? e.reason, note: e.note ? (titles.get(e.note) ?? e.note) : null, created_at: e.created_at })),
  }
}

// India time, for "one per day" rules.
export const indiaDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d)
export const indiaWeek = (d = new Date()) => {
  const day = new Date(`${indiaDay(d)}T00:00:00Z`)
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86_400_000)
  return monday.toISOString().slice(0, 10)
}

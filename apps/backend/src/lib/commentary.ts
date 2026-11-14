import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { speakCoachWorkflow } from "../workflows/coach"
import { askAi } from "./ai-writer"
import { indiaDay } from "./coach-voice"
import { getServiceKeys } from "./service-keys"

// Live commentary lines, asked for by the game server (apps/game/src/commentary.ts) with the
// facts of a moment in a game. The commentator only narrates what happened; it never judges
// a move or advises, and any line that does is replaced by the plain one. Written by the free AI keys (Groq, then Gemini) and, for
// featured games, voiced by ElevenLabs within a daily allowance. Without keys, the game
// server's own plain line is used.

// Shared with the game server (deploy/build.sh makes it).
export const internalSecret = () => process.env.GAME_INTERNAL_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-internal-secret")

export const secretOk = (given: unknown) => {
  const want = internalSecret()
  if (!want || typeof given !== "string" || given.length !== want.length) return false
  return crypto.timingSafeEqual(Buffer.from(given), Buffer.from(want))
}

// ElevenLabs characters a day for all live commentary together (about 40 minutes of speech).
export const COMMENTARY_DAILY_CHARS = Number(process.env.COMMENTARY_DAILY_CHARS || 40000)
export const COMMENTARY_ACCOUNT = "_commentary"

const SYSTEM = [
  "You are the live commentator for The 64 Squares, an Indian online chess site. Your words are read and spoken aloud to spectators while the game is still being played.",
  "Write ONE or TWO short sentences, at most 30 words in all, lively and warm, in simple Indian English, like a friendly TV chess commentator.",
  "You are a narrator, not an analyst: say ONLY what just happened on the board (which piece moved or was taken, on which square, check, castling, promotion), the clocks, the material count you are given, the opening's name and the result.",
  "NEVER judge a move or a position: no words like good, bad, strong, weak, mistake, blunder, brilliant, clever, risky, winning, losing, better, worse, advantage, edge, pressure, danger, threat, attack, chance.",
  "NEVER say or hint what a player should, could or might play, plan or look for, or what may happen next.",
  "Use only the facts you are given. Never invent players' history, titles, ratings, prizes or events.",
  "Use the players' names. Say the move as written (e.g. Bxf6) only for the move just played. No emojis, no hashtags, no quotation marks, no markdown.",
].join(" ")

const MOMENT: Record<string, string> = {
  start: "The game has just started. Introduce the players, their ratings and the time control.",
  opening: "Say which opening is on the board, by its name only.",
  capture: "A piece was just taken. Say who took which piece on which square, and the material count.",
  trade: "A piece was just taken back on the same square, so pieces were exchanged. Say so, and the material count.",
  promotion: "A pawn just reached the last rank and was promoted. Say who and to what.",
  check: "A check was just given. Say who gave it. Keep it short.",
  castle: "A player just castled. Say who and which side. Keep it short.",
  "low-time": "A player's clock is running low. Say who and how much time is left, building excitement without judging anything.",
  milestone: "Give a short update: the move number, the material count and both clocks.",
  end: "The game has just ended. Give the result and how it ended, and congratulate both players.",
}

// Anything that judges or advises is thrown away (the plain line is used instead).
const JUDGEMENT =
  /\b(should|could|would|might|must|ought|needs? to|best|better|worse|mistake|blunder|error|inaccura\w*|good|bad|strong|weak|brilliant|clever|careless|risky|winning|losing|advantage|edge|pressure|danger\w*|threat\w*|attack\w*|missed|instead|plan\w*|idea|chance\w*|trouble|crush\w*|dominat\w*|decisive)\b/i

export const writeCommentary = async (c: MedusaContainer, input: { facts: Record<string, unknown>; fallback: string; voice: boolean }) => {
  const logger = c.resolve(ContainerRegistrationKeys.LOGGER)
  const keys = await getServiceKeys(c)
  let text = input.fallback
  if (keys.ai.length) {
    const f = input.facts
    const prompt = [`Moment: ${MOMENT[String(f.moment)] ?? MOMENT.milestone}`, `Facts: ${JSON.stringify(f)}`].join("\n")
    const answer = await askAi(c, keys.ai, SYSTEM, prompt, { temperature: 0.8, maxTokens: 120, timeoutMs: 8_000, label: "Live commentary" })
    const line = answer?.text.replace(/^["'“”]+|["'“”]+$/g, "").replace(/\s+/g, " ").trim()
    if (line && line.length <= 280 && !JUDGEMENT.test(line)) text = line
  }
  let audio_url: string | null = null
  if (input.voice && keys.voice) {
    try {
      const { result } = await speakCoachWorkflow(c).run({ input: { customer_id: COMMENTARY_ACCOUNT, text, voice: keys.voice, limit: COMMENTARY_DAILY_CHARS } })
      audio_url = result.url
    } catch (e) {
      logger.warn(`Live commentary voice: ${(e as Error).message}`)
    }
  }
  return { text, audio_url }
}

// ---------------------------------------------------------------- admin

type Row = Record<string, any>
type Pg = { raw: (q: string, b?: unknown[]) => Promise<{ rows: Row[] }> }
const pg = (c: MedusaContainer) => c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg

// Everything the admin's Live commentary page shows: the site switch, every live game and
// the tournaments on now or coming up, each with its setting, and today's voice use.
export const commentaryOverview = async (c: MedusaContainer) => {
  const db = pg(c)
  const { rows: ready } = await db.raw("select to_regclass('play.commentary') as t")
  if (!ready[0]?.t) return { ready: false, site: { enabled: true, voice: true }, games: [], tournaments: [], voice: { connected: false, used: 0, limit: COMMENTARY_DAILY_CHARS } }
  const [settings, games, tournaments] = await Promise.all([
    db.raw("select scope, enabled, voice from play.commentary"),
    db.raw(
      `select g.id, g.mode, g.white_name, g.black_name, g.white_rating, g.black_rating, g.initial_ms, g.increment_ms, g.started_at, g.tournament_id, t.title as tournament
         from play.game g left join public.tournament t on t.id = g.tournament_id
        where g.status = 'active' and g.mode <> 'computer' and g.black_id is not null
        order by (g.tournament_id is null), g.started_at desc limit 200`
    ),
    db.raw(
      `select t.id, t.title, t.handle, t.format, t.time_control, t.starts_at, t.ends_at, s.phase, t.lobby ->> 'commentary' as lobby_commentary,
              (select count(*)::int from public.tournament_registration r where r.tournament_id = t.id and r.status = 'confirmed' and r.deleted_at is null) as players
         from public.tournament t left join play.t_state s on s.tournament_id = t.id
        where t.deleted_at is null and t.status = 'published' and t.mode = 'online'
          and coalesce(s.finished_at, t.ends_at, t.starts_at + interval '6 hours') > now()
          and t.starts_at < now() + interval '30 days'
        order by t.starts_at asc limit 60`
    ),
  ])
  const map = new Map(settings.rows.map((r) => [r.scope as string, { enabled: !!r.enabled, voice: !!r.voice }]))
  // A tournament's own choice (its form's Lobby section) until it's switched here.
  for (const t of tournaments.rows)
    if (!map.has(`tourney:${t.id}`) && (t.lobby_commentary === "text" || t.lobby_commentary === "voice")) map.set(`tourney:${t.id}`, { enabled: true, voice: t.lobby_commentary === "voice" })
  const site = map.get("site") ?? { enabled: true, voice: true }
  const keys = await getServiceKeys(c)
  const { rows: use } = await db.raw("select chars from coach_usage where customer_id = ? and day = ? and deleted_at is null", [COMMENTARY_ACCOUNT, indiaDay()]).catch(() => ({ rows: [] as Row[] }))
  return {
    ready: true,
    site,
    games: games.rows.map((g) => {
      const own = map.get(`game:${g.id}`)
      const t = g.tournament_id ? map.get(`tourney:${g.tournament_id}`) : undefined
      return { ...g, own: own ?? null, from_tournament: !own && !!t?.enabled, enabled: own ? own.enabled : !!t?.enabled, voice: own ? own.voice : !!t?.voice }
    }),
    tournaments: tournaments.rows.map((t) => ({ ...t, ...(map.get(`tourney:${t.id}`) ?? { enabled: false, voice: false }) })),
    voice: { connected: !!keys.voice, used: Number(use[0]?.chars ?? 0), limit: COMMENTARY_DAILY_CHARS },
  }
}

export const setCommentary = async (c: MedusaContainer, s: { scope: string; enabled: boolean; voice: boolean }, by: string) => {
  const db = pg(c)
  await db.raw(
    `insert into play.commentary (scope, enabled, voice, updated_by) values (?, ?, ?, ?)
     on conflict (scope) do update set enabled = excluded.enabled, voice = excluded.voice, updated_by = excluded.updated_by, updated_at = now()`,
    [s.scope, s.enabled, s.enabled && s.voice, by]
  )
  await db.raw("select pg_notify('commentary', ?)", [s.scope])
}

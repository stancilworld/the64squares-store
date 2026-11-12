import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// What staff see while running an online tournament: the engine's state and every game
// (to correct a result), and the funnel from page visits to players who played.

type Row = Record<string, any>
type Pg = { raw: (q: string, b?: unknown[]) => Promise<{ rows: Row[] }> }

const pg = (c: MedusaContainer) => c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Pg

const hasTables = async (c: MedusaContainer) => {
  const { rows } = await pg(c).raw("select to_regclass('play.t_game') as g, to_regclass('play.arena_player') as a")
  return { engine: !!rows[0]?.g, arena: !!rows[0]?.a }
}

// Tells the game server to re-score and refresh the page (after a correction or removal).
export const nudgeGameServer = async (c: MedusaContainer, tournamentId: string) => {
  if (!(await hasTables(c)).engine) return
  await pg(c).raw("insert into play.t_refresh (tournament_id) values (?) on conflict do nothing", [tournamentId])
}

export const engineState = async (c: MedusaContainer, tournamentId: string) => {
  const have = await hasTables(c)
  if (!have.engine) return { state: null, games: [], entrants: [], arena: [] }
  const db = pg(c)
  const [state, games, entrants, arena] = await Promise.all([
    db.raw("select phase, round, round_done_at, started_at, finished_at, note from play.t_state where tournament_id = ?", [tournamentId]),
    db.raw(
      `select g.round, g.board, g.game_no, g.white_id, g.black_id, g.game_id, g.result, g.forfeit, g.armageddon, g.fixed_by, g.fix_note, g.ended_at,
              w.name as white_name, b.name as black_name, pg.status as game_status
         from play.t_game g
         left join play.t_entrant w on w.tournament_id = g.tournament_id and w.player_id = g.white_id
         left join play.t_entrant b on b.tournament_id = g.tournament_id and b.player_id = g.black_id
         left join play.game pg on pg.id = g.game_id
        where g.tournament_id = ? order by g.round desc, g.board, g.game_no`,
      [tournamentId]
    ),
    db.raw("select player_id, name, rating, seed from play.t_entrant where tournament_id = ? order by seed", [tournamentId]),
    have.arena
      ? db.raw("select player_id, name, score, games, wins from play.arena_player where tournament_id = ? order by score desc, wins desc limit 200", [tournamentId])
      : Promise.resolve({ rows: [] as Row[] }),
  ])
  return { state: state.rows[0] ?? null, games: games.rows, entrants: entrants.rows, arena: arena.rows }
}

// Visits → registered → joined (checked in, or played in an arena) → played, by source.
export const tournamentFunnel = async (c: MedusaContainer, tournamentId: string) => {
  const db = pg(c)
  const have = await hasTables(c)
  const { rows: visits } = await db.raw("select source, count(*)::int as n from tournament_visit where tournament_id = ? and deleted_at is null group by source", [tournamentId])
  const { rows: regs } = await db.raw(
    `select coalesce(nullif(r.source, ''), 'direct') as source, count(*)::int as registered,
            count(*) filter (where r.checked_in_at is not null ${have.arena ? "or exists (select 1 from play.arena_player a where a.tournament_id = r.tournament_id and a.player_id = r.customer_id)" : ""})::int as joined,
            count(*) filter (where r.final_rank is not null)::int as played
       from tournament_registration r where r.tournament_id = ? and r.deleted_at is null and r.status <> 'cancelled' group by 1`,
    [tournamentId]
  )
  const by = new Map<string, { source: string; visits: number; registered: number; joined: number; played: number }>()
  const row = (s: string) => by.get(s) ?? by.set(s, { source: s, visits: 0, registered: 0, joined: 0, played: 0 }).get(s)!
  for (const v of visits) row(v.source).visits = v.n
  for (const r of regs) Object.assign(row(r.source), { registered: r.registered, joined: r.joined, played: r.played })
  const sources = [...by.values()].sort((a, b) => b.visits + b.registered - (a.visits + a.registered))
  const total = sources.reduce((t, s) => ({ source: "All", visits: t.visits + s.visits, registered: t.registered + s.registered, joined: t.joined + s.joined, played: t.played + s.played }), { source: "All", visits: 0, registered: 0, joined: 0, played: 0 })
  return { total, sources }
}

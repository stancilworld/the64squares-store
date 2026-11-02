import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// Fair-play review for the admin. The game server (apps/game) writes play.fairplay_flag and
// play.fairplay_game after checking rated games; this reads them and records the decision.

type Knex = {
  raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: Record<string, any>[] }>
  transaction: <T>(fn: (trx: Knex) => Promise<T>) => Promise<T>
}

const db = (scope: MedusaContainer) => scope.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Knex

// The game server creates these tables; before it has run once there's nothing to show.
const ready = async (k: Knex) => {
  const { rows } = await k.raw("select to_regclass('play.fairplay_flag') as t")
  return !!rows[0]?.t
}

const PLAYER = `
  coalesce(p.display_name, c.first_name || ' ' || coalesce(c.last_name, ''), f.player_id) as name,
  p.username, c.email`

export const listFlags = async (scope: MedusaContainer, status: string) => {
  const k = db(scope)
  if (!(await ready(k))) return []
  const { rows } = await k.raw(
    `select f.*, ${PLAYER},
            (select count(*) from play.fairplay_game g where g.player_id = f.player_id)::int as checked_games,
            (select scope from play.ban b where b.player_id = f.player_id) as ban_scope
       from play.fairplay_flag f
       left join play.profile p on p.player_id = f.player_id
       left join public.customer c on c.id = f.player_id
      where (? = 'all' or f.status = ?)
      order by (f.status = 'open') desc, f.score desc, f.updated_at desc
      limit 200`,
    [status, status]
  )
  return rows
}

export const flagDetail = async (scope: MedusaContainer, id: number) => {
  const k = db(scope)
  if (!(await ready(k))) return null
  const { rows } = await k.raw(`select f.*, ${PLAYER} from play.fairplay_flag f left join play.profile p on p.player_id = f.player_id left join public.customer c on c.id = f.player_id where f.id = ?`, [id])
  const flag = rows[0]
  if (!flag) return null
  const games = await k.raw(
    `select fg.*, g.white_name, g.black_name, g.result, g.reason, g.initial_ms, g.increment_ms, g.mode, g.ended_at,
            coalesce(array_length(g.moves, 1), 0) as plies
       from play.fairplay_game fg join play.game g on g.id = fg.game_id
      where fg.player_id = ? order by fg.created_at desc limit 20`,
    [flag.player_id]
  )
  const ratings = await k.raw("select speed, round(rating)::int as rating, games from play.rating where player_id = ?", [flag.player_id])
  return { flag, games: games.rows, ratings: ratings.rows }
}

const SPEED = `case when (g.initial_ms + 40 * g.increment_ms) / 1000.0 < 180 then 'bullet'
                    when (g.initial_ms + 40 * g.increment_ms) / 1000.0 < 480 then 'blitz'
                    when (g.initial_ms + 40 * g.increment_ms) / 1000.0 < 1500 then 'rapid' else 'classical' end`

export type Decision = { action: "clear" | "warn" | "ban" | "unban"; scope?: "rated" | "all"; note?: string }

// Records the decision. A ban also gives back the rating points that opponents lost to the
// player in the last 90 days, and takes the player off the leaderboard.
export const decide = async (scope: MedusaContainer, id: number, d: Decision, by: string | null) => {
  const k = db(scope)
  return k.transaction(async (t) => {
    const { rows } = await t.raw("select * from play.fairplay_flag where id = ? for update", [id])
    const flag = rows[0]
    if (!flag) return null
    const status = d.action === "clear" ? "cleared" : d.action === "warn" ? "warned" : d.action === "ban" ? "banned" : "cleared"
    await t.raw("update play.fairplay_flag set status = ?, note = ?, reviewed_by = ?, reviewed_at = now(), updated_at = now() where id = ?", [
      status,
      d.note ?? flag.note ?? null,
      by,
      id,
    ])
    let refunded = 0
    if (d.action === "ban") {
      await t.raw(
        `insert into play.ban (player_id, scope, reason, by_user) values (?, ?, ?, ?)
         on conflict (player_id) do update set scope = excluded.scope, reason = excluded.reason, by_user = excluded.by_user, created_at = now()`,
        [flag.player_id, d.scope ?? "rated", d.note ?? "Fair-play review", by]
      )
      const games = await t.raw(
        `select g.id, ${SPEED} as speed,
                case when g.white_id = ? then g.black_id else g.white_id end as opponent,
                case when g.white_id = ? then g.black_diff else g.white_diff end as opp_diff
           from play.game g
          where (g.white_id = ? or g.black_id = ?) and g.rated and not g.refunded and g.status = 'finished'
            and g.ended_at > now() - interval '90 days'`,
        [flag.player_id, flag.player_id, flag.player_id, flag.player_id]
      )
      for (const g of games.rows) {
        if (g.opp_diff != null && g.opp_diff < 0) {
          await t.raw("update play.rating set rating = rating - ? where player_id = ? and speed = ?", [g.opp_diff, g.opponent, g.speed])
          refunded++
        }
        await t.raw("update play.game set refunded = true where id = ?", [g.id])
      }
    }
    if (d.action === "unban") await t.raw("delete from play.ban where player_id = ?", [flag.player_id])
    return { status, refunded }
  })
}

import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"

// The store's own analytics (Marketing → Analytics), counted from the shop events the
// website records (marketing_event) and from the games on Play (play.*). Nothing here
// identifies a person: a visit is a random id kept in one browser tab.

type Knex = { raw: (sql: string, bindings?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> }

const TZ = "Asia/Kolkata"
const db = (c: MedusaContainer) => c.resolve(ContainerRegistrationKeys.PG_CONNECTION) as unknown as Knex

type Row = Record<string, unknown>
const n = (v: unknown) => Number(v ?? 0) || 0
const rows = async (k: Knex, sql: string, args: unknown[]): Promise<Row[]> => (await k.raw(sql, args)).rows

// Events of the period, live (not deleted).
const EV = `from marketing_event e where e.deleted_at is null and e.created_at >= ? and e.created_at < ?`
// A visit: the tab's random id; events recorded before visits were counted stand alone.
const VISIT = `coalesce(e.data->>'visit', e.event_id)`
// Where a visit came from: its campaign tag, else the website it came from, else none.
const SOURCE = `coalesce(nullif(e.data->'utm'->>'utm_source', ''), nullif(e.data->>'ref', ''), 'Direct')`

export type Period = { from: Date; to: Date; days: number }

export const periodOf = (days: number): Period => {
  const to = new Date()
  const from = new Date(to.getTime() - days * 86_400_000)
  return { from, to, days }
}

const totals = async (k: Knex, p: { from: Date; to: Date }) => {
  const [r] = await rows(
    k,
    `select
       count(distinct ${VISIT}) filter (where e.name = 'PageView') as visits,
       count(*) filter (where e.name = 'PageView') as page_views,
       count(*) filter (where e.name = 'Purchase') as orders,
       coalesce(sum(e.value) filter (where e.name = 'Purchase'), 0) as revenue,
       count(*) filter (where e.name = 'AddToCart') as add_to_carts,
       count(*) filter (where e.name = 'Search') as searches
     ${EV}`,
    [p.from, p.to]
  )
  const visits = n(r.visits)
  const orders = n(r.orders)
  const revenue = n(r.revenue)
  return {
    visits,
    page_views: n(r.page_views),
    orders,
    revenue: Math.round(revenue),
    conversion: visits ? orders / visits : 0,
    average_order: orders ? Math.round(revenue / orders) : 0,
    add_to_carts: n(r.add_to_carts),
    searches: n(r.searches),
  }
}

export const shopReport = async (c: MedusaContainer, p: Period) => {
  const k = db(c)
  const range = [p.from, p.to]
  const before = { from: new Date(p.from.getTime() - p.days * 86_400_000), to: p.from }

  const [now, prev] = await Promise.all([totals(k, p), totals(k, before)])

  const daily = (
    await rows(
      k,
      `select to_char(date_trunc('day', e.created_at at time zone '${TZ}'), 'YYYY-MM-DD') as day,
         count(distinct ${VISIT}) filter (where e.name = 'PageView') as visits,
         count(*) filter (where e.name = 'Purchase') as orders,
         coalesce(sum(e.value) filter (where e.name = 'Purchase'), 0) as revenue
       ${EV} group by 1 order by 1`,
      range
    )
  ).map((r) => ({ day: String(r.day), visits: n(r.visits), orders: n(r.orders), revenue: Math.round(n(r.revenue)) }))

  // Visits by where they came from (the first source seen in the visit).
  const visitSources = await rows(
    k,
    `select source, medium, count(*) as visits from (
       select distinct on (${VISIT}) ${SOURCE} as source, coalesce(e.data->'utm'->>'utm_medium', case when e.data->>'ref' is not null then 'referral' else '' end) as medium
       ${EV} and e.name = 'PageView' order by ${VISIT}, e.created_at
     ) v group by 1, 2 order by 3 desc limit 25`,
    range
  )
  const orderSources = await rows(
    k,
    `select coalesce(nullif(e.data->'utm'->>'utm_source', ''), 'Direct') as source, count(*) as orders, coalesce(sum(e.value), 0) as revenue
     ${EV} and e.name = 'Purchase' group by 1`,
    range
  )
  const bySource = new Map<string, { source: string; medium: string; visits: number; orders: number; revenue: number }>()
  for (const r of visitSources) {
    const key = String(r.source).toLowerCase()
    const cur = bySource.get(key)
    if (cur) cur.visits += n(r.visits)
    else bySource.set(key, { source: String(r.source), medium: String(r.medium ?? ""), visits: n(r.visits), orders: 0, revenue: 0 })
  }
  for (const r of orderSources) {
    const key = String(r.source).toLowerCase()
    const cur = bySource.get(key) ?? { source: String(r.source), medium: "", visits: 0, orders: 0, revenue: 0 }
    cur.orders += n(r.orders)
    cur.revenue += Math.round(n(r.revenue))
    bySource.set(key, cur)
  }
  const sources = [...bySource.values()].sort((a, b) => b.visits - a.visits || b.revenue - a.revenue).slice(0, 20)

  const campaigns = (
    await rows(
      k,
      `select e.data->'utm'->>'utm_campaign' as campaign,
         max(e.data->'utm'->>'utm_source') as source,
         count(distinct ${VISIT}) filter (where e.name = 'PageView') as visits,
         count(*) filter (where e.name = 'Purchase') as orders,
         coalesce(sum(e.value) filter (where e.name = 'Purchase'), 0) as revenue
       ${EV} and coalesce(e.data->'utm'->>'utm_campaign', '') <> ''
       group by 1 order by 3 desc, 5 desc limit 20`,
      range
    )
  ).map((r) => ({ campaign: String(r.campaign), source: (r.source as string) ?? "", visits: n(r.visits), orders: n(r.orders), revenue: Math.round(n(r.revenue)) }))

  // From a visit to an order. The first steps count visits; the last counts orders.
  const [f] = await rows(
    k,
    `select
       count(distinct ${VISIT}) filter (where e.name = 'PageView') as visited,
       count(distinct ${VISIT}) filter (where e.name = 'ViewContent') as viewed,
       count(distinct ${VISIT}) filter (where e.name = 'AddToCart') as added,
       count(distinct ${VISIT}) filter (where e.name = 'InitiateCheckout') as checkout,
       count(*) filter (where e.name = 'Purchase') as ordered
     ${EV}`,
    range
  )
  const funnel = [
    { step: "Visited the website", count: n(f.visited) },
    { step: "Looked at a product", count: n(f.viewed) },
    { step: "Added to cart", count: n(f.added) },
    { step: "Started checkout", count: n(f.checkout) },
    { step: "Placed an order", count: n(f.ordered) },
  ]

  const pages = (
    await rows(
      k,
      `select regexp_replace(e.page, '^/(order|account/orders)/[^/]+', '/\\1/…') as page, count(*) as views, count(distinct ${VISIT}) as visits
       ${EV} and e.name = 'PageView' and e.page is not null group by 1 order by 2 desc limit 20`,
      range
    )
  ).map((r) => ({ page: String(r.page), views: n(r.views), visits: n(r.visits) }))

  // Products: looked at, added to cart, sold (one row per product in each event).
  const products = (
    await rows(
      k,
      `select i->>'product_id' as product_id, max(i->>'name') as name,
         count(*) filter (where e.name = 'ViewContent') as views,
         count(*) filter (where e.name = 'AddToCart') as added,
         coalesce(sum(coalesce((i->>'quantity')::numeric, 1)) filter (where e.name = 'Purchase'), 0) as sold,
         coalesce(sum(coalesce((i->>'price')::numeric, 0) * coalesce((i->>'quantity')::numeric, 1)) filter (where e.name = 'Purchase'), 0) as revenue
       from marketing_event e
       cross join lateral jsonb_array_elements(case when jsonb_typeof(e.data->'items') = 'array' then e.data->'items' else '[]'::jsonb end) i
       where e.deleted_at is null and e.created_at >= ? and e.created_at < ? and e.name in ('ViewContent', 'AddToCart', 'Purchase')
       group by 1 order by 6 desc, 3 desc limit 20`,
      range
    )
  ).map((r) => ({ product_id: String(r.product_id), name: (r.name as string) ?? "", views: n(r.views), added: n(r.added), sold: n(r.sold), revenue: Math.round(n(r.revenue)) }))

  return { period: { from: p.from.toISOString(), to: p.to.toISOString(), days: p.days }, totals: now, previous: prev, daily, sources, campaigns, funnel, pages, products }
}

// What people searched the shop for, and the searches that found nothing.
export const searchReport = async (c: MedusaContainer, p: Period) => {
  const k = db(c)
  const all = (
    await rows(
      k,
      `select lower(trim(e.data->>'search')) as term, count(*) as searches,
         count(distinct ${VISIT}) as visits,
         round(avg((e.data->>'results')::numeric)) as results,
         count(*) filter (where (e.data->>'results')::numeric = 0) as empty,
         max(e.created_at) as last_at
       ${EV} and e.name = 'Search' and coalesce(e.data->>'search', '') <> ''
       group by 1 order by 2 desc limit 200`,
      [p.from, p.to]
    )
  ).map((r) => ({
    term: String(r.term),
    searches: n(r.searches),
    visits: n(r.visits),
    results: r.results == null ? null : n(r.results),
    empty: n(r.empty),
    last_at: r.last_at ? new Date(r.last_at as string).toISOString() : null,
  }))
  const total = all.reduce((s, r) => s + r.searches, 0)
  const empty = all.reduce((s, r) => s + r.empty, 0)
  return { total, empty, terms: all, nothing_found: all.filter((r) => r.empty > 0).sort((a, b) => b.empty - a.empty).slice(0, 50) }
}

// Play: games, players, puzzles. Read from the game server's tables in the same database.
export const playReport = async (c: MedusaContainer, p: Period) => {
  const k = db(c)
  const [has] = await rows(k, `select to_regclass('play.game') as game, to_regclass('play.puzzle_attempt') as puzzles, to_regclass('play.profile') as profiles, to_regclass('play.house') as house`, [])
  if (!has?.game) return { available: false as const }
  const range = [p.from, p.to]

  const [t] = await rows(
    k,
    `select count(*) filter (where g.started_at is not null) as started,
       count(*) filter (where g.ended_at is not null and g.result is not null) as finished,
       count(*) filter (where g.rated) as rated,
       count(*) filter (where g.tournament_id is not null) as tournament,
       (select count(distinct pid) from play.game h, unnest(array[h.white_id, h.black_id]) pid where h.created_at >= ? and h.created_at < ? and h.started_at is not null and pid not in (select player_id from play.house)) as players,
       round(avg(coalesce(array_length(g.moves, 1), 0)) filter (where g.ended_at is not null)) as avg_moves
     from play.game g where g.created_at >= ? and g.created_at < ?`,
    [...range, ...range]
  )
  const daily = (
    await rows(
      k,
      `select to_char(date_trunc('day', g.created_at at time zone '${TZ}'), 'YYYY-MM-DD') as day, count(*) as games
       from play.game g where g.created_at >= ? and g.created_at < ? and g.started_at is not null group by 1 order by 1`,
      range
    )
  ).map((r) => ({ day: String(r.day), games: n(r.games) }))
  const modes = (
    await rows(k, `select g.mode as mode, count(*) as games from play.game g where g.created_at >= ? and g.created_at < ? and g.started_at is not null group by 1 order by 2 desc`, range)
  ).map((r) => ({ mode: String(r.mode), games: n(r.games) }))
  const speeds = (
    await rows(
      k,
      `select case
         when (g.initial_ms + 40 * g.increment_ms) < 180000 then 'Bullet'
         when (g.initial_ms + 40 * g.increment_ms) < 480000 then 'Blitz'
         when (g.initial_ms + 40 * g.increment_ms) < 1500000 then 'Rapid'
         else 'Classical' end as speed,
         g.initial_ms / 60000 || '+' || g.increment_ms / 1000 as clock, count(*) as games
       from play.game g where g.created_at >= ? and g.created_at < ? and g.started_at is not null
       group by 1, 2 order by 3 desc limit 12`,
      range
    )
  ).map((r) => ({ speed: String(r.speed), clock: String(r.clock), games: n(r.games) }))
  const endings = (
    await rows(k, `select coalesce(g.reason, 'other') as reason, count(*) as games from play.game g where g.created_at >= ? and g.created_at < ? and g.ended_at is not null group by 1 order by 2 desc`, range)
  ).map((r) => ({ reason: String(r.reason), games: n(r.games) }))

  const [pz] = has.puzzles
    ? await rows(k, `select count(*) as attempts, count(*) filter (where solved) as solved, count(distinct player_id) as players from play.puzzle_attempt where created_at >= ? and created_at < ?`, range)
    : [{}]
  const puzzles = { attempts: n(pz.attempts), solved: n(pz.solved), players: n(pz.players) }
  const new_players = has.profiles ? n((await rows(k, `select count(*) as c from play.profile p where p.created_at >= ? and p.created_at < ? and not exists (select 1 from play.house h where h.player_id = p.player_id)`, range))[0]?.c) : 0

  return {
    available: true as const,
    totals: { started: n(t.started), finished: n(t.finished), rated: n(t.rated), tournament: n(t.tournament), players: n(t.players), avg_moves: n(t.avg_moves), new_players },
    puzzles,
    daily,
    modes,
    speeds,
    endings,
  }
}

import { announce, lobbyDefaults } from "./lobby.js"
import { Chess } from "chess.js"
import type { Server, Socket } from "socket.io"
import { pool } from "./db.js"
import { type Game, parseTimeControl, type Player } from "./game.js"
import type { GameManager } from "./manager.js"
import { buildBracket, type Entrant, finalRanking, matchState, pairRoundRobin, pairSwiss, rrRounds, rrTable, swissTable, type TGame } from "./tourney-rules.js"

// Swiss and knockout tournaments, run by this server from the store's tournament settings
// (public.tournament, read only) and its checked-in players. Everything the event needs to
// carry on after a restart is in play.t_entrant, play.t_game and play.t_state.
//
// Staff change things from the admin: pause (tournament.paused), withdraw a player
// (registration status "withdrawn"), or correct a result (play.t_game.result + fixed_by).

type T = {
  id: string
  title: string
  handle: string
  format: "swiss" | "knockout" | "arena" | string
  status: string
  time_control: string
  rounds: number | null
  starts_at: number
  ends_at: number | null
  check_in_minutes: number
  min_players: number
  round_break_seconds: number
  knockout_games: number
  armageddon: boolean
  paused: boolean
}

type State = { phase: "running" | "finished" | "cancelled_low"; round: number; round_done_at: number | null; started_at: number; finished_at: number | null; note: string | null }

export const migrateTourney = async () => {
  await pool.query(`
    create table if not exists play.t_entrant (
      tournament_id text not null,
      player_id text not null,
      name text not null,
      rating integer not null,
      seed integer not null,
      primary key (tournament_id, player_id)
    );
    create table if not exists play.t_game (
      tournament_id text not null,
      round integer not null,
      board integer not null,
      game_no integer not null default 1,
      white_id text not null,
      black_id text,
      game_id text,
      result text,
      forfeit boolean not null default false,
      armageddon boolean not null default false,
      fixed_by text,
      fix_note text,
      created_at timestamptz not null default now(),
      ended_at timestamptz,
      primary key (tournament_id, round, board, game_no)
    );
    create index if not exists t_game_game_idx on play.t_game (game_id);
    create table if not exists play.t_state (
      tournament_id text primary key,
      phase text not null,
      round integer not null default 0,
      round_done_at timestamptz,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      note text
    );
    create table if not exists play.t_final (
      tournament_id text not null,
      player_id text not null,
      rank integer not null,
      score real not null,
      primary key (tournament_id, player_id)
    );
    create table if not exists play.t_refresh (
      tournament_id text primary key,
      at timestamptz not null default now()
    );
    create table if not exists play.t_withdrawn (
      tournament_id text not null,
      player_id text not null,
      reason text not null,
      at timestamptz not null default now(),
      primary key (tournament_id, player_id)
    );
  `)
}

const ms = (d: unknown) => (d ? new Date(d as string).getTime() : null)

const loadT = async (idOrHandle: string): Promise<T | null> => {
  const { rows } = await pool.query(
    `select id, title, handle, format, status, time_control, rounds, starts_at, ends_at, check_in_minutes, min_players,
            round_break_seconds, knockout_games, armageddon, paused
       from public.tournament where (id = $1 or handle = $1) and deleted_at is null and status <> 'draft' and mode = 'online'`,
    [idOrHandle]
  )
  const r = rows[0]
  if (!r) return null
  return {
    ...r,
    starts_at: ms(r.starts_at)!,
    ends_at: ms(r.ends_at),
    check_in_minutes: Number(r.check_in_minutes ?? 0),
    min_players: Number(r.min_players ?? 2),
    round_break_seconds: Number(r.round_break_seconds ?? 60),
    knockout_games: Number(r.knockout_games ?? 1),
    rounds: r.rounds == null ? null : Number(r.rounds),
  }
}

const loadState = async (tid: string): Promise<State | null> => {
  const { rows } = await pool.query("select * from play.t_state where tournament_id = $1", [tid])
  const r = rows[0]
  return r ? { phase: r.phase, round: r.round, round_done_at: ms(r.round_done_at), started_at: ms(r.started_at)!, finished_at: ms(r.finished_at), note: r.note } : null
}

const loadGames = async (tid: string): Promise<(TGame & { white_name?: string; black_name?: string; fixed_by: string | null; fix_note: string | null })[]> => {
  const { rows } = await pool.query("select * from play.t_game where tournament_id = $1 order by round, board, game_no", [tid])
  return rows.map((r) => ({ ...r, result: r.result ?? null }))
}

const loadEntrants = async (tid: string): Promise<(Entrant & { seed: number })[]> => {
  const { rows } = await pool.query("select player_id as id, name, rating, seed from play.t_entrant where tournament_id = $1 order by seed", [tid])
  return rows
}

// Withdrawn by staff (registration status) or after not turning up for a game.
const loadWithdrawn = async (tid: string) => {
  const { rows } = await pool.query(
    `select player_id from play.t_withdrawn where tournament_id = $1
     union select customer_id from public.tournament_registration where tournament_id = $1 and status <> 'confirmed' and deleted_at is null`,
    [tid]
  )
  return new Set(rows.map((r) => r.player_id as string))
}

// The players who may play: confirmed, and checked in when the event has check-in.
const checkedIn = async (t: T) => {
  const { rows } = await pool.query(
    `select r.customer_id as id, coalesce(nullif(p.display_name, ''), r.player_name) as name,
            coalesce(round(pr.rating)::int, r.rating, 1500) as rating
       from public.tournament_registration r
       left join play.profile p on p.player_id = r.customer_id
       left join play.rating pr on pr.player_id = r.customer_id and pr.speed = $2
      where r.tournament_id = $1 and r.status = 'confirmed' and r.deleted_at is null
        and ($3::int = 0 or r.checked_in_at is not null)`,
    [t.id, speedOfTc(t.time_control), t.check_in_minutes]
  )
  return rows as Entrant[]
}

const speedOfTc = (tc: string) => {
  const p = parseTimeControl(tc)
  if (!p) return "blitz"
  const est = (p.initial_ms + 40 * p.increment_ms) / 1000
  return est < 180 ? "bullet" : est < 480 ? "blitz" : est < 1500 ? "rapid" : "classical"
}

// How many Swiss rounds: as set, else enough to find a clear winner (log2 of the field).
// Round robin: "rounds" set to 2 means everyone plays everyone twice.
export const rrCycles = (t: Pick<T, "rounds">) => (t.rounds === 2 ? 2 : 1)

export const swissRounds = (t: Pick<T, "rounds">, players: number) => t.rounds ?? Math.max(3, Math.min(11, Math.ceil(Math.log2(Math.max(2, players)))))

const busy = new Set<string>()

export class Tourneys {
  private io: Server
  private manager: GameManager
  // What each tournament page shows, cached between changes.
  private views = new Map<string, { at: number; v: unknown }>()

  constructor(io: Server, manager: GameManager) {
    this.io = io
    this.manager = manager
  }

  async start() {
    await migrateTourney()
    this.manager.whenGameEnds((g) => this.onGameEnd(g))
    // Live boards for spectators: every move of a tournament game.
    this.manager.whenGameChanges((g) => {
      if (!g.r.tournament_id || g.r.mode !== "arena") return
      const v = g.view(Date.now())
      this.io.to(`tourney:${g.r.tournament_id}`).emit("tourney:board", {
        game_id: v.id,
        fen: v.fen,
        last_move: v.last_move,
        clocks: v.clocks,
        clock_running: v.clock_running,
        status: v.status,
        result: v.result,
        moves: v.moves.length,
        server_now: v.server_now,
      })
    })
    setInterval(() => void this.tick(), 3000).unref()
  }

  // Every few seconds: start events that are due, pair rounds, create knockout games.
  async tick() {
    // Staff changed something in admin (a corrected result, a removed player): re-score.
    try {
      const { rows } = await pool.query("delete from play.t_refresh returning tournament_id")
      for (const r of rows) {
        const st = await loadState(r.tournament_id)
        if (st?.phase === "finished") await saveFinal(r.tournament_id)
        this.changed(r.tournament_id)
      }
    } catch {
      /* the table appears on first start */
    }
    let ids: string[] = []
    try {
      const { rows } = await pool.query(
        `select t.id from public.tournament t left join play.t_state s on s.tournament_id = t.id
          where t.deleted_at is null and t.mode = 'online' and t.format in ('swiss', 'round_robin', 'knockout') and t.status = 'published'
            and t.starts_at <= now() and (s.phase is null or s.phase = 'running') and t.starts_at > now() - interval '3 days'
            and t.id not like 'trn\\_demo\\_%'`
      )
      ids = rows.map((r) => r.id)
    } catch {
      return
    }
    for (const id of ids) {
      if (busy.has(id)) continue
      busy.add(id)
      try {
        await this.advance(id)
      } catch (e) {
        console.error("tournament", id, e)
      } finally {
        busy.delete(id)
      }
    }
  }

  private async advance(tid: string) {
    const t = await loadT(tid)
    if (!t || t.status !== "published") return
    let state = await loadState(t.id)
    if (!state) {
      // The start: freeze the field (seeded by rating), or call it off if too few came.
      const field = (await checkedIn(t)).sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name))
      const need = Math.max(2, t.min_players)
      if (field.length < need) {
        await pool.query(`insert into play.t_state (tournament_id, phase, note) values ($1, 'cancelled_low', $2) on conflict do nothing`, [
          t.id,
          `${field.length} of the ${need} players needed checked in`,
        ])
        announce(t.id, `Only ${field.length} of the ${need} players needed checked in, so this tournament is called off. Sorry, and see you at the next one!`)
        return this.changed(t.id)
      }
      for (const [i, e] of field.entries()) {
        await pool.query(`insert into play.t_entrant (tournament_id, player_id, name, rating, seed) values ($1,$2,$3,$4,$5) on conflict do nothing`, [t.id, e.id, e.name, e.rating, i + 1])
      }
      await pool.query(`insert into play.t_state (tournament_id, phase, round) values ($1, 'running', 0) on conflict do nothing`, [t.id])
      state = (await loadState(t.id))!
    }
    if (state.phase !== "running") return
    const entrants = await loadEntrants(t.id)
    const games = await loadGames(t.id)
    const withdrawn = await loadWithdrawn(t.id)
    const breakMs = Math.max(0, t.round_break_seconds) * 1000
    const roundDone = (r: number) => games.filter((g) => g.round === r).every((g) => g.black_id === null || g.result)

    if (t.format === "swiss") {
      const rounds = swissRounds(t, entrants.length)
      if (state.round > 0 && !roundDone(state.round)) return
      if (state.round >= rounds) return this.finish(t.id)
      if (state.round > 0) {
        if (!state.round_done_at) {
          await pool.query("update play.t_state set round_done_at = now() where tournament_id = $1", [t.id])
          announce(t.id, `Round ${state.round} is over. The next round starts in ${Math.round(breakMs / 1000)} seconds: stay in the lobby.`)
          return this.changed(t.id)
        }
        if (Date.now() - state.round_done_at < breakMs) return
      }
      if (t.paused) return
      const next = state.round + 1
      const table = swissTable(entrants, games, withdrawn, rounds)
      // Too few players left to go on.
      if (table.filter((r) => !r.withdrawn).length < 2) return this.finish(t.id)
      const pairs = pairSwiss(table, next)
      await pool.query("update play.t_state set round = $2, round_done_at = null where tournament_id = $1", [t.id, next])
      const byId = new Map(entrants.map((e) => [e.id, e]))
      for (const [i, p] of pairs.entries()) {
        if (!p.black) {
          await pool.query(`insert into play.t_game (tournament_id, round, board, white_id, black_id, result) values ($1,$2,$3,$4,null,'1-0') on conflict do nothing`, [t.id, next, i + 1, p.white])
          continue
        }
        await this.createGame(t, next, i + 1, 1, byId.get(p.white)!, byId.get(p.black)!, false)
      }
      announce(t.id, `Round ${next} of ${rounds} is paired! Your board opens right here: press Ready when it appears.`)
      return this.changed(t.id)
    }

    if (t.format === "round_robin") {
      // Everyone plays everyone (twice when rounds is 2): the schedule is fixed by the seeds.
      const rounds = rrRounds(entrants.length, rrCycles(t))
      if (state.round > 0 && !roundDone(state.round)) return
      if (state.round >= rounds) return this.finish(t.id)
      if (state.round > 0) {
        if (!state.round_done_at) {
          await pool.query("update play.t_state set round_done_at = now() where tournament_id = $1", [t.id])
          announce(t.id, `Round ${state.round} is over. The next round starts in ${Math.round(breakMs / 1000)} seconds: stay in the lobby.`)
          return this.changed(t.id)
        }
        if (Date.now() - state.round_done_at < breakMs) return
      }
      if (t.paused) return
      if (entrants.filter((e) => !withdrawn.has(e.id)).length < 2) return this.finish(t.id)
      const next = state.round + 1
      const seeded = [...entrants].sort((a, b) => a.seed - b.seed)
      const pairs = pairRoundRobin(seeded.map((e) => e.id), next)
      await pool.query("update play.t_state set round = $2, round_done_at = null where tournament_id = $1", [t.id, next])
      const byId = new Map(entrants.map((e) => [e.id, e]))
      for (const [i, p] of pairs.entries()) {
        if (!p.black) {
          await pool.query(`insert into play.t_game (tournament_id, round, board, white_id, black_id, result) values ($1,$2,$3,$4,null,'1-0') on conflict do nothing`, [t.id, next, i + 1, p.white])
          continue
        }
        // A player who has left loses their remaining games without playing them.
        const wOut = withdrawn.has(p.white)
        const bOut = withdrawn.has(p.black)
        if (wOut || bOut) {
          const result = wOut && bOut ? "1/2-1/2" : wOut ? "0-1" : "1-0"
          await pool.query(`insert into play.t_game (tournament_id, round, board, game_no, white_id, black_id, result, forfeit) values ($1,$2,$3,1,$4,$5,$6,true) on conflict do nothing`, [t.id, next, i + 1, p.white, p.black, result])
          continue
        }
        await this.createGame(t, next, i + 1, 1, byId.get(p.white)!, byId.get(p.black)!, false)
      }
      announce(t.id, `Round ${next} of ${rounds} is paired! Your board opens right here: press Ready when it appears.`)
      return this.changed(t.id)
    }

    if (t.format === "knockout") {
      const opts = { games: t.knockout_games, armageddon: t.armageddon }
      const bracket = buildBracket(entrants, games, opts)
      const current = Math.max(1, state.round)
      const matches = bracket.rounds[current - 1]?.matches ?? []
      const undecided = matches.filter((m) => !m.winner)
      if (state.round === 0) {
        if (t.paused) return
        await pool.query("update play.t_state set round = 1, round_done_at = null where tournament_id = $1", [t.id])
        announce(t.id, `The tournament has begun: ${bracket.rounds[0]?.name ?? "round 1"}! Your board opens right here: press Ready when it appears.`)
      } else if (!undecided.length) {
        if (current >= bracket.totalRounds) return this.finish(t.id)
        if (!state.round_done_at) {
          await pool.query("update play.t_state set round_done_at = now() where tournament_id = $1", [t.id])
          announce(t.id, `Round ${state.round} is over. The next round starts in ${Math.round(breakMs / 1000)} seconds: stay in the lobby.`)
          return this.changed(t.id)
        }
        if (Date.now() - state.round_done_at < breakMs || t.paused) return
        await pool.query("update play.t_state set round = $2, round_done_at = null where tournament_id = $1", [t.id, current + 1])
        announce(t.id, `${bracket.rounds[current]?.name ?? `Round ${current + 1}`} begins! Your board opens right here: press Ready when it appears.`)
        return this.changed(t.id)
      }
      if (t.paused) return
      // The next game of every match still going (one at a time per match).
      let made = false
      for (const m of matches) {
        if (m.winner || !m.a || !m.b) continue
        // A withdrawn player loses the match.
        const out = [m.a.id, m.b.id].find((id) => withdrawn.has(id))
        if (out && m.games.every((g) => g.result)) {
          const other = out === m.a.id ? m.b : m.a
          await pool.query(
            `insert into play.t_game (tournament_id, round, board, game_no, white_id, black_id, result, forfeit) values ($1,$2,$3,$4,$5,$6,$7,true) on conflict do nothing`,
            [t.id, current, m.board, m.games.length + 1, other.id, out, "1-0"]
          )
          made = true
          continue
        }
        if (m.games.some((g) => !g.result)) continue
        const st = matchState(m.a.id, m.b.id, m.games, opts)
        if (!st.next) continue
        const white = st.next.white === m.a.id ? m.a : m.b
        const black = white === m.a ? m.b : m.a
        await this.createGame(t, current, m.board, m.games.length + 1, white, black, st.next.armageddon)
        made = true
      }
      if (made) this.changed(t.id)
    }
  }

  private async createGame(t: T, round: number, board: number, gameNo: number, white: Entrant, black: Entrant, armageddon: boolean) {
    const tc = parseTimeControl(t.time_control) ?? { initial_ms: 300_000, increment_ms: 3_000 }
    // Claim the board first, so two ticks never make the same game.
    const claim = await pool.query(
      `insert into play.t_game (tournament_id, round, board, game_no, white_id, black_id, armageddon) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing returning board`,
      [t.id, round, board, gameNo, white.id, black.id, armageddon]
    )
    if (!claim.rowCount) return
    const g = await this.manager.createPaired({ id: white.id, name: white.name } as Player, { id: black.id, name: black.name } as Player, tc.initial_ms, tc.increment_ms, {
      mode: "arena",
      tournamentId: t.id,
      readyMs: (await lobbyDefaults(t.id)).ready_seconds * 1000,
    })
    await pool.query("update play.t_game set game_id = $5 where tournament_id = $1 and round = $2 and board = $3 and game_no = $4", [t.id, round, board, gameNo, g.r.id])
    const payload = { tournament_id: t.id, handle: t.handle, game_id: g.r.id, round, board }
    this.io.to(`player:${white.id}`).to(`player:${black.id}`).emit("tourney:paired", payload)
    // The game page listens for this to offer the next game.
    this.io.to(`player:${white.id}`).to(`player:${black.id}`).emit("arena:paired", payload)
  }

  private async onGameEnd(g: Game) {
    if (!g.r.tournament_id || g.r.mode !== "arena") return
    const { rows } = await pool.query("select * from play.t_game where game_id = $1", [g.r.id])
    const row = rows[0]
    if (!row) return
    // Didn't make a first move: that player loses (and leaves a Swiss).
    let result = g.r.result
    let forfeit = false
    let absent: string | null = null
    if (g.r.reason === "no-show") {
      // Didn't press Ready (the opponent did).
      absent = result === "1-0" ? row.black_id : row.white_id
      forfeit = true
    } else if (g.r.reason === "no-start" || (!result && g.r.status === "aborted")) {
      absent = g.r.moves.length === 0 ? row.white_id : row.black_id
      result = absent === row.white_id ? "0-1" : "1-0"
      forfeit = true
    }
    await pool.query("update play.t_game set result = $2, forfeit = $3, ended_at = now() where game_id = $1 and fixed_by is null", [g.r.id, result ?? "1/2-1/2", forfeit])
    if (absent) {
      const { rows: tr } = await pool.query("select format from public.tournament where id = $1", [row.tournament_id])
      if (tr[0]?.format === "swiss" || tr[0]?.format === "round_robin") {
        await pool.query(`insert into play.t_withdrawn (tournament_id, player_id, reason) values ($1,$2,'no-show') on conflict do nothing`, [row.tournament_id, absent])
      }
    }
    this.changed(row.tournament_id)
    void this.tick()
  }

  private async finish(tid: string) {
    const done = await pool.query("update play.t_state set phase = 'finished', finished_at = now() where tournament_id = $1 and phase = 'running' returning tournament_id", [tid])
    if (done.rowCount) {
      await saveFinal(tid)
      announce(tid, "That's the last game: the tournament is over! Final standings are on the Standings tab. Congratulations to the winners, and thank you all for playing.")
    }
    this.changed(tid)
  }

  // Tell everyone watching that something changed.
  changed(tid: string) {
    this.views.delete(tid)
    void this.view(tid).then((v) => v && this.io.to(`tourney:${tid}`).emit("tourney:state", v))
  }

  register(socket: Socket, me: () => Player | null, limited: (s: Socket, ack?: unknown) => boolean) {
    socket.on("tourney:watch", async (idOrHandle: unknown, ack: unknown) => {
      if (typeof ack !== "function" || limited(socket, ack) || typeof idOrHandle !== "string" || idOrHandle.length > 120) return
      const t = await loadT(idOrHandle)
      if (!t) return ack({ ok: false, error: "not-found" })
      socket.join(`tourney:${t.id}`)
      const p = me()
      if (p) socket.join(`player:${p.id}`)
      ack({ ok: true, view: await this.view(t.id) })
    })
    socket.on("tourney:leave", (tid: unknown) => {
      if (typeof tid === "string" && tid.length < 120) socket.leave(`tourney:${tid}`)
    })
  }

  // Everything the tournament page shows (also for arenas: their games, live boards, stats).
  async view(idOrHandle: string) {
    const t = await loadT(idOrHandle)
    if (!t) return null
    const cached = this.views.get(t.id)
    if (cached && Date.now() - cached.at < 2000) return cached.v as Awaited<ReturnType<Tourneys["build"]>>
    const v = await this.build(t)
    this.views.set(t.id, { at: Date.now(), v })
    return v
  }

  private async build(t: T) {
    const [state, entrants, games, withdrawn] = await Promise.all([loadState(t.id), loadEntrants(t.id), loadGames(t.id), loadWithdrawn(t.id)])
    const live = this.manager.liveGames().filter((g) => g.r.tournament_id === t.id)
    const liveIds = new Set(live.map((g) => g.r.id))
    const now = Date.now()
    const boards = live.map((g) => {
      const v = g.view(now)
      return {
        game_id: v.id,
        white: v.white,
        black: v.black,
        fen: v.fen,
        last_move: v.last_move,
        clocks: v.clocks,
        clock_running: v.clock_running,
        moves: v.moves.length,
        server_now: now,
      }
    })
    const names = new Map(entrants.map((e) => [e.id, e]))
    const side = (id: string | null) => (id ? { id, name: names.get(id)?.name ?? "Player", rating: names.get(id)?.rating ?? null, seed: names.get(id)?.seed ?? null } : null)
    const base = {
      id: t.id,
      handle: t.handle,
      title: t.title,
      format: t.format,
      paused: t.paused,
      server_now: now,
      state: state
        ? {
            ...state,
            next_round_at: state.round_done_at ? state.round_done_at + Math.max(0, t.round_break_seconds) * 1000 : null,
          }
        : null,
      entrants: entrants.map((e) => ({ ...e, withdrawn: withdrawn.has(e.id) })),
      live: boards,
      stats: await tournamentStats(t.id),
      games: await finishedGames(t.id),
    }
    if (t.format === "swiss") {
      const rounds = swissRounds(t, entrants.length)
      const table = swissTable(entrants, games, withdrawn, rounds)
      const byRound = new Map<number, typeof games>()
      for (const g of games) byRound.set(g.round, [...(byRound.get(g.round) ?? []), g])
      return {
        ...base,
        rounds,
        standings: table.map((r, i) => ({ rank: i + 1, ...r })),
        pairings: [...byRound.entries()].map(([round, gs]) => ({
          round,
          games: gs.map((g) => ({ board: g.board, white: side(g.white_id), black: side(g.black_id), result: g.black_id === null ? "bye" : g.result, forfeit: g.forfeit, game_id: g.game_id, live: !!g.game_id && liveIds.has(g.game_id), fixed: !!g.fixed_by })),
        })),
      }
    }
    if (t.format === "round_robin") {
      const rounds = rrRounds(entrants.length, rrCycles(t))
      const table = rrTable(entrants, games, withdrawn, rounds)
      const byRound = new Map<number, typeof games>()
      for (const g of games) byRound.set(g.round, [...(byRound.get(g.round) ?? []), g])
      return {
        ...base,
        rounds,
        cycles: rrCycles(t),
        standings: table.map((r, i) => ({ rank: i + 1, ...r })),
        pairings: [...byRound.entries()].map(([round, gs]) => ({
          round,
          games: gs.map((g) => ({ board: g.board, white: side(g.white_id), black: side(g.black_id), result: g.black_id === null ? "bye" : g.result, forfeit: g.forfeit, game_id: g.game_id, live: !!g.game_id && liveIds.has(g.game_id), fixed: !!g.fixed_by })),
        })),
      }
    }
    if (t.format === "knockout") {
      const b = buildBracket(entrants, games, { games: t.knockout_games, armageddon: t.armageddon })
      return {
        ...base,
        bracket: {
          size: b.size,
          total_rounds: b.totalRounds,
          rounds: b.rounds.map((r) => ({
            ...r,
            matches: r.matches.map((m) => ({
              ...m,
              live: m.games.some((g) => g.game_id && liveIds.has(g.game_id)),
              games: m.games.map((g) => ({ game_no: g.game_no, white_id: g.white_id, black_id: g.black_id, result: g.result, forfeit: g.forfeit, armageddon: g.armageddon, game_id: g.game_id, live: !!g.game_id && liveIds.has(g.game_id) })),
            })),
          })),
        },
        champion: state?.phase === "finished" ? (b.rounds.at(-1)?.matches[0]?.winner ?? null) : null,
      }
    }
    return base
  }
}

// Writes the final placings, which the store reads to hand out results, passes and certificates.
// Run again after staff correct a result.
export const saveFinal = async (tid: string) => {
  const t = await loadT(tid)
  if (!t || !["swiss", "round_robin", "knockout"].includes(t.format)) return
  const [entrants, games, withdrawn] = await Promise.all([loadEntrants(t.id), loadGames(t.id), loadWithdrawn(t.id)])
  const ranks =
    t.format === "swiss"
      ? finalRanking("swiss", swissTable(entrants, games, withdrawn, swissRounds(t, entrants.length)), null)
      : t.format === "round_robin"
        ? finalRanking("round_robin", rrTable(entrants, games, withdrawn, rrRounds(entrants.length, rrCycles(t))), null)
        : finalRanking("knockout", null, buildBracket(entrants, games, { games: t.knockout_games, armageddon: t.armageddon }))
  await pool.query("delete from play.t_final where tournament_id = $1", [t.id])
  for (const r of ranks) {
    await pool.query("insert into play.t_final (tournament_id, player_id, rank, score) values ($1,$2,$3,$4)", [t.id, r.id, r.rank, r.score])
  }
}

// The tournament's finished games, newest first, for the Games tab (each opens the replay).
export const finishedGames = async (tid: string) => {
  const { rows } = await pool.query(
    `select id, white_id, black_id, white_name, black_name, white_rating, black_rating, result, reason,
            coalesce(array_length(moves, 1), 0) as plies, ended_at
       from play.game where tournament_id = $1 and status = 'finished' order by ended_at desc limit 300`,
    [tid]
  )
  return rows.map((g) => ({
    id: g.id,
    white: { id: g.white_id, name: g.white_name, rating: g.white_rating },
    black: { id: g.black_id, name: g.black_name, rating: g.black_rating },
    result: g.result,
    reason: g.reason,
    moves: Math.ceil(Number(g.plies) / 2),
    ended_at: g.ended_at ? new Date(g.ended_at).getTime() : null,
  }))
}

// Numbers for the tournament's Stats tab, from its finished games.
export const tournamentStats = async (tid: string) => {
  const { rows } = await pool.query(
    `select id, white_id, black_id, white_name, black_name, white_rating, black_rating, result, reason, moves,
            extract(epoch from (ended_at - started_at))::int as seconds
       from play.game where tournament_id = $1 and status = 'finished'`,
    [tid]
  )
  const games = rows.length
  if (!games) return { games: 0 }
  let white = 0
  let black = 0
  let draws = 0
  let movesTotal = 0
  let fastest: { game_id: string; moves: number; winner: string } | null = null
  let longest: { game_id: string; moves: number } | null = null
  let upset: { game_id: string; winner: string; loser: string; diff: number } | null = null
  const openings = new Map<string, number>()
  const wins = new Map<string, { name: string; wins: number }>()
  const endings = new Map<string, number>()
  for (const g of rows) {
    const n = Math.ceil((g.moves?.length ?? 0) / 2)
    movesTotal += n
    endings.set(g.reason, (endings.get(g.reason) ?? 0) + 1)
    if (g.result === "1-0") white++
    else if (g.result === "0-1") black++
    else draws++
    if (!longest || n > longest.moves) longest = { game_id: g.id, moves: n }
    if (g.result !== "1/2-1/2") {
      const wonW = g.result === "1-0"
      const winner = wonW ? g.white_name : g.black_name
      const wid = wonW ? g.white_id : g.black_id
      const cur = wins.get(wid) ?? { name: winner, wins: 0 }
      cur.wins++
      wins.set(wid, cur)
      if (["checkmate", "resign"].includes(g.reason) && n > 0 && (!fastest || n < fastest.moves)) fastest = { game_id: g.id, moves: n, winner }
      const wr = wonW ? g.white_rating : g.black_rating
      const lr = wonW ? g.black_rating : g.white_rating
      if (wr != null && lr != null && lr - wr > (upset?.diff ?? 99)) upset = { game_id: g.id, winner, loser: wonW ? g.black_name : g.white_name, diff: lr - wr }
    }
    // The first two moves each, as a simple "most played start".
    const start = (g.moves ?? []).slice(0, 2).join(" ")
    if (start) openings.set(start, (openings.get(start) ?? 0) + 1)
  }
  const top = [...wins.entries()].sort((a, b) => b[1].wins - a[1].wins)[0]
  return {
    games,
    white_wins: white,
    black_wins: black,
    draws,
    average_moves: Math.round(movesTotal / games),
    fastest,
    longest,
    upset,
    most_wins: top ? { id: top[0], name: top[1].name, wins: top[1].wins } : null,
    openings: [...openings.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([moves, count]) => ({ moves, count, name: openingName(moves) })),
    endings: Object.fromEntries(endings),
  }
}

// A friendly name for the first two moves.
const OPENINGS: Record<string, string> = {
  "e4 e5": "Open game (1.e4 e5)",
  "e4 c5": "Sicilian Defence",
  "e4 e6": "French Defence",
  "e4 c6": "Caro-Kann Defence",
  "e4 d5": "Scandinavian Defence",
  "e4 Nf6": "Alekhine's Defence",
  "e4 d6": "Pirc Defence",
  "d4 d5": "Closed game (1.d4 d5)",
  "d4 Nf6": "Indian Defence",
  "d4 f5": "Dutch Defence",
  "c4 e5": "English Opening",
  "c4 Nf6": "English Opening",
  "Nf3 d5": "Réti Opening",
  "Nf3 Nf6": "Réti Opening",
}
const openingName = (moves: string) => OPENINGS[moves] ?? `1.${moves.split(" ")[0]} ${moves.split(" ")[1] ?? ""}`.trim()

// The final position of a game (for "last move" thumbnails).
export const fenOf = (moves: string[]) => {
  const c = new Chess()
  for (const m of moves) {
    try {
      c.move(m)
    } catch {
      break
    }
  }
  return c.fen()
}

// For the tournaments timeline: what's happening in each recent or coming event.
export const tourneySummaries = async (manager: GameManager) => {
  try {
    const { rows } = await pool.query(
      `select t.id, t.format, t.starts_at, t.ends_at, s.phase, s.round, s.note,
              (select count(*)::int from play.t_entrant e where e.tournament_id = t.id) as entrants,
              (select count(*)::int from public.tournament_registration r where r.tournament_id = t.id and r.status = 'confirmed' and r.deleted_at is null and r.checked_in_at is not null) as checked_in
         from public.tournament t left join play.t_state s on s.tournament_id = t.id
        where t.deleted_at is null and t.mode = 'online' and t.status <> 'draft'
          and t.starts_at > now() - interval '14 days' and t.starts_at < now() + interval '30 days'`
    )
    const live = new Map<string, number>()
    for (const g of manager.liveGames()) if (g.r.tournament_id) live.set(g.r.tournament_id, (live.get(g.r.tournament_id) ?? 0) + 1)
    // Arena leaders.
    const leaders = new Map<string, string>()
    const ids = rows.filter((r) => r.format === "arena").map((r) => r.id)
    if (ids.length) {
      const { rows: top } = await pool.query(
        `select distinct on (tournament_id) tournament_id, name from play.arena_player where tournament_id = any($1) order by tournament_id, score desc, wins desc`,
        [ids]
      )
      for (const r of top) leaders.set(r.tournament_id, r.name)
    }
    // Swiss and knockout winners, once the event is over (the leader while it runs).
    const others = rows.filter((r) => r.format !== "arena" && r.phase).map((r) => r.id)
    if (others.length) {
      const { rows: won } = await pool.query(
        `select f.tournament_id, e.name from play.t_final f join play.t_entrant e on e.tournament_id = f.tournament_id and e.player_id = f.player_id
          where f.tournament_id = any($1) and f.rank = 1`,
        [others]
      )
      for (const r of won) leaders.set(r.tournament_id, r.name)
    }
    return rows.map((r) => ({
      id: r.id,
      phase: r.phase ?? null,
      round: r.round ?? 0,
      note: r.note ?? null,
      entrants: r.entrants,
      checked_in: r.checked_in,
      live_games: live.get(r.id) ?? 0,
      leader: leaders.get(r.id) ?? null,
    }))
  } catch {
    return []
  }
}

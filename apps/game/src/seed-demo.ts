// Demo tournaments, to see how every kind of event looks before real ones run: finished
// Arena, Swiss and Knockout events with results, prizes, certificates and replayable games;
// a Swiss and an Arena "live now"; upcoming events with players registered; and one called
// off. Everything is marked "Demo" and uses ids starting trn_demo_, so it's easy to spot
// and remove. The engine, reminders and results jobs leave demo events alone.
//
//   node dist/seed-demo.js           add (or refresh) the demo events
//   node dist/seed-demo.js --remove  delete them all
//
// deploy/seed-demo-tournaments.sh runs it on the server with the right settings.

import { Chess } from "chess.js"
import { randomBytes } from "node:crypto"
import { applyResult, emptyStanding, type Standing } from "./arena-rules.js"
import { pool } from "./db.js"
import { migrateTourney } from "./tourney.js"
import { buildBracket, type Entrant, finalRanking, matchState, pairRoundRobin, pairSwiss, type Result, rrRounds, rrTable, swissTable, type TGame } from "./tourney-rules.js"

const DEMO = "trn_demo_"
const HOUR = 3600_000
const DAY = 24 * HOUR

const NAMES = [
  "Aarav Sharma", "Diya Patel", "Vihaan Reddy", "Ananya Iyer", "Arjun Nair", "Ishita Gupta", "Kabir Singh", "Meera Joshi",
  "Rohan Das", "Saanvi Kulkarni", "Aditya Menon", "Priya Rao", "Krishna Pillai", "Riya Banerjee", "Siddharth Jain", "Tara Bose",
  "Nikhil Verma", "Avni Chatterjee", "Yash Thakur", "Kavya Hegde", "Dev Malhotra", "Neha Kapoor", "Harsh Agarwal", "Pooja Mishra",
]
const CITIES = ["Mumbai", "Bengaluru", "Chennai", "Pune", "Kolkata", "Hyderabad", "Jaipur", "Ahmedabad", "Kochi", "Delhi", "Lucknow", "Mysuru"]
const SOURCES = ["instagram", "whatsapp", "direct", "google.com", "youtube", "newsletter"]
const OPENINGS = [
  ["e4", "e5", "Nf3", "Nc6", "Bb5", "a6"],
  ["e4", "c5", "Nf3", "d6", "d4", "cxd4", "Nxd4", "Nf6"],
  ["d4", "d5", "c4", "e6", "Nc3", "Nf6"],
  ["e4", "e6", "d4", "d5", "Nc3", "Bb4"],
  ["d4", "Nf6", "c4", "g6", "Nc3", "Bg7", "e4", "d6"],
  ["e4", "c6", "d4", "d5", "Nc3", "dxe4", "Nxe4"],
  ["c4", "e5", "Nc3", "Nf6", "g3", "d5"],
  ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6"],
  ["d4", "d5", "Bf4", "Nf6", "e3", "c5"],
  ["Nf3", "d5", "g3", "Nf6", "Bg2", "c6", "O-O"],
]

// A seeded random, so a refresh gives the same results.
let seed = 64
const rnd = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return seed / 2147483648
}
const pick = <T>(a: T[]) => a[Math.floor(rnd() * a.length)]
const gameId = () => `dm${randomBytes(5).toString("hex")}`.slice(0, 12)

type Player = Entrant & { city: string; customer_id: string; email: string }

const players: Player[] = NAMES.map((name, i) => {
  const city = CITIES[i % CITIES.length]
  return { id: `cus_DEMO${String(i + 1).padStart(4, "0")}`, customer_id: `cus_DEMO${String(i + 1).padStart(4, "0")}`, name, rating: 2150 - i * 37 - Math.floor(rnd() * 30), city, email: `demo-player-${i + 1}@example.com` }
})

// The result, more often won by the higher rated player; a few draws.
const play = (w: Entrant, b: Entrant): Result => {
  const p = 1 / (1 + 10 ** ((b.rating - w.rating) / 400))
  const r = rnd()
  if (r < 0.14) return "1/2-1/2"
  return r < 0.14 + 0.86 * p ? "1-0" : "0-1"
}

// A legal game: a known opening, then random moves, ending the way the result says.
const moves = (result: Result) => {
  const c = new Chess()
  for (const m of pick(OPENINGS)) c.move(m)
  const length = 30 + Math.floor(rnd() * 60)
  while (c.history().length < length && !c.isGameOver()) {
    const legal = c.moves()
    const captures = legal.filter((m) => m.includes("x"))
    const mv = captures.length && rnd() < 0.35 ? pick(captures) : pick(legal)
    c.move(mv)
    if (c.isGameOver()) {
      c.undo()
      break
    }
  }
  const reason = result === "1/2-1/2" ? "agreement" : rnd() < 0.7 ? "resign" : "timeout"
  return { moves: c.history(), reason }
}

const tcMs = (tc: string) => {
  const [m, s] = tc.split("+").map(Number)
  return { initial: m * 60_000, inc: (s || 0) * 1000 }
}

const saveGame = async (tid: string, tc: string, w: Entrant, b: Entrant, result: Result, at: number) => {
  const id = gameId()
  const { moves: mv, reason } = moves(result)
  const { initial, inc } = tcMs(tc)
  const left = () => Math.max(1000, Math.floor(initial * (0.1 + rnd() * 0.6)))
  await pool.query(
    `insert into play.game (id, mode, tournament_id, white_id, white_name, black_id, black_name, creator_id, initial_ms, increment_ms,
       status, result, reason, moves, white_ms, black_ms, created_at, started_at, ended_at, rated, white_rating, black_rating)
     values ($1,'arena',$2,$3,$4,$5,$6,$3,$7,$8,'finished',$9,$10,$11,$12,$13,$14,$14,$15,false,$16,$17)`,
    [id, tid, w.id, w.name, b.id, b.name, initial, inc, result, reason, mv, left(), left(), new Date(at), new Date(at + 6 * 60_000), w.rating, b.rating]
  )
  return id
}

type Demo = {
  id: string
  title: string
  handle: string
  format: "arena" | "swiss" | "round_robin" | "knockout"
  tc: string
  starts: number
  minutes: number
  rounds?: number
  ko_games?: number
  summary: string
  tagline: string
  status: "published" | "completed" | "cancelled"
  field: number
  featured?: boolean
  prizes: { place: string; title: string; detail?: string }[]
  check_in?: number
}

const prizeSets = {
  big: [
    { place: "1st place", title: "Walnut Folding Chess Board", detail: "Handmade, 15 inch" },
    { place: "2nd place", title: "Travel Magnetic Chess Set", detail: "Pocket size" },
    { place: "3rd place", title: "Store voucher ₹500" },
  ],
  small: [
    { place: "1st place", title: "Store voucher ₹1,000" },
    { place: "2nd place", title: "Store voucher ₹500" },
  ],
}

const description = (d: Demo) =>
  `This is a demo tournament, made up to show how tournaments look on The 64 Squares. ${d.format === "arena" ? "Play as many games as you can before the clock runs out." : d.format === "swiss" ? "Everyone plays every round against players on the same score." : d.format === "round_robin" ? "Everyone plays everyone once." : "Win your match to go through; lose and you're out."}`

const cert = () => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const d = new Date()
  return `T64-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}-${[...randomBytes(6)].map((b) => abc[b % abc.length]).join("")}`
}

const insertTournament = async (d: Demo, extra: Record<string, unknown> = {}) => {
  const ends = d.format === "arena" ? new Date(d.starts + d.minutes * 60_000) : null
  const done = d.status === "completed"
  await pool.query(
    `insert into public.tournament (id, title, handle, summary, description, format, mode, time_control, rounds, starts_at, ends_at,
       capacity, status, entry, pass_cost, check_in_minutes, min_players, round_break_seconds, knockout_games, armageddon,
       prize_list, tagline, featured, reminders, certificates, coupon_code, results_at, results_final_at, cancel_reason, prizes)
     values ($1,$2,$3,$4,$5,$6,'online',$7,$8,$9,$10,64,$11,'pass',1,$12,4,30,$13,true,$14,$15,$16,false,true,$17,$18,$18,$19,null)`,
    [
      d.id, d.title, d.handle, d.summary, description(d), d.format, d.tc, d.rounds ?? null, new Date(d.starts), ends, d.status,
      d.format === "arena" ? 0 : (d.check_in ?? 30), d.ko_games ?? 1, JSON.stringify(d.prizes), d.tagline, !!d.featured,
      done ? "PLAYED10" : null, done ? new Date(d.starts + d.minutes * 60_000) : null, (extra.cancel_reason as string) ?? null,
    ]
  )
}

const register = async (d: Demo, n: number, field: Player[], opts: { checked_in?: boolean; ranks?: Map<string, { rank: number; score: number }> } = {}) => {
  const prizes = d.prizes
  for (const [i, p] of field.entries()) {
    const r = opts.ranks?.get(p.id)
    const prize = r ? (prizes[r.rank - 1]?.title ?? null) : null
    await pool.query(
      `insert into public.tournament_registration (id, tournament_id, customer_id, ticket_code, player_name, email, rating, city, status,
         checked_in_at, final_rank, score, review, prize_title, prize_status, certificate_no, source, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        `treg_demo_${d.id.slice(DEMO.length)}_${i + 1}`, d.id, p.customer_id, `T64-DEMO${String(n).padStart(2, "0")}${String(i + 1).padStart(2, "0")}`,
        p.name, p.email, p.rating, p.city, d.status === "cancelled" ? "cancelled" : "confirmed",
        opts.checked_in ? new Date(d.starts - 10 * 60_000) : null,
        r?.rank ?? null, r?.score ?? null, r && r.rank <= 3 ? "cleared" : null, prize, prize ? (r!.rank === 1 ? "delivered" : "shipped") : null,
        r ? cert() : null, pick(SOURCES), new Date(d.starts - (2 + rnd() * 5) * DAY),
      ]
    )
  }
  // Page visits, for the funnel report: about three visitors for every player.
  for (let i = 0; i < field.length * 3; i++) {
    await pool.query(`insert into public.tournament_visit (id, tournament_id, visitor, source) values ($1,$2,$3,$4)`, [`tvis_demo_${d.id.slice(DEMO.length)}_${i}`, d.id, `demo${d.id}${i}`, pick(SOURCES)])
  }
}

const entrantsOf = async (d: Demo, field: Player[]) => {
  const seeded = [...field].sort((a, b) => b.rating - a.rating)
  for (const [i, e] of seeded.entries()) {
    await pool.query(`insert into play.t_entrant (tournament_id, player_id, name, rating, seed) values ($1,$2,$3,$4,$5)`, [d.id, e.id, e.name, e.rating, i + 1])
  }
  return seeded
}

const saveTGames = async (d: Demo, games: TGame[]) => {
  for (const g of games) {
    await pool.query(
      `insert into play.t_game (tournament_id, round, board, game_no, white_id, black_id, game_id, result, forfeit, armageddon, ended_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [d.id, g.round, g.board, g.game_no, g.white_id, g.black_id, g.game_id, g.result, g.forfeit, g.armageddon, g.result ? new Date(d.starts + g.round * 15 * 60_000) : null]
    )
  }
}

// Plays a Swiss event round by round (the real pairing rules); `upTo` rounds get results.
const swiss = async (d: Demo, field: Player[], upTo: number) => {
  const seeded = await entrantsOf(d, field)
  const byId = new Map(seeded.map((e) => [e.id, e]))
  const games: TGame[] = []
  const rounds = d.rounds ?? 5
  for (let r = 1; r <= Math.min(rounds, upTo + 1); r++) {
    const table = swissTable(seeded, games, new Set(), rounds)
    const pairs = pairSwiss(table, r)
    for (const [i, p] of pairs.entries()) {
      if (!p.black) {
        games.push({ round: r, board: i + 1, game_no: 1, white_id: p.white, black_id: null, result: "1-0", forfeit: false, armageddon: false, game_id: null })
        continue
      }
      const done = r <= upTo
      const result = done ? play(byId.get(p.white)!, byId.get(p.black)!) : null
      const id = done ? await saveGame(d.id, d.tc, byId.get(p.white)!, byId.get(p.black)!, result!, d.starts + (r - 1) * 15 * 60_000) : null
      games.push({ round: r, board: i + 1, game_no: 1, white_id: p.white, black_id: p.black, result, forfeit: false, armageddon: false, game_id: id })
    }
  }
  await saveTGames(d, games)
  const finished = upTo >= rounds
  await pool.query(`insert into play.t_state (tournament_id, phase, round, started_at, finished_at) values ($1,$2,$3,$4,$5)`, [
    d.id, finished ? "finished" : "running", Math.min(rounds, upTo + 1), new Date(d.starts), finished ? new Date(d.starts + d.minutes * 60_000) : null,
  ])
  if (!finished) return null
  const ranks = finalRanking("swiss", swissTable(seeded, games, new Set(), rounds), null)
  for (const r of ranks) await pool.query(`insert into play.t_final (tournament_id, player_id, rank, score) values ($1,$2,$3,$4)`, [d.id, r.id, r.rank, r.score])
  return new Map(ranks.map((r) => [r.id, { rank: r.rank, score: r.score }]))
}

// A round robin played to the end: everyone against everyone, on Berger tables.
const roundRobin = async (d: Demo, field: Player[]) => {
  const seeded = await entrantsOf(d, field)
  const byId = new Map(seeded.map((e) => [e.id, e]))
  const games: TGame[] = []
  const rounds = rrRounds(seeded.length, 1)
  for (let r = 1; r <= rounds; r++) {
    for (const [i, p] of pairRoundRobin(seeded.map((e) => e.id), r).entries()) {
      if (!p.black) {
        games.push({ round: r, board: i + 1, game_no: 1, white_id: p.white, black_id: null, result: "1-0", forfeit: false, armageddon: false, game_id: null })
        continue
      }
      const result = play(byId.get(p.white)!, byId.get(p.black)!)
      const id = await saveGame(d.id, d.tc, byId.get(p.white)!, byId.get(p.black)!, result, d.starts + (r - 1) * 12 * 60_000)
      games.push({ round: r, board: i + 1, game_no: 1, white_id: p.white, black_id: p.black, result, forfeit: false, armageddon: false, game_id: id })
    }
  }
  await saveTGames(d, games)
  await pool.query(`insert into play.t_state (tournament_id, phase, round, started_at, finished_at) values ($1,'finished',$2,$3,$4)`, [d.id, rounds, new Date(d.starts), new Date(d.starts + d.minutes * 60_000)])
  const ranks = finalRanking("round_robin", rrTable(seeded, games, new Set(), rounds), null)
  for (const r of ranks) await pool.query(`insert into play.t_final (tournament_id, player_id, rank, score) values ($1,$2,$3,$4)`, [d.id, r.id, r.rank, r.score])
  return new Map(ranks.map((r) => [r.id, { rank: r.rank, score: r.score }]))
}

// Plays a knockout bracket to the end, with sudden death when a match is drawn.
const knockout = async (d: Demo, field: Player[]) => {
  const seeded = await entrantsOf(d, field)
  const byId = new Map(seeded.map((e) => [e.id, e]))
  const opts = { games: d.ko_games ?? 1, armageddon: true }
  const games: TGame[] = []
  for (let guard = 0; guard < 200; guard++) {
    const b = buildBracket(seeded, games, opts)
    if (b.rounds.at(-1)?.matches[0]?.winner) break
    const round = b.rounds.find((r) => r.matches.some((m) => !m.winner))!
    const ri = b.rounds.indexOf(round) + 1
    for (const m of round.matches) {
      if (m.winner || !m.a || !m.b) continue
      const st = matchState(m.a.id, m.b.id, m.games, opts)
      if (!st.next) continue
      const w = byId.get(st.next.white)!
      const bl = byId.get(st.next.black)!
      // Make some matches go to sudden death.
      let result = play(w, bl)
      if (st.next.armageddon && result === "1/2-1/2" && rnd() < 0.5) result = rnd() < 0.5 ? "1-0" : "0-1"
      const id = await saveGame(d.id, d.tc, w, bl, result, d.starts + (ri - 1) * 20 * 60_000)
      games.push({ round: ri, board: m.board, game_no: m.games.length + 1, white_id: w.id, black_id: bl.id, result, forfeit: false, armageddon: st.next.armageddon, game_id: id })
    }
  }
  await saveTGames(d, games)
  const b = buildBracket(seeded, games, opts)
  await pool.query(`insert into play.t_state (tournament_id, phase, round, started_at, finished_at) values ($1,'finished',$2,$3,$4)`, [d.id, b.totalRounds, new Date(d.starts), new Date(d.starts + d.minutes * 60_000)])
  const ranks = finalRanking("knockout", null, b)
  for (const r of ranks) await pool.query(`insert into play.t_final (tournament_id, player_id, rank, score) values ($1,$2,$3,$4)`, [d.id, r.id, r.rank, r.score])
  return new Map(ranks.map((r) => [r.id, { rank: r.rank, score: r.score }]))
}

// An arena: players paired as they come free; `share` of the time has been played.
const arena = async (d: Demo, field: Player[], share = 1) => {
  const st = new Map<string, Standing>(field.map((p) => [p.id, emptyStanding(p.id, p.name, d.starts)]))
  const rounds = Math.max(2, Math.round(8 * share))
  for (let r = 0; r < rounds; r++) {
    const free = [...field].sort(() => rnd() - 0.5).filter(() => rnd() < 0.85)
    for (let i = 0; i + 1 < free.length; i += 2) {
      const [w, b] = rnd() < 0.5 ? [free[i], free[i + 1]] : [free[i + 1], free[i]]
      const result = play(w, b)
      await saveGame(d.id, d.tc, w, b, result, d.starts + r * 7 * 60_000)
      applyResult(st.get(w.id)!, result === "1-0" ? "win" : result === "0-1" ? "loss" : "draw", "w", b.id)
      applyResult(st.get(b.id)!, result === "0-1" ? "win" : result === "1-0" ? "loss" : "draw", "b", w.id)
    }
  }
  for (const s of st.values()) {
    if (!s.games) continue
    await pool.query(
      `insert into play.arena_player (tournament_id, player_id, name, score, games, wins, draws, losses, streak, sheet, whites, blacks, last_opponent, joined_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [d.id, s.player_id, s.name, s.score, s.games, s.wins, s.draws, s.losses, s.streak, s.sheet, s.whites, s.blacks, s.last_opponent, new Date(s.joined_at)]
    )
  }
  const order = [...st.values()].filter((s) => s.games).sort((a, b) => b.score - a.score || b.wins - a.wins || a.games - b.games)
  return new Map(order.map((s, i) => [s.player_id, { rank: i + 1, score: s.score }]))
}

const remove = async () => {
  const like = `${DEMO}%`
  for (const sql of [
    "delete from play.game where tournament_id like $1",
    "delete from play.t_game where tournament_id like $1",
    "delete from play.t_entrant where tournament_id like $1",
    "delete from play.t_state where tournament_id like $1",
    "delete from play.t_final where tournament_id like $1",
    "delete from play.t_withdrawn where tournament_id like $1",
    "delete from play.arena_player where tournament_id like $1",
    "delete from public.tournament_visit where tournament_id like $1",
    "delete from public.tournament_registration where tournament_id like $1",
    "delete from public.tournament where id like $1",
  ]) {
    await pool.query(sql, [like])
  }
}

const main = async () => {
  const hasArena = await pool.query("select to_regclass('play.arena_player') as a, to_regclass('public.tournament_visit') as v")
  if (!hasArena.rows[0]?.v) throw new Error("Run the store update first (the tournament tables are missing).")
  await migrateTourney()
  await remove()
  if (process.argv.includes("--remove")) {
    console.log("Demo tournaments removed.")
    return
  }
  const now = Date.now()
  const at = (dayOffset: number, hourIST: number) => {
    const d = new Date(now + dayOffset * DAY)
    const ist = new Date(d.getTime() + 5.5 * HOUR)
    ist.setUTCHours(hourIST, 0, 0, 0)
    return ist.getTime() - 5.5 * HOUR
  }
  const field = (n: number, offset = 0) => [...players.slice(offset), ...players.slice(0, offset)].slice(0, n)

  const demos: Demo[] = [
    { id: `${DEMO}arena_sun`, title: "Demo · Sunday Blitz Arena", handle: "demo-sunday-blitz-arena", format: "arena", tc: "3+2", starts: at(-3, 19), minutes: 60, summary: "An hour of non-stop blitz.", tagline: "Most points in an hour wins", status: "completed", field: 20, prizes: prizeSets.small },
    { id: `${DEMO}swiss_open`, title: "Demo · Rapid Swiss Open", handle: "demo-rapid-swiss-open", format: "swiss", tc: "10+5", rounds: 5, starts: at(-2, 18), minutes: 150, summary: "Five rounds of rapid.", tagline: "Win a handmade walnut board", status: "completed", field: 16, prizes: prizeSets.big },
    { id: `${DEMO}ko_cup`, title: "Demo · Knockout Cup", handle: "demo-knockout-cup", format: "knockout", tc: "5+3", ko_games: 2, starts: at(-1, 19), minutes: 120, summary: "Sixteen players, two-game matches, sudden death.", tagline: "Lose and you're out", status: "completed", field: 16, prizes: prizeSets.big },
    { id: `${DEMO}ko_bullet`, title: "Demo · Bullet Knockout", handle: "demo-bullet-knockout", format: "knockout", tc: "1+0", starts: at(-5, 21), minutes: 30, summary: "Eight players, one game per match.", tagline: "Fast hands only", status: "completed", field: 11, prizes: prizeSets.small },
    { id: `${DEMO}rr_masters`, title: "Demo · Club Masters (round robin)", handle: "demo-club-masters", format: "round_robin", tc: "5+3", starts: at(-6, 18), minutes: 100, summary: "Eight players, everyone plays everyone.", tagline: "Seven rounds, no hiding", status: "completed", field: 8, prizes: prizeSets.small },
    { id: `${DEMO}swiss_live`, title: "Demo · Thursday Swiss (live)", handle: "demo-thursday-swiss-live", format: "swiss", tc: "3+2", rounds: 5, starts: now - 45 * 60_000, minutes: 90, summary: "A blitz Swiss under way.", tagline: "Round 3 being played", status: "published", field: 14, prizes: prizeSets.small },
    { id: `${DEMO}arena_live`, title: "Demo · Evening Arena (live)", handle: "demo-evening-arena-live", format: "arena", tc: "3+0", starts: now - 25 * 60_000, minutes: 60, summary: "Join any time while it's on.", tagline: "On fire: double points", status: "published", field: 18, prizes: prizeSets.small },
    { id: `${DEMO}arena_next`, title: "Demo · Late Night Arena", handle: "demo-late-night-arena", format: "arena", tc: "1+0", starts: now + 3 * HOUR, minutes: 45, summary: "Bullet before bed.", tagline: "Free with a pass", status: "published", field: 9, prizes: prizeSets.small },
    { id: `${DEMO}swiss_next`, title: "Demo · Weekend Rapid Swiss", handle: "demo-weekend-rapid-swiss", format: "swiss", tc: "10+5", rounds: 5, starts: at(2, 18), minutes: 150, summary: "Five rounds of rapid on Saturday.", tagline: "Win a handmade walnut board", status: "published", field: 21, featured: true, prizes: prizeSets.big },
    { id: `${DEMO}ko_next`, title: "Demo · Junior Knockout", handle: "demo-junior-knockout", format: "knockout", tc: "5+3", starts: at(4, 17), minutes: 120, summary: "For under-15s.", tagline: "Who's the best junior?", status: "published", field: 6, prizes: prizeSets.small },
    { id: `${DEMO}cancelled`, title: "Demo · Midweek Swiss (called off)", handle: "demo-midweek-swiss", format: "swiss", tc: "5+0", rounds: 4, starts: at(-4, 20), minutes: 80, summary: "Called off: too few players checked in.", tagline: "", status: "cancelled", field: 3, prizes: [] },
  ]

  for (const d of demos) {
    const f = field(d.field, demos.indexOf(d) * 3)
    await insertTournament(d, d.status === "cancelled" ? { cancel_reason: "Not enough players checked in (3 of the 4 needed)." } : {})
    let ranks: Map<string, { rank: number; score: number }> | null = null
    if (d.status === "completed") {
      ranks = d.format === "arena" ? await arena(d, f) : d.format === "swiss" ? await swiss(d, f, d.rounds ?? 5) : d.format === "round_robin" ? await roundRobin(d, f) : await knockout(d, f)
    } else if (d.id.endsWith("swiss_live")) {
      await swiss(d, f, 2)
    } else if (d.id.endsWith("arena_live")) {
      await arena(d, f, 0.4)
    } else if (d.status === "cancelled") {
      await pool.query(`insert into play.t_state (tournament_id, phase, note) values ($1,'cancelled_low','3 of the 4 players needed checked in')`, [d.id])
    }
    await register(d, demos.indexOf(d) + 1, f, { checked_in: d.status === "completed" || d.id.endsWith("_live"), ranks: ranks ?? undefined })
    console.log(`  ${d.title}`)
  }
  console.log(`Added ${demos.length} demo tournaments. Remove them with --remove.`)
}

main()
  .then(() => pool.end())
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    void pool.end()
    process.exit(1)
  })

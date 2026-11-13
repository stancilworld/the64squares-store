// Swiss, round-robin and knockout tournaments: the pure rules (pairing, standings, tie-breaks,
// brackets), kept apart from the database so they can be tested on their own.

export type Result = "1-0" | "0-1" | "1/2-1/2"
// A tournament game (or a bye) as stored in play.t_game.
export type TGame = {
  round: number
  board: number
  game_no: number
  white_id: string
  black_id: string | null // null: a bye for White
  result: Result | null
  forfeit: boolean // won because the opponent didn't play
  armageddon: boolean
  game_id: string | null
}

export type Entrant = { id: string; name: string; rating: number }

// ---------------------------------------------------------------- Swiss

export type SwissRow = {
  id: string
  name: string
  rating: number
  points: number
  wins: number
  games: number
  buchholz: number // Buchholz Cut-1
  sb: number // Sonneborn-Berger
  blacks: number
  whites: number
  bye: boolean
  opponents: string[]
  // Per round: "W" won, "L" lost, "D" drew, "B" bye, "F" won by forfeit, "X" lost by forfeit, "-" didn't play
  sheet: { round: number; opponent: string | null; colour: "w" | "b" | null; mark: string; game_id: string | null }[]
  withdrawn: boolean
}

const pointsFor = (g: TGame, id: string) => {
  if (g.black_id === null) return g.white_id === id ? 1 : 0
  if (!g.result) return 0
  if (g.result === "1/2-1/2") return 0.5
  return (g.result === "1-0") === (g.white_id === id) ? 1 : 0
}

export const swissTable = (entrants: Entrant[], games: TGame[], withdrawn: Set<string>, rounds: number): SwissRow[] => {
  const rows = new Map<string, SwissRow>()
  for (const e of entrants) {
    rows.set(e.id, { id: e.id, name: e.name, rating: e.rating, points: 0, wins: 0, games: 0, buchholz: 0, sb: 0, blacks: 0, whites: 0, bye: false, opponents: [], sheet: [], withdrawn: withdrawn.has(e.id) })
  }
  const done = games.filter((g) => g.black_id === null || g.result)
  for (const g of done) {
    const w = rows.get(g.white_id)
    if (!w) continue
    if (g.black_id === null) {
      w.points += 1
      w.bye = true
      w.sheet.push({ round: g.round, opponent: null, colour: null, mark: "B", game_id: null })
      continue
    }
    const b = rows.get(g.black_id)
    if (!b) continue
    const pw = pointsFor(g, w.id)
    const pb = pointsFor(g, b.id)
    w.points += pw
    b.points += pb
    if (pw === 1) w.wins++
    if (pb === 1) b.wins++
    if (!g.forfeit) {
      w.games++
      b.games++
    }
    w.whites++
    b.blacks++
    w.opponents.push(b.id)
    b.opponents.push(w.id)
    const mark = (p: number) => (g.forfeit ? (p === 1 ? "F" : "X") : p === 1 ? "W" : p === 0 ? "L" : "D")
    w.sheet.push({ round: g.round, opponent: b.id, colour: "w", mark: mark(pw), game_id: g.game_id })
    b.sheet.push({ round: g.round, opponent: w.id, colour: "b", mark: mark(pb), game_id: g.game_id })
  }
  // Tie-breaks from opponents' scores.
  for (const r of rows.values()) {
    const opp = r.opponents.map((o) => rows.get(o)?.points ?? 0)
    const sorted = [...opp].sort((a, b) => a - b)
    r.buchholz = sorted.slice(sorted.length > 1 ? 1 : 0).reduce((s, x) => s + x, 0)
    let sb = 0
    for (const s of r.sheet) {
      if (!s.opponent) continue
      const op = rows.get(s.opponent)?.points ?? 0
      sb += s.mark === "W" || s.mark === "F" ? op : s.mark === "D" ? op / 2 : 0
    }
    r.sb = sb
    // Rounds not played (withdrawn or not yet paired) stay empty.
    r.sheet.sort((a, b) => a.round - b.round)
    void rounds
  }
  return [...rows.values()].sort(compareSwiss)
}

export const compareSwiss = (a: SwissRow, b: SwissRow) =>
  b.points - a.points || b.buchholz - a.buchholz || b.sb - a.sb || b.wins - a.wins || b.blacks - a.blacks || b.rating - a.rating || a.name.localeCompare(b.name)

export type SwissPairing = { white: string; black: string | null }

// One Swiss round: players with the same score meet (top half of a score group against the
// bottom half), nobody meets the same opponent twice if it can be avoided, colours balance
// out, and an odd player out gets a bye (1 point, at most once).
export const pairSwiss = (table: SwissRow[], round: number, maxSteps = 200_000): SwissPairing[] => {
  const active = table.filter((r) => !r.withdrawn).sort(compareSwiss)
  const out: SwissPairing[] = []
  let pool = active
  if (pool.length % 2 === 1) {
    // The lowest-placed player who hasn't had a bye.
    const byeTo = [...pool].reverse().find((r) => !r.bye) ?? pool[pool.length - 1]
    out.push({ white: byeTo.id, black: null })
    pool = pool.filter((r) => r.id !== byeTo.id)
  }
  const pos = new Map(pool.map((r, i) => [r.id, i]))
  // Where each player sits in their score group, to aim for top half vs bottom half.
  const groups = new Map<number, SwissRow[]>()
  for (const r of pool) groups.set(r.points, [...(groups.get(r.points) ?? []), r])
  const ideal = new Map<string, number>()
  for (const g of groups.values()) {
    const half = Math.floor(g.length / 2)
    g.forEach((r, i) => ideal.set(r.id, pos.get(g[i < half ? i + half : i - half]?.id ?? r.id) ?? 0))
  }
  const met = (a: SwissRow, b: SwissRow) => a.opponents.includes(b.id)
  let steps = 0
  const solve = (left: SwissRow[], allowRematch: boolean): [SwissRow, SwissRow][] | null => {
    if (!left.length) return []
    if (++steps > maxSteps) return null
    const [p, ...rest] = left
    const target = ideal.get(p.id) ?? 0
    const candidates = rest
      .filter((q) => allowRematch || !met(p, q))
      .sort((x, y) => Math.abs(p.points - x.points) - Math.abs(p.points - y.points) || Math.abs((pos.get(x.id) ?? 0) - target) - Math.abs((pos.get(y.id) ?? 0) - target))
    for (const q of candidates) {
      const sub = solve(
        rest.filter((r) => r.id !== q.id),
        allowRematch
      )
      if (sub) return [[p, q], ...sub]
    }
    return null
  }
  const pairs = solve(pool, false) ?? ((steps = 0), solve(pool, true)) ?? []
  for (const [a, b] of pairs) {
    const [white, black] = colours(a, b, round)
    out.push({ white: white.id, black: black.id })
  }
  return out
}

const lastColour = (r: SwissRow) => [...r.sheet].reverse().find((s) => s.colour)?.colour ?? null

// White to whoever has had Black more often; then to whoever had Black last; then the
// higher-placed player alternates by round.
export const colours = (a: SwissRow, b: SwissRow, round: number): [SwissRow, SwissRow] => {
  const da = a.whites - a.blacks
  const db = b.whites - b.blacks
  if (da !== db) return da < db ? [a, b] : [b, a]
  const la = lastColour(a)
  const lb = lastColour(b)
  if (la !== lb) {
    if (la === "b") return [a, b]
    if (lb === "b") return [b, a]
    if (la === "w") return [b, a]
    if (lb === "w") return [a, b]
  }
  const higher = compareSwiss(a, b) <= 0 ? a : b
  const lower = higher === a ? b : a
  return round % 2 === 1 ? [higher, lower] : [lower, higher]
}

// ---------------------------------------------------------------- Knockout

// Bracket positions so the top seeds meet last: 1 v 8, 4 v 5, 2 v 7, 3 v 6 for 8 players.
export const seedOrder = (size: number): number[] => {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order
}

export const bracketSize = (n: number) => {
  let s = 2
  while (s < n) s *= 2
  return s
}

export const roundName = (round: number, totalRounds: number) => {
  const left = totalRounds - round
  if (left === 0) return "Final"
  if (left === 1) return "Semi-finals"
  if (left === 2) return "Quarter-finals"
  return `Round of ${2 ** (left + 1)}`
}

export type MatchSide = { id: string; name: string; rating: number; seed: number } | null

export type Match = {
  round: number
  board: number
  a: MatchSide // the higher seed (in round 1)
  b: MatchSide
  games: TGame[]
  score: [number, number]
  winner: string | null
  // How it was decided, for the bracket: "bye", "games", "armageddon", "seed", "forfeit"
  decided_by: string | null
}

// The result of a match so far, and what to play next (null when decided).
export const matchState = (
  a: string,
  b: string,
  games: TGame[],
  opts: { games: number; armageddon: boolean }
): { score: [number, number]; winner: string | null; decided_by: string | null; next: { white: string; black: string; armageddon: boolean } | null } => {
  const ordered = [...games].sort((x, y) => x.game_no - y.game_no)
  let sa = 0
  let sb = 0
  for (const g of ordered) {
    if (!g.result) return { score: [sa, sb], winner: null, decided_by: null, next: null }
    // A player who didn't turn up loses the match.
    if (g.forfeit) {
      const won = g.result === "1-0" ? g.white_id : g.black_id
      return { score: [sa + (won === a ? 1 : 0), sb + (won === b ? 1 : 0)], winner: won, decided_by: "forfeit", next: null }
    }
    if (g.armageddon) {
      // Draw odds for Black.
      const won = g.result === "1-0" ? g.white_id : g.black_id!
      return { score: [sa, sb], winner: won, decided_by: "armageddon", next: null }
    }
    if (g.result === "1/2-1/2") {
      sa += 0.5
      sb += 0.5
    } else {
      const won = g.result === "1-0" ? g.white_id : g.black_id
      if (won === a) sa += 1
      else sb += 1
    }
  }
  const played = ordered.filter((g) => !g.armageddon).length
  const regular = Math.max(1, opts.games)
  // Decided early when one player can't be caught.
  const left = regular - played
  if (sa > sb + left) return { score: [sa, sb], winner: a, decided_by: "games", next: null }
  if (sb > sa + left) return { score: [sa, sb], winner: b, decided_by: "games", next: null }
  if (played < regular) {
    // Game 1: the higher seed has White; then colours swap.
    const aWhite = played % 2 === 0
    return { score: [sa, sb], winner: null, decided_by: null, next: { white: aWhite ? a : b, black: aWhite ? b : a, armageddon: false } }
  }
  if (opts.armageddon) {
    // Sudden death: the higher seed takes Black (a draw is enough).
    return { score: [sa, sb], winner: null, decided_by: null, next: { white: b, black: a, armageddon: true } }
  }
  return { score: [sa, sb], winner: a, decided_by: "seed", next: null }
}

// The whole bracket from the seeded players and the games so far.
export const buildBracket = (seeded: Entrant[], games: TGame[], opts: { games: number; armageddon: boolean }) => {
  const size = bracketSize(Math.max(2, seeded.length))
  const totalRounds = Math.log2(size)
  const bySeed = new Map(seeded.map((e, i) => [i + 1, { ...e, seed: i + 1 }]))
  const order = seedOrder(size)
  let sides: MatchSide[] = order.map((s) => bySeed.get(s) ?? null)
  const rounds: { round: number; name: string; matches: Match[] }[] = []
  for (let round = 1; round <= totalRounds; round++) {
    const matches: Match[] = []
    for (let board = 1; board <= sides.length / 2; board++) {
      let a = sides[(board - 1) * 2]
      let b = sides[(board - 1) * 2 + 1]
      // The higher seed is shown first.
      if (a && b && b.seed < a.seed) [a, b] = [b, a]
      if (!a && b) [a, b] = [b, a]
      const mine = games.filter((g) => g.round === round && g.board === board)
      let m: Match
      if (round === 1 && a && !b) m = { round, board, a, b: null, games: [], score: [0, 0], winner: a.id, decided_by: "bye" }
      else if (!a || !b) m = { round, board, a, b, games: [], score: [0, 0], winner: null, decided_by: null }
      else {
        const st = matchState(a.id, b.id, mine, opts)
        m = { round, board, a, b, games: mine.sort((x, y) => x.game_no - y.game_no), score: st.score, winner: st.winner, decided_by: st.decided_by }
      }
      matches.push(m)
    }
    rounds.push({ round, name: roundName(round, totalRounds), matches })
    // Winners move on; an undecided match leaves an empty place in the next round.
    const next: MatchSide[] = []
    for (const m of matches) {
      const w = m.winner ? ([m.a, m.b].find((s) => s?.id === m.winner) ?? null) : null
      next.push(w)
    }
    // Byes happen in the first round only; later an empty side means "to be decided".
    sides = next
  }
  return { size, totalRounds, rounds }
}

// ---------------------------------------------------------------- Round robin

// Everyone plays everyone: once, or twice (colours reversed) in a double round robin. An odd
// field gets a bye each round, so everyone sits out once per cycle (a bye scores 1 point, the
// same for everyone).
export const rrRounds = (players: number, cycles: number) => (players + (players % 2) - 1) * Math.max(1, cycles)

// Berger tables (the circle method): the last seed stays put, the others turn one place a
// round. Seeds in rating order; the same seeding always gives the same schedule.
export const pairRoundRobin = (seeded: string[], round: number): SwissPairing[] => {
  const ids: (string | null)[] = [...seeded]
  if (ids.length % 2) ids.push(null)
  const n = ids.length
  const cycle = n - 1
  const r = (round - 1) % cycle
  const second = Math.floor((round - 1) / cycle) % 2 === 1
  const ring = Array.from({ length: cycle }, (_, i) => ids[(i + r * (n / 2)) % cycle])
  const pairs: [string | null, string | null][] = [r % 2 === 0 ? [ring[0], ids[n - 1]] : [ids[n - 1], ring[0]]]
  for (let i = 1; i < n / 2; i++) pairs.push([ring[i], ring[cycle - i]])
  return pairs.flatMap(([w, b]): SwissPairing[] => {
    if (second) [w, b] = [b, w]
    if (w && b) return [{ white: w, black: b }]
    const one = w ?? b
    return one ? [{ white: one, black: null }] : []
  })
}

// Round-robin standings: points, then Sonneborn-Berger, then wins (Buchholz says nothing when
// everyone meets everyone).
export const compareRR = (a: SwissRow, b: SwissRow) =>
  b.points - a.points || b.sb - a.sb || b.wins - a.wins || b.blacks - a.blacks || b.rating - a.rating || a.name.localeCompare(b.name)

export const rrTable = (entrants: Entrant[], games: TGame[], withdrawn: Set<string>, rounds: number) => swissTable(entrants, games, withdrawn, rounds).sort(compareRR)

export type FinalRank = { id: string; rank: number; score: number }

// The final placings. Swiss and round robin: the standings order (tied players share nothing; tie-breaks
// already split them). Knockout: the champion 1st, the losing finalist 2nd, then everyone
// out in the same round shares a place (both losing semi-finalists are 3rd, and so on).
export const finalRanking = (
  format: "swiss" | "round_robin" | "knockout",
  table: SwissRow[] | null,
  bracket: { rounds: { matches: Match[] }[]; totalRounds: number } | null
): FinalRank[] => {
  if (format === "swiss") return [...(table ?? [])].sort(compareSwiss).map((r, i) => ({ id: r.id, rank: i + 1, score: r.points }))
  if (format === "round_robin") return [...(table ?? [])].sort(compareRR).map((r, i) => ({ id: r.id, rank: i + 1, score: r.points }))
  if (!bracket) return []
  const out: FinalRank[] = []
  const placed = new Set<string>()
  const final = bracket.rounds.at(-1)?.matches[0]
  if (final?.winner) {
    out.push({ id: final.winner, rank: 1, score: bracket.totalRounds })
    placed.add(final.winner)
  }
  let rank = 2
  for (let r = bracket.rounds.length - 1; r >= 0; r--) {
    const losers = bracket.rounds[r].matches
      .filter((m) => m.winner && m.a && m.b)
      .map((m) => (m.winner === m.a!.id ? m.b! : m.a!))
      .filter((s) => !placed.has(s.id))
      .sort((x, y) => x.seed - y.seed)
    for (const s of losers) {
      out.push({ id: s.id, rank, score: r })
      placed.add(s.id)
    }
    rank += losers.length
  }
  return out
}

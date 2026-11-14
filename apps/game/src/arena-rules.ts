// Arena scoring and pairing, kept free of sockets and the database so it can be tested.

export type Standing = {
  player_id: string
  name: string
  score: number
  games: number
  wins: number
  draws: number
  losses: number
  // Consecutive wins: from 2 on, the player is "on fire" and scores double.
  streak: number
  // Points per game, newest last, e.g. [2, 2, 4, 0].
  sheet: number[]
  whites: number
  blacks: number
  last_opponent: string | null
  joined_at: number
}

export const emptyStanding = (player_id: string, name: string, now: number): Standing => ({
  player_id,
  name,
  score: 0,
  games: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  streak: 0,
  sheet: [],
  whites: 0,
  blacks: 0,
  last_opponent: null,
  joined_at: now,
})

export type Outcome = "win" | "draw" | "loss"

// Win 2, draw 1, loss 0; doubled while on fire (after two wins in a row).
export const applyResult = (s: Standing, outcome: Outcome, colour: "w" | "b", opponent: string) => {
  const onFire = s.streak >= 2
  const base = outcome === "win" ? 2 : outcome === "draw" ? 1 : 0
  const points = onFire ? base * 2 : base
  s.score += points
  s.games += 1
  s.sheet.push(points)
  if (outcome === "win") {
    s.wins += 1
    s.streak += 1
  } else {
    if (outcome === "draw") s.draws += 1
    else s.losses += 1
    s.streak = 0
  }
  if (colour === "w") s.whites += 1
  else s.blacks += 1
  s.last_opponent = opponent
  return points
}

export const rank = (list: Standing[]) =>
  [...list].sort((a, b) => b.score - a.score || b.wins - a.wins || a.games - b.games || a.joined_at - b.joined_at)

// Ranked with a minimum number of games: those who played enough come first (and only they
// get a place); the rest follow, unranked.
export const rankQualified = (list: Standing[], minGames: number) => {
  const need = Math.max(1, minGames)
  const sorted = rank(list)
  const ok = sorted.filter((s) => s.games >= need)
  const not = sorted.filter((s) => s.games < need)
  return [...ok.map((s, i) => ({ s, rank: i + 1 as number | null })), ...not.map((s) => ({ s, rank: null as number | null }))]
}

// Challenges: at most this many games between the same two players in one arena.
export const MAX_GAMES_SAME_PAIR = 2
export const CHALLENGE_MS = 30_000

// Pairs waiting players: closest in the standings first, never the same opponent twice in
// a row while anyone else is free. Colours go to whoever has had fewer of them.
export const pairPool = (waiting: Standing[]) => {
  const order = rank(waiting)
  const used = new Set<string>()
  const pairs: { white: Standing; black: Standing }[] = []
  for (let i = 0; i < order.length; i++) {
    const a = order[i]
    if (used.has(a.player_id)) continue
    let pick: Standing | null = null
    for (let j = i + 1; j < order.length; j++) {
      const b = order[j]
      if (used.has(b.player_id)) continue
      const rematch = a.last_opponent === b.player_id || b.last_opponent === a.player_id
      if (!rematch) {
        pick = b
        break
      }
      // A rematch only when these two are the only ones left.
      if (!pick) pick = b
    }
    if (!pick) continue
    const freeOthers = order.filter((p) => !used.has(p.player_id) && p !== a && p !== pick).length
    const rematch = a.last_opponent === pick.player_id || pick.last_opponent === a.player_id
    if (rematch && freeOthers > 0) continue
    used.add(a.player_id)
    used.add(pick.player_id)
    const aBalance = a.whites - a.blacks
    const bBalance = pick.whites - pick.blacks
    pairs.push(aBalance <= bBalance ? { white: a, black: pick } : { white: pick, black: a })
  }
  return pairs
}

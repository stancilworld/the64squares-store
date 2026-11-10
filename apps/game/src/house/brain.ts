import { OPENING_BY_KEY } from "./openings.js"
import type { Persona } from "./persona.js"

// How a House Player decides: which move, how long to think, when to resign or take a draw.
// Pure functions (randomness passed in), so they can be tested.

export type Candidate = { uci: string; san: string; cp: number; capture: boolean; check: boolean; quiet: boolean }

// --- Openings ------------------------------------------------------------------------------

// How deep a player knows its openings (in half-moves): beginners only the first moves.
export const bookDepth = (strength: number) => Math.round(Math.max(4, Math.min(18, 2 + strength / 140)))

// The next move from the persona's repertoire if the game is still on one of its lines.
export const bookMove = (played: string[], persona: Pick<Persona, "repertoire" | "strength">, side: "w" | "b", r: () => number) => {
  if (played.length >= bookDepth(persona.strength)) return null
  const keys = side === "w" ? persona.repertoire.white : persona.repertoire.black
  const next: string[] = []
  for (const key of keys) {
    for (const line of OPENING_BY_KEY.get(key)?.lines ?? []) {
      const moves = line.split(" ")
      if (moves.length <= played.length) continue
      if (played.every((m, i) => moves[i] === m)) next.push(moves[played.length])
    }
  }
  if (!next.length) return null
  // Lines that share a move make it likelier, like a favourite.
  return next[Math.floor(r() * next.length)]
}

// --- Searching -----------------------------------------------------------------------------

// Engine depth and how many alternatives to look at, by strength.
export const searchFor = (strength: number) => ({
  depth: Math.round(Math.max(3, Math.min(12, 1 + strength / 250))),
  multipv: strength < 1600 ? 8 : 6,
})

// How far from the best move a player tends to stray (centipawns), by strength.
const temperature = (strength: number) => Math.max(10, 400 * Math.exp(-strength / 1000))

// Chance of a real oversight on a given move.
const blunderRate = (strength: number) => Math.max(0.015, Math.min(0.22, 0.5 * Math.exp(-strength / 1000)))

// Picks a move the way a player of this strength would: usually a good one, sometimes the
// second-best or a natural-looking slip, and more slips when short of time.
export const chooseMove = (
  cands: Candidate[],
  o: { strength: number; aggression: number; pressure: number },
  r: () => number
): Candidate => {
  if (cands.length === 1) return cands[0]
  const best = Math.max(...cands.map((c) => c.cp))
  const strength = o.strength * (1 - 0.25 * o.pressure)
  // Even weak players see mate in one and a free queen most of the time.
  const forced = cands.find((c) => c.cp >= 9000)
  if (forced && r() < Math.min(0.97, 0.55 + strength / 2500)) return forced
  if (r() < blunderRate(strength) * (1 + o.pressure)) {
    // A slip: a natural-looking move that isn't losing outright.
    const slips = cands.filter((c) => best - c.cp > 60 && best - c.cp < 900 && c.cp > -9000)
    if (slips.length) return slips[Math.floor(r() * slips.length)]
  }
  const t = temperature(strength) * (1 + o.pressure)
  const weights = cands.map((c) => {
    let w = Math.exp(-(best - c.cp) / t)
    // Style: attackers like captures and checks, calm players like quiet moves.
    if (c.capture || c.check) w *= 1 + 0.35 * o.aggression
    else if (c.quiet) w *= 1 - 0.2 * o.aggression
    return Math.max(0, w)
  })
  const total = weights.reduce((s, w) => s + w, 0)
  let x = r() * total
  for (let i = 0; i < cands.length; i++) {
    x -= weights[i]
    if (x <= 0) return cands[i]
  }
  return cands[0]
}

// --- Thinking time -------------------------------------------------------------------------

// A random factor with a long tail (most moves near the average, a few much longer).
const lognormal = (r: () => number, sigma: number) => {
  const u = Math.max(1e-9, r())
  const v = r()
  return Math.exp(sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v))
}

export type TimeSituation = {
  initial_ms: number
  increment_ms: number
  left_ms: number
  opp_left_ms: number
  ply: number
  // 0 obvious (one sensible move, a recapture) … 1 hard (many close options).
  complexity: number
  book: boolean
  pace: number
}

// How long to think before moving (ms).
export const thinkMs = (s: TimeSituation, r: () => number) => {
  // First moves don't use the clock but must come within 30 seconds.
  if (s.ply < 2) return 900 + r() * 2600
  const moveNo = Math.floor(s.ply / 2) + 1
  const movesLeft = Math.max(22, 45 - moveNo * 0.5)
  // Bullet players move on instinct; slower games leave room to think.
  const speed = s.initial_ms <= 60_000 ? 0.6 : s.initial_ms <= 180_000 ? 0.7 : s.initial_ms <= 300_000 ? 0.85 : 1
  const budget = (s.left_ms / movesLeft) * speed + s.increment_ms * 0.85
  let t: number
  if (s.book) t = Math.min(budget * 0.5, 600 + r() * Math.min(2400, s.initial_ms / 120))
  else {
    // Early middlegame and hard positions take longest; recaptures are quick.
    const phase = moveNo < 8 ? 0.7 : moveNo < 25 ? 1.1 : 0.9
    t = budget * phase * (0.3 + 1.5 * s.complexity) * lognormal(r, 0.5)
    // Now and then a long think at a critical moment.
    if (s.complexity > 0.6 && r() < 0.08) t *= 2.2
  }
  t *= s.pace
  // Short of time: hurry, and keep some reserve.
  const reserve = s.left_ms - Math.max(1500, s.initial_ms * 0.04)
  if (reserve < t) t = Math.max(250, reserve * 0.35)
  if (s.left_ms < 10_000) t = Math.min(t, 300 + r() * 900)
  // Ahead on the clock in a quick game: no need to burn it.
  if (s.left_ms > s.opp_left_ms * 2 && s.initial_ms <= 180_000) t *= 0.8
  return Math.round(Math.max(220, Math.min(t, s.left_ms * 0.33)))
}

// How hard the choice is: one clearly best move (or one legal move) is easy.
export const complexityOf = (cands: Candidate[], legal: number) => {
  if (legal <= 1 || cands.length <= 1) return 0
  const best = cands[0].cp
  const close = cands.filter((c) => best - c.cp < 40).length
  const gap = best - (cands[1]?.cp ?? best)
  let c = Math.min(1, (close - 1) / 4) * 0.6 + Math.min(1, legal / 40) * 0.25
  if (gap > 250) c *= 0.4 // an obvious move (a recapture, the only defence)
  if (Math.abs(best) > 800) c *= 0.6 // the game is decided
  return Math.max(0.05, Math.min(1, c + 0.15))
}

// Share of the starting time already used, as "pressure" 0…1.
export const pressureOf = (left_ms: number, initial_ms: number) => {
  const frac = left_ms / Math.max(1, initial_ms)
  return frac > 0.2 ? 0 : Math.min(1, (0.2 - frac) / 0.2)
}

// --- Resigning and draws ------------------------------------------------------------------

// Resign after a few moves of being clearly lost (stronger and tidier players resign sooner;
// some play on to mate). Never while the opponent is about to run out of time.
export const shouldResign = (o: { evalHistory: number[]; resigns: number; strength: number; opp_left_ms: number }, r: () => number) => {
  if (o.resigns < 0.15 || o.opp_left_ms < 20_000) return false
  const limit = -(1500 - 900 * o.resigns)
  const recent = o.evalHistory.slice(-3)
  return recent.length === 3 && recent.every((e) => e < limit) && r() < 0.6
}

// Answer to a draw offer: take it when the position is level late on, or when worse.
export const acceptDraw = (o: { eval: number; ply: number; strength: number }, r: () => number) => {
  if (o.eval < -150) return r() < 0.9
  if (o.ply >= 50 && Math.abs(o.eval) < 60) return r() < 0.7
  if (o.ply >= 30 && Math.abs(o.eval) < 30) return r() < 0.35
  return false
}

// Offer a draw itself: rarely, in a long level endgame.
export const offerDraw = (o: { evalHistory: number[]; ply: number }, r: () => number) =>
  o.ply >= 70 && o.evalHistory.slice(-6).length === 6 && o.evalHistory.slice(-6).every((e) => Math.abs(e) < 25) && r() < 0.15

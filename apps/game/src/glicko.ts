// Glicko-2 rating updates for one game at a time (Glickman, 2012).
// Ratings move a lot for new players (high deviation) and settle as they play.

export type Rating = { rating: number; rd: number; vol: number }

export const DEFAULT_RATING: Rating = { rating: 1500, rd: 350, vol: 0.06 }
// Below this deviation a rating counts as established (shown without "?").
export const PROVISIONAL_RD = 110
const MIN_RD = 45
const MAX_RD = 350
const TAU = 0.5
const SCALE = 173.7178

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI))
const E = (mu: number, muj: number, phij: number) => 1 / (1 + Math.exp(-g(phij) * (mu - muj)))

// Deviation grows again while a player is away (about one rating period per week).
export const ageRating = (r: Rating, idleDays: number): Rating => {
  if (idleDays <= 0) return r
  const phi = r.rd / SCALE
  const sigma = r.vol
  const periods = Math.min(idleDays / 7, 52)
  const rd = Math.min(MAX_RD, Math.sqrt(phi * phi + periods * sigma * sigma) * SCALE)
  return { ...r, rd }
}

// score: 1 win, 0.5 draw, 0 loss for `me` against `opp`.
export const update = (me: Rating, opp: Rating, score: number): Rating => {
  const mu = (me.rating - 1500) / SCALE
  const phi = me.rd / SCALE
  const muj = (opp.rating - 1500) / SCALE
  const phij = opp.rd / SCALE
  const e = E(mu, muj, phij)
  const v = 1 / (g(phij) ** 2 * e * (1 - e))
  const delta = v * g(phij) * (score - e)

  // New volatility (Illinois algorithm).
  const a = Math.log(me.vol ** 2)
  const f = (x: number) =>
    (Math.exp(x) * (delta ** 2 - phi ** 2 - v - Math.exp(x))) / (2 * (phi ** 2 + v + Math.exp(x)) ** 2) - (x - a) / TAU ** 2
  let A = a
  let B: number
  if (delta ** 2 > phi ** 2 + v) B = Math.log(delta ** 2 - phi ** 2 - v)
  else {
    let k = 1
    while (f(a - k * TAU) < 0) k++
    B = a - k * TAU
  }
  let fA = f(A)
  let fB = f(B)
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA)
    const fC = f(C)
    if (fC * fB <= 0) {
      A = B
      fA = fB
    } else fA /= 2
    B = C
    fB = fC
  }
  const vol = Math.exp(A / 2)

  const phiStar = Math.sqrt(phi ** 2 + vol ** 2)
  const phiNew = 1 / Math.sqrt(1 / phiStar ** 2 + 1 / v)
  const muNew = mu + phiNew ** 2 * g(phij) * (score - e)
  return {
    rating: Math.max(100, Math.min(3500, muNew * SCALE + 1500)),
    rd: Math.max(MIN_RD, Math.min(MAX_RD, phiNew * SCALE)),
    vol,
  }
}

export type Speed = "bullet" | "blitz" | "rapid" | "classical"

// By the expected game length: base time plus 40 moves of increment (as on lichess).
export const speedOf = (initial_ms: number, increment_ms: number): Speed => {
  const est = (initial_ms + 40 * increment_ms) / 1000
  if (est < 180) return "bullet"
  if (est < 480) return "blitz"
  if (est < 1500) return "rapid"
  return "classical"
}

import { COUNTRIES, type Country } from "./names.js"
import { BLACK_VS_D4, BLACK_VS_E4, WHITE_FIRST } from "./openings.js"

// A House Player: a computer opponent with its own name, place, strength and habits.
// Everything is made from a number (the seed), so the same roster comes back after a restart.

export const HOUSE_PREFIX = "house_"
export const isHouse = (id: string | null | undefined) => !!id && id.startsWith(HOUSE_PREFIX)

export type Persona = {
  id: string
  username: string
  display_name: string
  country: string
  city: string
  bio: string
  // How well it plays, on the site's rating scale.
  strength: number
  // Thinking speed: below 1 moves faster than most, above 1 slower.
  pace: number
  // -1 calm and solid … +1 likes captures, checks and attacks.
  aggression: number
  // 0 never resigns (plays to mate) … 1 resigns as soon as it's clearly lost.
  resigns: number
  // How often it says hello / good game.
  chatty: number
  repertoire: { white: string[]; black: string[] }
  avatar: boolean
}

// Small deterministic random generator (mulberry32).
export const rng = (seed: number) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)]

const pickCountry = (r: () => number): Country => {
  const total = COUNTRIES.reduce((s, c) => s + c.weight, 0)
  let x = r() * total
  for (const c of COUNTRIES) {
    x -= c.weight
    if (x <= 0) return c
  }
  return COUNTRIES[0]
}

const ascii = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ı/g, "i")
    .replace(/ł/g, "l")
    .replace(/ø/g, "o")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

const CHESS_WORDS = ["knight", "rook", "bishop", "pawn", "queen", "castle", "gambit", "endgame", "fianchetto", "zugzwang", "checkmate", "blitz", "e4", "d4", "sicilian", "caro"]

const usernameFor = (r: () => number, first: string, last: string) => {
  const f = ascii(first.split(" ")[0])
  const ln = ascii(last.split(" ").slice(-1)[0])
  const n2 = String(Math.floor(r() * 90) + 10)
  const year = String(Math.floor(r() * 30) + 1975)
  const styles = [
    () => `${f}_${ln}`,
    () => `${f}${ln}`,
    () => `${f}${n2}`,
    () => `${f[0]}${ln}${n2}`,
    () => `${f}_${pick(r, CHESS_WORDS)}`,
    () => `${pick(r, CHESS_WORDS)}_${f}`,
    () => `${f}${year}`,
    () => `${ln}_${f[0]}`,
    () => `the_${f}`,
    () => `${f}.${ln}`.replace(".", "_"),
  ]
  return pick(r, styles)().replace(/[^a-z0-9_]/g, "").slice(0, 20)
}

// Strength spread like a real club: most between 700 and 1700, fewer at the ends.
const strengthFor = (r: () => number) => {
  // Mostly a bell curve centred near 1200; one in six anywhere from 400 to 2400, so there
  // are opponents for complete beginners and for strong players too.
  const s = r() < 0.17 ? 400 + r() * 2000 : 350 + ((r() + r() + r() + r()) / 4) * 1750
  return Math.round(Math.max(400, Math.min(2400, s)) / 5) * 5
}

const BIOS = [
  "Evening blitz after work.",
  "Learning a little every day.",
  "Always up for a rematch.",
  "Endgames are my favourite part.",
  "Trying to stop hanging pieces.",
  "Quick games on the bus.",
  "Weekend player.",
  "Tactics over theory.",
  "Slow and steady.",
  "Chess and chai.",
  "Back to chess after many years.",
  "Puzzle a day.",
  "Still learning the openings.",
  "I like long games.",
  "Good game is all I ask.",
]

const OPENING_BIO: Record<string, string> = {
  london: "London System every game.",
  "kings-gambit": "King's Gambit, always.",
  sicilian: "Sicilian player.",
  caro: "Caro-Kann fan.",
  french: "French Defence loyalist.",
  kid: "King's Indian when I can.",
  scandi: "Scandinavian, of course.",
  english: "1.c4 player.",
  italian: "Italian Game fan.",
  dutch: "I play the Dutch.",
}

export const makePersona = (seed: number): Omit<Persona, "id"> => {
  const r = rng(seed * 7919 + 17)
  const c = pickCountry(r)
  const first = pick(r, c.first)
  const last = pick(r, c.last)
  const username = usernameFor(r, first, last)
  const shown = r()
  const display_name = shown < 0.72 ? `${first} ${last}` : shown < 0.86 ? first : username
  const strength = strengthFor(r)
  const aggression = Math.round((r() * 2 - 1) * 100) / 100

  // Repertoire: one first move as White with matching answers; one answer to 1.e4 and to 1.d4.
  const fm = r()
  const white: string[] = []
  if (fm < 0.62) {
    white.push(aggression > 0.55 && r() < 0.5 ? "kings-gambit" : pick(r, ["italian", "italian", "ruy", "scotch"]))
    white.push("open-sicilian", "white-vs-french", "white-vs-caro", "white-vs-scandi")
  } else if (fm < 0.9) white.push(pick(r, WHITE_FIRST.d4))
  else white.push(pick(r, WHITE_FIRST.flank))
  const vsE4 = pick(r, BLACK_VS_E4)
  const vsD4 = pick(r, BLACK_VS_D4)
  const black = [vsE4, vsD4, "vs-flank"]

  const signature = OPENING_BIO[white[0]] ?? OPENING_BIO[vsE4] ?? OPENING_BIO[vsD4]
  const b = r()
  const bio = b < 0.45 ? "" : b < 0.6 && signature ? signature : pick(r, BIOS)

  return {
    username,
    display_name,
    country: c.code,
    city: r() < 0.8 ? pick(r, c.cities) : "",
    bio,
    strength,
    pace: Math.round((0.65 + r() * 0.75) * 100) / 100,
    aggression,
    resigns: Math.round(Math.min(1, Math.max(0, (strength - 600) / 1400 + (r() - 0.5) * 0.4)) * 100) / 100,
    chatty: Math.round(r() * 100) / 100,
    repertoire: { white, black },
    avatar: r() < 0.42,
  }
}

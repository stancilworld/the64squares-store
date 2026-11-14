export type Tournament = {
  id: string
  title: string
  handle: string
  summary: string | null
  description: string
  format: "arena" | "swiss" | "round_robin" | "knockout"
  format_label: string
  mode: "online" | "offline"
  time_control: string
  rounds: number | null
  starts_at: string
  ends_at: string | null
  registration_closes_at: string | null
  venue: string | null
  capacity: number | null
  entry_fee: number
  rating_min: number | null
  rating_max: number | null
  prizes: string | null
  rules: string | null
  image_url: string | null
  status: "published" | "cancelled" | "completed"
  registered: number
  places_left: number | null
  registration_open: boolean
  registration_note: string | null
  entry: "pass" | "free" | "fee"
  pass_cost: number
  check_in_minutes: number
  min_players: number
  round_break_seconds: number
  knockout_games: number
  armageddon: boolean
  age_min: number | null
  age_max: number | null
  prize_list: Prize[] | null
  category_prizes: { category: string; title: string }[] | null
  tagline: string | null
  accent: string | null
  featured: boolean
  stream_url: string | null
  paused: boolean
  cancel_reason: string | null
  results_final_at: string | null
  certificates: boolean
  // "scheduled": players register, pairings are made when registration closes and each
  // round starts at its time. "checkin": players check in before the start.
  start_mode?: "checkin" | "scheduled"
  round_times?: string[] | null
  join_minutes?: number
  arena_pairing?: "auto" | "challenge"
  min_games?: number
}

export type Prize = { place: string; title: string; detail?: string | null; image_url?: string | null; product_handle?: string | null }

export type Ticket = {
  id: string
  ticket_code: string
  status: "confirmed" | "cancelled" | "withdrawn"
  checked_in_at: string | null
  player_name: string
  email: string
  phone: string | null
  fide_id: string | null
  rating: number | null
  city: string | null
  created_at: string
  qr_url: string
  can_cancel: boolean
  pass_used?: boolean
  check_in?: { opens: string; closes: string } | null
  can_check_in?: boolean
  final_rank?: number | null
  score?: number | null
  review?: "pending" | "cleared" | "disqualified" | null
  prize_title?: string | null
  prize_status?: "due" | "address" | "shipped" | "delivered" | null
  certificate_no?: string | null
  prize_tracking?: string | null
  prize_address?: Record<string, string> | null
  can_send_address?: boolean
  coupon_code?: string | null
  tournament: {
    id: string
    title: string
    handle: string
    mode: "online" | "offline"
    format_label: string
    time_control: string
    starts_at: string
    venue: string | null
    entry_fee: number
    status: string
    entry?: "pass" | "free" | "fee"
    format?: string
    image_url?: string | null
    results_final_at?: string | null
    results_at?: string | null
  }
}

export type Certificate = {
  number: string
  player_name: string
  city: string | null
  rank: number
  score: number | null
  players: number
  final: boolean
  issued_at: string
  tournament: { title: string; handle: string; format: string; time_control: string; starts_at: string }
}

// ---- The tournament engine's live view (game server /tourneys/:id) ----

export type TSide = { id: string; name: string; rating: number | null; seed: number | null } | null
export type LiveBoard = {
  game_id: string
  white: { id: string; name: string; rating: number | null } | null
  black: { id: string; name: string; rating: number | null } | null
  fen: string
  last_move: { from: string; to: string } | null
  clocks: { w: number; b: number }
  clock_running: "w" | "b" | null
  moves: number
  server_now: number
}
export type TStats = {
  games: number
  white_wins?: number
  black_wins?: number
  draws?: number
  average_moves?: number
  fastest?: { game_id: string; moves: number; winner: string } | null
  longest?: { game_id: string; moves: number } | null
  upset?: { game_id: string; winner: string; loser: string; diff: number } | null
  most_wins?: { id: string; name: string; wins: number } | null
  openings?: { moves: string; count: number; name: string }[]
  endings?: Record<string, number>
}
export type SwissStanding = {
  rank: number
  id: string
  name: string
  rating: number
  points: number
  wins: number
  games: number
  buchholz: number
  sb: number
  withdrawn: boolean
  sheet: { round: number; opponent: string | null; colour: "w" | "b" | null; mark: string; game_id: string | null }[]
}
export type BracketMatch = {
  round: number
  board: number
  a: TSide
  b: TSide
  score: [number, number]
  winner: string | null
  decided_by: string | null
  live: boolean
  games: { game_no: number; white_id: string; black_id: string | null; result: string | null; forfeit: boolean; armageddon: boolean; game_id: string | null; live: boolean }[]
}
export type TourneyView = {
  id: string
  handle: string
  title: string
  format: string
  paused: boolean
  server_now: number
  state: { phase: "locked" | "running" | "finished" | "cancelled_low"; round: number; round_done_at: number | null; next_round_at: number | null; started_at: number; finished_at: number | null; note: string | null } | null
  entrants: { id: string; name: string; rating: number; seed: number; withdrawn: boolean }[]
  live: LiveBoard[]
  stats: TStats
  games: { id: string; white: { id: string; name: string; rating: number | null }; black: { id: string; name: string; rating: number | null }; result: string; reason: string; moves: number; ended_at: number | null }[]
  rounds?: number
  // Round robin: how many times each pair plays (1 or 2).
  cycles?: number
  standings?: SwissStanding[]
  pairings?: { round: number; games: { board: number; white: TSide; black: TSide; result: string | null; forfeit: boolean; game_id: string | null; live: boolean; fixed: boolean }[] }[]
  bracket?: { size: number; total_rounds: number; rounds: { round: number; name: string; matches: BracketMatch[] }[] }
  champion?: string | null
  start_mode?: "checkin" | "scheduled"
  round_times?: (number | null)[]
  join_minutes?: number
  locks_at?: number | null
  upcoming?: { round: number; at: number | null; fixed: boolean; games: { board: number; white: TSide; black: TSide }[] } | null
}
export type TourneySummary = { id: string; phase: string | null; round: number; note: string | null; entrants: number; checked_in: number; live_games: number; leader: string | null }

export const FORMAT_COLOUR: Record<string, string> = { arena: "#ffb300", swiss: "#35c6d4", knockout: "#ff5d5d", round_robin: "#9b8cff" }

// "3+2" → Bullet / Blitz / Rapid / Classical.
export const speedLabel = (tc: string) => {
  const m = /^(\d+(?:\.\d+)?)\+(\d+)$/.exec(tc.trim())
  if (!m) return "Blitz"
  const est = Number(m[1]) * 60 + 40 * Number(m[2])
  return est < 180 ? "Bullet" : est < 480 ? "Blitz" : est < 1500 ? "Rapid" : "Classical"
}

// How long an event runs (for the timeline), when it has no end time.
export const estimatedEnd = (t: { format: string; time_control: string; starts_at: string; ends_at: string | null; rounds: number | null; registered?: number; knockout_games?: number; round_break_seconds?: number }) => {
  if (t.ends_at) return new Date(t.ends_at).getTime()
  const m = /^(\d+(?:\.\d+)?)\+(\d+)$/.exec(t.time_control.trim())
  const game = m ? (Number(m[1]) * 60 * 2 + 80 * Number(m[2])) * 1000 : 600_000
  const breakMs = (t.round_break_seconds ?? 60) * 1000
  const players = Math.max(4, t.registered ?? 8)
  const rounds = t.format === "knockout" ? Math.ceil(Math.log2(players)) * Math.max(1, t.knockout_games ?? 1) : t.rounds ?? Math.max(3, Math.ceil(Math.log2(players)))
  const start = new Date(t.starts_at).getTime()
  return t.format === "arena" ? start + 3600_000 : start + rounds * (game + breakMs)
}

const IST: Intl.DateTimeFormatOptions = { timeZone: "Asia/Kolkata" }

// "Sun, 22 Nov" and "6:00 pm IST", shown in India time wherever the visitor is.
export const eventDay = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { ...IST, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso))
export const eventDate = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { ...IST, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso))
export const eventTime = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { ...IST, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) + " IST"
// Parts for a calendar-style date block.
export const dateBlock = (iso: string) => {
  const d = new Date(iso)
  const part = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-IN", { ...IST, ...o }).format(d)
  return { day: part({ day: "numeric" }), month: part({ month: "short" }), weekday: part({ weekday: "short" }) }
}

export const whereText = (t: { mode: string; venue: string | null }) =>
  t.mode === "online" ? "Online, on The 64 Squares" : t.venue?.split("\n")[0] || "Venue to be announced"

export const ratingText = (t: { rating_min: number | null; rating_max: number | null }) =>
  t.rating_min != null && t.rating_max != null
    ? `Rated ${t.rating_min}–${t.rating_max}`
    : t.rating_min != null
      ? `Rated ${t.rating_min} and above`
      : t.rating_max != null
        ? `Rated up to ${t.rating_max}`
        : "Open to all"

export type PublicPlayer = { id: string; name: string; username: string | null; avatar: string | null; rating: number | null; state: string | null; checked_in: boolean }

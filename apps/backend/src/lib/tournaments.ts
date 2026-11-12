import crypto from "node:crypto"
import type { AuthenticatedMedusaRequest } from "@medusajs/framework/http"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"

// Tournaments: shared rules and the shapes the website and admin receive.

export const FORMAT_LABELS: Record<string, string> = {
  arena: "Arena",
  swiss: "Swiss",
  round_robin: "Round robin",
  knockout: "Knockout",
}

type Row = Record<string, any>

// "T64-7KQ4MX": no 0/O, 1/I/L, so it can be read out over the phone.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
export const newTicketCode = () =>
  "T64-" + Array.from({ length: 6 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join("")

export const normaliseTicketCode = (raw: string) => {
  const s = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  const body = s.startsWith("T64") ? s.slice(3) : s
  return body.length === 6 ? `T64-${body}` : null
}

const adminBase = () => (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")

// The QR code on a ticket opens this page in the admin, where staff check the player in.
export const checkInUrl = (code: string) => `${adminBase()}/app/tournaments/check-in?code=${encodeURIComponent(code)}`

const time = (d: unknown) => (d ? new Date(d as string).getTime() : NaN)

// Registration closes at the deadline, or when the event starts if there is none.
export const registrationState = (t: Row, confirmed: number, now = Date.now()) => {
  if (t.status === "cancelled") return { open: false, reason: "This tournament was cancelled." }
  if (t.status === "completed") return { open: false, reason: "This tournament has finished." }
  if (t.status !== "published") return { open: false, reason: "Registration is not open yet." }
  const closes = time(t.registration_closes_at ?? t.starts_at)
  if (!Number.isNaN(closes) && now >= closes) return { open: false, reason: "Registration has closed." }
  if (t.capacity != null && confirmed >= t.capacity) return { open: false, reason: "All places are taken." }
  return { open: true, reason: null as string | null }
}

export const countConfirmed = async (container: MedusaContainer, tournamentIds: string[]) => {
  const counts = new Map<string, number>(tournamentIds.map((id) => [id, 0]))
  if (!tournamentIds.length) return counts
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "tournament_registration",
    fields: ["tournament_id", "status"],
    filters: { tournament_id: tournamentIds, status: "confirmed" } as never,
  })
  for (const r of data as Row[]) counts.set(r.tournament_id, (counts.get(r.tournament_id) ?? 0) + 1)
  return counts
}

const PUBLIC_FIELDS = [
  "id", "title", "handle", "summary", "description", "format", "mode", "time_control", "rounds",
  "starts_at", "ends_at", "registration_closes_at", "venue", "capacity", "entry_fee",
  "rating_min", "rating_max", "prizes", "rules", "image_url", "status",
  "entry", "pass_cost", "check_in_minutes", "min_players", "round_break_seconds", "knockout_games", "armageddon",
  "age_min", "age_max", "prize_list", "category_prizes", "tagline", "accent", "featured", "stream_url", "paused",
  "cancel_reason", "results_final_at", "certificates",
] as const

// Check-in: opens `check_in_minutes` before the start and closes at the start.
export const checkInWindow = (t: Row) => {
  const starts = time(t.starts_at)
  const minutes = Number(t.check_in_minutes ?? 0)
  if (t.mode !== "online" || minutes <= 0 || Number.isNaN(starts)) return null
  return { opens: new Date(starts - minutes * 60_000).toISOString(), closes: new Date(starts).toISOString() }
}

export const checkInOpen = (t: Row, now = Date.now()) => {
  const w = checkInWindow(t)
  return !!w && t.status === "published" && now >= time(w.opens) && now < time(w.closes)
}

// "3+2" → bullet/blitz/rapid/classical, as the game server rates it.
export const speedOfTc = (tc: string) => {
  const m = /^(\d+(?:\.\d+)?)\+(\d+)$/.exec(String(tc).trim())
  if (!m) return "blitz"
  const est = Number(m[1]) * 60 + 40 * Number(m[2])
  return est < 180 ? "bullet" : est < 480 ? "blitz" : est < 1500 ? "rapid" : "classical"
}

export const TOURNAMENT_FIELDS = [...PUBLIC_FIELDS, "coupon_code", "results_at"] as string[]

// What the website shows about a tournament.
export const publicTournament = (t: Row, confirmed: number): Row => {
  const out: Row = {}
  for (const k of PUBLIC_FIELDS) out[k] = t[k] ?? null
  const state = registrationState(t, confirmed)
  return {
    ...out,
    format_label: FORMAT_LABELS[t.format] ?? t.format,
    registered: confirmed,
    places_left: t.capacity != null ? Math.max(t.capacity - confirmed, 0) : null,
    registration_open: state.open,
    registration_note: state.reason,
  }
}

// A player's ticket, for their account page and email.
export const ticketView = (r: Row, t: Row) => ({
  id: r.id,
  ticket_code: r.ticket_code,
  status: r.status,
  checked_in_at: r.checked_in_at ?? null,
  player_name: r.player_name,
  email: r.email,
  phone: r.phone ?? null,
  fide_id: r.fide_id ?? null,
  rating: r.rating ?? null,
  city: r.city ?? null,
  created_at: r.created_at,
  qr_url: checkInUrl(r.ticket_code),
  // Players can give up their place until the event starts (and get their pass back).
  can_cancel: r.status === "confirmed" && new Date(t.starts_at).getTime() > Date.now(),
  pass_used: !!r.pass_entry_id,
  check_in: checkInWindow(t),
  can_check_in: r.status === "confirmed" && !r.checked_in_at && checkInOpen(t),
  final_rank: r.final_rank ?? null,
  score: r.score ?? null,
  review: r.review ?? null,
  prize_title: r.prize_title ?? null,
  prize_status: r.prize_status ?? null,
  certificate_no: r.certificate_no ?? null,
  prize_tracking: r.prize_tracking ?? null,
  prize_address: r.prize_address ?? null,
  // Winners send an address once the result is final.
  can_send_address: r.prize_status === "address" && r.review !== "disqualified",
  // The shop thank-you code, for everyone who played.
  coupon_code: r.final_rank != null && r.status === "confirmed" ? (t.coupon_code ?? null) : null,
  tournament: {
    id: t.id,
    title: t.title,
    handle: t.handle,
    mode: t.mode,
    format_label: FORMAT_LABELS[t.format] ?? t.format,
    time_control: t.time_control,
    starts_at: t.starts_at,
    venue: t.venue ?? null,
    entry_fee: t.entry_fee ?? 0,
    entry: t.entry ?? "pass",
    status: t.status,
    format: t.format,
    image_url: t.image_url ?? null,
    results_final_at: t.results_final_at ?? null,
    results_at: t.results_at ?? null,
  },
})

// "Sat, 15 Nov 2026, 6:00 pm IST" for emails.
export const formatWhen = (d: unknown) =>
  new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(d as string)) + " IST"

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v)
  // A leading = + - @ would run as a formula in Excel.
  const safe = /^[=+\-@]/.test(s) && !/^[+\-]?[0-9 ()-]+$/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

export const registrationsCsv = (rows: Row[]) => {
  const head = ["Ticket", "Status", "Checked in", "Player", "Email", "Phone", "FIDE ID", "Rating", "City", "Registered"]
  const lines = rows.map((r) =>
    [
      r.ticket_code,
      r.status,
      r.checked_in_at ? formatWhen(r.checked_in_at) : "",
      r.player_name,
      r.email,
      r.phone,
      r.fide_id,
      r.rating,
      r.city,
      r.created_at ? formatWhen(r.created_at) : "",
    ]
      .map(csvCell)
      .join(",")
  )
  return [head.join(","), ...lines].join("\n")
}

// One of the signed-in customer's own tickets, by its code (404 for anyone else's).
export const loadMyTicket = async (req: AuthenticatedMedusaRequest) => {
  const code = normaliseTicketCode(String(req.params.code ?? ""))
  const query = req.scope.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = code
    ? await query.graph({
        entity: "tournament_registration",
        fields: ["*", ...TOURNAMENT_FIELDS.map((f) => `tournament.${f}`)],
        filters: { ticket_code: code, customer_id: req.auth_context.actor_id } as never,
      })
    : { data: [] }
  const r = data[0]
  if (!r?.tournament) {
    throw new MedusaError(MedusaError.Types.NOT_FOUND, "Ticket not found")
  }
  return r
}


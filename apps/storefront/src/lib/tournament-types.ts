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
}

export type Ticket = {
  id: string
  ticket_code: string
  status: "confirmed" | "cancelled"
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
  }
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

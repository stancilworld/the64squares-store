// The "Arrives by" date on the product page: today (India time) plus the days to make or
// pack the order plus the days in transit.

const IST_OFFSET_MIN = 5.5 * 60
const DAY = 24 * 60 * 60 * 1000

// Today's date in India as a UTC midnight timestamp (so adding days never trips on time zones).
export const indiaToday = (now: number) => {
  const ist = new Date(now + IST_OFFSET_MIN * 60 * 1000)
  return Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate())
}

export const arrivalDate = (now: number, days: number) => new Date(indiaToday(now) + Math.max(0, days) * DAY)

const fmt = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
// "Mon, 16 Nov"
export const formatArrival = (d: Date) => fmt.format(d)

const fmtDay = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
// "16 Nov", for a sale end date.
export const formatShortDate = (iso: string) => fmtDay.format(new Date(iso))

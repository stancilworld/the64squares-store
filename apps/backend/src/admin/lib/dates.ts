// <input type="datetime-local"> works in the browser's local time (India); the server stores ISO.
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

export const formatWhen = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    : ""

export const isFuture = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() > Date.now()
export const isPast = (iso: string | null | undefined) => !!iso && new Date(iso).getTime() <= Date.now()

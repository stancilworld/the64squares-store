import { estimatedEnd } from "@/lib/tournament-types"
import { getTournament } from "@/lib/tournaments"
import { absoluteUrl } from "@/lib/seo"

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n")

// An .ics file: "Add to calendar" for a tournament, with a reminder 30 minutes before.
export async function GET(_req: Request, ctx: RouteContext<"/api/tournaments/[handle]/calendar">) {
  const t = await getTournament((await ctx.params).handle)
  if (!t) return new Response("Not found", { status: 404 })
  const url = absoluteUrl(`/play/tournaments/${t.handle}`)
  const start = new Date(t.starts_at).getTime()
  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The 64 Squares//Tournaments//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${t.id}@the64squares.in`,
    `DTSTAMP:${stamp(Date.now())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(estimatedEnd(t))}`,
    `SUMMARY:${esc(t.title)}`,
    `DESCRIPTION:${esc(`${t.format_label} chess tournament, ${t.time_control}.${t.check_in_minutes > 0 ? ` Check in ${t.check_in_minutes} minutes before the start.` : ""} ${url}`)}`,
    `URL:${url}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc(t.title)}`,
    `TRIGGER:-PT${Math.max(10, t.check_in_minutes || 30)}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n")
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": `attachment; filename="${t.handle}.ics"` } })
}

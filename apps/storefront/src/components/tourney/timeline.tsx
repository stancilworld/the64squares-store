"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FORMAT_COLOUR } from "@/lib/tournament-types"
import { useNow } from "./countdown"
import { nowMs } from "@/lib/clock"

export type TimelineEvent = {
  id: string
  handle: string
  title: string
  format: string
  format_label: string
  time_control: string
  speed: string
  starts_at: number
  ends_at: number
  registered: number
  capacity: number | null
  phase: "upcoming" | "live" | "over" | "cancelled"
  live_games: number
  leader: string | null
  entry: string
  featured: boolean
}

// Zoom: pixels per hour. Zoomed out shows the whole day; zoomed in shows a couple of hours.
const ZOOMS = [36, 56, 84, 120, 168, 240]
const DEFAULT_ZOOM = 168
const LANE_PX = 96
// Narrowest a card gets (short events still show their title).
const cardMin = (hourPx: number) => (hourPx >= 120 ? 240 : 180)
const IST = "Asia/Kolkata"
const dayKey = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(new Date(ms))
const dayStart = (key: string) => new Date(`${key}T00:00:00+05:30`).getTime()
const hm = (ms: number) => new Intl.DateTimeFormat("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(ms))
const dayLabel = (key: string, today: string) => {
  const d = new Date(`${key}T12:00:00+05:30`)
  const diff = Math.round((dayStart(key) - dayStart(today)) / 86_400_000)
  if (diff === 0) return "Today"
  if (diff === 1) return "Tomorrow"
  if (diff === -1) return "Yesterday"
  return new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short" }).format(d)
}

// Puts each event in the first row where it doesn't overlap another.
const lanesFor = (events: TimelineEvent[], hourPx: number) => {
  const ends: number[] = []
  const lane = new Map<string, number>()
  for (const e of [...events].sort((a, b) => a.starts_at - b.starts_at)) {
    const visualEnd = Math.max(e.ends_at, e.starts_at + ((cardMin(hourPx) + 20) / hourPx) * 3600_000)
    let i = ends.findIndex((end) => end <= e.starts_at)
    if (i === -1) {
      i = ends.length
      ends.push(visualEnd)
    } else ends[i] = visualEnd
    lane.set(e.id, i)
  }
  return { lane, count: Math.max(1, ends.length) }
}

const TYPES = [
  { value: "all", label: "All types" },
  { value: "arena", label: "Arena" },
  { value: "swiss", label: "Swiss" },
  { value: "round_robin", label: "Round robin" },
  { value: "knockout", label: "Knockout" },
]
const SPEEDS = ["All controls", "Bullet", "Blitz", "Rapid", "Classical"]

// The day's tournaments on a time line, like a TV guide: a red line marks now, each card spans
// its start to its end, and tapping one opens it.
export function TournamentTimeline({ events, initialDay }: { events: TimelineEvent[]; initialDay: string }) {
  const now = useNow() ?? 0
  const today = useMemo(() => (now ? dayKey(now) : initialDay), [now, initialDay])
  const [day, setDay] = useState(initialDay)
  const [type, setType] = useState("all")
  const [speed, setSpeed] = useState("All controls")
  const scroller = useRef<HTMLDivElement>(null)
  const [hourPx, setHourPx] = useState(DEFAULT_ZOOM)
  // The zoom for event handlers (kept in step by zoomTo, the only thing that changes it).
  const zoomRef = useRef(DEFAULT_ZOOM)

  // Zooms around the middle of what's on screen (or the pointer), so the same time stays in view.
  const zoomTo = useCallback((next: number, anchorX?: number) => {
    const el = scroller.current
    const prev = zoomRef.current
    if (!el || next === prev) return
    const ax = anchorX ?? el.clientWidth / 2
    const hourAt = (el.scrollLeft + ax) / prev
    zoomRef.current = next
    setHourPx(next)
    requestAnimationFrame(() => el.scrollTo({ left: Math.max(0, hourAt * next - ax) }))
  }, [])
  const step = (dir: 1 | -1) => {
    const i = ZOOMS.findIndex((z) => z >= zoomRef.current)
    const at = i === -1 ? ZOOMS.length - 1 : ZOOMS[i] === zoomRef.current ? i : dir > 0 ? i - 1 : i
    zoomTo(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, at + dir))])
  }
  const fitDay = () => {
    const el = scroller.current
    if (el) zoomTo(Math.max(20, Math.floor(el.clientWidth / 24)))
  }
  // Ctrl/⌘ + scroll (or a trackpad pinch) zooms.
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      const next = Math.round(Math.min(ZOOMS[ZOOMS.length - 1], Math.max(20, zoomRef.current * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))
      zoomTo(next, e.clientX - el.getBoundingClientRect().left)
    }
    el.addEventListener("wheel", onWheel, { passive: false })
    return () => el.removeEventListener("wheel", onWheel)
  }, [zoomTo])

  const start = dayStart(day)
  const end = start + 86_400_000
  const shown = events.filter(
    (e) => e.starts_at < end && e.ends_at > start && (type === "all" || e.format === type) && (speed === "All controls" || e.speed === speed)
  )
  const { lane, count } = lanesFor(shown, hourPx)
  const x = (ms: number) => ((Math.min(Math.max(ms, start), end) - start) / 3600_000) * hourPx
  // Hour labels every 1, 2 or 3 hours, so they don't crowd when zoomed out.
  const labelEvery = hourPx >= 60 ? 1 : hourPx >= 36 ? 2 : 3
  const days = useMemo(() => Array.from({ length: 9 }, (_, i) => dayKey(dayStart(initialDay) + (i - 1) * 86_400_000)), [initialDay])

  // Opens at the current time (or the first event of another day).
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const first = shown.length ? Math.min(...shown.map((e) => e.starts_at)) : start + 9 * 3600_000
    const target = day === dayKey(nowMs()) ? nowMs() - 3600_000 * 0.5 : first - 1800_000
    el.scrollTo({ left: Math.max(0, x(target) - 24), behavior: "smooth" })
    // Only when the day or the filters change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, type, speed])

  const select = "h-[42px] rounded-lg border border-[var(--g-line)] bg-[var(--g-panel)] px-3 text-[14px] text-[var(--g-text)] outline-none focus:border-[var(--g-accent)]"

  return (
    <section aria-label="Tournament timeline">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="t-type">
          Type
        </label>
        <select id="t-type" value={type} onChange={(e) => setType(e.target.value)} className={select}>
          {TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="t-speed">
          Time control
        </label>
        <select id="t-speed" value={speed} onChange={(e) => setSpeed(e.target.value)} className={select}>
          {SPEEDS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--g-line)] bg-[var(--g-panel)] p-1" role="group" aria-label="Zoom the timeline">
          <button type="button" onClick={() => step(-1)} disabled={hourPx <= ZOOMS[0]} aria-label="Zoom out" className="grid h-[32px] w-[34px] place-items-center rounded-md text-[20px] font-bold leading-none hover:bg-white/10 disabled:opacity-35">
            −
          </button>
          <button type="button" onClick={fitDay} className="h-[32px] rounded-md px-2.5 text-[13px] font-semibold text-[var(--g-muted)] hover:bg-white/10 hover:text-[var(--g-text)]">
            Whole day
          </button>
          <button type="button" onClick={() => step(1)} disabled={hourPx >= ZOOMS[ZOOMS.length - 1]} aria-label="Zoom in" className="grid h-[32px] w-[34px] place-items-center rounded-md text-[20px] font-bold leading-none hover:bg-white/10 disabled:opacity-35">
            +
          </button>
        </div>
        <div className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 py-1" role="tablist" aria-label="Day">
          {days.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === day}
              onClick={() => setDay(d)}
              className={`h-[38px] shrink-0 rounded-full px-4 text-[13px] font-semibold transition ${d === day ? "bg-[var(--g-accent)] text-black" : "bg-[var(--g-panel)] text-[var(--g-muted)] hover:text-[var(--g-text)]"}`}
            >
              {dayLabel(d, today)}
            </button>
          ))}
        </div>
      </div>

      <div ref={scroller} className="relative mt-4 overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--g-line)] bg-[#141414] [scrollbar-width:thin]">
        <div className="relative" style={{ width: 24 * hourPx, height: 40 + count * LANE_PX + 16 }}>
          {/* Hours */}
          {Array.from({ length: 48 }, (_, i) => (
            <div key={i} className={`absolute top-0 h-full border-l ${i % 2 === 0 ? "border-white/[0.05]" : hourPx >= 60 ? "border-white/[0.03]" : "border-transparent"}`} style={{ left: (i * hourPx) / 2 }}>
              {i % (2 * labelEvery) === 0 && <span className="absolute left-2 top-2 text-[12px] font-semibold tabular-nums text-white/45">{String(i / 2).padStart(2, "0")}:00</span>}
            </div>
          ))}
          {/* Now */}
          {now > start && now < end && (
            <>
              {/* The line runs behind the cards; its time label sits on top. */}
              <span aria-hidden="true" className="pointer-events-none absolute top-6 z-[5] h-[calc(100%-24px)] w-[2px] bg-[#ff3b3b] shadow-[0_0_12px_#ff3b3b]" style={{ left: x(now) }} />
              <span className="pointer-events-none absolute top-1 z-20 -translate-x-1/2 rounded bg-[#ff3b3b] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-white" style={{ left: x(now) }}>
                {hm(now)}
              </span>
            </>
          )}
          {shown.map((e) => {
            const left = x(e.starts_at)
            const width = Math.max(cardMin(hourPx), x(e.ends_at) - left)
            const colour = FORMAT_COLOUR[e.format] ?? "#ffb300"
            const live = e.phase === "live"
            const over = e.phase === "over" || e.phase === "cancelled"
            return (
              <Link
                key={e.id}
                href={`/play/tournaments/${e.handle}`}
                className={`group absolute z-10 block focus-visible:outline-none ${over ? "opacity-55 hover:opacity-90" : ""}`}
                style={{ left, top: 40 + (lane.get(e.id) ?? 0) * LANE_PX, width }}
              >
                {live && (
                  <span aria-hidden="true" className="absolute -left-7 top-1/2 flex -translate-y-1/2 flex-col gap-1.5">
                    {[18, 12, 22].map((w, i) => (
                      <span key={i} className="block h-[2px] rounded-full" style={{ width: w, background: colour, opacity: 0.8 - i * 0.2 }} />
                    ))}
                  </span>
                )}
                <span
                  className="relative block h-[82px] overflow-hidden rounded-l-lg px-4 py-2.5 text-black transition group-hover:brightness-110 group-focus-visible:ring-2 group-focus-visible:ring-white"
                  style={{ background: colour, clipPath: "polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%)", boxShadow: live ? `0 0 26px ${colour}66` : undefined }}
                >
                  <span className="flex items-center gap-2">
                    {live && (
                      <span className="inline-flex items-center gap-1 rounded bg-black px-1.5 py-[1px] text-[10px] font-extrabold text-white">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff3b3b] motion-reduce:animate-none" />
                        LIVE
                      </span>
                    )}
                    <span className="truncate text-[15px] font-extrabold leading-tight">{e.title}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-semibold text-black/70">
                    {e.speed} {e.time_control} · {e.format_label}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-medium text-black/70">
                    {e.registered}
                    {e.capacity ? `/${e.capacity}` : ""} players · {live ? (e.live_games ? `${e.live_games} boards live` : "Running") : over ? (e.leader ? `Winner: ${e.leader}` : "Finished") : hm(e.starts_at)}
                  </span>
                </span>
              </Link>
            )
          })}
        </div>
      </div>
      {!shown.length && (
        <p className="mt-3 text-[14px] text-[var(--g-muted)]">
          No tournaments {dayLabel(day, today) === "Today" ? "today" : dayLabel(day, today) === "Tomorrow" ? "tomorrow" : `on ${dayLabel(day, today)}`}
          {type !== "all" || speed !== "All controls" ? " with these filters" : ""}. Try another day.
        </p>
      )}
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--g-muted)]">
        {(["arena", "swiss", "round_robin", "knockout"] as const).map((f) => (
          <span key={f} className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: FORMAT_COLOUR[f] }} />
            {f === "arena" ? "Arena: play as many games as you can" : f === "swiss" ? "Swiss: fixed rounds, nobody is knocked out" : f === "round_robin" ? "Round robin: everyone plays everyone" : "Knockout: lose a match and you're out"}
          </span>
        ))}
        <span>Times in India time (IST).</span>
      </p>
    </section>
  )
}

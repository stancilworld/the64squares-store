"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { nowMs } from "@/lib/clock"
import { claimAd, countAd, myAdClaims } from "@/lib/showcase-actions"
import type { Ad, Given, MediaVisual, Showcase as Data, Visual } from "@/lib/showcase-types"
import { SceneView } from "./scene-view"

// An advert window (set up in the admin under Advertisements): live adverts take turns, each
// a 3D design, picture, GIF or video with optional words, a countdown and one action (a link,
// a coupon code or a reward to claim). With no advert on, it shows the default screen.

const TURN_MS = 8000

const visibleNow = (ad: Ad, now: number, signedIn: boolean) =>
  (!ad.starts_at || new Date(ad.starts_at).getTime() <= now) &&
  (!ad.ends_at || new Date(ad.ends_at).getTime() > now) &&
  (ad.audience === "everyone" || (ad.audience === "members") === signedIn)

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 639px)").matches

function Media({ v, active }: { v: MediaVisual; active: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  // Phones get the phone version when there is one (chosen once, after the first paint).
  const [phone, setPhone] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setPhone(isPhone()), 0)
    return () => clearTimeout(t)
  }, [])
  const m = phone && v.mobile ? { ...v.mobile, fit: v.fit, focus: v.focus } : v
  const still = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

  useEffect(() => {
    const el = video.current
    if (!el) return
    if (active && !still) el.play().catch(() => {})
    else el.pause()
  }, [active, still, m.url])

  const style = { objectFit: m.fit, objectPosition: m.focus }
  if (m.kind === "video")
    return (
      <video
        ref={video}
        key={m.url}
        src={m.url}
        poster={m.poster_url ?? undefined}
        muted
        loop
        playsInline
        preload={active ? "auto" : "metadata"}
        className="absolute inset-0 h-full w-full"
        style={style}
        aria-hidden="true"
      />
    )
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={m.url} alt="" draggable={false} loading={active ? "eager" : "lazy"} className="absolute inset-0 h-full w-full select-none" style={style} />
}

function VisualView({ v, active }: { v: Visual; active: boolean }) {
  if (v.kind === "scene")
    return <div className="absolute inset-0 bg-[#161616]">{active && <SceneView scene={v.scene} className="h-full w-full" />}</div>
  return <Media v={v} active={active} />
}

function Countdown({ to, label, now }: { to: string; label: string | null; now: number }) {
  const left = Math.max(0, new Date(to).getTime() - now)
  if (!left) return null
  const s = Math.floor(left / 1000)
  const parts: [number, string][] = [
    [Math.floor(s / 86400), "d"],
    [Math.floor((s % 86400) / 3600), "h"],
    [Math.floor((s % 3600) / 60), "m"],
    [s % 60, "s"],
  ]
  const shown = parts[0][0] ? parts : parts.slice(1)
  return (
    <p className="ad-count mt-3" aria-label={`${label ?? "Starts in"} ${shown.map(([n, u]) => `${n}${u}`).join(" ")}`}>
      {label && <span className="ad-count-label">{label}</span>}
      <span className="flex gap-1.5" aria-hidden="true">
        {shown.map(([n, u]) => (
          <span key={u} className="ad-count-cell">
            {String(n).padStart(2, "0")}
            <small>{u}</small>
          </span>
        ))}
      </span>
    </p>
  )
}

const external = (url: string) => /^https?:\/\//.test(url)

function ActionLink({ url, label, onUse, className }: { url: string; label: string; onUse: () => void; className: string }) {
  return external(url) ? (
    <a href={url} target="_blank" rel="noopener" onClick={onUse} className={className}>
      {label}
    </a>
  ) : (
    <Link href={url} onClick={onUse} className={className}>
      {label}
    </Link>
  )
}

function ActionView({ ad, signedIn, given, onGiven }: { ad: Ad; signedIn: boolean; given: Given | undefined; onGiven: (g: Given) => void }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const a = ad.action
  const used = () => void countAd(ad.id, "clicks")
  const claim = async () => {
    setBusy(true)
    setNote(null)
    used()
    const r = await claimAd(ad.id)
    setBusy(false)
    if (r.ok) {
      onGiven(r.given)
      setNote(r.message)
      // The level bar shows the boost straight away.
      if (r.given.kind === "xp_boost") window.dispatchEvent(new CustomEvent("t64:xp-boost", { detail: { factor: r.given.factor, ends_at: r.given.until } }))
    } else setNote(r.error)
  }
  const btn = "g-btn g-btn-primary ad-btn"

  if (a.kind === "none") return null
  if (a.kind === "link") return <ActionLink url={a.url} label={a.label} onUse={used} className={btn} />

  if (a.kind === "coupon") {
    const code = a.code ?? (given?.kind === "coupon" ? given.code : null)
    const copy = async () => {
      if (!code) return
      used()
      try {
        await navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      } catch {
        setNote(`Your code: ${code}`)
      }
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        {code ? (
          <button type="button" onClick={copy} className="ad-code" aria-label={`Copy code ${code}`}>
            <span>{code}</span>
            <span className="ad-code-copy">{copied ? "Copied" : "Copy"}</span>
          </button>
        ) : signedIn ? (
          <button type="button" onClick={claim} disabled={busy} className={btn}>
            {busy ? "Getting your code…" : a.label || "Get the code"}
          </button>
        ) : (
          <Link href="/account?next=/play" className={btn}>
            Sign in for the code
          </Link>
        )}
        {code && a.url && <ActionLink url={a.url} label={a.label || "Use it in the shop"} onUse={used} className="g-btn ad-btn ad-btn-quiet" />}
        {note && <span className="ad-note">{note}</span>}
      </div>
    )
  }

  // A reward to claim.
  const done = given && given.kind !== "coupon"
  return (
    <div className="flex flex-wrap items-center gap-2">
      {done ? (
        <span className="ad-claimed">
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          {given.kind === "xp_boost" ? (new Date(given.until).getTime() > nowMs() ? `${given.factor}x XP is on` : "Claimed") : "Claimed"}
        </span>
      ) : a.sold_out ? (
        <span className="ad-claimed ad-claimed-off">All claimed</span>
      ) : signedIn ? (
        <button type="button" onClick={claim} disabled={busy} className={btn}>
          {busy ? "Claiming…" : a.label}
        </button>
      ) : (
        <Link href="/account?next=/play" className={btn}>
          Sign in to claim
        </Link>
      )}
      {!done && !a.sold_out && <span className="ad-note">{a.text}</span>}
      {note && <span className="ad-note" role="status">{note}</span>}
    </div>
  )
}

function Slide({ ad, now, signedIn, given, onGiven }: { ad: Ad; now: number; signedIn: boolean; given: Given | undefined; onGiven: (g: Given) => void }) {
  const words = ad.tag || ad.headline || ad.body || ad.countdown_to || ad.action.kind !== "none"
  if (!words) return null
  return (
    <div className={`ad-copy ad-${ad.position} ad-${ad.align} ad-theme-${ad.theme}${ad.scrim ? " ad-scrim" : ""}`}>
      <div className="ad-copy-inner">
        {ad.tag && <span className="ad-tag">{ad.tag}</span>}
        {ad.headline && <h2 className="ad-headline font-display">{ad.headline}</h2>}
        {ad.body && <p className="ad-body">{ad.body}</p>}
        {ad.countdown_to && <Countdown to={ad.countdown_to} label={ad.countdown_label} now={now} />}
        {ad.action.kind !== "none" && (
          <div className="ad-action">
            <ActionView ad={ad} signedIn={signedIn} given={given} onGiven={onGiven} />
          </div>
        )}
      </div>
    </div>
  )
}

export function Showcase({ data, signedIn, className = "", label = "Featured" }: { data: Data; signedIn: boolean; className?: string; label?: string }) {
  const [now, setNow] = useState(0)
  const [index, setIndex] = useState(0)
  const [hold, setHold] = useState(false)
  const [claims, setClaims] = useState<Record<string, Given>>({})
  const [started, setStarted] = useState(0)

  // The clock: every second while a countdown shows, otherwise twice a minute (adverts start
  // and end on time without a reload).
  const ads = useMemo(() => (now ? data.ads.filter((a) => visibleNow(a, now, signedIn)) : []), [data.ads, now, signedIn])
  const current = ads.length ? ads[index % ads.length] : null
  const ticking = !!current?.countdown_to
  useEffect(() => {
    const tick = () => setNow(nowMs())
    const first = setTimeout(tick, 0)
    const t = setInterval(tick, ticking ? 1000 : 30_000)
    return () => {
      clearTimeout(first)
      clearInterval(t)
    }
  }, [ticking])

  useEffect(() => {
    if (!signedIn || !data.ads.some((a) => a.action.kind === "reward" || (a.action.kind === "coupon" && !a.action.code))) return
    let on = true
    void myAdClaims().then((c) => on && setClaims(c))
    return () => {
      on = false
    }
  }, [signedIn, data.ads])

  // Taking turns (not while the pointer or keyboard focus is on the window).
  const go = useCallback(
    (i: number) => {
      setIndex(((i % ads.length) + ads.length) % ads.length)
      setStarted(nowMs())
    },
    [ads.length]
  )
  useEffect(() => {
    if (ads.length < 2 || hold) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const t = setTimeout(() => go(index + 1), TURN_MS)
    return () => clearTimeout(t)
  }, [ads.length, hold, index, go, started])

  // Seen: counted once per visit.
  useEffect(() => {
    if (!current) return
    const key = `ad-seen:${current.id}`
    try {
      if (sessionStorage.getItem(key)) return
      sessionStorage.setItem(key, "1")
    } catch {}
    void countAd(current.id, "views")
  }, [current])

  const onGiven = (id: string) => (g: Given) => setClaims((c) => ({ ...c, [id]: g }))

  // Before the clock has started (first paint), and with no advert on: the default screen.
  if (!current) {
    const v = data.fallback ?? { kind: "scene" as const, scene: "clash" }
    return (
      <div className={`ad-window ${className}`}>
        <VisualView v={v} active />
      </div>
    )
  }

  return (
    <section
      className={`ad-window ${className}`}
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onFocus={() => setHold(true)}
      onBlur={() => setHold(false)}
    >
      {ads.map((ad, i) => {
        const on = ad === current
        return (
          <div key={ad.id} className="ad-slide" data-on={on || undefined} aria-hidden={!on} role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${ads.length}`} inert={!on || undefined}>
            <VisualView v={ad.visual} active={on} />
            <Slide ad={ad} now={now} signedIn={signedIn} given={claims[ad.id]} onGiven={onGiven(ad.id)} />
          </div>
        )
      })}
      {ads.length > 1 && (
        <div className="ad-dots">
          {ads.map((ad, i) => (
            <button
              key={ad.id}
              type="button"
              className="ad-dot"
              data-on={ad === current || undefined}
              data-run={(ad === current && !hold) || undefined}
              aria-label={`Show ${ad.headline ?? `advert ${i + 1}`}`}
              aria-current={ad === current || undefined}
              onClick={() => go(i)}
            >
              <span key={ad === current ? started : 0} style={{ animationDuration: `${TURN_MS}ms` }} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

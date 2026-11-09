"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState, useSyncExternalStore } from "react"
import { CONSENT_CHANGED, OPEN_CONSENT, effectiveConsent, readConsent, saveConsent, type Stored } from "@/lib/tracking/consent"
import { loadScript, setupTracking, track } from "@/lib/tracking/engine"
import { type Consent, type MarketingConfig, anyAdTag, anyTag } from "@/lib/tracking/types"

const subscribe = (cb: () => void) => {
  addEventListener(CONSENT_CHANGED, cb)
  return () => removeEventListener(CONSENT_CHANGED, cb)
}
let cached: { raw: string; value: Stored | null } = { raw: "\u0000", value: null }
const snapshot = () => {
  const raw = typeof document === "undefined" ? "" : (document.cookie.match(/t64_consent=[^;]*/)?.[0] ?? "")
  if (raw !== cached.raw) cached = { raw, value: readConsent() }
  return cached.value
}

// Tags, cookie banner and page views for the whole website (root layout).
export function Tracking({ config }: { config: MarketingConfig }) {
  const stored = useSyncExternalStore(subscribe, snapshot, () => null)
  const params = useSearchParams()
  const checkNonce = params.get("t64-tag-check")
  if (checkNonce && /^[a-f0-9]{32}$/.test(checkNonce)) return <TagCheck nonce={checkNonce} />
  return <Live config={config} stored={stored} />
}

function Live({ config, stored }: { config: MarketingConfig; stored: Stored | null }) {
  const consent = effectiveConsent(config, stored)
  const path = usePathname()
  const search = useSearchParams().toString()
  const [open, setOpen] = useState(false)

  // The choice is read from the cookie here, not from the render: while the page is first
  // shown it can't be known yet, and no tag may start before it is.
  useEffect(() => {
    setupTracking(config, effectiveConsent(config, readConsent()))
  }, [config, stored])

  // A page view for each page, including moves inside the site.
  useEffect(() => {
    const t = setTimeout(() => track("PageView"), 50)
    return () => clearTimeout(t)
  }, [path, search, consent.analytics, consent.marketing])

  useEffect(() => {
    const show = () => setOpen(true)
    addEventListener(OPEN_CONSENT, show)
    return () => removeEventListener(OPEN_CONSENT, show)
  }, [])

  if (!anyTag(config)) return null
  const showBanner = open || !stored
  return showBanner ? <ConsentBanner config={config} current={consent} detailed={open} onDone={() => setOpen(false)} /> : null
}

// The cookie bar at the bottom of the screen.
function ConsentBanner({ config, current, detailed, onDone }: { config: MarketingConfig; current: Consent; detailed: boolean; onDone: () => void }) {
  const [choose, setChoose] = useState(detailed)
  const [pick, setPick] = useState<Consent>(current)
  const notice = config.consent.mode === "notice"
  const decide = (c: Consent) => {
    saveConsent(c)
    onDone()
  }
  const hasAnalytics = !!(config.ga4 || config.clarity || config.gtm)
  const hasMarketing = anyAdTag(config)
  return (
    <div role="region" aria-label="Cookie choices" className="fixed inset-x-0 bottom-0 z-[60] max-h-[85dvh] overflow-y-auto border-t border-white/10 bg-ink text-white shadow-[0_-8px_30px_rgba(0,0,0,0.25)]">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:gap-8 lg:px-10">
        <div className="min-w-0 flex-1 text-[14px] leading-[1.55] text-white/85">
          <p>
            {config.consent.text}{" "}
            {config.consent.policy_url && (
              <Link href={config.consent.policy_url} className="font-semibold text-white underline underline-offset-2">
                Privacy policy
              </Link>
            )}
          </p>
          {choose && (
            <fieldset className="mt-3 grid gap-2 sm:grid-cols-3">
              <legend className="sr-only">Cookie types</legend>
              <label className="flex items-start gap-2.5 rounded-sm bg-white/[0.06] p-3">
                <input type="checkbox" checked disabled className="mt-0.5 h-4 w-4 accent-amber" />
                <span>
                  <span className="block font-semibold text-white">Essential</span>
                  <span className="block text-[13px] text-white/65">Cart, sign-in and checkout. Always on.</span>
                </span>
              </label>
              {hasAnalytics && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-sm bg-white/[0.06] p-3">
                  <input type="checkbox" checked={pick.analytics} onChange={(e) => setPick({ ...pick, analytics: e.target.checked })} className="mt-0.5 h-4 w-4 accent-amber" />
                  <span>
                    <span className="block font-semibold text-white">Analytics</span>
                    <span className="block text-[13px] text-white/65">Which pages are visited, so we can improve the shop.</span>
                  </span>
                </label>
              )}
              {hasMarketing && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-sm bg-white/[0.06] p-3">
                  <input type="checkbox" checked={pick.marketing} onChange={(e) => setPick({ ...pick, marketing: e.target.checked })} className="mt-0.5 h-4 w-4 accent-amber" />
                  <span>
                    <span className="block font-semibold text-white">Marketing</span>
                    <span className="block text-[13px] text-white/65">Measures our ads on {adNetworks(config)}.</span>
                  </span>
                </label>
              )}
            </fieldset>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {choose ? (
            <button type="button" onClick={() => decide(pick)} className="btn btn-amber h-[44px] px-5 text-[14px]">
              Save choices
            </button>
          ) : (
            <>
              <button type="button" onClick={() => decide({ analytics: true, marketing: true })} className="btn btn-amber h-[44px] px-5 text-[14px]">
                {notice ? "OK" : "Accept all"}
              </button>
              <button type="button" onClick={() => decide({ analytics: false, marketing: false })} className="btn btn-ghost-light h-[44px] px-5 text-[14px]">
                {notice ? "Turn off" : "Only essential"}
              </button>
              <button type="button" onClick={() => setChoose(true)} className="h-[44px] px-3 text-[14px] font-semibold text-white/80 underline underline-offset-4 hover:text-white">
                Choose
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// "Facebook, Instagram and Google", from the ad tags switched on.
const adNetworks = (c: MarketingConfig) => {
  const n = [
    ...(c.meta_pixel ? ["Facebook", "Instagram"] : []),
    ...(c.google_ads || c.gtm ? ["Google"] : []),
    ...(c.pinterest ? ["Pinterest"] : []),
    ...(c.snapchat ? ["Snapchat"] : []),
    ...(c.microsoft_ads ? ["Bing"] : []),
    ...(c.linkedin ? ["LinkedIn"] : []),
  ]
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : (n[0] ?? "other websites")
}

const SCRIPT: Record<string, (c: MarketingConfig) => string | null> = {
  meta_pixel: (c) => (c.meta_pixel ? "https://connect.facebook.net/en_US/fbevents.js" : null),
  ga4: (c) => (c.ga4 ? `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(c.ga4.measurement_id)}` : null),
  google_ads: (c) => (c.google_ads ? `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(c.google_ads.conversion_id)}` : null),
  gtm: (c) => (c.gtm ? `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(c.gtm.container_id)}` : null),
  clarity: (c) => (c.clarity ? `https://www.clarity.ms/tag/${encodeURIComponent(c.clarity.project_id)}` : null),
  pinterest: (c) => (c.pinterest ? "https://s.pinimg.com/ct/core.js" : null),
  snapchat: (c) => (c.snapchat ? "https://sc-static.net/scevent.min.js" : null),
  microsoft_ads: (c) => (c.microsoft_ads ? "https://bat.bing.com/bat.js" : null),
  linkedin: (c) => (c.linkedin ? "https://snap.licdn.com/li.lms-analytics/insight.min.js" : null),
}

// A test started in the admin: loads the tags under test (without sending any event) and
// reports whether each one loaded.
function TagCheck({ nonce }: { nonce: string }) {
  const [state, setState] = useState<{ done: boolean; lines: { name: string; ok: boolean }[]; error?: string }>({ done: false, lines: [] })
  useEffect(() => {
    let alive = true
    ;(async () => {
      const res = await fetch(`/api/t/config?check=${nonce}`, { cache: "no-store" }).catch(() => null)
      const cfg = (await res?.json().catch(() => null)) as MarketingConfig | null
      const list = cfg?.check?.integrations ?? []
      if (!cfg || !list.length) {
        if (alive) setState({ done: true, lines: [], error: "This test has ended. Start it again in the admin." })
        return
      }
      const results: Record<string, { ok: boolean; detail?: string }> = {}
      for (const i of list) {
        const src = SCRIPT[i]?.(cfg)
        const ok = src ? await loadScript(src) : false
        results[i] = { ok, ...(ok ? {} : { detail: "the script could not be loaded" }) }
      }
      const sent = await fetch("/api/t/check", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nonce, results }) }).catch(() => null)
      if (alive)
        setState({
          done: true,
          lines: list.map((name) => ({ name, ok: results[name].ok })),
          error: sent?.ok ? undefined : "The result could not be sent back. Start the test again in the admin.",
        })
    })()
    return () => {
      alive = false
    }
  }, [nonce])
  const NAMES: Record<string, string> = {
    meta_pixel: "Meta Pixel",
    ga4: "Google Analytics 4",
    google_ads: "Google Ads",
    gtm: "Google Tag Manager",
    clarity: "Microsoft Clarity",
    pinterest: "Pinterest Tag",
    snapchat: "Snap Pixel",
    microsoft_ads: "Microsoft UET",
    linkedin: "LinkedIn Insight Tag",
  }
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-[70] mx-auto max-w-[460px] border border-black bg-white p-5 shadow-[6px_6px_0_rgba(0,0,0,0.9)]">
      <p className="text-[17px] font-extrabold tracking-tight">{state.done ? "Tag test finished" : "Testing your tags…"}</p>
      <ul className="mt-2 space-y-1 text-[14px]">
        {state.lines.map((l) => (
          <li key={l.name} className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 ${l.ok ? "bg-good" : "bg-love"}`} />
            {NAMES[l.name] ?? l.name}: {l.ok ? "loaded" : "did not load"}
          </li>
        ))}
      </ul>
      {state.error && <p className="mt-2 text-[14px] text-love">{state.error}</p>}
      {state.done && !state.error && <p className="mt-2 text-[14px] text-muted">You can close this tab and go back to the admin.</p>}
    </div>
  )
}

// "Cookie settings" link (footer).
export function CookieSettingsLink({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={() => dispatchEvent(new Event(OPEN_CONSENT))} className={className}>
      Cookie settings
    </button>
  )
}

import type { Consent, MarketingConfig } from "./types"

// The visitor's cookie choice, kept in a first-party cookie (needed to remember the choice
// itself, so it's essential). Six months, then we ask again.
const COOKIE = "t64_consent"
export const CONSENT_CHANGED = "t64:consent-changed"
export const OPEN_CONSENT = "t64:open-consent"

export type Stored = Consent & { at: number }

export const readConsent = (): Stored | null => {
  if (typeof document === "undefined") return null
  const m = document.cookie.match(/(?:^|;\s*)t64_consent=v1\.a([01])\.m([01])\.(\d+)/)
  return m ? { analytics: m[1] === "1", marketing: m[2] === "1", at: Number(m[3]) } : null
}

// What applies now: the visitor's choice, or the default for the banner mode.
export const effectiveConsent = (config: MarketingConfig, stored: Stored | null): Consent =>
  stored ?? (config.consent.mode === "notice" ? { analytics: true, marketing: true } : { analytics: false, marketing: false })

// Cookies the tags set. Removed when the visitor takes their permission back.
const TAG_COOKIES = [/^_ga/, /^_gid$/, /^_gat/, /^_gcl_/, /^_fbp$/, /^_fbc$/, /^_clck$/, /^_clsk$/, /^CLID$/, /^MUID$/]

export const saveConsent = (c: Consent) => {
  const before = readConsent()
  const value = `v1.a${c.analytics ? 1 : 0}.m${c.marketing ? 1 : 0}.${Date.now()}`
  document.cookie = `${COOKIE}=${value}; path=/; max-age=${180 * 86400}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`
  const revoked = !!before && ((before.analytics && !c.analytics) || (before.marketing && !c.marketing))
  if (revoked) {
    const host = location.hostname
    const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`]
    for (const part of document.cookie.split(";")) {
      const name = part.split("=")[0].trim()
      if (!TAG_COOKIES.some((re) => re.test(name))) continue
      for (const d of domains) document.cookie = `${name}=; path=/; max-age=0${d ? `; domain=${d}` : ""}`
    }
    // Tags already running can't be unloaded: start the page again without them.
    location.reload()
    return
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED, { detail: c }))
}

export const openConsentSettings = () => window.dispatchEvent(new Event(OPEN_CONSENT))

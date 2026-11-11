import crypto from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"
import { decrypt, encrypt, getServiceKeys } from "./service-keys"

// Google Search Console in the admin: which searches show the site, clicks, positions. The
// admin connects once with Google (the same Google Client ID/Secret as "Sign in with Google");
// the access Google gives is stored encrypted.

export const GSC_SETTING = "search_console"
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly"

export type GscStored = { refresh_enc: string | null; site_url: string | null; email: string | null; connected_at: string | null }
const EMPTY: GscStored = { refresh_enc: null, site_url: null, email: null, connected_at: null }

export const backendUrl = () => (process.env.MEDUSA_BACKEND_URL || "http://localhost:9000").replace(/\/$/, "")
export const callbackUrl = () => `${backendUrl()}/admin/seo/gsc/callback`

export const loadGsc = async (container: MedusaContainer): Promise<GscStored> => {
  const content: ContentModuleService = container.resolve(CONTENT_MODULE)
  return { ...EMPTY, ...((await content.getSettingValue(GSC_SETTING)) as Partial<GscStored> | null) }
}

const secret = () => process.env.JWT_SECRET || process.env.COOKIE_SECRET || "dev-secret"
// A state value Google hands back, so only a sign-in this admin started is accepted (30 min).
export const makeState = (userId: string) => {
  const body = `${userId}.${Date.now()}`
  const sig = crypto.createHmac("sha256", secret()).update(body).digest("base64url")
  return Buffer.from(`${body}.${sig}`).toString("base64url")
}
export const checkState = (state: string, userId: string) => {
  try {
    const [uid, ts, sig] = Buffer.from(state, "base64url").toString().split(".")
    const good = crypto.createHmac("sha256", secret()).update(`${uid}.${ts}`).digest("base64url")
    return uid === userId && sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good)) && Date.now() - Number(ts) < 30 * 60_000
  } catch {
    return false
  }
}

const creds = async (container: MedusaContainer) => {
  const keys = await getServiceKeys(container)
  return keys.google
}

export const authUrl = async (container: MedusaContainer, state: string) => {
  const g = await creds(container)
  if (!g) return null
  const q = new URLSearchParams({
    client_id: g.clientId,
    redirect_uri: callbackUrl(),
    response_type: "code",
    scope: `${SCOPE} openid email`,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

const tokenRequest = async (container: MedusaContainer, body: Record<string, string>) => {
  const g = await creds(container)
  if (!g) throw new Error("Add the Google Client ID and Secret first (Settings → Payments & delivery → Keys).")
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, ...body }),
  })
  const d = (await r.json().catch(() => ({}))) as Record<string, string>
  if (!r.ok) throw new Error(d.error_description || d.error || `Google said ${r.status}`)
  return d
}

// Swaps the code from Google's sign-in for lasting access; returns what to save.
export const exchangeCode = async (container: MedusaContainer, code: string): Promise<GscStored & { sites: string[] }> => {
  const t = await tokenRequest(container, { code, grant_type: "authorization_code", redirect_uri: callbackUrl() })
  if (!t.refresh_token) throw new Error("Google didn't give lasting access. Remove the app's access in your Google account and connect again.")
  let email: string | null = null
  try {
    email = JSON.parse(Buffer.from(String(t.id_token).split(".")[1], "base64url").toString()).email ?? null
  } catch {}
  const sites = await listSites(t.access_token)
  // The site that matches this shop, if Google has one.
  const host = new URL(process.env.STORE_URL || process.env.STORE_CORS?.split(",")[0] || "https://the64squares.in").hostname.replace(/^www\./, "")
  const site = sites.find((s) => s === `sc-domain:${host}`) ?? sites.find((s) => s.includes(host)) ?? sites[0] ?? null
  return { refresh_enc: encrypt(t.refresh_token), site_url: site, email, connected_at: new Date().toISOString(), sites }
}

const accessToken = async (container: MedusaContainer, stored: GscStored) => {
  const refresh = stored.refresh_enc ? decrypt(stored.refresh_enc) : null
  if (!refresh) throw new Error("Search Console isn't connected.")
  const t = await tokenRequest(container, { refresh_token: refresh, grant_type: "refresh_token" })
  return t.access_token
}

const listSites = async (token: string) => {
  const r = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { authorization: `Bearer ${token}` } })
  const d = (await r.json().catch(() => ({}))) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] }
  return (d.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl)
}

export const sitesFor = async (container: MedusaContainer, stored: GscStored) => listSites(await accessToken(container, stored))

type Row = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }

// Last N days (Google's data lags ~2 days): totals, a daily line, top searches and top pages.
export const report = async (container: MedusaContainer, stored: GscStored, days: number) => {
  if (!stored.site_url) throw new Error("Choose which site to show.")
  const token = await accessToken(container, stored)
  const end = new Date(Date.now() - 2 * 86_400_000)
  const start = new Date(end.getTime() - (days - 1) * 86_400_000)
  const d = (x: Date) => x.toISOString().slice(0, 10)
  const q = async (dimensions: string[], rowLimit: number) => {
    const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(stored.site_url!)}/searchAnalytics/query`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ startDate: d(start), endDate: d(end), dimensions, rowLimit }),
    })
    const body = (await r.json().catch(() => ({}))) as { rows?: Row[]; error?: { message: string } }
    if (!r.ok) throw new Error(body.error?.message || `Google said ${r.status}`)
    return body.rows ?? []
  }
  const [daily, queries, pages] = await Promise.all([q(["date"], 500), q(["query"], 100), q(["page"], 100)])
  const sum = (k: "clicks" | "impressions") => daily.reduce((n, r) => n + r[k], 0)
  const clicks = sum("clicks")
  const impressions = sum("impressions")
  const position = impressions ? daily.reduce((n, r) => n + r.position * r.impressions, 0) / impressions : 0
  const map = (rows: Row[]) => rows.map((r) => ({ key: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }))
  return {
    range: { start: d(start), end: d(end) },
    totals: { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position },
    daily: map(daily),
    queries: map(queries),
    pages: map(pages),
  }
}

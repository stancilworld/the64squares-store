import crypto from "node:crypto"
import { container as globalContainer } from "@medusajs/framework"
import type { MedusaContainer } from "@medusajs/framework/types"
import { CONTENT_MODULE } from "../modules/content"
import type ContentModuleService from "../modules/content/service"

// Keys for Razorpay, Resend, Google and Delhivery.
//
// They can be set in two places:
// - the admin (Settings → Payments & delivery → Keys, main admin only), stored encrypted in
//   the database. The encryption key comes from the server's own secrets (JWT_SECRET and
//   COOKIE_SECRET in apps/backend/.env), so a copy of the database alone can't unlock them.
// - the server's .env file (deploy/set-keys.sh), used when the admin has no value.
// The admin never shows a saved secret again, only its last 4 characters.

export const SERVICE_KEYS_SETTING = "service_keys"

export type KeyName =
  | "RAZORPAY_TEST_KEY_ID"
  | "RAZORPAY_TEST_KEY_SECRET"
  | "RAZORPAY_TEST_WEBHOOK_SECRET"
  | "RAZORPAY_LIVE_KEY_ID"
  | "RAZORPAY_LIVE_KEY_SECRET"
  | "RAZORPAY_LIVE_WEBHOOK_SECRET"
  | "RESEND_API_KEY"
  | "EMAIL_FROM"
  | "EMAIL_REPLY_TO"
  | "MAILBOX_EMAIL"
  | "MAILBOX_PASSWORD"
  | "MAILBOX_IMAP"
  | "MAILBOX_SMTP"
  | "GOOGLE_CLIENT_ID"
  | "GOOGLE_CLIENT_SECRET"
  | "DELHIVERY_TOKEN"
  | "GROQ_API_KEY"
  | "GROQ_MODEL"
  | "GEMINI_API_KEY"
  | "GEMINI_MODEL"
  | "META_CAPI_TOKEN"
  | "GA4_API_SECRET"

export type KeyDef = {
  name: KeyName
  group: "razorpay_test" | "razorpay_live" | "resend" | "google" | "delhivery" | "mailbox" | "ai" | "marketing"
  label: string
  secret: boolean
  pattern: RegExp
  hint: string
}

export const KEY_DEFS: KeyDef[] = [
  { name: "RAZORPAY_TEST_KEY_ID", group: "razorpay_test", label: "Test Key Id", secret: false, pattern: /^rzp_test_[A-Za-z0-9]+$/, hint: "Starts with rzp_test_" },
  { name: "RAZORPAY_TEST_KEY_SECRET", group: "razorpay_test", label: "Test Key Secret", secret: true, pattern: /^[\w-]{10,}$/, hint: "Shown once by Razorpay when the key is made" },
  { name: "RAZORPAY_TEST_WEBHOOK_SECRET", group: "razorpay_test", label: "Test webhook secret", secret: true, pattern: /^.{8,200}$/, hint: "The secret you typed in Razorpay's Test Mode webhook" },
  { name: "RAZORPAY_LIVE_KEY_ID", group: "razorpay_live", label: "Live Key Id", secret: false, pattern: /^rzp_live_[A-Za-z0-9]+$/, hint: "Starts with rzp_live_" },
  { name: "RAZORPAY_LIVE_KEY_SECRET", group: "razorpay_live", label: "Live Key Secret", secret: true, pattern: /^[\w-]{10,}$/, hint: "Shown once by Razorpay when the key is made" },
  { name: "RAZORPAY_LIVE_WEBHOOK_SECRET", group: "razorpay_live", label: "Live webhook secret", secret: true, pattern: /^.{8,200}$/, hint: "The secret you typed in Razorpay's Live Mode webhook" },
  { name: "RESEND_API_KEY", group: "resend", label: "Resend API key", secret: true, pattern: /^re_[A-Za-z0-9_]{8,}$/, hint: "Starts with re_" },
  { name: "EMAIL_FROM", group: "resend", label: "Send emails from", secret: false, pattern: /^[^<>]{0,60}<?[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}>?$/i, hint: "e.g. The 64 Squares <orders@the64squares.in>, on the domain added in Resend" },
  { name: "EMAIL_REPLY_TO", group: "resend", label: "Customer replies go to", secret: false, pattern: /^[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}$/i, hint: "A real inbox, e.g. info@the64squares.in. When a customer presses Reply on any email, it goes here." },
  { name: "MAILBOX_EMAIL", group: "mailbox", label: "Inbox email address", secret: false, pattern: /^[^\s<>@]+@[^\s<>@]+\.[a-z]{2,}$/i, hint: "e.g. info@the64squares.in" },
  { name: "MAILBOX_PASSWORD", group: "mailbox", label: "Inbox password", secret: true, pattern: /^.{1,200}$/, hint: "The password you use to sign in to that mailbox (or an app password)" },
  { name: "MAILBOX_IMAP", group: "mailbox", label: "Incoming server (IMAP)", secret: false, pattern: /^[a-z0-9.-]+:\d{2,5}$/i, hint: "Leave empty for GoDaddy: imap.secureserver.net:993" },
  { name: "MAILBOX_SMTP", group: "mailbox", label: "Outgoing server (SMTP)", secret: false, pattern: /^[a-z0-9.-]+:\d{2,5}$/i, hint: "Leave empty for GoDaddy: smtpout.secureserver.net:465" },
  { name: "GOOGLE_CLIENT_ID", group: "google", label: "Google Client ID", secret: false, pattern: /^[\w.-]+\.apps\.googleusercontent\.com$/, hint: "Ends with .apps.googleusercontent.com" },
  { name: "GOOGLE_CLIENT_SECRET", group: "google", label: "Google Client Secret", secret: true, pattern: /^[\w-]{10,}$/, hint: "Usually starts with GOCSPX-" },
  { name: "GROQ_API_KEY", group: "ai", label: "Groq API key (free)", secret: true, pattern: /^gsk_[A-Za-z0-9]{20,}$/, hint: "From console.groq.com → API Keys. Starts with gsk_" },
  { name: "GROQ_MODEL", group: "ai", label: "Groq model", secret: false, pattern: /^[\w./:-]{3,80}$/, hint: "Leave empty for llama-3.3-70b-versatile" },
  { name: "GEMINI_API_KEY", group: "ai", label: "Google Gemini API key (free, spare)", secret: true, pattern: /^[\w-]{30,60}$/, hint: "From aistudio.google.com → Get API key. Starts with AIza" },
  { name: "GEMINI_MODEL", group: "ai", label: "Gemini model", secret: false, pattern: /^[\w./:-]{3,80}$/, hint: "Leave empty for gemini-flash-lite-latest" },
  { name: "META_CAPI_TOKEN", group: "marketing", label: "Meta Conversions API access token", secret: true, pattern: /^[A-Za-z0-9]{40,400}$/, hint: "From Meta Events Manager → your Pixel → Settings → Conversions API → Generate access token" },
  { name: "GA4_API_SECRET", group: "marketing", label: "Google Analytics Measurement Protocol API secret", secret: true, pattern: /^[\w-]{10,80}$/, hint: "From Google Analytics → Admin → Data streams → your website → Measurement Protocol API secrets → Create" },
  { name: "DELHIVERY_TOKEN", group: "delhivery", label: "Delhivery API token", secret: true, pattern: /^[A-Za-z0-9]{16,}$/, hint: "From Delhivery One → Settings → API Setup" },
]

export type Stored = {
  // A removed key is kept as null: saved settings are merged into the old value, so a
  // deleted entry would come back.
  values?: Partial<Record<KeyName, { enc: string; last4: string; updated_at: string } | null>>
  razorpay_mode?: "test" | "live"
  log?: { at: string; by: string; what: string }[]
}

// ---------------------------------------------------------------- encryption

const encryptionKey = () =>
  Buffer.from(
    crypto.hkdfSync(
      "sha256",
      `${process.env.JWT_SECRET || "supersecret"}|${process.env.COOKIE_SECRET || "supersecret"}`,
      "the64squares",
      "service-keys-v1",
      32
    )
  )

export const encrypt = (plain: string) => {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv)
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":")
}

export const decrypt = (blob: string): string | null => {
  try {
    const [v, iv, tag, data] = blob.split(":")
    if (v !== "v1") return null
    const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64"))
    decipher.setAuthTag(Buffer.from(tag, "base64"))
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8")
  } catch {
    return null
  }
}

// ---------------------------------------------------------------- reading

const CACHE_MS = 20_000
let cache: { at: number; stored: Stored } | null = null
export const clearServiceKeyCache = () => {
  cache = null
}

export const loadStored = async (container?: MedusaContainer): Promise<Stored> => {
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return cache.stored
  }
  let stored: Stored = {}
  try {
    const content: ContentModuleService = (container ?? globalContainer).resolve(CONTENT_MODULE)
    stored = ((await content.getSettingValue(SERVICE_KEYS_SETTING)) ?? {}) as Stored
  } catch {
    // Database not reachable yet (server starting): use the .env values for now.
    return {}
  }
  cache = { at: Date.now(), stored }
  return stored
}

// Older setups keep one Razorpay key pair in .env (RAZORPAY_KEY_ID etc.); its prefix says
// whether it's the test or the live pair.
const envFor = (name: KeyName): string | undefined => {
  const env = process.env
  const envMode = (env.RAZORPAY_KEY_ID || "").startsWith("rzp_live_") ? "LIVE" : env.RAZORPAY_KEY_ID ? "TEST" : null
  const m = name.match(/^RAZORPAY_(TEST|LIVE)_(KEY_ID|KEY_SECRET|WEBHOOK_SECRET)$/)
  if (m) {
    if (env[name]) return env[name]
    if (m[1] !== envMode) return undefined
    return m[2] === "KEY_ID" ? env.RAZORPAY_KEY_ID : m[2] === "KEY_SECRET" ? env.RAZORPAY_KEY_SECRET : env.RAZORPAY_WEBHOOK_SECRET
  }
  return env[name] || undefined
}

const resolveName = (stored: Stored, name: KeyName): string | undefined => {
  const saved = stored.values?.[name]
  if (saved) {
    const plain = decrypt(saved.enc)
    if (plain) return plain
  }
  return envFor(name)
}

export type RazorpayCreds = { mode: "test" | "live"; keyId: string; keySecret: string }

export type MailServer = { host: string; port: number; secure: boolean }
export type MailboxCreds = { email: string; password: string; imap: MailServer; smtp: MailServer }

// "host:port". Port 993/465 use TLS from the start; others upgrade with STARTTLS (except
// on this computer, for testing).
const server = (value: string | undefined, fallback: string): MailServer => {
  const [host, p] = (value || fallback).split(":")
  const port = Number(p)
  return { host, port, secure: port === 993 || port === 465 }
}

export type ServiceKeys = {
  razorpayMode: "test" | "live"
  razorpay: RazorpayCreds | null
  razorpayFor: (mode: "test" | "live") => RazorpayCreds | null
  razorpayWebhookSecrets: string[]
  resendKey?: string
  emailFrom?: string
  emailReplyTo?: string
  mailbox: MailboxCreds | null
  google: { clientId: string; clientSecret: string } | null
  delhiveryToken?: string
  // Marketing: sent only from this server, never to the website.
  metaCapiToken?: string
  ga4ApiSecret?: string
  // The chat bot's AI helpers (free plans), tried in this order.
  ai: { provider: "groq" | "gemini"; key: string; model: string }[]
}

export const getServiceKeys = async (container?: MedusaContainer): Promise<ServiceKeys> =>
  keysFromStored(await loadStored(container))

// The keys a stored value gives (also used to check a change before saving it).
export const keysFromStored = (stored: Stored): ServiceKeys => {
  const get = (n: KeyName) => resolveName(stored, n)
  const razorpayFor = (mode: "test" | "live"): RazorpayCreds | null => {
    const M = mode === "live" ? "LIVE" : "TEST"
    const keyId = get(`RAZORPAY_${M}_KEY_ID` as KeyName)
    const keySecret = get(`RAZORPAY_${M}_KEY_SECRET` as KeyName)
    return keyId && keySecret ? { mode, keyId, keySecret } : null
  }
  const envMode = (process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_live_") ? "live" : "test"
  const razorpayMode = stored.razorpay_mode ?? envMode
  const clientId = get("GOOGLE_CLIENT_ID")
  const clientSecret = get("GOOGLE_CLIENT_SECRET")
  return {
    razorpayMode,
    razorpay: razorpayFor(razorpayMode),
    razorpayFor,
    razorpayWebhookSecrets: [get("RAZORPAY_TEST_WEBHOOK_SECRET"), get("RAZORPAY_LIVE_WEBHOOK_SECRET")].filter(
      (s): s is string => !!s
    ),
    resendKey: get("RESEND_API_KEY"),
    emailFrom: get("EMAIL_FROM"),
    emailReplyTo: get("EMAIL_REPLY_TO"),
    mailbox: (() => {
      const email = get("MAILBOX_EMAIL")
      const password = get("MAILBOX_PASSWORD")
      if (!email || !password) return null
      return {
        email,
        password,
        imap: server(get("MAILBOX_IMAP"), "imap.secureserver.net:993"),
        smtp: server(get("MAILBOX_SMTP"), "smtpout.secureserver.net:465"),
      }
    })(),
    google: clientId && clientSecret ? { clientId, clientSecret } : null,
    delhiveryToken: get("DELHIVERY_TOKEN"),
    metaCapiToken: get("META_CAPI_TOKEN"),
    ga4ApiSecret: get("GA4_API_SECRET"),
    ai: [
      ...(get("GROQ_API_KEY") ? [{ provider: "groq" as const, key: get("GROQ_API_KEY")!, model: get("GROQ_MODEL") || "llama-3.3-70b-versatile" }] : []),
      ...(get("GEMINI_API_KEY") ? [{ provider: "gemini" as const, key: get("GEMINI_API_KEY")!, model: get("GEMINI_MODEL") || "gemini-flash-lite-latest" }] : []),
    ],
  }
}

// What the admin may see about each key: where it's set and its last 4 characters.
export const describeServiceKeys = async (container: MedusaContainer) => {
  clearServiceKeyCache()
  const stored = await loadStored(container)
  return {
    razorpay_mode: (stored.razorpay_mode ?? ((process.env.RAZORPAY_KEY_ID || "").startsWith("rzp_live_") ? "live" : "test")) as
      | "test"
      | "live",
    keys: KEY_DEFS.map((d) => {
      const saved = stored.values?.[d.name]
      const plain = saved ? decrypt(saved.enc) : null
      const env = envFor(d.name)
      const value = plain ?? env
      return {
        name: d.name,
        group: d.group,
        label: d.label,
        secret: d.secret,
        hint: d.hint,
        source: plain ? "admin" : env ? "server" : null,
        unreadable: !!saved && !plain,
        // Non-secret values (Key Id, sender, Client ID) are shown in full; secrets only end.
        preview: value ? (d.secret ? `…${value.slice(-4)}` : value) : null,
        updated_at: plain ? saved!.updated_at : null,
      }
    }),
    log: (stored.log ?? []).slice(0, 20),
  }
}

// The new stored value after a change (validated by the caller).
export const applyChanges = (
  stored: Stored,
  changes: Partial<Record<KeyName, string | null>>,
  mode: "test" | "live" | undefined,
  by: string
): { next: Stored; changed: string[] } => {
  const values = { ...(stored.values ?? {}) }
  const changed: string[] = []
  for (const def of KEY_DEFS) {
    if (!(def.name in changes)) continue
    const v = changes[def.name]
    if (v === null) {
      if (values[def.name]) {
        values[def.name] = null
        changed.push(`${def.label} removed`)
      }
    } else if (typeof v === "string" && v) {
      values[def.name] = { enc: encrypt(v), last4: v.slice(-4), updated_at: new Date().toISOString() }
      changed.push(`${def.label} ${stored.values?.[def.name] ? "changed" : "added"}`)
    }
  }
  let razorpay_mode = stored.razorpay_mode
  if (mode && mode !== (stored.razorpay_mode ?? "test")) {
    razorpay_mode = mode
    changed.push(`Razorpay switched to ${mode === "live" ? "Live" : "Test"} mode`)
  } else if (mode) {
    razorpay_mode = mode
  }
  const at = new Date().toISOString()
  const log = [...changed.map((what) => ({ at, by, what })), ...(stored.log ?? [])].slice(0, 50)
  return { next: { values, razorpay_mode, log }, changed }
}

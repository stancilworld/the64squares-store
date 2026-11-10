import crypto from "node:crypto"
import { MedusaError } from "@medusajs/framework/utils"
import type { PayuCreds } from "../../lib/service-keys"

// PayU India: the parts that don't depend on Medusa (hashes, addresses, API calls), so they
// can be tested on their own. Docs: docs.payu.in (Hosted Checkout, Verify Payment API,
// Refund Transaction API, Webhooks).

export type Mode = "test" | "live"

// Where the shopper pays, and PayU's server-to-server API, for each mode. PAYU_API_BASE
// (tests only) sends both to a stand-in server.
export const payuUrls = (mode: Mode, base = process.env.PAYU_API_BASE) => {
  if (base) {
    const b = base.replace(/\/$/, "")
    return { pay: `${b}/_payment`, api: `${b}/merchant/postservice?form=2` }
  }
  return mode === "live"
    ? { pay: "https://secure.payu.in/_payment", api: "https://info.payu.in/merchant/postservice?form=2" }
    : { pay: "https://test.payu.in/_payment", api: "https://test.payu.in/merchant/postservice?form=2" }
}

const sha512 = (s: string) => crypto.createHash("sha512").update(s, "utf8").digest("hex")

// The fields sent to PayU with the shopper (udf1: payment session, udf2: cart).
export type PayFields = {
  key: string
  txnid: string
  amount: string
  productinfo: string
  firstname: string
  email: string
  phone: string
  surl: string
  furl: string
  udf1: string
  udf2: string
  udf3: string
  udf4: string
  udf5: string
}

// Request hash: sha512(key|txnid|amount|productinfo|firstname|email|udf1|…|udf5||||||SALT).
export const requestHash = (f: PayFields, salt: string) =>
  sha512([f.key, f.txnid, f.amount, f.productinfo, f.firstname, f.email, f.udf1, f.udf2, f.udf3, f.udf4, f.udf5, "", "", "", "", "", salt].join("|"))

// Response hash (what PayU sends back, on the return and in webhooks):
// sha512([additionalCharges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key).
export const responseHash = (p: Record<string, string | undefined>, salt: string) => {
  const parts = [
    salt,
    p.status ?? "",
    "",
    "",
    "",
    "",
    "",
    p.udf5 ?? "",
    p.udf4 ?? "",
    p.udf3 ?? "",
    p.udf2 ?? "",
    p.udf1 ?? "",
    p.email ?? "",
    p.firstname ?? "",
    p.productinfo ?? "",
    p.amount ?? "",
    p.txnid ?? "",
    p.key ?? "",
  ]
  if (p.additionalCharges) parts.unshift(p.additionalCharges)
  return sha512(parts.join("|"))
}

export const sameHash = (a: string, b: string) => {
  const x = Buffer.from(a.toLowerCase())
  const y = Buffer.from(b.toLowerCase())
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

// Command hash for the server API: sha512(key|command|var1|salt).
export const commandHash = (key: string, command: string, var1: string, salt: string) => sha512(`${key}|${command}|${var1}|${salt}`)

export type PayuTxn = {
  txnid: string
  mihpayid?: string
  status: string // success | failure | pending | Not Found
  unmappedstatus?: string
  amt?: string
  mode?: string
  error_Message?: string
}

const timeout = (ms: number) => {
  const c = new AbortController()
  setTimeout(() => c.abort(), ms).unref?.()
  return c.signal
}

export const payuCommand = async (creds: PayuCreds, command: string, vars: string[]) => {
  const body = new URLSearchParams({ key: creds.key, command, hash: commandHash(creds.key, command, vars[0], creds.salt) })
  vars.forEach((v, i) => body.set(`var${i + 1}`, v))
  const res = await fetch(payuUrls(creds.mode).api, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
    signal: timeout(15_000),
  })
  const text = await res.text()
  let json: Record<string, any> | null = null
  try {
    json = JSON.parse(text)
  } catch {
    json = null
  }
  if (!res.ok || !json) throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `PayU answered with an error (${res.status}): ${text.slice(0, 160)}`)
  return json
}

// Asks PayU (server to server) how one or more payments went.
export const verifyPayments = async (creds: PayuCreds, txnids: string[]): Promise<Map<string, PayuTxn>> => {
  const json = await payuCommand(creds, "verify_payment", [txnids.join("|")])
  const out = new Map<string, PayuTxn>()
  if (Number(json.status) !== 1 && !json.transaction_details) {
    // "Invalid Hash" / wrong key: say so instead of treating payments as unpaid.
    const msg = String(json.msg ?? "")
    if (/invalid|hash|key/i.test(msg)) throw new MedusaError(MedusaError.Types.NOT_ALLOWED, `PayU: ${msg}`)
  }
  for (const [id, t] of Object.entries((json.transaction_details ?? {}) as Record<string, PayuTxn>)) out.set(id, { ...t, txnid: id })
  return out
}

// The payment is complete only when PayU says success (captured or authorised).
export const isPaid = (t: PayuTxn | undefined) => !!t && t.status === "success" && (!t.unmappedstatus || ["captured", "auth"].includes(t.unmappedstatus))
export const isFailed = (t: PayuTxn | undefined) => !!t && t.status === "failure"

// A unique transaction id (PayU allows letters and numbers, up to 25 characters).
export const newTxnId = () => `t64${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`.slice(0, 25)

export const toAmount = (rupees: number) => (Math.round(rupees * 100) / 100).toFixed(2)

// PayU's form takes plain text; keep what customers type within its limits.
export const clean = (s: unknown, max: number) =>
  String(s ?? "")
    .replace(/[|<>"'`\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)

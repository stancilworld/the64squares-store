import crypto from "node:crypto"

// One-time sign-in codes sent by email (see modules/otp-auth and api/store/otp).
export const OTP_PROVIDER = "otp"
export const OTP_TTL_MS = 10 * 60_000 // a code works for 10 minutes
export const OTP_MAX_ATTEMPTS = 5 // wrong tries before the code stops working
export const OTP_RESEND_MS = 30_000 // wait between two codes
export const OTP_MAX_PER_HOUR = 6

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const isEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)

export const newCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")

export const hashCode = (email: string, code: string) =>
  crypto
    .createHmac("sha256", process.env.JWT_SECRET || "stancil-otp")
    .update(`${normalizeEmail(email)}:${code}`)
    .digest("hex")

export type OtpMeta = {
  code_hash?: string | null
  expires_at?: number
  attempts?: number
  sent?: number[]
}

export const sameHash = (a: string, b: string) =>
  a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))

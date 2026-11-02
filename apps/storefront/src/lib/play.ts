"use server"

import crypto from "node:crypto"
import { SignJWT } from "jose"
import { cookies } from "next/headers"
import { getCustomer } from "./auth"

// A short-lived pass for the game server, signed with a secret both servers share. It
// carries only the player's id and the name shown on the board, never their login.
const secret = () => {
  const s = process.env.PLAY_TOKEN_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-play-secret")
  return s ? new TextEncoder().encode(s) : null
}

export type PlayPass = { token: string; me: { id: string; name: string; guest: boolean } }

const sign = (key: Uint8Array, sub: string, name: string, guest: boolean) =>
  new SignJWT({ name, ...(guest ? { guest: true } : {}) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .setAudience("the64squares-play")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key)

// Signed-in players only (null for visitors).
export async function getPlayPass(): Promise<PlayPass | null> {
  const key = secret()
  const customer = await getCustomer()
  if (!customer || !key) return null
  const name =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || customer.email.split("@")[0]
  return { token: await sign(key, customer.id, name, false), me: { id: customer.id, name, guest: false } }
}

const GUEST_COOKIE = "t64_guest"
const guestName = (id: string) => `Guest${(parseInt(crypto.createHash("sha256").update(id).digest("hex").slice(0, 8), 16) % 9000) + 1000}`

// Visitors play as a guest: the same guest id is kept in this browser for a year, so a guest
// can come back to an unfinished game. Guest games never count for ratings.
export async function getGuestPass(): Promise<PlayPass | null> {
  const signedIn = await getPlayPass()
  if (signedIn) return signedIn
  const key = secret()
  if (!key) return null
  const jar = await cookies()
  let id = jar.get(GUEST_COOKIE)?.value ?? ""
  if (!/^guest_[A-Za-z0-9]{16}$/.test(id)) {
    id = `guest_${crypto.randomBytes(12).toString("base64url").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).padEnd(16, "x")}`
    jar.set(GUEST_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 365 * 24 * 3600, path: "/" })
  }
  const name = guestName(id)
  return { token: await sign(key, id, name, true), me: { id, name, guest: true } }
}

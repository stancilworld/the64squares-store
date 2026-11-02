"use server"

import { SignJWT } from "jose"
import { getCustomer } from "./auth"

// A short-lived pass for the game server, signed with a secret both servers share. It
// carries only the customer's id and the name shown on the board, never their login.
const secret = () => {
  const s = process.env.PLAY_TOKEN_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-play-secret")
  return s ? new TextEncoder().encode(s) : null
}

export type PlayPass = { token: string; me: { id: string; name: string } }

export async function getPlayPass(): Promise<PlayPass | null> {
  const key = secret()
  const customer = await getCustomer()
  if (!customer || !key) return null
  const name =
    [customer.first_name, customer.last_name].filter(Boolean).join(" ").trim() || customer.email.split("@")[0]
  const token = await new SignJWT({ name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(customer.id)
    .setAudience("the64squares-play")
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key)
  return { token, me: { id: customer.id, name } }
}

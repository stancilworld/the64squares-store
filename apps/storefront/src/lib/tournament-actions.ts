"use server"

import { updateTag } from "next/cache"
import { getToken } from "./auth"
import { sdk } from "./medusa"
import type { Ticket } from "./tournament-types"

const headers = async (): Promise<Record<string, string>> => {
  const token = await getToken()
  return token ? { authorization: `Bearer ${token}` } : {}
}

export type RegisterInput = {
  player_name: string
  phone: string | null
  fide_id: string | null
  rating: number | null
  city: string | null
}

type Result = { ok: true; ticket: Ticket } | { ok: false; error: string; signIn?: boolean }

export async function registerForTournament(handle: string, input: RegisterInput): Promise<Result> {
  const h = await headers()
  if (!h.authorization) {
    return { ok: false, error: "Please sign in to register.", signIn: true }
  }
  try {
    const { ticket } = await sdk.client.fetch<{ ticket: Ticket }>(`/store/tournaments/${encodeURIComponent(handle)}/register`, {
      method: "POST",
      headers: h,
      body: input,
    })
    updateTag("tournaments")
    return { ok: true, ticket }
  } catch (e) {
    const status = (e as { status?: number }).status
    const message = (e as { message?: string }).message
    if (status === 401) return { ok: false, error: "Please sign in again to register.", signIn: true }
    return { ok: false, error: message && !/fetch failed|ECONN/i.test(message) ? message : "Registration didn't go through. Please try again." }
  }
}

export async function getMyTickets(): Promise<Ticket[]> {
  const h = await headers()
  if (!h.authorization) return []
  try {
    const { tickets } = await sdk.client.fetch<{ tickets: Ticket[] }>("/store/account/tournaments", { headers: h })
    return tickets
  } catch {
    return []
  }
}

export async function getMyTicket(code: string): Promise<Ticket | null> {
  const h = await headers()
  if (!h.authorization) return null
  try {
    const { ticket } = await sdk.client.fetch<{ ticket: Ticket }>(`/store/account/tournaments/${encodeURIComponent(code)}`, { headers: h })
    return ticket
  } catch {
    return null
  }
}

export async function cancelMyTicket(code: string): Promise<{ ok: boolean; error?: string }> {
  const h = await headers()
  try {
    await sdk.client.fetch(`/store/account/tournaments/${encodeURIComponent(code)}/cancel`, { method: "POST", headers: h })
    updateTag("tournaments")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as { message?: string }).message || "Couldn't cancel. Please try again." }
  }
}

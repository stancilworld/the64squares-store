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
  player_name?: string
  phone?: string | null
  fide_id?: string | null
  rating?: number | null
  city?: string | null
  source?: string | null
}

type Result = { ok: true; ticket: Ticket } | { ok: false; error: string; signIn?: boolean; profile?: boolean }

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
    if (status === 409) return { ok: false, error: "Please complete your player profile first.", profile: true }
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

// ---- Online tournaments: passes, the player profile ("Almost done") and check-in ----

export type PassWallet = {
  balance: number
  history: { id: string; delta: number; reason: string; label: string; note: string | null; created_at: string }[]
  rules: { welcome: number; games_per_pass: number; games_daily_max: number; puzzle_streak_days: number; puzzle_pass: number; referral: number; referral_monthly_max: number; completed: number }
}

export async function getMyPasses(): Promise<PassWallet | null> {
  const h = await headers()
  if (!h.authorization) return null
  try {
    return await sdk.client.fetch<PassWallet>("/store/account/passes", { headers: h })
  } catch {
    return null
  }
}

export type PlayerProfile = {
  first_name: string
  last_name: string
  dob: string | null
  city: string | null
  state: string | null
  guardian_name: string | null
  guardian_phone: string | null
  guardian_consent: boolean
  terms: boolean
  age: number | null
  missing: string[]
  complete: boolean
  states: string[]
}

export async function getPlayerProfile(): Promise<PlayerProfile | null> {
  const h = await headers()
  if (!h.authorization) return null
  try {
    return (await sdk.client.fetch<{ profile: PlayerProfile }>("/store/account/player-profile", { headers: h })).profile
  } catch {
    return null
  }
}

export type PlayerProfileInput = {
  first_name: string
  last_name: string
  dob: string
  city: string
  state: string
  guardian_name?: string | null
  guardian_phone?: string | null
  guardian_consent?: boolean
  terms: boolean
  marketing?: boolean
}

export async function savePlayerProfile(input: PlayerProfileInput): Promise<{ ok: true; profile: PlayerProfile } | { ok: false; error: string }> {
  const h = await headers()
  if (!h.authorization) return { ok: false, error: "Please sign in first." }
  try {
    const { profile } = await sdk.client.fetch<{ profile: PlayerProfile }>("/store/account/player-profile", { method: "POST", headers: h, body: input })
    return { ok: true, profile }
  } catch (e) {
    return { ok: false, error: (e as { message?: string }).message || "Couldn't save. Please try again." }
  }
}

export async function checkInToTournament(handle: string): Promise<{ ok: true; ticket: Ticket } | { ok: false; error: string }> {
  const h = await headers()
  if (!h.authorization) return { ok: false, error: "Please sign in first." }
  try {
    const { ticket } = await sdk.client.fetch<{ ticket: Ticket }>(`/store/tournaments/${encodeURIComponent(handle)}/check-in`, { method: "POST", headers: h })
    updateTag("tournaments")
    return { ok: true, ticket }
  } catch (e) {
    return { ok: false, error: (e as { message?: string }).message || "Check-in didn't go through. Please try again." }
  }
}

export type PrizeAddress = { name: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string }

// A prize winner tells us where to send it.
export async function sendPrizeAddress(handle: string, address: PrizeAddress): Promise<{ ok: true; ticket: Ticket } | { ok: false; error: string }> {
  const h = await headers()
  if (!h.authorization) return { ok: false, error: "Please sign in first." }
  try {
    const { ticket } = await sdk.client.fetch<{ ticket: Ticket }>(`/store/tournaments/${encodeURIComponent(handle)}/prize-address`, { method: "POST", headers: h, body: address })
    return { ok: true, ticket }
  } catch (e) {
    return { ok: false, error: (e as { message?: string }).message || "Couldn't save the address. Please try again." }
  }
}

// Counts a visit to a tournament page (for the organisers' funnel report).
export async function recordTournamentVisit(handle: string, visitor: string, source: string) {
  try {
    await sdk.client.fetch(`/store/tournaments/${encodeURIComponent(handle)}/visit`, { method: "POST", body: { visitor, source: source.slice(0, 60) } })
  } catch {
    // Not important enough to bother the visitor.
  }
}

export type Invite = { code: string; link: string }

// The player's invite link (a friend who joins and plays earns them a pass), when invites are on.
export async function getPlayInvite(): Promise<Invite | null> {
  const h = await headers()
  if (!h.authorization) return null
  try {
    const r = await sdk.client.fetch<{ code: string; link: string }>("/store/account/referral", { headers: h })
    return { code: r.code, link: r.link.replace(/\/\?code=/, "/play?code=") }
  } catch {
    return null
  }
}

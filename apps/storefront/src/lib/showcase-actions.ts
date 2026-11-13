"use server"

import { getToken } from "./auth"
import { sdk } from "./medusa"
import type { Given } from "./showcase-types"

// An advert was seen (once per visit) or its button used.
export async function countAd(id: string, what: "views" | "clicks") {
  if (!/^ad_[A-Za-z0-9]+$/.test(id)) return
  await sdk.client.fetch(`/store/showcase/${id}/count`, { method: "POST", body: { what } }).catch(() => {})
}

type ClaimResult = { ok: true; given: Given; message: string; again: boolean } | { ok: false; error: string; signIn?: boolean }

// Claims an advert's reward, or a members-only coupon code.
export async function claimAd(id: string): Promise<ClaimResult> {
  const token = await getToken()
  if (!token) return { ok: false, error: "Sign in to claim this.", signIn: true }
  try {
    const r = await sdk.client.fetch<{ given: Given; message: string; again: boolean }>(`/store/showcase/${id}/claim`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    })
    return { ok: true, ...r }
  } catch (e) {
    const status = (e as { status?: number }).status
    if (status === 401) return { ok: false, error: "Sign in again to claim this.", signIn: true }
    return { ok: false, error: (e as { message?: string }).message || "Couldn't claim this. Try again." }
  }
}

// What this player has already claimed, by advert.
export async function myAdClaims(): Promise<Record<string, Given>> {
  const token = await getToken()
  if (!token) return {}
  try {
    const { claims } = await sdk.client.fetch<{ claims: { ad_id: string; given: Given }[] }>("/store/showcase/claims", {
      headers: { authorization: `Bearer ${token}` },
    })
    return Object.fromEntries(claims.map((c) => [c.ad_id, c.given]))
  } catch {
    return {}
  }
}

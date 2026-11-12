import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

// What a player tells us once before their first tournament ("Almost done"), kept on their
// account (customer metadata `t64_player`). Under-18s need a parent or guardian's consent.

export type PlayerProfile = {
  dob: string | null // YYYY-MM-DD
  city: string | null
  state: string | null
  guardian: { name: string; phone: string; consent_at: string } | null
  terms_at: string | null // tournament rules, fair-play policy and privacy policy accepted
}

export const EMPTY_PLAYER: PlayerProfile = { dob: null, city: null, state: null, guardian: null, terms_at: null }

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir",
  "Jharkhand", "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Outside India",
]

// Whole years on a given day.
export const ageOn = (dob: string | null, on: Date = new Date()) => {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const [y, m, d] = dob.split("-").map(Number)
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(on).split("-").map(Number)
  let age = day[0] - y
  if (day[1] < m || (day[1] === m && day[2] < d)) age--
  return age
}

export const playerOf = (metadata: Record<string, unknown> | null | undefined): PlayerProfile => ({
  ...EMPTY_PLAYER,
  ...(((metadata ?? {}) as { t64_player?: Partial<PlayerProfile> }).t64_player ?? {}),
})

type CustomerLike = { first_name?: string | null; last_name?: string | null; phone?: string | null; metadata?: Record<string, unknown> | null }

// What is still missing before the player can enter a tournament.
export const missingFor = (c: CustomerLike) => {
  const p = playerOf(c.metadata)
  const out: string[] = []
  if (!c.first_name?.trim()) out.push("first_name")
  if (!c.last_name?.trim()) out.push("last_name")
  if (!p.dob) out.push("dob")
  if (!p.city) out.push("city")
  if (!p.state) out.push("state")
  if (!p.terms_at) out.push("terms")
  const age = ageOn(p.dob)
  if (age != null && age < 18 && !p.guardian?.consent_at) out.push("guardian")
  return out
}

export const loadPlayer = async (c: MedusaContainer, customerId: string) => {
  const customers = c.resolve(Modules.CUSTOMER)
  const me = await customers.retrieveCustomer(customerId)
  const p = playerOf(me.metadata as Record<string, unknown> | null)
  return { customer: me, player: p, age: ageOn(p.dob), missing: missingFor(me as CustomerLike) }
}

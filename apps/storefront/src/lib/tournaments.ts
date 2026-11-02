import { cacheLife, cacheTag } from "next/cache"
import { sdk } from "./medusa"
import type { Tournament } from "./tournament-types"

// Public tournament pages. Kept fresh for seconds, since places fill up.
export async function getTournaments(): Promise<{ upcoming: Tournament[]; past: Tournament[] }> {
  "use cache"
  cacheLife("seconds")
  cacheTag("tournaments")
  try {
    return await sdk.client.fetch<{ upcoming: Tournament[]; past: Tournament[] }>("/store/tournaments")
  } catch {
    return { upcoming: [], past: [] }
  }
}

export async function getTournament(handle: string): Promise<Tournament | null> {
  "use cache"
  cacheLife("seconds")
  cacheTag("tournaments")
  try {
    const { tournament } = await sdk.client.fetch<{ tournament: Tournament }>(`/store/tournaments/${encodeURIComponent(handle)}`)
    return tournament
  } catch {
    return null
  }
}

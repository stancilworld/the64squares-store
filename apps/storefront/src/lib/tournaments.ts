import { cacheLife, cacheTag } from "next/cache"
import { sdk } from "./medusa"
import type { Tournament } from "./tournament-types"

// Public tournament pages. Refreshed every 30 seconds (and at once on each registration), since places fill up.
export async function getTournaments(): Promise<{ upcoming: Tournament[]; past: Tournament[] }> {
  "use cache"
  cacheLife({ stale: 30, revalidate: 30, expire: 3600 })
  cacheTag("tournaments")
  try {
    return await sdk.client.fetch<{ upcoming: Tournament[]; past: Tournament[] }>("/store/tournaments")
  } catch {
    return { upcoming: [], past: [] }
  }
}

export async function getTournament(handle: string): Promise<Tournament | null> {
  "use cache"
  cacheLife({ stale: 30, revalidate: 30, expire: 3600 })
  cacheTag("tournaments")
  try {
    const { tournament } = await sdk.client.fetch<{ tournament: Tournament }>(`/store/tournaments/${encodeURIComponent(handle)}`)
    return tournament
  } catch {
    return null
  }
}

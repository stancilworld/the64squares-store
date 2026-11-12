import { cacheLife, cacheTag } from "next/cache"
import { sdk } from "./medusa"
import { GAME_URL } from "./game-types"
import type { Certificate, PublicPlayer, Tournament, TourneySummary, TourneyView } from "./tournament-types"

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

// What's happening in recent and coming online events (phase, live games, leader), from the
// game server. Short-lived: it changes while events run.
export async function getTourneySummaries(): Promise<TourneySummary[]> {
  try {
    const res = await fetch(`${GAME_URL}/game/tourneys`, { cache: "no-store", signal: AbortSignal.timeout(3000) })
    return res.ok ? ((await res.json()) as { tourneys: TourneySummary[] }).tourneys : []
  } catch {
    return []
  }
}

// A tournament's pairings, standings or bracket, live boards and stats (first paint; the page
// then follows changes live).
export async function getTourneyView(id: string): Promise<TourneyView | null> {
  try {
    const res = await fetch(`${GAME_URL}/game/tourneys/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(3000) })
    return res.ok ? ((await res.json()) as { tourney: TourneyView }).tourney : null
  } catch {
    return null
  }
}

export async function getTournamentPlayers(handle: string): Promise<PublicPlayer[]> {
  try {
    return (await sdk.client.fetch<{ players: PublicPlayer[] }>(`/store/tournaments/${encodeURIComponent(handle)}/players`, { cache: "no-store" } as never)).players
  } catch {
    return []
  }
}

// A tournament certificate, for its verification page (the QR code on it opens this).
export async function getCertificate(no: string): Promise<Certificate | null> {
  "use cache"
  cacheLife({ stale: 60, revalidate: 60, expire: 3600 })
  try {
    return (await sdk.client.fetch<{ certificate: Certificate }>(`/store/certificates/${encodeURIComponent(no)}`)).certificate
  } catch {
    return null
  }
}

"use client"

import { useEffect, useSyncExternalStore } from "react"
import { GAME_URL, LIVE_KEY } from "@/lib/game-types"
import type { PlayPass } from "@/lib/play"

// What's live for this player, shared by the "Live now" panel and the "return to your game"
// bar: games in progress (signed in, or this browser's game as a guest), tournaments they've
// joined, and tournaments on now or this week. Polled while something on screen uses it.

export type LiveGame = {
  id: string
  mode: string
  colour: "w" | "b" | null
  opponent: string
  opponent_rating: number | null
  initial_ms: number
  increment_ms: number
}
export type LiveTournament = {
  id: string
  title: string
  handle: string
  format: string
  mode: "online" | "offline"
  time_control: string
  starts_at: string
  ends_at: string | null
  players?: number
}
// A tournament lobby open now that this player plays in or moderates.
export type LiveLobby = LiveTournament & { moderating: boolean }
export type LiveNow = { games: LiveGame[]; lobbies: LiveLobby[]; tournaments: LiveTournament[]; events: LiveTournament[] }

const listeners = new Set<() => void>()
let snapshot: LiveNow | null = null
let token: string | null = null
let timer: ReturnType<typeof setInterval> | null = null
let loading: Promise<void> | null = null

const emit = () => {
  for (const l of listeners) l()
}
const json = (r: Response) => (r.ok ? r.json() : null)

// This browser's game (also how guests find theirs).
const browserGame = async (): Promise<LiveGame | null> => {
  let id: string | null = null
  try {
    id = window.localStorage.getItem(LIVE_KEY)
  } catch {}
  if (!id) return null
  const d = await fetch(`${GAME_URL}/game/games/${id}/status`).then(json).catch(() => null)
  if (d?.status !== "active") {
    if (d) {
      try {
        window.localStorage.removeItem(LIVE_KEY)
      } catch {}
    }
    return null
  }
  return {
    id: d.id,
    mode: d.mode,
    colour: null,
    opponent: `${d.white?.name ?? "?"} vs ${d.black?.name ?? "?"}`,
    opponent_rating: null,
    initial_ms: 0,
    increment_ms: 0,
  }
}

const load = () => {
  if (loading) return loading
  loading = (async () => {
    const [me, ev, mine] = await Promise.all([
      token ? fetch(`${GAME_URL}/game/me/active`, { headers: { authorization: `Bearer ${token}` } }).then(json).catch(() => null) : null,
      fetch(`${GAME_URL}/game/events`).then(json).catch(() => null),
      browserGame(),
    ])
    const games: LiveGame[] = (me?.games ?? []).filter((g: LiveGame) => g.id)
    if (mine && !games.some((g) => g.id === mine.id)) games.unshift(mine)
    const lobbies: LiveLobby[] = me?.lobbies ?? []
    const inLobby = new Set(lobbies.map((t) => t.id))
    const tournaments: LiveTournament[] = (me?.tournaments ?? []).filter((t: LiveTournament) => !inLobby.has(t.id))
    const joined = new Set([...inLobby, ...tournaments.map((t) => t.id)])
    const events: LiveTournament[] = (ev?.events ?? []).filter((t: LiveTournament) => !joined.has(t.id))
    snapshot = { games, lobbies, tournaments, events }
    emit()
  })().finally(() => {
    loading = null
  })
  return loading
}

export const refreshLive = () => void load()

const subscribe = (l: () => void) => {
  listeners.add(l)
  if (!timer) {
    void load()
    timer = setInterval(() => void load(), 20_000)
  }
  return () => {
    listeners.delete(l)
    if (!listeners.size && timer) {
      clearInterval(timer)
      timer = null
    }
  }
}

export function useLiveNow(pass: PlayPass | null) {
  useEffect(() => {
    const t = pass?.token ?? null
    if (t !== token) {
      token = t
      void load()
    }
  }, [pass?.token])
  return useSyncExternalStore(subscribe, () => snapshot, () => null)
}

// "On now", "Today, 6:30 pm" or "14 Nov, 6:30 pm".
export const whenText = (t: LiveTournament) => {
  const start = new Date(t.starts_at).getTime()
  if (start <= Date.now()) return "On now"
  const d = new Date(start)
  const today = new Date().toDateString() === d.toDateString()
  return today
    ? `Today, ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
    : d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

export const tournamentHref = (t: LiveTournament) => (t.mode === "online" ? `/play/tournaments/${t.handle}` : `/tournaments/${t.handle}`)
export const lobbyHref = (t: LiveTournament) => `/play/tournaments/${t.handle}/lobby`

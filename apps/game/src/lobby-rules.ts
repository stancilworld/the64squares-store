// Tournament lobby rules (pure, tested in lobby-rules.test.ts): when a lobby is open, who
// may write where, and in what form.

export type Role = "moderator" | "player" | "spectator"
export type Channel = "players" | "spectators" | "arbiter" | "all"
export type Kind = "text" | "quick" | "announce" | "system"

// Moderators choose how the players' and spectators' chats work.
//   players_chat:   open  = players talk to each other
//                   quick = players send the quick messages only (the default)
//                   off   = only moderators write (players can still ask the arbiter)
//   spectator_chat: open / slow (one message every 15 s each) / off
export type PlayersChat = "open" | "quick" | "off"
export type SpectatorChat = "open" | "slow" | "off"
export type Settings = { players_chat: PlayersChat; spectator_chat: SpectatorChat; pinned: string | null; voice_on: boolean }
export const DEFAULT_SETTINGS: Settings = { players_chat: "quick", spectator_chat: "open", pinned: null, voice_on: false }

export const LOBBY_QUICK = ["Good luck everyone!", "Have fun!", "Ready!", "Good game!", "Well played!", "Thanks!", "Congratulations!", "When does the next round start?", "👋", "👍", "🔥", "👏", "♟️"] as const

export type Who = { role: Role; signedIn: boolean; minor: boolean; muted: boolean; removed: boolean }

// The lobby opens with check-in (at least 30 minutes before the start) and closes an hour
// after the tournament ends.
export const lobbyWindow = (t: { starts_at: number; check_in_minutes: number; ends_at: number | null; finished_at: number | null; cancelled: boolean }) => {
  const opens = t.starts_at - Math.max(30, t.check_in_minutes) * 60_000
  const end = t.finished_at ?? t.ends_at ?? t.starts_at + 6 * 3600_000
  return { opens_at: opens, closes_at: end + 3600_000, cancelled: t.cancelled }
}
export const isOpen = (w: ReturnType<typeof lobbyWindow>, now: number) => !w.cancelled && now >= w.opens_at && now < w.closes_at

// Which channels a role reads.
export const readable = (role: Role): Channel[] =>
  role === "moderator" ? ["all", "players", "spectators", "arbiter"] : role === "player" ? ["all", "players", "spectators", "arbiter"] : ["all", "spectators"]

// May this person write this kind of message in this channel? null = yes, else the reason.
export const canWrite = (who: Who, s: Settings, channel: Channel, kind: Kind): string | null => {
  if (!who.signedIn) return "sign-in"
  if (who.removed) return "removed"
  if (who.role === "moderator") return channel === "all" && kind !== "announce" ? "bad-request" : null
  if (who.muted) return "muted"
  if (kind === "announce" || kind === "system" || channel === "all") return "moderators-only"
  if (channel === "arbiter") return who.role === "player" ? (kind === "text" || kind === "quick" ? null : "bad-request") : "players-only"
  // Children send the quick messages only, to people they don't know.
  if (who.minor && kind === "text") return "quick-only"
  if (channel === "players") {
    if (who.role !== "player") return "players-only"
    if (s.players_chat === "off") return "chat-off"
    if (s.players_chat === "quick" && kind === "text") return "quick-only"
    return null
  }
  if (channel === "spectators") {
    if (s.spectator_chat === "off") return "chat-off"
    return null
  }
  return "bad-request"
}

// Seconds between messages for one person in a channel.
export const cooldownMs = (who: Who, s: Settings, channel: Channel) =>
  who.role === "moderator" ? 500 : channel === "spectators" && s.spectator_chat === "slow" ? 15_000 : 2_000

export const ageOn = (dob: unknown, now = new Date()) => {
  if (typeof dob !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return null
  const [y, m, d] = dob.split("-").map(Number)
  let age = now.getUTCFullYear() - y
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age--
  return age
}

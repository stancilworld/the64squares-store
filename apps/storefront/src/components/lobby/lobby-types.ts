// What the game server sends for a tournament lobby (see apps/game/src/lobby.ts).

export type Role = "moderator" | "player" | "spectator"
export type Channel = "players" | "spectators" | "arbiter" | "all"
export type Kind = "text" | "quick" | "announce" | "system"
export type PlayersChat = "open" | "quick" | "off"
export type SpectatorChat = "open" | "slow" | "off"
export type LobbySettings = { players_chat: PlayersChat; spectator_chat: SpectatorChat; pinned: string | null; voice_on: boolean }

export type LobbyMsg = { id: string; channel: Channel; thread: string | null; kind: Kind; text: string; at: number; author: { id: string; name: string; role: Role } }
export type Person = { id: string; name: string; avatar_url: string | null; username: string | null }
export type Presence = { moderators: Person[]; players: Person[]; spectators: number }
export type LobbyMe = { id: string; name: string; guest: boolean; minor: boolean; muted_until: number | null; removed: boolean }

export type LobbyJoin = {
  ok: true
  tid: string
  server_now: number
  window: { opens_at: number; closes_at: number; cancelled: boolean; open: boolean }
  role: Role
  me: LobbyMe | null
  settings: LobbySettings
  quick: string[]
  messages: LobbyMsg[]
  presence: Presence
}

export const ROLE_LABEL: Record<Role, string> = { moderator: "Moderator", player: "Player", spectator: "Spectator" }

// Which composer a person gets in a channel (the server checks again).
export const writeMode = (role: Role, me: LobbyMe | null, s: LobbySettings, channel: Channel, now: number): { mode: "text" | "quick" | "none"; why: string | null } => {
  if (!me || me.guest) return { mode: "none", why: "Sign in to chat." }
  if (me.removed) return { mode: "none", why: "A moderator removed you from the chat for this tournament." }
  if (role === "moderator") return { mode: "text", why: null }
  if (me.muted_until && me.muted_until > now) return { mode: "none", why: "A moderator muted you for a few minutes." }
  if (channel === "arbiter") return role === "player" ? { mode: "text", why: null } : { mode: "none", why: null }
  if (channel === "players") {
    if (role !== "player") return { mode: "none", why: null }
    if (s.players_chat === "off") return { mode: "none", why: "Only moderators write here right now. Questions? Ask the arbiter." }
    if (s.players_chat === "quick" || me.minor) return { mode: "quick", why: me.minor ? null : "Quick messages only for now. A moderator can open the chat." }
    return { mode: "text", why: null }
  }
  if (channel === "spectators") {
    if (s.spectator_chat === "off") return { mode: "none", why: "The spectators' chat is closed for now." }
    if (me.minor) return { mode: "quick", why: null }
    return { mode: "text", why: s.spectator_chat === "slow" ? "Slow mode: one message every 15 seconds." : null }
  }
  return { mode: "none", why: null }
}

export const SEND_ERROR: Record<string, string> = {
  "sign-in": "Sign in to chat.",
  removed: "You were removed from this chat.",
  muted: "You're muted for a few minutes.",
  "quick-only": "Quick messages only here.",
  "chat-off": "This chat is closed for now.",
  "players-only": "Only players write here.",
  "moderators-only": "Only moderators can do that.",
  "slow-down": "Slow down a little.",
  closed: "The lobby is closed.",
  empty: "Write something first.",
  "is-moderator": "That's a moderator.",
}

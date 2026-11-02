export type Level = { level: number; title: string; xp: number; into: number; needed: number }

export type PublicProfile = {
  player_id: string
  username: string
  display_name: string
  avatar_url: string | null
  bio: string
  city: string
  xp: number
  level: Level
  joined: string
  online: boolean
}

export type Results = { games: number; wins: number; draws: number; losses: number }

export type FullProfile = PublicProfile & {
  ratings: { speed: "bullet" | "blitz" | "rapid" | "classical"; rating: number; provisional: boolean; games: number }[]
  stats: { people: Results; computer: Results }
  fair_play_closed?: boolean
}

export const TITLE_COLOURS: Record<string, string> = {
  Pawn: "#9db0a4",
  Knight: "#7fb2d9",
  Bishop: "#8fd19e",
  Rook: "#e0a35c",
  Queen: "#c58be0",
  King: "#e6c57f",
  Grandmaster: "#ff8a6b",
}

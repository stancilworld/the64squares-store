import type { Server, Socket } from "socket.io"
import { isGuest, type Player } from "./game.js"
import type { GameManager } from "./manager.js"

// Chat during a game. Everyone can send the quick messages and emojis; typed messages are
// only for games between friends who are both signed in (many players are children, and
// strangers can't be expected to be polite). Typed messages are filtered, kept short and
// never stored: only the last few are kept in memory so a reload still shows them.

export const QUICK = ["Hi!", "Good luck!", "Have fun!", "Nice move!", "Oops", "Thanks!", "Good game", "Well played", "Rematch?"] as const
export const EMOJI = ["👋", "👍", "😄", "😮", "🤔", "😅", "🔥", "👏", "♟️", "🙏"] as const

// Words that are masked in typed messages (English and common Hindi abuse, written in Latin letters).
const BAD = [
  "fuck", "shit", "bitch", "bastard", "asshole", "dick", "cunt", "slut", "whore", "fag", "nigg", "retard", "motherf",
  "chutiya", "chutiye", "madarchod", "behenchod", "bhenchod", "bhosdi", "bhosdike", "gandu", "gaand", "lund",
  "randi", "harami", "kamina", "kutta", "kutti", "saala", "saali", "lavde", "lawde", "lauda", "tatti",
]
const BAD_RE = new RegExp(`\\b(${BAD.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\w*`, "gi")
// Phone numbers, links and emails aren't allowed (keeps players from being contacted off the site).
const CONTACT_RE = /(https?:\/\/\S+|www\.\S+|\b[\w.-]+@[\w-]+\.\w+|\b\d[\d\s-]{7,}\d\b|\b[\w-]+\.(com|in|net|org|me|io|gg)\b)/gi

export const cleanText = (raw: string) => {
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 140)
  return t.replace(BAD_RE, (m) => "*".repeat(Math.min(m.length, 6))).replace(CONTACT_RE, "•••")
}

type Msg = { id: string; from: "w" | "b"; name: string; kind: "quick" | "emoji" | "text"; text: string; at: number }

const history = new Map<string, Msg[]>()
export const chatHistory = (gameId: string) => history.get(gameId) ?? []
export const dropChat = (gameId: string) => history.delete(gameId)

let seq = 0

export const registerChat = (io: Server, socket: Socket, manager: GameManager, me: () => Player | null) => {
  const sent: number[] = []
  socket.on("game:chat", async (input: { id?: unknown; kind?: unknown; text?: unknown }, ack: unknown) => {
    const reply = typeof ack === "function" ? (ack as (r: Record<string, unknown>) => void) : () => {}
    const p = me()
    if (!p || typeof input?.id !== "string" || typeof input.text !== "string") return reply({ ok: false })
    const g = await manager.get(input.id)
    const colour = g?.colorOf(p.id)
    if (!g || !colour || (g.r.status !== "active" && g.r.status !== "finished")) return reply({ ok: false, error: "not-playing" })
    // At most one message a second and 15 a minute.
    const now = Date.now()
    while (sent.length && now - sent[0] > 60_000) sent.shift()
    if (sent.length >= 15 || (sent.length && now - sent[sent.length - 1] < 1000)) return reply({ ok: false, error: "slow-down" })
    let kind: Msg["kind"]
    let text: string
    if (input.kind === "quick" && (QUICK as readonly string[]).includes(input.text)) [kind, text] = ["quick", input.text]
    else if (input.kind === "emoji" && (EMOJI as readonly string[]).includes(input.text)) [kind, text] = ["emoji", input.text]
    else if (input.kind === "text") {
      const opp = (colour === "w" ? g.r.black : g.r.white)?.id
      const friendly = g.r.mode === "friend" && !isGuest(p.id) && !!opp && !isGuest(opp)
      if (!friendly) return reply({ ok: false, error: "quick-only" })
      text = cleanText(input.text)
      if (!text) return reply({ ok: false })
      kind = "text"
    } else return reply({ ok: false })
    sent.push(now)
    const msg: Msg = { id: `${now.toString(36)}${(seq++).toString(36)}`, from: colour, name: p.name, kind, text, at: now }
    const list = [...chatHistory(g.r.id), msg].slice(-30)
    history.set(g.r.id, list)
    io.to(`game:${g.r.id}`).emit("game:chat", { game: g.r.id, ...msg })
    reply({ ok: true })
  })
}

// Plays a rated game where one player copies the engine's moves (and keeps leaving the tab),
// to see the fair-play checks flag them. Dev tool: npx tsx scripts/fairplay-demo.ts <cheaterId> <victimId>
import { Chess } from "chess.js"
import { SignJWT } from "jose"
import { io, type Socket } from "socket.io-client"
import { Engine } from "../src/engine.js"

const url = process.env.GAME_URL || "http://localhost:9200"
const key = new TextEncoder().encode(process.env.PLAY_TOKEN_SECRET || "local-play-secret")
const token = (sub: string, name: string) => new SignJWT({ name }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("the64squares-play").setExpirationTime("1h").sign(key)
const connect = async (sub: string, name: string) => {
  const s = io(url, { path: "/game/socket.io", auth: { token: await token(sub, name) }, transports: ["websocket"] })
  await new Promise<void>((ok) => s.on("connect", () => ok()))
  return s
}
const call = <T = Record<string, any>>(s: Socket, ev: string, p: unknown) => new Promise<T>((ok) => s.emit(ev, p, (r: T) => ok(r)))

const [cheaterId, victimId] = process.argv.slice(2)
const main = async () => {
  const cheater = await connect(cheaterId, "Cheater")
  const victim = await connect(victimId, "Victim")
  const paired = new Promise<string>((ok) => cheater.on("seek:paired", (p) => ok(p.game_id)))
  console.log(await call(cheater, "seek:join", { tc: "10+0" }), await call(victim, "seek:join", { tc: "10+0" }))
  const id = await paired
  const w = await call<{ game: any }>(cheater, "game:watch", id)
  await call(victim, "game:watch", id)
  const cheaterWhite = w.game.white.id === cheaterId
  console.log("game", id, "cheater plays", cheaterWhite ? "white" : "black")
  const strong = new Engine()
  const weak = new Engine()
  const chess = new Chess()
  let ply = 0
  while (!chess.isGameOver() && ply < 120) {
    const cheaterTurn = (chess.turn() === "w") === cheaterWhite
    const e = cheaterTurn ? await strong.evaluate(chess.fen(), 250) : await weak.evaluate(chess.fen(), 60)
    let uci = e.best!
    if (!cheaterTurn && Math.random() < 0.08) {
      const ms = chess.moves({ verbose: true })
      const m = ms[Math.floor(Math.random() * ms.length)]
      uci = `${m.from}${m.to}${m.promotion ?? ""}`
    }
    if (cheaterTurn && ply > 10 && ply % 6 === 0) cheater.emit("game:focus", { id, away_ms: 4000 + Math.random() * 3000 })
    const who = cheaterTurn ? cheater : victim
    const r = await call(who, "game:move", { id, uci, ply })
    if (!r.ok) throw new Error(`move refused ${uci}: ${JSON.stringify(r)}`)
    chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    ply++
  }
  if (!chess.isGameOver()) await call(victim, "game:resign", id)
  console.log("game over after", ply, "plies:", chess.isCheckmate() ? "checkmate" : "resigned/other")
  strong.stop()
  weak.stop()
  process.exit(0)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})

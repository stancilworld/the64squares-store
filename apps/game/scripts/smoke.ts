// Plays a quick game between two scripted players against a running game server.
//   PLAY_TOKEN_SECRET=... GAME_URL=http://localhost:9200 npx tsx scripts/smoke.ts
import { SignJWT } from "jose"
import { io, type Socket } from "socket.io-client"

const url = process.env.GAME_URL || "http://localhost:9200"
const key = new TextEncoder().encode(process.env.PLAY_TOKEN_SECRET || "local-play-secret")

const token = (sub: string, name: string) =>
  new SignJWT({ name }).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setAudience("the64squares-play").setExpirationTime("1h").sign(key)

const connect = async (sub: string, name: string) => {
  const s = io(url, { path: "/game/socket.io", auth: { token: await token(sub, name) }, transports: ["websocket"] })
  await new Promise<void>((ok, fail) => {
    s.on("connect", () => ok())
    s.on("connect_error", fail)
  })
  return s
}

const call = <T = Record<string, any>>(s: Socket, ev: string, payload: unknown) =>
  new Promise<T>((ok) => s.emit(ev, payload, (res: T) => ok(res)))

const main = async () => {
  const alice = await connect("cus_smoke_alice", "Alice")
  const bob = await connect("cus_smoke_bob", "Bob")
  const created = await call(alice, "game:create", { tc: "3+2", colour: "b" })
  console.log("created", created)
  const id = created.id as string
  console.log("accept", await call(bob, "game:accept", id))
  const watched = await call<{ game: Record<string, any> }>(bob, "game:watch", id)
  console.log("status", watched.game.status, "white", watched.game.white.name, "black", watched.game.black.name)
  const seen: string[] = []
  alice.on("game:state", (g) => seen.push(`${g.moves.length}:${g.status}`))
  // Fool's mate: Bob (white) f3, Alice e5, Bob g4, Alice Qh4#.
  const plays: [Socket, string][] = [
    [bob, "f2f3"],
    [alice, "e7e5"],
    [bob, "g2g4"],
    [alice, "d8h4"],
  ]
  for (let i = 0; i < plays.length; i++) {
    const [who, uci] = plays[i]
    console.log(uci, await call(who, "game:move", { id, uci, ply: i }))
  }
  console.log("illegal after end:", await call(bob, "game:move", { id, uci: "e2e4", ply: 4 }))
  const end = await call<{ game: Record<string, any> }>(bob, "game:watch", id)
  console.log("final", end.game.status, end.game.result, end.game.reason, end.game.moves.join(" "))
  await new Promise((r) => setTimeout(r, 300))
  console.log("alice saw", seen.join(", "))
  const pgn = await fetch(`${url}/game/games/${id}.pgn`).then((r) => r.text())
  console.log(pgn)
  console.log("guest create:", await call(await (async () => {
    const g = io(url, { path: "/game/socket.io", transports: ["websocket"] })
    await new Promise((ok) => g.on("connect", () => ok(null)))
    return g
  })(), "game:create", { tc: "3+2" }))
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

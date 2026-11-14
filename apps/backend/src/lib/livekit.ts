import crypto from "node:crypto"

// LiveKit (lobby voice): the server is LiveKit Cloud or the one on the VPS. The game server
// hands out the passes; the backend only keeps the keys (Settings → Keys) and tests them.

type Lk = { url: string; key: string; secret: string; apiUrl: string }

const b64 = (v: Buffer | string) => Buffer.from(v).toString("base64url")

// An HS256 token in LiveKit's format.
export const livekitToken = (lk: { key: string; secret: string }, claims: Record<string, unknown>, ttlSeconds = 600) => {
  const now = Math.floor(Date.now() / 1000)
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }))
  const body = b64(JSON.stringify({ iss: lk.key, nbf: now - 5, exp: now + ttlSeconds, ...claims }))
  const sig = b64(crypto.createHmac("sha256", lk.secret).update(`${head}.${body}`).digest())
  return `${head}.${body}.${sig}`
}

// Asks the server for its rooms: proves the URL and the keys work.
export const testLivekit = async (lk: Lk) => {
  try {
    const token = livekitToken(lk, { sub: "admin-check", video: { roomList: true } }, 60)
    const r = await fetch(`${lk.apiUrl}/twirp/livekit.RoomService/ListRooms`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    })
    if (r.status === 401) return { ok: false, message: "The voice server refused the key or secret. Check both and Save again." }
    if (!r.ok) return { ok: false, message: `The voice server answered with an error (${r.status}). Check the URL.` }
    const d = (await r.json()) as { rooms?: unknown[] }
    return { ok: true, message: `Voice server reached. ${d.rooms?.length ?? 0} lobby voice room${d.rooms?.length === 1 ? "" : "s"} open now.` }
  } catch {
    return { ok: false, message: "Couldn't reach the voice server. Check the URL, and on your own VPS that the update script has run." }
  }
}

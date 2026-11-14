"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Socket } from "socket.io-client"
import type { LobbySettings, Person, Role } from "./lobby-types"

// Lobby voice (LiveKit). Everyone in the lobby can listen; moderators talk, players when a
// moderator lets them, spectators never. The game server hands out the pass and grants the
// mic; LiveKit carries the audio. The LiveKit library loads only when someone joins.

type Speaker = { id: string; name: string; role: Role }
type Join = { ok: true; url: string; token: string; identity: string; can_talk: boolean; why: string | null; speakers: Speaker[]; max_speakers: number }
type LkRoom = import("livekit-client").Room

const WHY: Record<string, string> = {
  "not-allowed": "Listening. The moderator hasn't opened the mic to players.",
  "ask-moderator": "Listening. Ask a moderator if you'd like to talk.",
  "listen-only": "Spectators listen only.",
  muted: "A moderator muted you.",
  "voice-off": "Voice is off in this lobby.",
}
const ERR: Record<string, string> = {
  "voice-off-site": "Voice isn't available right now.",
  "voice-off": "Voice is off in this lobby.",
  "lobby-full": "Voice is full in this lobby (150 listening). Try again in a bit.",
  "site-full": "Voice is full across the site right now. Try again in a bit.",
  "mics-full": "Six people are already talking. Wait for a free mic.",
  closed: "The lobby is closed.",
  "not-allowed": "The moderator hasn't opened the mic to players.",
  "ask-moderator": "Ask a moderator to give you the mic.",
  "listen-only": "Spectators listen only.",
  muted: "A moderator muted you.",
  "not-connected": "Voice isn't connected yet. Try again in a moment.",
}

const emit = <T,>(s: Socket, ev: string, arg: unknown) =>
  new Promise<T>((resolve) => s.timeout(10_000).emit(ev, arg, (err: Error | null, r: T) => resolve(err ? ({ ok: false, error: "not-connected" } as T) : r)))

export function LobbyVoice({ socket, tid, role, settings, players }: { socket: Socket | null; tid: string; role: Role; settings: LobbySettings; players: Person[] }) {
  const room = useRef<LkRoom | null>(null)
  const audio = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"idle" | "joining" | "in">("idle")
  const [join, setJoin] = useState<Join | null>(null)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [listeners, setListeners] = useState(0)
  const [active, setActive] = useState<string[]>([])
  const [mic, setMic] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [allowed, setAllowed] = useState<string[]>([])

  const leave = useCallback(async () => {
    const r = room.current
    room.current = null
    setMic(false)
    setState("idle")
    setJoin(null)
    setActive([])
    socket?.emit("voice:leave", tid)
    if (r) await r.disconnect()
  }, [socket, tid])

  useEffect(() => {
    if (!socket) return
    const onState = (d: { tid: string; speakers: Speaker[]; listeners: number }) => {
      if (d.tid !== tid) return
      setSpeakers(d.speakers)
      setListeners(d.listeners)
    }
    const onMic = (d: { tid: string; on: boolean }) => {
      if (d.tid !== tid || d.on) return
      setMic(false)
      void room.current?.localParticipant.setMicrophoneEnabled(false).catch(() => {})
      setNote("Your mic was turned off.")
    }
    const onClosed = (d: { tid: string }) => {
      if (d.tid !== tid) return
      void leave()
      setNote("The moderator ended voice.")
    }
    // The rules changed (players may talk, allowed by name): ask again whether I may talk.
    const onRecheck = (d: { tid: string }) => {
      if (d.tid !== tid || !room.current) return
      void emit<Join | { ok: false; error: string }>(socket, "voice:join", tid).then((r) => r.ok && setJoin((j) => (j ? { ...j, can_talk: r.can_talk, why: r.why } : j)))
    }
    socket.on("voice:state", onState)
    socket.on("voice:mic", onMic)
    socket.on("voice:closed", onClosed)
    socket.on("voice:recheck", onRecheck)
    return () => {
      socket.off("voice:state", onState)
      socket.off("voice:mic", onMic)
      socket.off("voice:closed", onClosed)
      socket.off("voice:recheck", onRecheck)
    }
  }, [socket, tid, leave])

  useEffect(
    () => () => {
      void room.current?.disconnect()
    },
    []
  )

  // Moderators: who has been given the mic by name.
  useEffect(() => {
    if (!socket || role !== "moderator" || !settings.voice_on) return
    socket.emit("voice:allowed", tid, (r: { ok: boolean; ids?: string[] }) => r.ok && setAllowed(r.ids ?? []))
  }, [socket, role, tid, settings.voice_on])

  if (!settings.voice_on && role !== "moderator") return null

  const start = async () => {
    if (!socket) return
    setNote(null)
    setState("joining")
    const r = await emit<Join | { ok: false; error: string }>(socket, "voice:join", tid)
    if (!r.ok) {
      setState("idle")
      return setNote(ERR[r.error] ?? "Voice couldn't connect.")
    }
    try {
      const { Room, RoomEvent, Track } = await import("livekit-client")
      const lk = new Room({ adaptiveStream: false, dynacast: false })
      lk.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) audio.current?.appendChild(track.attach())
      })
      lk.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()))
      lk.on(RoomEvent.ActiveSpeakersChanged, (ps) => setActive(ps.map((p) => p.identity)))
      lk.on(RoomEvent.Disconnected, () => {
        if (room.current === lk) {
          room.current = null
          setState("idle")
          setMic(false)
        }
      })
      await lk.connect(r.url, r.token, { autoSubscribe: true })
      await lk.startAudio().catch(() => {})
      room.current = lk
      setJoin(r)
      setSpeakers(r.speakers)
      setState("in")
    } catch {
      socket.emit("voice:leave", tid)
      setState("idle")
      setNote("Voice couldn't connect from this network.")
    }
  }

  const talk = async (on: boolean) => {
    if (!socket || !room.current) return
    setNote(null)
    if (!on) {
      setMic(false)
      await room.current.localParticipant.setMicrophoneEnabled(false).catch(() => {})
      await emit(socket, "voice:mic", { tid, on: false })
      return
    }
    const r = await emit<{ ok: boolean; error?: string }>(socket, "voice:mic", { tid, on: true })
    if (!r.ok) return setNote(ERR[r.error ?? ""] ?? "You can't talk right now.")
    // The server's permission reaches the room a moment later.
    const me = room.current.localParticipant
    for (let i = 0; i < 30 && !me.permissions?.canPublish; i++) await new Promise((x) => setTimeout(x, 100))
    try {
      await me.setMicrophoneEnabled(true)
      setMic(true)
    } catch {
      await emit(socket, "voice:mic", { tid, on: false })
      setNote("Your microphone couldn't start. Check the browser's permission for it.")
    }
  }

  const mod = async (body: Record<string, unknown>) => {
    if (!socket) return
    const r = await emit<{ ok: boolean; error?: string }>(socket, "voice:mod", { tid, ...body })
    if (!r.ok) setNote(ERR[r.error ?? ""] ?? "That didn't work.")
    if (body.action === "allow" && r.ok) setAllowed((a) => (body.on ? [...a, String(body.player_id)] : a.filter((x) => x !== body.player_id)))
  }

  const speaking = (id: string) => active.includes(id)

  return (
    <section className="lobby-voice" aria-label="Lobby voice">
      <div className="lobby-voice-head">
        <span className="lobby-voice-title">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" fill="currentColor" />
          </svg>
          Voice
        </span>
        {settings.voice_on ? <span className="lobby-voice-count">{listeners} listening</span> : <span className="lobby-voice-count">Off</span>}
      </div>

      {settings.voice_on && speakers.length > 0 && (
        <ul className="lobby-voice-speakers">
          {speakers.map((s) => (
            <li key={s.id} className={speaking(s.id) ? "is-speaking" : undefined}>
              <span className={`lobby-voice-dot lobby-voice-dot-${s.role}`} aria-hidden="true" />
              {s.name}
              {s.role === "moderator" && <span className="lobby-badge lobby-badge-moderator ml-1">Moderator</span>}
              {role === "moderator" && s.id !== join?.identity && (
                <button type="button" className="lobby-voice-mini" onClick={() => void mod({ action: "mute", player_id: s.id })}>
                  Mute
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="lobby-voice-actions">
        {settings.voice_on && state !== "in" && (
          <button type="button" className="g-btn g-btn-primary !min-h-[40px] !px-4 !text-[14px]" disabled={state === "joining" || !socket} onClick={() => void start()}>
            {state === "joining" ? "Connecting…" : "Join voice"}
          </button>
        )}
        {state === "in" && join && (
          <>
            {join.can_talk || role === "moderator" ? (
              <button type="button" className={`lobby-voice-talk ${mic ? "is-on" : ""}`} aria-pressed={mic} onClick={() => void talk(!mic)}>
                {mic ? "Mic on · tap to stop" : "Talk"}
              </button>
            ) : (
              <p className="lobby-why !mt-0">{WHY[join.why ?? ""] ?? "Listening."}</p>
            )}
            <button type="button" className="g-btn !min-h-[38px] !px-3 !text-[13px]" onClick={() => void leave()}>
              Leave voice
            </button>
          </>
        )}
      </div>

      {role === "moderator" && (
        <details className="lobby-tools !border-0 !px-0 !pb-0">
          <summary>Voice controls</summary>
          <div className="flex flex-col gap-3 pt-3">
            <div className="lobby-seg" role="radiogroup" aria-label="Lobby voice">
              <button type="button" role="radio" aria-checked={settings.voice_on} onClick={() => void mod({ action: "voice", on: true })}>
                Voice on
              </button>
              <button type="button" role="radio" aria-checked={!settings.voice_on} onClick={() => void mod({ action: "voice", on: false })}>
                Off
              </button>
            </div>
            {settings.voice_on && (
              <>
                <label className="flex items-center gap-2 text-[13.5px]">
                  <input type="checkbox" checked={settings.players_voice} onChange={(e) => void mod({ action: "players", on: e.target.checked })} />
                  Adult players may take the mic
                </label>
                {players.length > 0 && (
                  <div>
                    <p className="lobby-tools-label">Give the mic by name (how under-18 players can talk)</p>
                    <ul className="lobby-voice-allow">
                      {players.map((p) => (
                        <li key={p.id}>
                          <span className="truncate">{p.name}</span>
                          <button type="button" aria-pressed={allowed.includes(p.id)} onClick={() => void mod({ action: "allow", player_id: p.id, on: !allowed.includes(p.id) })}>
                            {allowed.includes(p.id) ? "Allowed" : "Allow"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        </details>
      )}

      {note && <p className="lobby-why">{note}</p>}
      <div ref={audio} hidden />
    </section>
  )
}

"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Socket } from "socket.io-client"
import type { LobbySettings, Person, Role } from "./lobby-types"

// Lobby voice (LiveKit), as a strip in the lobby's broadcast bar. Everyone can listen;
// moderators talk; players talk when the moderator lets players talk (adults) or accepts
// their raised hand; viewers listen. The game server hands out the pass and grants the mic;
// LiveKit carries the audio. The LiveKit library loads only when someone joins.

export type Speaker = { id: string; name: string; role: Role }
export type Hand = { id: string; name: string; at: number }
export type VoiceState = { joined: boolean; speakers: Speaker[]; hands: Hand[]; active: string[]; listeners: number }

type Join = { ok: true; url: string; token: string; identity: string; can_talk: boolean; why: string | null; speakers: Speaker[]; hands: Hand[]; max_speakers: number }
type LkRoom = import("livekit-client").Room

const ERR: Record<string, string> = {
  "voice-off-site": "Voice isn't available right now.",
  "voice-off": "Voice is off in this lobby.",
  "lobby-full": "Voice is full in this lobby (150 listening). Try again in a bit.",
  "site-full": "Voice is full across the site right now. Try again in a bit.",
  "mics-full": "Six people are already talking. Wait for a free mic.",
  closed: "The lobby is closed.",
  "not-allowed": "Raise your hand to ask the moderator for the mic.",
  "ask-moderator": "Raise your hand to ask the moderator for the mic.",
  "listen-only": "Viewers listen only.",
  "players-only": "Only participants can ask to talk.",
  muted: "A moderator muted you.",
  "not-connected": "Voice isn't connected yet. Try again in a moment.",
}

const emit = <T,>(s: Socket, ev: string, arg: unknown) =>
  new Promise<T>((resolve) => s.timeout(10_000).emit(ev, arg, (err: Error | null, r: T) => resolve(err ? ({ ok: false, error: "not-connected" } as T) : r)))

const Mic = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
    <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-2.08A7 7 0 0 0 19 12h-2Z" fill="currentColor" />
  </svg>
)

export function LobbyVoice({
  socket,
  tid,
  role,
  meId,
  settings,
  players,
  onState,
}: {
  socket: Socket | null
  tid: string
  role: Role
  meId: string | null
  settings: LobbySettings
  players: Person[]
  onState?: (s: VoiceState) => void
}) {
  const room = useRef<LkRoom | null>(null)
  const audio = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<"idle" | "joining" | "in">("idle")
  const [join, setJoin] = useState<Join | null>(null)
  const [speakers, setSpeakers] = useState<Speaker[]>([])
  const [hands, setHands] = useState<Hand[]>([])
  const [listeners, setListeners] = useState(0)
  const [active, setActive] = useState<string[]>([])
  const [mic, setMic] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [allowed, setAllowed] = useState<string[]>([])
  const [panel, setPanel] = useState(false)

  useEffect(() => {
    onState?.({ joined: state === "in", speakers, hands, active, listeners })
  }, [onState, state, speakers, hands, active, listeners])

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
    const onVoiceState = (d: { tid: string; speakers: Speaker[]; listeners: number; hands?: Hand[] }) => {
      if (d.tid !== tid) return
      setSpeakers(d.speakers)
      setListeners(d.listeners)
      setHands(d.hands ?? [])
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
    // The rules changed (players may talk, a hand accepted): ask again whether I may talk.
    const onRecheck = (d: { tid: string }) => {
      if (d.tid !== tid || !room.current) return
      void emit<Join | { ok: false; error: string }>(socket, "voice:join", tid).then((r) => {
        if (!r.ok) return
        setJoin((j) => (j ? { ...j, can_talk: r.can_talk, why: r.why } : j))
        if (r.can_talk) setNote("The moderator gave you the mic. Tap Talk when you're ready.")
      })
    }
    const onLowered = (d: { tid: string }) => d.tid === tid && setNote("The moderator lowered your hand.")
    socket.on("voice:state", onVoiceState)
    socket.on("voice:mic", onMic)
    socket.on("voice:closed", onClosed)
    socket.on("voice:recheck", onRecheck)
    socket.on("voice:hand-lowered", onLowered)
    return () => {
      socket.off("voice:state", onVoiceState)
      socket.off("voice:mic", onMic)
      socket.off("voice:closed", onClosed)
      socket.off("voice:recheck", onRecheck)
      socket.off("voice:hand-lowered", onLowered)
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
      setHands(r.hands ?? [])
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

  const hand = async (up: boolean) => {
    if (!socket) return
    const r = await emit<{ ok: boolean; error?: string }>(socket, "voice:hand", { tid, up })
    setNote(r.ok ? (up ? "Hand raised. The moderator will give you the mic." : null) : (ERR[r.error ?? ""] ?? "That didn't work."))
  }

  const mod = async (body: Record<string, unknown>) => {
    if (!socket) return
    const r = await emit<{ ok: boolean; error?: string }>(socket, "voice:mod", { tid, ...body })
    if (!r.ok) setNote(ERR[r.error ?? ""] ?? "That didn't work.")
    if (body.action === "allow" && r.ok) setAllowed((a) => (body.on ? [...a, String(body.player_id)] : a.filter((x) => x !== body.player_id)))
  }

  const myHand = !!meId && hands.some((h) => h.id === meId)
  const canTalk = role === "moderator" || !!join?.can_talk

  return (
    <div className="lv">
      {!settings.voice_on ? (
        role === "moderator" ? (
          <button type="button" className="lv-btn lv-btn-go" onClick={() => void mod({ action: "voice", on: true })}>
            <Mic /> Start voice
          </button>
        ) : (
          <span className="lv-off">
            <Mic /> Voice off
          </span>
        )
      ) : state !== "in" ? (
        <button type="button" className="lv-btn lv-btn-go" disabled={state === "joining" || !socket} onClick={() => void start()}>
          🎧 {state === "joining" ? "Connecting…" : "Join voice"}
        </button>
      ) : (
        <>
          {canTalk ? (
            <button type="button" className={`lv-btn lv-talk ${mic ? "is-on" : ""}`} aria-pressed={mic} onClick={() => void talk(!mic)}>
              <Mic /> {mic ? "Mic on" : "Talk"}
            </button>
          ) : role === "player" ? (
            <button type="button" className={`lv-btn ${myHand ? "is-hand" : ""}`} aria-pressed={myHand} onClick={() => void hand(!myHand)}>
              ✋ {myHand ? "Hand raised" : "Raise hand"}
            </button>
          ) : (
            <span className="lv-off">🎧 Listening</span>
          )}
          <button type="button" className="lv-btn lv-btn-quiet" onClick={() => void leave()}>
            Leave
          </button>
        </>
      )}
      {settings.voice_on && (
        <button type="button" className="lv-btn lv-btn-quiet" aria-expanded={panel} onClick={() => setPanel((v) => !v)}>
          {speakers.length > 0 ? `${speakers.length} on mic` : "Voice"}
          {role === "moderator" && hands.length > 0 && <span className="lv-badge">✋ {hands.length}</span>} ▾
        </button>
      )}

      {panel && settings.voice_on && (
        <div className="lv-panel" role="dialog" aria-label="Voice">
          <div className="flex items-center justify-between">
            <p className="lv-panel-title">Voice · {listeners} listening</p>
            <button type="button" className="lv-x" aria-label="Close" onClick={() => setPanel(false)}>
              ×
            </button>
          </div>
          <p className="lv-label">On the mic</p>
          {speakers.length === 0 ? (
            <p className="lobby-why !mt-0">Nobody is talking right now.</p>
          ) : (
            <ul className="lobby-voice-speakers">
              {speakers.map((s) => (
                <li key={s.id} className={active.includes(s.id) ? "is-speaking" : undefined}>
                  <span className={`lobby-voice-dot lobby-voice-dot-${s.role}`} aria-hidden="true" />
                  {s.name}
                  {s.role === "moderator" && <span className="lobby-badge lobby-badge-moderator ml-1">Moderator</span>}
                  {role === "moderator" && s.id !== join?.identity && (
                    <button type="button" className="lobby-voice-mini" onClick={() => void mod({ action: "mute", player_id: s.id })}>
                      Take the mic
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {role === "moderator" && (
            <>
              <p className="lv-label">Raised hands</p>
              {hands.length === 0 ? (
                <p className="lobby-why !mt-0">No hands up.</p>
              ) : (
                <ul className="lobby-voice-allow">
                  {hands.map((h) => (
                    <li key={h.id}>
                      <span className="truncate">✋ {h.name}</span>
                      <span className="flex gap-1">
                        <button type="button" aria-pressed="true" onClick={() => void mod({ action: "allow", player_id: h.id, on: true })}>
                          Give the mic
                        </button>
                        <button type="button" onClick={() => void mod({ action: "lower", player_id: h.id })}>
                          Lower
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="lv-label">Voice settings</p>
              <label className="flex items-center gap-2 text-[13.5px]">
                <input type="checkbox" checked={settings.players_voice} onChange={(e) => void mod({ action: "players", on: e.target.checked })} />
                Adult participants may talk without asking
              </label>
              {players.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[13px] font-semibold">Give the mic by name (how under-18s can talk)</summary>
                  <ul className="lobby-voice-allow mt-2">
                    {players.map((p) => (
                      <li key={p.id}>
                        <span className="truncate">{p.name}</span>
                        <button type="button" aria-pressed={allowed.includes(p.id)} onClick={() => void mod({ action: "allow", player_id: p.id, on: !allowed.includes(p.id) })}>
                          {allowed.includes(p.id) ? "Allowed" : "Allow"}
                        </button>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <button type="button" className="g-btn mt-2 !min-h-[36px] !text-[13px]" onClick={() => void mod({ action: "voice", on: false })}>
                End voice for everyone
              </button>
            </>
          )}
        </div>
      )}
      {note && <p className="lv-note">{note}</p>}
      <div ref={audio} hidden />
    </div>
  )
}

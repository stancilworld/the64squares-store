"use client"

import { useEffect, useRef, useState } from "react"

export type ChatMsg = { id: string; from: "w" | "b"; name: string; kind: "quick" | "emoji" | "text"; text: string; at: number }

export const QUICK = ["Hi!", "Good luck!", "Have fun!", "Nice move!", "Oops", "Thanks!", "Good game", "Well played", "Rematch?"]
export const EMOJI = ["👋", "👍", "😄", "😮", "🤔", "😅", "🔥", "👏", "♟️", "🙏"]

// Chat beside the board: quick messages and emojis for everyone, typing for friends' games.
export function GameChat({
  messages,
  me,
  canType,
  onSend,
  muted,
  onMute,
}: {
  messages: ChatMsg[]
  me: "w" | "b" | null
  canType: boolean
  onSend: (kind: ChatMsg["kind"], text: string) => Promise<string | null>
  muted: boolean
  onMute: () => void
}) {
  const [text, setText] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<"quick" | "emoji" | null>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length])

  const send = async (kind: ChatMsg["kind"], t: string) => {
    setError(null)
    const err = await onSend(kind, t)
    if (err) setError(err)
    else {
      setOpen(null)
      if (kind === "text") setText("")
    }
  }

  return (
    <div className="g-panel flex flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-2">
        <span className="text-[13px] font-bold">Chat</span>
        <button type="button" onClick={onMute} className="g-muted text-[12px] font-semibold hover:text-white" aria-pressed={muted}>
          {muted ? "🔇 Opponent muted" : "🔈 Mute opponent"}
        </button>
      </div>
      <div ref={list} className="flex max-h-[140px] min-h-[64px] flex-col gap-1 overflow-y-auto px-3 py-2 text-[13px]" aria-live="polite">
        {messages.length === 0 ? (
          <p className="g-muted m-auto text-[12px]">Say hi to your opponent.</p>
        ) : (
          messages.map((m) =>
            muted && m.from !== me ? null : (
              <p key={m.id} className={m.from === me ? "text-right" : ""}>
                <span className={`inline-block max-w-[85%] rounded-xl px-2.5 py-1 ${m.kind === "emoji" ? "text-[20px] leading-tight" : ""} ${m.from === me ? "bg-[var(--g-panel-3)]" : "bg-black/25"}`}>
                  {m.from !== me && <b className="mr-1 text-[var(--g-gold)]">{m.name}:</b>}
                  {m.text}
                </span>
              </p>
            )
          )
        )}
      </div>
      {me && (
        <div className="border-t border-white/5 p-2">
          {open === "quick" && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <button key={q} type="button" className="rounded-full bg-[var(--g-panel-3)] px-2.5 py-1 text-[12px] font-semibold hover:brightness-110" onClick={() => send("quick", q)}>
                  {q}
                </button>
              ))}
            </div>
          )}
          {open === "emoji" && (
            <div className="mb-2 flex flex-wrap gap-1">
              {EMOJI.map((e) => (
                <button key={e} type="button" aria-label={`Send ${e}`} className="grid h-9 w-9 place-items-center rounded-lg text-[20px] hover:bg-[var(--g-panel-3)]" onClick={() => send("emoji", e)}>
                  {e}
                </button>
              ))}
            </div>
          )}
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault()
              if (text.trim()) void send("text", text)
            }}
          >
            <button type="button" aria-pressed={open === "quick"} onClick={() => setOpen(open === "quick" ? null : "quick")} className="g-btn !min-h-[36px] !px-2.5 !text-[12px]">
              Quick
            </button>
            <button type="button" aria-pressed={open === "emoji"} aria-label="Emojis" onClick={() => setOpen(open === "emoji" ? null : "emoji")} className="g-btn !min-h-[36px] !px-2.5 !text-[15px]">
              🙂
            </button>
            {canType ? (
              <input
                value={text}
                maxLength={140}
                onChange={(e) => setText(e.target.value)}
                placeholder="Message"
                aria-label="Message"
                className="h-[36px] min-w-0 flex-1 rounded-lg border border-[var(--g-line)] bg-[var(--g-panel-2)] px-2.5 text-[13px] outline-none focus:border-[var(--g-gold)]"
              />
            ) : (
              <span className="g-muted min-w-0 flex-1 truncate text-[11px]">Typing is for games with friends.</span>
            )}
          </form>
          {error && <p className="mt-1 text-[12px] text-[#ff8a7d]">{error}</p>}
        </div>
      )}
    </div>
  )
}

// The latest message from one side, shown as a bubble by their name for a few seconds.
export const recentFrom = (messages: ChatMsg[], colour: "w" | "b", now: number) => {
  const m = [...messages].reverse().find((x) => x.from === colour)
  return m && now - m.at < 4000 ? m : null
}

"use client"

import { useEffect, useSyncExternalStore } from "react"
import { BOARD_THEMES, PIECE_SETS, pieceSrc, setBoardSettings, useBoardSettings } from "@/lib/chess/settings"

// One settings window for the whole Play area, opened from the board, the menu or the top bar.
let open = false
const listeners = new Set<() => void>()
const setOpen = (v: boolean) => {
  open = v
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const openBoardSettings = () => setOpen(true)

const GEAR =
  "M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.5 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"

export function GearIcon({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d={GEAR} />
    </svg>
  )
}

export function BoardSettingsButton({ className }: { className: string }) {
  return (
    <button type="button" aria-label="Board settings" className={className} onClick={openBoardSettings}>
      <GearIcon />
    </button>
  )
}

const PREVIEW = [
  ["bR", "bN", "bB", "bQ"],
  ["bP", "bP", null, "bP"],
  [null, null, "wN", null],
  ["wK", "wB", "wP", "wR"],
]

// A small corner of a board to show what a "Last move" or "Legal moves" choice looks like.
const MINI = [
  [null, "bB", "bR"],
  ["bP", "bP", "bP"],
  [null, "bN", null],
  [null, null, null],
]
function MiniPreview({ kind, light, dark, set }: { kind: "none" | "highlight" | "arrow" | "dots"; light: string; dark: string; set: Parameters<typeof pieceSrc>[0] }) {
  // The knight came from the top-left square to the middle.
  const lit = (r: number, c: number) => kind === "highlight" && ((r === 0 && c === 0) || (r === 2 && c === 1))
  return (
    <span className="relative grid aspect-[3/4] w-full grid-cols-3 overflow-hidden rounded">
      {MINI.flatMap((row, r) =>
        row.map((p, c) => (
          <span key={`${r}${c}`} className="relative" style={{ background: lit(r, c) ? "#e8c45c" : (r + c) % 2 ? dark : light }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {p && <img src={pieceSrc(set, p)} alt="" className="absolute inset-[6%] h-[88%] w-[88%] object-contain" />}
            {kind === "dots" && r === 0 && c === 0 && <span className="absolute left-1/2 top-1/2 h-[26%] w-[26%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30" />}
          </span>
        ))
      )}
      {kind === "arrow" && (
        <svg viewBox="0 0 3 4" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <marker id="mini-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="rgba(20,20,20,0.85)" />
            </marker>
          </defs>
          <line x1="0.5" y1="0.5" x2="1.38" y2="2.3" stroke="rgba(20,20,20,0.85)" strokeWidth="0.05" markerEnd="url(#mini-head)" />
        </svg>
      )}
    </span>
  )
}

export function BoardSettingsModal() {
  const isOpen = useSyncExternalStore(subscribe, () => open, () => false)
  const s = useBoardSettings()
  const theme = BOARD_THEMES[s.theme]

  useEffect(() => {
    if (!isOpen) return
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("keydown", esc)
    return () => document.removeEventListener("keydown", esc)
  }, [isOpen])

  if (!isOpen) return null

  const toggle = (label: string, on: boolean, flip: () => void) => (
    <label className="flex cursor-pointer items-center justify-between py-2 text-[15px]">
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={flip}
        className={`relative h-[26px] w-[46px] rounded-full transition ${on ? "bg-[var(--g-accent)]" : "bg-[var(--g-panel-3)]"}`}
      >
        <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-[23px]" : "left-[3px]"}`} />
      </button>
    </label>
  )

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Board settings">
      <button type="button" aria-label="Close settings" className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
      <div className="relative max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-[var(--g-line)] bg-[var(--g-panel)] p-5 text-[var(--g-text)] shadow-2xl sm:max-w-[460px] sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <p className="g-title">Board settings</p>
          <button type="button" className="g-btn g-btn-ghost !min-h-[36px] !px-3" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
        <div className="mt-4 grid grid-cols-[auto_1fr] items-center gap-4">
          <div className="grid h-[112px] w-[112px] grid-cols-4 overflow-hidden rounded-lg shadow-lg">
            {PREVIEW.flatMap((row, r) =>
              row.map((p, c) => (
                <span key={`${r}${c}`} className="relative" style={{ background: (r + c) % 2 ? theme.dark : theme.light }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {p && <img src={pieceSrc(s.pieces, p)} alt="" className="absolute inset-0 h-full w-full" />}
                </span>
              ))
            )}
          </div>
          <p className="g-muted text-[14px]">
            {theme.label} board with {PIECE_SETS[s.pieces].label} pieces. Your choice is remembered on this device.
          </p>
        </div>
        <p className="mt-5 text-[12px] font-semibold text-[var(--g-muted)]">Board</p>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {Object.entries(BOARD_THEMES).map(([key, t]) => (
            <button
              key={key}
              type="button"
              aria-pressed={s.theme === key}
              onClick={() => setBoardSettings({ theme: key as keyof typeof BOARD_THEMES })}
              className="g-choice flex flex-col items-center gap-1 p-1.5 text-[11px] font-semibold"
            >
              <span className="grid aspect-square w-full grid-cols-2 overflow-hidden rounded">
                <span style={{ background: t.light }} />
                <span style={{ background: t.dark }} />
                <span style={{ background: t.dark }} />
                <span style={{ background: t.light }} />
              </span>
              {t.label}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[12px] font-semibold text-[var(--g-muted)]">Pieces</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {Object.entries(PIECE_SETS).map(([key, p]) => (
            <button
              key={key}
              type="button"
              aria-pressed={s.pieces === key}
              onClick={() => setBoardSettings({ pieces: key as keyof typeof PIECE_SETS })}
              className="g-choice flex flex-col items-center p-1.5 text-[11px] font-semibold"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pieceSrc(key as keyof typeof PIECE_SETS, "wN")} alt="" className="h-10 w-10 object-contain" />
              {p.label}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[12px] font-semibold text-[var(--g-muted)]">Last move</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(["none", "highlight", "arrow"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={s.lastMove === k}
              onClick={() => setBoardSettings({ lastMove: k })}
              className="g-choice flex flex-col items-center gap-1.5 p-1.5 text-[12px] font-semibold"
            >
              <MiniPreview kind={k} light={theme.light} dark={theme.dark} set={s.pieces} />
              {k === "none" ? "None" : k === "highlight" ? "Highlight" : "Arrow"}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[12px] font-semibold text-[var(--g-muted)]">Legal moves</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {([false, true] as const).map((on) => (
            <button
              key={String(on)}
              type="button"
              aria-pressed={s.legalMoves === on}
              onClick={() => setBoardSettings({ legalMoves: on })}
              className="g-choice flex flex-col items-center gap-1.5 p-1.5 text-[12px] font-semibold"
            >
              <MiniPreview kind={on ? "dots" : "none"} light={theme.light} dark={theme.dark} set={s.pieces} />
              {on ? "Dots" : "None"}
            </button>
          ))}
        </div>
        <div className="mt-4 border-t border-[var(--g-line)] pt-2">
          {toggle("Sounds (wooden pieces)", s.sound, () => setBoardSettings({ sound: !s.sound }))}
          {toggle("Premoves (queue moves while your opponent thinks)", s.premove, () => setBoardSettings({ premove: !s.premove }))}
          {toggle("Chat during games", s.chat, () => setBoardSettings({ chat: !s.chat }))}
          <div className="flex items-center justify-between py-2 text-[15px]">
            Piece animation
            <div className="flex gap-1">
              {(["off", "fast", "normal"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  aria-pressed={s.animation === a}
                  onClick={() => setBoardSettings({ animation: a })}
                  className="g-choice px-3 py-1 text-[13px] font-semibold"
                >
                  {a === "normal" ? "Smooth" : a === "fast" ? "Fast" : "Off"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <a href="/pieces/LICENSES.txt" className="g-muted mt-3 block text-[11px] underline underline-offset-2">
          Piece artwork and engine credits
        </a>
      </div>
    </div>
  )
}

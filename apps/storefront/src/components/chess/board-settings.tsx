"use client"

import { useEffect, useRef, useState } from "react"
import { BOARD_THEMES, PIECE_SETS, pieceSrc, setBoardSettings, useBoardSettings } from "@/lib/chess/settings"

// The gear button: board colours, piece style, sounds, move dots and animation.
export function BoardSettingsButton({ className }: { className: string }) {
  const s = useBoardSettings()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", close)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("mousedown", close)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  const toggle = (label: string, on: boolean, flip: () => void) => (
    <label className="flex cursor-pointer items-center justify-between py-1.5 text-[14px]">
      {label}
      <input type="checkbox" checked={on} onChange={flip} className="h-4 w-4 accent-[#d6b06a]" />
    </label>
  )

  return (
    <div ref={box} className="relative flex max-w-[52px] flex-1">
      <button type="button" aria-label="Board settings" aria-expanded={open} className={`${className} w-full`} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
          <path d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.7a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.5 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.7a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" />
        </svg>
      </button>
      {open && (
        <div role="dialog" aria-label="Board settings" className="absolute bottom-[54px] right-0 z-40 w-[300px] rounded-xl border border-[var(--g-line)] bg-[var(--g-panel-2)] p-4 text-[var(--g-text)] shadow-2xl">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Board</p>
          <div className="mt-2 grid grid-cols-5 gap-2">
            {Object.entries(BOARD_THEMES).map(([key, t]) => (
              <button
                key={key}
                type="button"
                aria-label={t.label}
                aria-pressed={s.theme === key}
                onClick={() => setBoardSettings({ theme: key as keyof typeof BOARD_THEMES })}
                className={`grid aspect-square grid-cols-2 overflow-hidden rounded ${s.theme === key ? "ring-2 ring-[var(--g-gold)] ring-offset-2 ring-offset-[var(--g-panel-2)]" : ""}`}
              >
                <span style={{ background: t.light }} />
                <span style={{ background: t.dark }} />
                <span style={{ background: t.dark }} />
                <span style={{ background: t.light }} />
              </button>
            ))}
          </div>
          <p className="mt-4 text-[12px] font-semibold uppercase tracking-wide text-[var(--g-gold)]">Pieces</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {Object.entries(PIECE_SETS).map(([key, p]) => (
              <button
                key={key}
                type="button"
                aria-pressed={s.pieces === key}
                onClick={() => setBoardSettings({ pieces: key as keyof typeof PIECE_SETS })}
                className={`g-choice flex flex-col items-center p-1.5 text-[12px]`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pieceSrc(key as keyof typeof PIECE_SETS, "wN")} alt="" className="h-9 w-9 object-contain" />
                {p.label}
              </button>
            ))}
          </div>
          <div className="mt-3 border-t border-[var(--g-line)] pt-2">
            {toggle("Sounds", s.sound, () => setBoardSettings({ sound: !s.sound }))}
            {toggle("Show legal moves", s.legalMoves, () => setBoardSettings({ legalMoves: !s.legalMoves }))}
            <label className="flex items-center justify-between py-1.5 text-[14px]">
              Animation
              <select
                value={s.animation}
                onChange={(e) => setBoardSettings({ animation: e.target.value as "off" | "fast" | "normal" })}
                className="rounded-md border border-[var(--g-line)] bg-[var(--g-panel)] px-2 py-1 text-[13px]"
              >
                <option value="normal">Smooth</option>
                <option value="fast">Fast</option>
                <option value="off">Off</option>
              </select>
            </label>
          </div>
          <a href="/pieces/LICENSES.txt" className="mt-2 block text-[11px] text-[var(--g-muted)] underline underline-offset-2">
            Piece artwork and engine credits
          </a>
        </div>
      )}
    </div>
  )
}

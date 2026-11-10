"use client"

import { Chess, type Square } from "chess.js"
import { type ReactNode, useMemo, useState } from "react"
import { Chessboard, type PieceRenderObject } from "react-chessboard"
import { premoveTargets, withPremoves } from "@/lib/chess/premove"
import { playSound } from "@/lib/chess/sounds"
import { animationMs, BOARD_THEMES, boardPiece, PIECE_SETS, pieceSrc, useBoardSettings } from "@/lib/chess/settings"

export type Colour = "w" | "b"
export type BoardArrow = { from: string; to: string; color?: string }

const PIECE_CODES = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"] as const
const PROMOTE = ["q", "n", "r", "b"] as const

const LAST_MOVE = "rgba(232, 196, 92, 0.5)"
const SELECTED = "rgba(232, 196, 92, 0.68)"
const DOT = "radial-gradient(circle, rgba(10,20,14,0.28) 22%, transparent 23%)"
const RING = "radial-gradient(circle, transparent 60%, rgba(10,20,14,0.28) 61%)"
const PREMOVE = "rgba(206, 74, 58, 0.55)"
const PREMOVE_DOT = "radial-gradient(circle, rgba(206,74,58,0.5) 20%, transparent 21%)"
const CHECK = "radial-gradient(ellipse at center, rgba(255,0,0,0.95) 0%, rgba(231,0,0,0.8) 25%, rgba(169,0,0,0) 80%)"

type Props = {
  id: string
  fen: string
  orientation: "white" | "black"
  // The side the person may move right now (null: just looking).
  movable: Colour | null
  lastMove?: { from: string; to: string } | null
  arrows?: BoardArrow[]
  // Return false when the move isn't accepted (the piece goes back).
  onMove?: (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => boolean | void
  // Premoves: the player's colour while the opponent is thinking, the queued moves (as many as
  // wanted, played one per turn), and a setter.
  premoveFor?: Colour | null
  premoves?: Premove[]
  onPremoves?: (p: Premove[]) => void
  // Drawn over the board (match intro, result).
  overlay?: ReactNode
  // Extra square colours (puzzle hints, right/wrong moves).
  marks?: Record<string, string>
  // Small preview: no coordinates.
  compact?: boolean
}

export type Premove = { from: Square; to: Square }

const pieceImages = (set: keyof typeof PIECE_SETS, upright = false): PieceRenderObject =>
  Object.fromEntries(
    PIECE_CODES.map((code) => {
      const { src, tall } = upright ? { src: pieceSrc(set, code), tall: 1 } : boardPiece(set, code)
      // Standing pieces: the picture starts at the square's bottom edge and rises above it.
      if (tall > 1)
        return [
          code,
          () => (
            <div style={{ position: "relative", zIndex: 1, width: "100%", aspectRatio: "1 / 1", pointerEvents: "none" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                draggable={false}
                style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: `${tall * 100}%`, maxWidth: "none", pointerEvents: "none", userSelect: "none" }}
              />
            </div>
          ),
        ]
      return [
      code,
      () => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            filter: set === "modern" ? "drop-shadow(0 2px 1.5px rgba(0,0,0,0.28))" : undefined,
            objectFit: "contain",
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      ),
    ]
    })
  )

// The last move as a thin arrow over the board (one of the "Last move" settings).
function LastMoveArrow({ from, to, orientation }: { from: string; to: string; orientation: "white" | "black" }) {
  const at = (sq: string) => {
    const f = sq.charCodeAt(0) - 97
    const r = Number(sq[1]) - 1
    return orientation === "white" ? { x: f + 0.5, y: 7 - r + 0.5 } : { x: 7 - f + 0.5, y: r + 0.5 }
  }
  const a = at(from)
  const b = at(to)
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  // Stop short of the centre so the head doesn't cover the piece's face.
  const end = { x: b.x - ((b.x - a.x) / len) * 0.22, y: b.y - ((b.y - a.y) / len) * 0.22 }
  return (
    <svg viewBox="0 0 8 8" className="pointer-events-none absolute inset-0 z-[3] h-full w-full" aria-hidden="true">
      <defs>
        <marker id="t64-last-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" fill="rgba(20,20,20,0.82)" />
        </marker>
      </defs>
      <line x1={a.x} y1={a.y} x2={end.x} y2={end.y} stroke="rgba(20,20,20,0.82)" strokeWidth={0.055} strokeLinecap="round" markerEnd="url(#t64-last-head)" />
    </svg>
  )
}

// The chessboard everywhere on the site: legal-move dots, highlights, drag or click to move,
// a piece picker for promotions, and the person's chosen board and pieces.
// Premoves kept at most (one per turn).
const MAX_PREMOVES = 40
const NONE: Premove[] = []

export function Board({ id, fen, orientation, movable, lastMove, arrows, onMove, premoveFor, premoves = NONE, onPremoves, overlay, marks, compact }: Props) {
  const settings = useBoardSettings()
  const theme = BOARD_THEMES[settings.theme]
  const [picked, setSelected] = useState<Square | null>(null)
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; colour: Colour } | null>(null)
  const chess = useMemo(() => {
    try {
      return new Chess(fen)
    } catch {
      return new Chess()
    }
  }, [fen])

  // A new position clears any half-made move.
  const [seenFen, setSeenFen] = useState(fen)
  if (seenFen !== fen) {
    setSeenFen(fen)
    setSelected(null)
    setPromotion(null)
  }
  const canMove = !!movable && chess.turn() === movable
  const canPremove = !canMove && !!premoveFor && !!onPremoves && settings.premove && chess.turn() !== premoveFor
  const selected = canMove || canPremove ? picked : null
  // With premoves queued, the board shows where the pieces will be after them.
  const queued = canPremove ? premoves : NONE
  const virtual = useMemo(() => withPremoves(fen, queued), [fen, queued])
  const shownFen = queued.length ? virtual.fen : fen
  const addPremove = (from: Square, to: Square) => {
    if (queued.length < MAX_PREMOVES) onPremoves?.([...queued, { from, to }])
  }
  const targets = useMemo(
    () => (selected && canMove ? chess.moves({ square: selected, verbose: true }) : []),
    [chess, selected, canMove]
  )
  const preTargets = useMemo(() => {
    if (!selected || !canPremove) return []
    const p = virtual.at(selected)
    return p && p.color === premoveFor ? premoveTargets(selected, p.type, p.color) : []
  }, [virtual, selected, canPremove, premoveFor])

  const attempt = (from: Square, to: Square): boolean => {
    if (!canMove || !onMove) return false
    const moves = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to)
    if (!moves.length) return false
    if (moves.some((m) => m.promotion)) {
      setPromotion({ from, to, colour: chess.turn() })
      return false
    }
    return onMove(from, to) !== false
  }

  const clickSquare = (square: Square) => {
    if (promotion) return setPromotion(null)
    if (canPremove) {
      const piece = virtual.at(square)
      if (selected && preTargets.includes(square)) {
        addPremove(selected, square)
        return setSelected(null)
      }
      if (piece && piece.color === premoveFor) return setSelected(selected === square ? null : square)
      // A click anywhere else cancels all premoves.
      if (queued.length) onPremoves?.([])
      return setSelected(null)
    }
    if (!canMove) return
    const piece = chess.get(square)
    if (selected && selected !== square) {
      if (attempt(selected, square)) return setSelected(null)
      if (targets.some((m) => m.to === square)) return // waiting for the promotion choice
    }
    if (piece && piece.color === movable) setSelected(selected === square ? null : square)
    else {
      if (selected && piece?.color !== movable && square !== selected) playSound("illegal")
      setSelected(null)
    }
  }

  const squareStyles = useMemo(() => {
    const st: Record<string, React.CSSProperties> = {}
    const add = (sq: string, s: React.CSSProperties) => (st[sq] = { ...st[sq], ...s })
    if (lastMove && settings.lastMove === "highlight") {
      add(lastMove.from, { backgroundColor: LAST_MOVE })
      add(lastMove.to, { backgroundColor: LAST_MOVE })
    }
    if (chess.inCheck()) {
      const king = chess
        .board()
        .flat()
        .find((p) => p && p.type === "k" && p.color === chess.turn())
      if (king) add(king.square, { backgroundImage: CHECK })
    }
    for (const pm of queued) {
      add(pm.from, { backgroundColor: PREMOVE })
      add(pm.to, { backgroundColor: PREMOVE })
    }
    if (selected && canPremove) {
      add(selected, { backgroundColor: PREMOVE })
      for (const t of preTargets) add(t, { backgroundImage: PREMOVE_DOT, cursor: "pointer" })
    }
    if (selected && !canPremove) {
      add(selected, { backgroundColor: SELECTED })
      if (settings.legalMoves) {
        for (const m of targets) add(m.to, { backgroundImage: chess.get(m.to as Square) ? RING : DOT, cursor: "pointer" })
      }
    }
    for (const [sq, colour] of Object.entries(marks ?? {})) add(sq, { backgroundColor: colour })
    return st
  }, [lastMove, settings.lastMove, chess, selected, targets, settings.legalMoves, queued, canPremove, preTargets, marks])

  const pieces = useMemo(() => pieceImages(settings.pieces, !!compact), [settings.pieces, compact])
  const standing = !compact && boardPiece(settings.pieces, "wK").tall > 1

  // Where the promotion picker goes: over the promotion square, towards the board's middle.
  const promoBox = (() => {
    if (!promotion) return null
    const file = promotion.to.charCodeAt(0) - 97
    const col = orientation === "white" ? file : 7 - file
    const atTop = (promotion.to[1] === "8") === (orientation === "white")
    return { col, atTop }
  })()

  return (
    <div className="relative select-none">
      <Chessboard
        options={{
          id,
          position: shownFen,
          boardOrientation: orientation,
          pieces,
          allowDragging: canMove || canPremove,
          showNotation: !compact,
          // A tap must move a few pixels before it counts as a drag: on phones, tiny finger
          // movements otherwise start a drag that can leave the piece dimmed and stuck.
          dragActivationDistance: 6,
          canDragPiece: ({ piece }) => (canMove && piece.pieceType[0] === movable) || (canPremove && piece.pieceType[0] === premoveFor),
          onPieceDrag: ({ square }) => square && setSelected(square as Square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare || targetSquare === sourceSquare) return false
            if (canPremove) {
              const p = virtual.at(sourceSquare)
              if (p && premoveTargets(sourceSquare as Square, p.type, p.color).includes(targetSquare as Square)) {
                addPremove(sourceSquare as Square, targetSquare as Square)
                setSelected(null)
                // Accepted: the piece stays where it was dropped (the board shows the queue).
                return true
              }
              setSelected(null)
              return false
            }
            const ok = attempt(sourceSquare as Square, targetSquare as Square)
            if (ok) setSelected(null)
            return ok
          },
          onSquareClick: ({ square }) => clickSquare(square as Square),
          // Standing pieces may rise above the top row, so that board isn't clipped; a thin wooden
          // frame takes the place of the rounded corners.
          boardStyle: standing
            ? { borderRadius: 2, overflow: "visible", boxShadow: "0 0 0 4px #3b2516, 0 0 0 5px rgba(0,0,0,0.35), 0 12px 30px rgba(0,0,0,0.4)" }
            : { borderRadius: 8, overflow: "hidden", boxShadow: "0 0 0 1px rgba(0,0,0,0.25), 0 14px 40px rgba(0,0,0,0.45)" },
          lightSquareStyle: { backgroundColor: theme.light },
          darkSquareStyle: { backgroundColor: theme.dark },
          lightSquareNotationStyle: { color: theme.dark, fontWeight: 600 },
          darkSquareNotationStyle: { color: theme.light, fontWeight: 600 },
          alphaNotationStyle: { fontSize: "clamp(9px, 1.6vmin, 13px)", position: "absolute", bottom: 1, right: 4 },
          numericNotationStyle: { fontSize: "clamp(9px, 1.6vmin, 13px)", position: "absolute", top: 2, left: 3 },
          dropSquareStyle: { boxShadow: "inset 0 0 0 4px rgba(255,255,255,0.75)" },
          draggingPieceStyle: { transform: "scale(1.18)", filter: "drop-shadow(0 8px 6px rgba(0,0,0,0.35))", cursor: "grabbing" },
          draggingPieceGhostStyle: { opacity: 0.3 },
          squareStyles,
          animationDurationInMs: animationMs(settings),
          showAnimations: settings.animation !== "off",
          allowDrawingArrows: true,
          arrows: arrows?.map((a) => ({ startSquare: a.from, endSquare: a.to, color: a.color ?? "rgba(31, 120, 70, 0.8)" })),
          clearArrowsOnPositionChange: true,
        }}
      />
      {lastMove && settings.lastMove === "arrow" && !compact && <LastMoveArrow from={lastMove.from} to={lastMove.to} orientation={orientation} />}
      {promotion && promoBox && (
        <>
          <button type="button" aria-label="Cancel promotion" className="absolute inset-0 z-10 bg-black/30" onClick={() => setPromotion(null)} />
          <div
            role="dialog"
            aria-label="Promote to"
            className={`absolute z-20 flex w-[12.5%] overflow-hidden rounded-md bg-white shadow-xl ${promoBox.atTop ? "top-0 flex-col" : "bottom-0 flex-col-reverse"}`}
            style={{ left: `${promoBox.col * 12.5}%` }}
          >
            {PROMOTE.map((p) => (
              <button
                key={p}
                type="button"
                aria-label={{ q: "Queen", n: "Knight", r: "Rook", b: "Bishop" }[p]}
                className="aspect-square w-full p-[6%] transition hover:bg-chalk"
                onClick={() => {
                  const { from, to } = promotion
                  setPromotion(null)
                  setSelected(null)
                  onMove?.(from, to, p)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pieceSrc(settings.pieces, `${promotion.colour}${p.toUpperCase()}`)} alt="" className="h-full w-full object-contain" />
              </button>
            ))}
          </div>
        </>
      )}
      {overlay}
    </div>
  )
}

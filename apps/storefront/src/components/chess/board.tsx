"use client"

import { Chess, type Square } from "chess.js"
import { useMemo, useState } from "react"
import { Chessboard, type PieceRenderObject } from "react-chessboard"
import { playSound } from "@/lib/chess/sounds"
import { animationMs, BOARD_THEMES, useBoardSettings } from "@/lib/chess/settings"

export type Colour = "w" | "b"
export type BoardArrow = { from: string; to: string; color?: string }

const PIECE_CODES = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"] as const
const PROMOTE = ["q", "n", "r", "b"] as const

const LAST_MOVE = "rgba(255, 238, 51, 0.42)"
const SELECTED = "rgba(255, 238, 51, 0.55)"
const DOT = "radial-gradient(circle, rgba(0,0,0,0.16) 22%, transparent 23%)"
const RING = "radial-gradient(circle, transparent 60%, rgba(0,0,0,0.16) 61%)"
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
}

const pieceImages = (set: string): PieceRenderObject =>
  Object.fromEntries(
    PIECE_CODES.map((code) => [
      code,
      () => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/pieces/${set}/${code}.svg`}
          alt=""
          draggable={false}
          style={{
            width: "100%",
            height: "100%",
            filter: set === "modern" ? "drop-shadow(0 2px 1.5px rgba(0,0,0,0.28))" : undefined,
            pointerEvents: "none",
            userSelect: "none",
          }}
        />
      ),
    ])
  )

// The chessboard everywhere on the site: legal-move dots, highlights, drag or click to move,
// a piece picker for promotions, and the person's chosen board and pieces.
export function Board({ id, fen, orientation, movable, lastMove, arrows, onMove }: Props) {
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
  const selected = canMove ? picked : null
  const targets = useMemo(
    () => (selected && canMove ? chess.moves({ square: selected, verbose: true }) : []),
    [chess, selected, canMove]
  )

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
    if (lastMove) {
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
    if (selected) {
      add(selected, { backgroundColor: SELECTED })
      if (settings.legalMoves) {
        for (const m of targets) add(m.to, { backgroundImage: chess.get(m.to as Square) ? RING : DOT, cursor: "pointer" })
      }
    }
    return st
  }, [lastMove, chess, selected, targets, settings.legalMoves])

  const pieces = useMemo(() => pieceImages(settings.pieces), [settings.pieces])

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
          position: fen,
          boardOrientation: orientation,
          pieces,
          allowDragging: canMove,
          canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === movable,
          onPieceDrag: ({ square }) => square && setSelected(square as Square),
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare || targetSquare === sourceSquare) return false
            const ok = attempt(sourceSquare as Square, targetSquare as Square)
            if (ok) setSelected(null)
            return ok
          },
          onSquareClick: ({ square }) => clickSquare(square as Square),
          boardStyle: { borderRadius: 6, overflow: "hidden", boxShadow: "0 6px 18px rgba(0,0,0,0.14)" },
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
                className="aspect-square w-full p-[6%] transition hover:bg-maple-soft"
                onClick={() => {
                  const { from, to } = promotion
                  setPromotion(null)
                  setSelected(null)
                  onMove?.(from, to, p)
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/pieces/${settings.pieces}/${promotion.colour}${p.toUpperCase()}.svg`} alt="" className="h-full w-full" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

"use client"

import type { Square } from "chess.js"
import { useEffect, useMemo, useRef, useState } from "react"
import { Board, type Colour } from "@/components/chess/board"
import { PlayLayout } from "@/components/chess/play-layout"
import { playSound, soundForSan } from "@/lib/chess/sounds"
import { isRightMove, positionAt, type Puzzle } from "@/lib/puzzles"

const RIGHT = "rgba(95, 208, 122, 0.55)"
const WRONG = "rgba(226, 84, 70, 0.6)"
const HINT = "rgba(80, 160, 255, 0.55)"

export type SolverState = {
  puzzle: Puzzle
  colour: Colour
  // Waiting for the player (after the opening move and every reply).
  yourTurn: boolean
  status: "starting" | "playing" | "wrong" | "solved" | "failed"
  // A mistake or a hint was used: it counts as a miss.
  missed: boolean
  hint: () => void
  retry: () => void
  showSolution: () => void
}

const sanOf = (p: Puzzle, ply: number) => {
  try {
    const c = positionAt(p, ply).chess
    const uci = p.moves[ply]
    return c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san
  } catch {
    return undefined
  }
}

// One puzzle on the board. The website plays the opponent's moves; the player finds theirs.
// `onFirstResult` is called once: false at the first mistake (or hint), true when solved cleanly.
// `strict` (Puzzle Rush): a mistake ends the puzzle straight away.
export function PuzzleSolver({
  puzzle,
  onFirstResult,
  onFinished,
  strict = false,
  panel,
  top,
  bottom,
  overlay,
}: {
  puzzle: Puzzle
  onFirstResult?: (solved: boolean) => void
  onFinished?: (solved: boolean) => void
  strict?: boolean
  panel: (s: SolverState) => React.ReactNode
  top?: React.ReactNode
  bottom?: (s: SolverState) => React.ReactNode
  overlay?: React.ReactNode
}) {
  // The line as played (a different mating move replaces the puzzle's last move).
  const [moves, setMoves] = useState(puzzle.moves)
  const line = useMemo(() => ({ ...puzzle, moves }), [puzzle, moves])
  const [ply, setPly] = useState(0)
  const [status, setStatus] = useState<SolverState["status"]>("starting")
  const [missed, setMissed] = useState(false)
  const [marks, setMarks] = useState<Record<string, string>>({})
  const reported = useRef(false)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const later = (ms: number, f: () => void) => timers.current.push(setTimeout(f, ms))

  // The player plays the side that moves after the opening move.
  const colour: Colour = useMemo(() => (positionAt(puzzle, 1).chess.turn() === "w" ? "w" : "b"), [puzzle])
  const { fen, last } = useMemo(() => positionAt(line, ply), [line, ply])

  const report = (solved: boolean) => {
    if (reported.current) return
    reported.current = true
    onFirstResult?.(solved)
  }

  useEffect(() => {
    const list = timers.current
    // Show the position, then play the opponent's move.
    list.push(
      setTimeout(() => {
        setPly(1)
        setStatus("playing")
        playSound(soundForSan(sanOf(puzzle, 0)))
      }, 650)
    )
    return () => list.forEach(clearTimeout)
  }, [puzzle])

  const onMove = (from: Square, to: Square, promotion?: "q" | "r" | "b" | "n") => {
    if (status !== "playing" || ply % 2 === 0) return false
    const uci = `${from}${to}${promotion ?? ""}`
    if (!isRightMove(puzzle, ply, uci)) {
      playSound("illegal")
      setMarks({ [from]: WRONG, [to]: WRONG })
      setMissed(true)
      report(false)
      if (strict) {
        setStatus("failed")
        later(700, () => onFinished?.(false))
        return false
      }
      setStatus("wrong")
      return false
    }
    // Right. (A different mate on the last move still ends the puzzle.)
    const finishing = ply + 1 >= puzzle.moves.length || puzzle.moves[ply] !== uci
    const played = [...puzzle.moves.slice(0, ply), uci]
    playSound(soundForSan(sanOf({ ...puzzle, moves: played }, ply)))
    setMarks({ [to]: RIGHT })
    if (finishing) {
      if (puzzle.moves[ply] !== uci) setMoves(played)
      setPly(ply + 1)
      setStatus("solved")
      report(true)
      later(400, () => onFinished?.(true))
      return true
    }
    setPly(ply + 1)
    later(450, () => {
      setPly(ply + 2)
      setMarks({})
      playSound(soundForSan(sanOf(puzzle, ply + 1)))
    })
    return true
  }

  const s: SolverState = {
    puzzle,
    colour,
    yourTurn: status === "playing" && ply % 2 === 1,
    status,
    missed,
    hint: () => {
      if (status !== "playing" || ply % 2 === 0) return
      setMissed(true)
      report(false)
      setMarks({ [puzzle.moves[ply].slice(0, 2)]: HINT })
    },
    retry: () => {
      setMarks({})
      setStatus("playing")
    },
    showSolution: () => {
      setMissed(true)
      report(false)
      setStatus("failed")
      setMarks({})
      let at = ply
      const step = () => {
        if (at >= puzzle.moves.length) {
          later(300, () => onFinished?.(false))
          return
        }
        const san = sanOf(puzzle, at)
        at++
        setPly(at)
        playSound(soundForSan(san))
        later(700, step)
      }
      step()
    },
  }

  /* eslint-disable react-hooks/refs -- the handlers in `s` use refs only when they run (on clicks), not while rendering */
  return (
    <PlayLayout
      top={top}
      bottom={bottom?.(s)}
      board={
        <Board
          id={`puzzle-${puzzle.id}`}
          fen={fen}
          orientation={colour === "w" ? "white" : "black"}
          movable={s.yourTurn ? colour : null}
          lastMove={last}
          onMove={onMove}
          marks={marks}
          overlay={overlay}
        />
      }
      panel={panel(s)}
    />
  )
  /* eslint-enable react-hooks/refs */
}

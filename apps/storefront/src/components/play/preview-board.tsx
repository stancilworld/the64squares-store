"use client"

import { Board } from "@/components/chess/board"
import { PlayerBar } from "@/components/chess/player-bar"
import { PlayLayout } from "@/components/chess/play-layout"
import { START_FEN } from "@/lib/chess/replay"

// The board shown beside menus (Play, Play online, Play a friend), like an empty table.
export function PreviewLayout({ panel, myName }: { panel: React.ReactNode; myName?: string | null }) {
  return (
    <PlayLayout
      boardOnPhones={false}
      top={<PlayerBar name="Opponent" colour="b" />}
      bottom={<PlayerBar name={myName ?? "You"} colour="w" />}
      board={<Board id="preview" fen={START_FEN} orientation="white" movable={null} />}
      panel={panel}
    />
  )
}

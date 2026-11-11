"use client"

import { GIcon } from "@/components/play-shell/icons"
import { GearIcon, openBoardSettings } from "@/components/chess/board-settings"
import { toggleFocus, useFocusScreen } from "@/lib/chess/focus"
import { BoardTool } from "./play-layout"

// The tools beside the board while playing: focus mode, board settings, flip. In focus mode,
// the game's own buttons (draw, resign) come here too, as the side panel is hidden.
export function GameTools({ onFlip, focusExtras }: { onFlip: () => void; focusExtras?: React.ReactNode }) {
  const focus = useFocusScreen()
  return (
    <>
      <BoardTool icon={<GIcon name="focus" size={26} />} label={focus ? "Exit focus" : "Focus"} keyHint="F" active={focus} onClick={toggleFocus} />
      <BoardTool icon={<GearIcon size={26} />} label="Board" onClick={openBoardSettings} />
      <BoardTool icon={<GIcon name="swap" size={26} />} label="Flip" onClick={onFlip} />
      {focus && focusExtras}
    </>
  )
}

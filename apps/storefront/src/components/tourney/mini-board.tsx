// A small board drawn from a position (FEN), for live boards and game cards. Pieces are the
// site's own set; the last move is tinted.
const PIECES: Record<string, string> = { p: "bP", n: "bN", b: "bB", r: "bR", q: "bQ", k: "bK", P: "wP", N: "wN", B: "wB", R: "wR", Q: "wQ", K: "wK" }
const FILES = "abcdefgh"

export function MiniBoard({ fen, lastMove, flipped = false, className = "", label }: { fen: string; lastMove?: { from: string; to: string } | null; flipped?: boolean; className?: string; label?: string }) {
  const rows = (fen.split(" ")[0] ?? "").split("/")
  const squares: { x: number; y: number; sq: string; piece: string | null }[] = []
  rows.forEach((rank, y) => {
    let x = 0
    for (const ch of rank) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) {
          squares.push({ x, y, sq: `${FILES[x]}${8 - y}`, piece: null })
          x++
        }
      } else {
        squares.push({ x, y, sq: `${FILES[x]}${8 - y}`, piece: PIECES[ch] ?? null })
        x++
      }
    }
  })
  const hl = new Set(lastMove ? [lastMove.from, lastMove.to] : [])
  return (
    <svg viewBox="0 0 8 8" role="img" aria-label={label ?? "Chess position"} className={`block aspect-square w-full overflow-hidden rounded-[4px] ${className}`}>
      {squares.map((s) => {
        const x = flipped ? 7 - s.x : s.x
        const y = flipped ? 7 - s.y : s.y
        const dark = (s.x + s.y) % 2 === 1
        return (
          <g key={s.sq}>
            <rect x={x} y={y} width={1} height={1} fill={hl.has(s.sq) ? (dark ? "#c7a24a" : "#e6cf7c") : dark ? "#9c7653" : "#ecd9b6"} />
            {s.piece && <image href={`/pieces/classic/${s.piece}.svg`} x={x + 0.03} y={y + 0.03} width={0.94} height={0.94} />}
          </g>
        )
      })}
    </svg>
  )
}

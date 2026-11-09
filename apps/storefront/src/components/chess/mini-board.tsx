// A small, still picture of a position (no moving pieces): used on the homepage and in
// lists. `flip` shows it from Black's side; `marks` are squares to highlight.
const FILES = "abcdefgh"

export function MiniBoard({ fen, flip = false, marks = [], className = "" }: { fen: string; flip?: boolean; marks?: string[]; className?: string }) {
  const rows = fen.split(" ")[0].split("/")
  const cells: { sq: string; piece: string | null }[] = []
  rows.forEach((row, r) => {
    let f = 0
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i++) cells.push({ sq: `${FILES[f++]}${8 - r}`, piece: null })
      } else {
        cells.push({ sq: `${FILES[f++]}${8 - r}`, piece: `${ch === ch.toUpperCase() ? "w" : "b"}${ch.toUpperCase()}` })
      }
    }
  })
  const shown = flip ? [...cells].reverse() : cells
  return (
    <div role="img" aria-label="Chess position" className={`grid aspect-square grid-cols-8 overflow-hidden ${className}`}>
      {shown.map((c) => {
        const dark = (FILES.indexOf(c.sq[0]) + Number(c.sq[1])) % 2 === 1
        const marked = marks.includes(c.sq)
        return (
          <span key={c.sq} className="relative" style={{ background: marked ? (dark ? "#d9a514" : "#f5cf4a") : dark ? "var(--color-sq-dark)" : "var(--color-sq-light)" }}>
            {c.piece && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/pieces/classic/${c.piece}.svg`} alt="" className="absolute inset-0 h-full w-full p-[4%]" />
            )}
          </span>
        )
      })}
    </div>
  )
}

import { Chess, type Color, type PieceSymbol, type Square } from "chess.js"
import type { Eval, Kind, Reviewed } from "./review"

// The game review coach: what to say about each move, worked out from the engine's review.
// Every line comes twice: `text` to read on screen (with moves like Nxf5+) and `say` for the
// voice (with moves in words: "knight takes f5, check").
//
// The reasons come from the position and the engine's best lines: a piece left to be taken
// (the engine's best reply takes it), a fork, a checkmate allowed or missed, material the
// best move would have won.

// detail: the explanation without the move and its verdict (the review shows those already).
export type Line = { text: string; say: string; detail?: string }
export type Ctx = { me: Color | null; white: string; black: string }

const NAME: Record<PieceSymbol, string> = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" }
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }
const KEY_KINDS: Kind[] = ["brilliant", "great", "inaccuracy", "mistake", "miss", "blunder"]

// A move in words, for the voice.
export const sayMove = (san: string) => {
  if (san.startsWith("O-O-O")) return `castles queenside${san.endsWith("#") ? ", checkmate" : san.endsWith("+") ? ", check" : ""}`
  if (san.startsWith("O-O")) return `castles${san.endsWith("#") ? ", checkmate" : san.endsWith("+") ? ", check" : ""}`
  const m = /^([NBRQK])?([a-h]?[1-8]?)?(x)?([a-h][1-8])(=([NBRQ]))?([+#])?$/.exec(san)
  if (!m) return san
  const piece = m[1] ? NAME[m[1].toLowerCase() as PieceSymbol] : "pawn"
  const promo = m[6] ? `, promotes to a ${NAME[m[6].toLowerCase() as PieceSymbol]}` : ""
  const end = m[7] === "#" ? ", checkmate" : m[7] === "+" ? ", check" : ""
  // Pawn moves as commentators say them: "e4", "e takes d5".
  if (!m[1]) return `${m[3] ? `${m[2] || ""} takes ${m[4]}` : m[4]}${promo}${end}`.trim()
  return `${piece} ${m[3] ? "takes" : "to"} ${m[4]}${promo}${end}`
}

// The pieces of `side` that the piece on `sq` attacks (as if it were its move).
const attacks = (fen: string, sq: Square) => {
  const parts = fen.split(" ")
  const c = new Chess(fen)
  const p = c.get(sq)
  if (!p) return []
  parts[1] = p.color
  parts[3] = "-"
  let pos: Chess
  try {
    pos = new Chess(parts.join(" "))
  } catch {
    return []
  }
  return pos
    .moves({ square: sq, verbose: true })
    .filter((m) => m.captured)
    .map((m) => ({ sq: m.to as Square, piece: m.captured as PieceSymbol }))
}

// A fork: the piece on `sq` attacks two or more pieces worth more than a pawn (or the king).
const forkAt = (fen: string, sq: Square) => {
  const hits = attacks(fen, sq).filter((h) => VALUE[h.piece] >= 3)
  const unique = [...new Map(hits.map((h) => [h.sq, h])).values()].sort((a, b) => VALUE[b.piece] - VALUE[a.piece])
  return unique.length >= 2 ? unique.slice(0, 2) : null
}

const after = (fen: string, uci: string) => {
  const c = new Chess(fen)
  try {
    const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
    return { c, m }
  } catch {
    return null
  }
}

const both = (text: string, say = text): Line => ({ text, say })
const join = (lines: (Line | null | undefined | false)[]): Line => {
  const ok = lines.filter((l): l is Line => !!l)
  return { text: ok.map((l) => l.text).join(" "), say: ok.map((l) => l.say).join(" ") }
}
const out = (head: Line, ...rest: (Line | null | undefined | false)[]): Line => ({ ...join([head, ...rest]), detail: join(rest).text })
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function coachLine(r: Reviewed, evBefore: Eval | undefined, evAfter: Eval | undefined, ctx: Ctx, ply: number): Line {
  const mine = ctx.me ? r.colour === ctx.me : null
  const who = mine === null ? (r.colour === "w" ? "White" : "Black") : mine ? "you" : "your opponent"
  const whose = mine === null ? `${r.colour === "w" ? "White" : "Black"}'s` : mine ? "your" : "your opponent's"
  const them = mine === null ? (r.colour === "w" ? "Black" : "White") : mine ? "your opponent" : "you"
  const themPoss = mine === null ? `${r.colour === "w" ? "Black" : "White"}'s` : mine ? "your opponent's" : "your"
  const moveNo = `${Math.ceil(ply / 2)}${r.colour === "w" ? "." : "..."}`
  const pos = new Chess(r.fenAfter)
  const before = new Chess(r.fenBefore)
  const moved = before.get(r.from as Square)
  const captured = before.get(r.to as Square) ?? (moved?.type === "p" && r.from[0] !== r.to[0] ? { type: "p" as PieceSymbol, color: moved.color } : undefined)
  const best = r.bestSan ? both(`${r.bestSan}`, cap(sayMove(r.bestSan))) : null
  const mateIn = (n: number) => (n === 1 ? "checkmate straight away" : `checkmate in ${n} moves`)

  // How things stand for the side that moved, after the move.
  const chance = r.colour === "w" ? r.winAfter : 100 - r.winAfter
  const standing =
    chance >= 85 ? both(`${cap(who)} ${who === "you" ? "are" : "is"} winning now.`) : chance >= 65 ? both(`${cap(who)} ${who === "you" ? "are" : "is"} better.`) : chance > 35 ? both("It's about level.") : chance > 15 ? both(`${cap(them)} ${them === "you" ? "are" : "is"} better now.`) : both(`${cap(them)} ${them === "you" ? "are" : "is"} winning now.`)

  // Checkmate on the board.
  if (pos.isCheckmate()) return both(`${moveNo} ${r.san}: checkmate! ${cap(who)} ${who === "you" ? "win" : "wins"} the game.`, `${cap(sayMove(r.san))}! ${cap(who)} ${who === "you" ? "win" : "wins"} the game.`)

  // What happened on the move.
  const what: Line[] = []
  if (r.san.startsWith("O-O")) what.push(both("Castling puts the king safe and brings the rook into play."))
  else if (captured && moved && VALUE[captured.type] >= 3) what.push(both(`${cap(who)} ${who === "you" ? "take" : "takes"} ${themPoss} ${NAME[captured.type]}.`))
  const fork = moved && moved.type !== "k" ? forkAt(r.fenAfter, r.to as Square) : null
  if (fork && !["inaccuracy", "mistake", "blunder"].includes(r.kind)) what.push(both(`A fork: the ${NAME[moved!.type]} attacks the ${NAME[fork[0].piece]} and the ${NAME[fork[1].piece]}.`))

  // Why a move was bad: the engine's best reply, and what it does.
  const why: Line[] = []
  const reply = evAfter?.best ?? evAfter?.pv?.[0]
  if (evAfter?.mate != null && evAfter.mate > 0) {
    why.push(both(`This lets ${them} force ${mateIn(evAfter.mate)}.`))
  } else if (reply) {
    const a = after(r.fenAfter, reply)
    if (a?.m.captured && VALUE[a.m.captured as PieceSymbol] >= 3) {
      why.push(both(`It leaves ${whose} ${NAME[a.m.captured as PieceSymbol]} on ${a.m.to} to be taken: ${a.m.san}.`, `It leaves ${whose} ${NAME[a.m.captured as PieceSymbol]} on ${a.m.to} to be taken, with ${sayMove(a.m.san)}.`))
    } else if (a) {
      const f = a.m.piece !== "k" ? forkAt(a.c.fen(), a.m.to as Square) : null
      if (f) why.push(both(`${cap(them)} can answer ${a.m.san}, forking the ${NAME[f[0].piece]} and the ${NAME[f[1].piece]}.`, `${cap(them)} can answer ${sayMove(a.m.san)}, forking the ${NAME[f[0].piece]} and the ${NAME[f[1].piece]}.`))
    }
  }
  // What the best move would have done.
  const missed: Line[] = []
  if (r.best && best) {
    if (evBefore?.mate != null && evBefore.mate > 0 && !(evAfter?.mate != null && evAfter.mate < 0)) {
      missed.push(both(`${best.text} would have forced ${mateIn(evBefore.mate)}.`, `${best.say} would have forced ${mateIn(evBefore.mate)}.`))
    } else {
      const b = after(r.fenBefore, r.best)
      if (b?.m.captured && VALUE[b.m.captured as PieceSymbol] >= 3) missed.push(both(`${best.text} would have won ${themPoss} ${NAME[b.m.captured as PieceSymbol]}.`, `${best.say} would have won ${themPoss} ${NAME[b.m.captured as PieceSymbol]}.`))
      else if (b && b.m.piece !== "k" && forkAt(b.c.fen(), b.m.to as Square)) {
        const f = forkAt(b.c.fen(), b.m.to as Square)!
        missed.push(both(`${best.text} was a fork, hitting the ${NAME[f[0].piece]} and the ${NAME[f[1].piece]}.`, `${best.say} was a fork, hitting the ${NAME[f[0].piece]} and the ${NAME[f[1].piece]}.`))
      }
    }
  }
  const bestWas = best ? both(`Best was ${best.text}.`, `Best was ${best.say}.`) : null
  const head = (label: string) => both(`${moveNo} ${r.san}: ${label}`, `${cap(sayMove(r.san))}. ${cap(label)}`)

  switch (r.kind) {
    case "book":
      return out(head("a standard opening move."), moved && (moved.type === "n" || moved.type === "b") && r.from[1] === (r.colour === "w" ? "1" : "8") ? both(`It develops the ${NAME[moved.type]}.`) : null, ...what.slice(0, 1))
    case "forced":
      return out(head("the only legal move."))
    case "brilliant":
      return out(head("brilliant!"), both(`${cap(who)} ${who === "you" ? "offer" : "offers"} the ${moved ? NAME[moved.type] : "piece"}, and taking it loses.`), standing)
    case "great":
      return out(head("a great move."), both("It's the one move that punishes the mistake."), ...what, standing)
    case "best":
      return out(head("the best move."), ...what)
    case "excellent":
      return out(head("an excellent move."), ...what)
    case "good":
      return out(head("a good move."), ...what, best ? both(`${best.text} was a little stronger.`, `${best.say} was a little stronger.`) : null)
    case "inaccuracy":
      return out(head("an inaccuracy."), why[0] ?? missed[0] ?? bestWas, why[0] || missed[0] ? bestWas : null)
    case "mistake":
      return out(head("a mistake."), why[0], missed[0] ?? bestWas, standing)
    case "miss":
      return out(head("a missed chance."), both(`${cap(them)} had just slipped, and this lets it go.`), missed[0] ?? bestWas)
    case "blunder":
      return out(head("a blunder!"), why[0], missed[0] ?? bestWas, standing)
  }
  return head("")
}

// Before the first move: who played, and how well.
export function coachIntro(ctx: Ctx, accW: number, accB: number, result: string | null | undefined, reviewed: Reviewed[]): Line {
  const n = (c: Color, k: Kind) => reviewed.filter((m) => m.colour === c && m.kind === k).length
  const me = ctx.me
  const acc = (c: Color) => Math.round(c === "w" ? accW : accB)
  const res = result === "1-0" ? "White won" : result === "0-1" ? "Black won" : result === "1/2-1/2" ? "It was a draw" : null
  if (me) {
    const opp: Color = me === "w" ? "b" : "w"
    const errors = n(me, "blunder") + n(me, "mistake")
    const tone =
      acc(me) >= 90 ? "A very accurate game." : acc(me) >= 75 ? "A solid game." : errors >= 3 ? "A few big errors decided this one." : "Some good ideas, and some moves to learn from."
    return both(
      `Let's look at your game against ${me === "w" ? ctx.black : ctx.white}. ${res ? `${res}. ` : ""}Your accuracy was ${acc(me)}%, your opponent's ${acc(opp)}%. ${tone}`,
      `Let's look at your game against ${me === "w" ? ctx.black : ctx.white}. ${res ? `${res}. ` : ""}Your accuracy was ${acc(me)} percent, your opponent's ${acc(opp)} percent. ${tone}`
    )
  }
  return both(
    `${ctx.white} against ${ctx.black}. ${res ? `${res}. ` : ""}Accuracy: White ${acc("w")}%, Black ${acc("b")}%.`,
    `${ctx.white} against ${ctx.black}. ${res ? `${res}. ` : ""}Accuracy: White ${acc("w")} percent, Black ${acc("b")} percent.`
  )
}

// The moves worth stopping on: errors, brilliant and great moves, and the end.
export const keyMoment = (r: Reviewed, isLast: boolean) => isLast || KEY_KINDS.includes(r.kind) || r.san.endsWith("#")

// The turning point: the move that swung the game most.
export function coachSummary(reviewed: Reviewed[], ctx: Ctx): Line | null {
  const worst = reviewed.reduce<{ i: number; loss: number } | null>((w, m, i) => (m.loss > (w?.loss ?? 12) ? { i, loss: m.loss } : w), null)
  if (!worst) return both("No big errors from either side: a clean game.")
  const m = reviewed[worst.i]
  const moveNo = `${Math.ceil((worst.i + 1) / 2)}${m.colour === "w" ? "." : "..."}`
  const mine = ctx.me ? m.colour === ctx.me : null
  const who = mine === null ? (m.colour === "w" ? "White" : "Black") : mine ? "your" : "your opponent's"
  return both(
    `The turning point was ${mine === null ? `${who}'s` : who} move ${moveNo} ${m.san}${m.bestSan ? `; ${m.bestSan} was the move` : ""}.`,
    `The turning point was ${mine === null ? `${who}'s` : who} move ${Math.ceil((worst.i + 1) / 2)}, ${sayMove(m.san)}${m.bestSan ? `. ${sayMove(m.bestSan)} was the move` : ""}.`
  )
}

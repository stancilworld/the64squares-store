import { Chess } from "chess.js"
import type { Server } from "socket.io"
import { postQuick } from "../chat.js"
import { Engine } from "../engine.js"
import type { Color, Game } from "../game.js"
import type { GameManager } from "../manager.js"
import { acceptDraw, bookMove, type Candidate, chooseMove, complexityOf, offerDraw, pressureOf, searchFor, shouldResign, thinkMs } from "./brain.js"
import { isHouse, type Persona } from "./persona.js"
import { personaOf } from "./store.js"

// Plays the House Players' side of their games: thinks for a human-like time, then moves
// through the same game logic as everyone else (same clocks, same rules).

type Turn = { ply: number; timer: NodeJS.Timeout | null }

export class HouseDriver {
  private engine: Engine | null = null
  private turns = new Map<string, Turn>() // game id → the move being prepared
  private evals = new Map<string, number[]>() // game id → its own eval after each of its moves
  private greeted = new Set<string>()
  private drawAnswered = new Map<string, number>() // game id → ply a draw offer was answered at
  private rand: () => number

  constructor(
    private io: Server,
    private manager: GameManager,
    rand: () => number = Math.random
  ) {
    this.rand = rand
    manager.whenGameChanges((g) => this.check(g))
  }

  private brain() {
    this.engine ??= new Engine({ background: false })
    return this.engine
  }

  // Picks up games already running (after a restart).
  restore() {
    for (const g of this.manager.liveGames()) void this.check(g)
  }

  houseSide(g: Game): Color | null {
    if (isHouse(g.r.white?.id)) return "w"
    if (isHouse(g.r.black?.id)) return "b"
    return null
  }

  async check(g: Game) {
    const side = this.houseSide(g)
    if (!side) return
    const id = g.r.id
    const bot = (side === "w" ? g.r.white : g.r.black)!
    const persona = await personaOf(bot.id)
    if (!persona) return

    if (g.r.status === "finished" || g.r.status === "aborted") {
      this.cancel(id)
      this.evals.delete(id)
      this.drawAnswered.delete(id)
      if (g.r.status === "finished" && g.ply >= 6 && this.rand() < 0.35 + 0.5 * persona.chatty) {
        const won = (g.r.result === "1-0") === (side === "w") && g.r.result !== "1/2-1/2"
        const say = won ? (this.rand() < 0.6 ? "Good game" : "Thanks!") : this.rand() < 0.5 ? "Well played" : "Good game"
        setTimeout(() => postQuick(this.io, id, side, bot.name, say), 1200 + this.rand() * 2500).unref?.()
      }
      this.greeted.delete(id)
      return
    }
    if (g.r.status !== "active") return

    // Hello at the start, sometimes.
    if (!this.greeted.has(id)) {
      this.greeted.add(id)
      if (this.rand() < persona.chatty * 0.6) {
        const say = this.rand() < 0.5 ? "Hi!" : this.rand() < 0.5 ? "Good luck!" : "Have fun!"
        setTimeout(() => postQuick(this.io, id, side, bot.name, say), 1500 + this.rand() * 3000).unref?.()
      }
    }

    // A draw offer from the opponent: think a moment, then answer.
    if (g.r.draw_offer && g.r.draw_offer !== side && this.drawAnswered.get(id) !== g.ply) {
      this.drawAnswered.set(id, g.ply)
      const last = this.evals.get(id)?.slice(-1)[0] ?? 0
      const yes = acceptDraw({ eval: last, ply: g.ply, strength: persona.strength }, this.rand)
      setTimeout(() => {
        void this.manager.act(id, (game, now) => (game.r.draw_offer && game.r.draw_offer !== side ? game.draw(bot.id, yes ? "accept" : "decline", now) : false))
      }, 1500 + this.rand() * 3500).unref?.()
    }

    if (g.turn !== side) return
    const prepared = this.turns.get(id)
    if (prepared && prepared.ply === g.ply) return
    this.cancel(id)
    const turn: Turn = { ply: g.ply, timer: null }
    this.turns.set(id, turn)
    try {
      await this.play(g, side, bot.id, persona, turn)
    } catch (e) {
      console.error("house move failed", e)
      // Never leave the game hanging: a quick safe move.
      if (this.turns.get(id) === turn) this.fallback(g, bot.id, turn)
    }
  }

  private cancel(id: string) {
    const t = this.turns.get(id)
    if (t?.timer) clearTimeout(t.timer)
    this.turns.delete(id)
  }

  private async play(g: Game, side: Color, botId: string, persona: Persona, turn: Turn) {
    const started = Date.now()
    const id = g.r.id
    const ply = g.ply
    const fen = g.fen
    const clocks = g.clocks(started)
    const left = side === "w" ? clocks.w : clocks.b
    const oppLeft = side === "w" ? clocks.b : clocks.w
    const chess = new Chess(fen)
    const legal = chess.moves({ verbose: true })

    // 1. Its own openings while the game is still on them.
    const book = bookMove(g.r.moves, persona, side, this.rand)
    const bookUci = book ? legal.find((m) => m.san === book) : null
    let move: { uci: string } | null = null
    let complexity = 0.3
    if (bookUci) move = { uci: bookUci.from + bookUci.to + (bookUci.promotion ?? "") }
    else {
      // 2. Otherwise, look at the best few moves and choose like a player of its strength.
      const { depth, multipv } = searchFor(persona.strength)
      const raw = await this.brain().candidates(fen, depth, Math.min(multipv, legal.length))
      const cands: Candidate[] = raw
        .map((c) => {
          const m = legal.find((x) => x.from + x.to + (x.promotion ?? "") === c.uci)
          return m ? { uci: c.uci, san: m.san, cp: c.cp, capture: !!m.captured, check: m.san.includes("+"), quiet: !m.captured && !m.san.includes("+") } : null
        })
        .filter((c): c is Candidate => !!c)
      if (!cands.length) throw new Error("no candidates")
      complexity = complexityOf(cands, legal.length)
      const pick = chooseMove(cands, { strength: persona.strength, aggression: persona.aggression, pressure: pressureOf(left, g.r.initial_ms) }, this.rand)
      move = pick
      const ev = this.evals.get(id) ?? []
      ev.push(cands[0].cp)
      this.evals.set(id, ev.slice(-12))
      // Lost for a while: resign instead of moving (as many players do).
      if (g.ply >= 20 && shouldResign({ evalHistory: ev, resigns: persona.resigns, strength: persona.strength, opp_left_ms: oppLeft }, this.rand)) {
        const wait = 2000 + this.rand() * 4000
        turn.timer = setTimeout(() => {
          if (this.turns.get(id) !== turn) return
          void this.manager.act(id, (game, now) => (game.ply === ply ? game.resign(botId, now) : false))
        }, wait)
        return
      }
    }

    const think = thinkMs(
      { initial_ms: g.r.initial_ms, increment_ms: g.r.increment_ms, left_ms: left, opp_left_ms: oppLeft, ply, complexity, book: !!bookUci, pace: persona.pace },
      this.rand
    )
    const wait = Math.max(0, think - (Date.now() - started))
    const chosen = move
    turn.timer = setTimeout(() => {
      if (this.turns.get(id) !== turn) return
      this.turns.delete(id)
      void this.manager.act(id, (game, now) => (game.ply === ply ? game.move(botId, chosen.uci, ply, now) : false)).then(async () => {
        // Now and then, in a long level ending, it offers a draw itself.
        const after = await this.manager.get(id)
        if (after && after.r.status === "active" && offerDraw({ evalHistory: this.evals.get(id) ?? [], ply: after.ply }, this.rand)) {
          void this.manager.act(id, (game, now) => game.draw(botId, "offer", now))
        }
      })
    }, wait)
  }

  private fallback(g: Game, botId: string, turn: Turn) {
    const chess = new Chess(g.fen)
    const moves = chess.moves({ verbose: true })
    if (!moves.length) return
    const m = moves.find((x) => x.captured) ?? moves[Math.floor(this.rand() * moves.length)]
    const ply = g.ply
    turn.timer = setTimeout(() => {
      this.turns.delete(g.r.id)
      void this.manager.act(g.r.id, (game, now) => (game.ply === ply ? game.move(botId, m.from + m.to + (m.promotion ?? ""), ply, now) : false))
    }, 800)
  }

  // A rematch offer from the opponent: most House Players take it, after a moment.
  rematchAnswer(persona: Persona) {
    return { accept: this.rand() < 0.55 + 0.25 * persona.chatty, after: 1500 + this.rand() * 3500 }
  }

  stop() {
    for (const id of [...this.turns.keys()]) this.cancel(id)
    this.engine?.stop()
  }
}

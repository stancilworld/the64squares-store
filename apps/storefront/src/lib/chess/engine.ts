"use client"

// Stockfish running in the person's browser (a Web Worker), so playing the computer costs
// the server nothing and works even on a slow connection once loaded.

export type Level = { level: number; name: string; elo: string; skill?: number; depth?: number; uciElo?: number; movetime?: number; random?: number }

export const LEVELS: Level[] = [
  { level: 1, name: "Beginner", elo: "≈400", skill: 0, depth: 1, random: 0.45 },
  { level: 2, name: "Novice", elo: "≈700", skill: 0, depth: 2, random: 0.2 },
  { level: 3, name: "Casual", elo: "≈1000", skill: 3, depth: 4, random: 0.06 },
  { level: 4, name: "Club player", elo: "≈1350", uciElo: 1350, movetime: 400 },
  { level: 5, name: "Strong club", elo: "≈1600", uciElo: 1600, movetime: 500 },
  { level: 6, name: "Expert", elo: "≈1900", uciElo: 1900, movetime: 700 },
  { level: 7, name: "Candidate master", elo: "≈2300", uciElo: 2300, movetime: 900 },
  { level: 8, name: "Master", elo: "2800+", movetime: 1200 },
]

export class Engine {
  private worker: Worker
  private ready: Promise<void>
  private waiting: ((line: string) => void) | null = null
  private busy: Promise<unknown> = Promise.resolve()

  constructor() {
    this.worker = new Worker("/engine/stockfish-19-lite-single.js")
    let markReady: () => void = () => {}
    this.ready = new Promise<void>((r) => (markReady = r))
    this.worker.onmessage = (e: MessageEvent) => {
      const line = String(e.data)
      if (line === "readyok") markReady()
      this.waiting?.(line)
    }
    this.send("uci")
    this.send("isready")
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  // Best move (UCI, like "e2e4") for a position, at a level's strength or at full strength.
  bestMove(fen: string, level: Level | null, movetime = 600): Promise<string | null> {
    const run = async () => {
      await this.ready
      if (level?.uciElo) {
        this.send("setoption name Skill Level value 20")
        this.send("setoption name UCI_LimitStrength value true")
        this.send(`setoption name UCI_Elo value ${level.uciElo}`)
      } else {
        this.send("setoption name UCI_LimitStrength value false")
        this.send(`setoption name Skill Level value ${level?.skill ?? 20}`)
      }
      this.send("ucinewgame")
      this.send(`position fen ${fen}`)
      const go = level?.depth ? `go depth ${level.depth}` : `go movetime ${level?.movetime ?? movetime}`
      return new Promise<string | null>((resolve) => {
        this.waiting = (line) => {
          if (!line.startsWith("bestmove")) return
          this.waiting = null
          const m = line.split(" ")[1]
          resolve(m && m !== "(none)" ? m : null)
        }
        this.send(go)
      })
    }
    const next = this.busy.then(run, run)
    this.busy = next.catch(() => null)
    return next
  }

  // Full-strength evaluation of a position, from the side to move's point of view.
  analyse(fen: string, depth = 14): Promise<{ cp: number | null; mate: number | null; best: string | null; pv: string[] }> {
    const run = async () => {
      await this.ready
      this.send("setoption name UCI_LimitStrength value false")
      this.send("setoption name Skill Level value 20")
      this.send(`position fen ${fen}`)
      return new Promise<{ cp: number | null; mate: number | null; best: string | null; pv: string[] }>((resolve) => {
        let cp: number | null = null
        let mate: number | null = null
        let pv: string[] = []
        this.waiting = (line) => {
          if (line.startsWith("info") && line.includes(" score ") && !line.includes(" lowerbound") && !line.includes(" upperbound")) {
            const sc = / score (cp|mate) (-?\d+)/.exec(line)
            if (sc) {
              cp = sc[1] === "cp" ? Number(sc[2]) : null
              mate = sc[1] === "mate" ? Number(sc[2]) : null
            }
            const p = / pv (.+)$/.exec(line)
            if (p) pv = p[1].trim().split(/\s+/)
            return
          }
          if (!line.startsWith("bestmove")) return
          this.waiting = null
          const m = line.split(" ")[1]
          resolve({ cp, mate, best: m && m !== "(none)" ? m : null, pv })
        }
        this.send(`go depth ${depth}`)
      })
    }
    const next = this.busy.then(run, run)
    this.busy = next.catch(() => null)
    return next
  }

  stop() {
    this.send("stop")
  }

  terminate() {
    this.worker.terminate()
  }
}

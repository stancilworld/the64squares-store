import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import readline from "node:readline"
import { fileURLToPath } from "node:url"

// A chess engine for checking finished games: a native Stockfish if the server has one
// (STOCKFISH_PATH, or /usr/games/stockfish), otherwise the same engine the website uses,
// run under Node. It runs at low priority so it never slows down live games.

const here = path.dirname(fileURLToPath(import.meta.url))
const bundled = path.resolve(here, "../engine/stockfish-19-lite-single.js")

const command = (): [string, string[]] => {
  const native = process.env.STOCKFISH_PATH || "/usr/games/stockfish"
  if (fs.existsSync(native)) return [native, []]
  return [process.execPath, [bundled]]
}

export type Eval = { cp: number; best: string | null }

export class Engine {
  private proc: ChildProcessWithoutNullStreams
  private lines: ((line: string) => void)[] = []
  private ready: Promise<void>

  constructor() {
    const [cmd, args] = command()
    const nice = fs.existsSync("/usr/bin/nice")
    this.proc = nice ? spawn("/usr/bin/nice", ["-n", "15", cmd, ...args]) : spawn(cmd, args)
    readline.createInterface({ input: this.proc.stdout }).on("line", (l) => {
      for (const f of [...this.lines]) f(l)
    })
    this.proc.on("error", (e) => console.error("engine failed to start", e))
    this.ready = this.until("uciok", () => this.send("uci")).then(() => {
      this.send("setoption name Threads value 1")
      this.send("setoption name Hash value 32")
    })
  }

  private send(cmd: string) {
    this.proc.stdin.write(`${cmd}\n`)
  }

  private until(prefix: string, start: () => void, timeoutMs = 20_000) {
    return new Promise<string[]>((resolve, reject) => {
      const seen: string[] = []
      const timer = setTimeout(() => {
        this.lines = this.lines.filter((f) => f !== on)
        reject(new Error(`engine timeout waiting for ${prefix}`))
      }, timeoutMs)
      const on = (l: string) => {
        seen.push(l)
        if (l.startsWith(prefix)) {
          clearTimeout(timer)
          this.lines = this.lines.filter((f) => f !== on)
          resolve(seen)
        }
      }
      this.lines.push(on)
      start()
    })
  }

  // Score of a position for the side to move, in centipawns (mates count as ±1000).
  async evaluate(fen: string, movetime = 150): Promise<Eval> {
    await this.ready
    const out = await this.until("bestmove", () => {
      this.send(`position fen ${fen}`)
      this.send(`go movetime ${movetime}`)
    })
    let cp = 0
    for (const l of out) {
      const m = / score (cp|mate) (-?\d+)/.exec(l)
      if (m) cp = m[1] === "cp" ? Number(m[2]) : Number(m[2]) > 0 ? 1000 : -1000
    }
    const best = /^bestmove (\S+)/.exec(out[out.length - 1])?.[1] ?? null
    return { cp: Math.max(-1000, Math.min(1000, cp)), best: best === "(none)" ? null : best }
  }

  stop() {
    try {
      this.send("quit")
    } catch {}
    this.proc.kill()
  }
}

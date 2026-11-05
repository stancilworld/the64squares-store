import readline from "node:readline"
import { pool } from "./db.js"
import { migratePuzzles } from "./puzzles.js"

// Imports puzzles from the Lichess puzzle database CSV (https://database.lichess.org/#puzzles,
// CC0) read from standard input:
//
//   curl -L https://database.lichess.org/lichess_db_puzzle.csv.zst | zstd -dc | node dist/import-puzzles.js
//
// Keeps well-tested, well-liked puzzles, at most PER_BAND in each 100-point rating band, so the
// table stays small (about 100,000 puzzles) while every level has plenty.
const PER_BAND = Number(process.env.PUZZLES_PER_BAND || 4000)

const main = async () => {
  await migratePuzzles()
  const bands = new Map<number, number>()
  const { rows } = await pool.query("select (rating / 100) as b, count(*)::int as n from play.puzzle group by 1")
  for (const r of rows) bands.set(Number(r.b), r.n)
  let batch: unknown[][] = []
  let kept = 0
  let read = 0
  const flush = async () => {
    if (!batch.length) return
    const values: unknown[] = []
    const rowsSql = batch.map((r, i) => {
      values.push(...r)
      const o = i * 6
      return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6})`
    })
    await pool.query(`insert into play.puzzle (id, fen, moves, rating, popularity, themes) values ${rowsSql.join(",")} on conflict (id) do nothing`, values)
    batch = []
  }
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
  for await (const line of rl) {
    read++
    if (read === 1 && line.startsWith("PuzzleId")) continue
    const [id, fen, moves, rating, rd, popularity, plays, themes] = line.split(",")
    const r = Number(rating)
    if (!id || !fen || !moves || !Number.isFinite(r)) continue
    if (Number(rd) > 90 || Number(popularity) < 80 || Number(plays) < 200) continue
    const band = Math.floor(r / 100)
    if ((bands.get(band) ?? 0) >= PER_BAND) continue
    bands.set(band, (bands.get(band) ?? 0) + 1)
    batch.push([id, fen, moves.split(" "), Math.round(r), Number(popularity), themes ? themes.split(" ") : []])
    kept++
    if (batch.length >= 500) await flush()
    if (read % 500_000 === 0) console.log(`read ${read.toLocaleString()} puzzles, kept ${kept.toLocaleString()}`)
  }
  await flush()
  console.log(`Done: read ${read.toLocaleString()}, added ${kept.toLocaleString()} puzzles.`)
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

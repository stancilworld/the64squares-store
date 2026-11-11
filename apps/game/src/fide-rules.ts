import { Unzip, UnzipInflate } from "fflate"

// Reading FIDE's monthly rating list (the XML download) and keeping the top players for each
// list. The file is ~300 MB of <player> records, read as a stream; only the top N per list are
// kept in memory.

export type FideSpeed = "standard" | "rapid" | "blitz"
export type FideList = "open" | "women" | "juniors" | "girls" | "india" | "india_women"
export const FIDE_LISTS: FideList[] = ["open", "women", "juniors", "girls", "india", "india_women"]
export const FIDE_SPEEDS: FideSpeed[] = ["standard", "rapid", "blitz"]
export const TOP_N = 100

export type FidePlayer = {
  fide_id: number
  name: string
  fed: string
  sex: "M" | "F"
  title: string | null
  rating: number
  games: number
  birth_year: number | null
}

const tag = (rec: string, name: string) => {
  const m = new RegExp(`<${name}>([^<]*)</${name}>`, "i").exec(rec)
  return m ? m[1].trim() : ""
}
const unescape = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&")

// One <player>…</player> record, or null if it's not a rated, active player.
export const parsePlayer = (rec: string): FidePlayer | null => {
  const id = Number(tag(rec, "fideid"))
  const rating = Number(tag(rec, "rating"))
  if (!id || !rating) return null
  // "i" = inactive (no rated games for a year), "w" = woman; inactive players aren't ranked.
  const flag = tag(rec, "flag").toLowerCase()
  if (flag.includes("i")) return null
  const sex = tag(rec, "sex").toUpperCase() === "F" || flag.includes("w") ? "F" : "M"
  const birth = Number(tag(rec, "birthday").slice(0, 4))
  return {
    fide_id: id,
    name: unescape(tag(rec, "name")),
    fed: tag(rec, "country").toUpperCase(),
    sex,
    title: tag(rec, "title") || null,
    rating,
    games: Number(tag(rec, "games")) || 0,
    birth_year: birth > 1900 ? birth : null,
  }
}

// Which lists a player belongs on. Juniors: 20 or under this year, as FIDE counts it.
export const listsFor = (p: FidePlayer, year: number): FideList[] => {
  const out: FideList[] = ["open"]
  const junior = p.birth_year !== null && year - p.birth_year <= 20
  if (p.sex === "F") out.push("women")
  if (junior) out.push("juniors")
  if (junior && p.sex === "F") out.push("girls")
  if (p.fed === "IND") out.push("india")
  if (p.fed === "IND" && p.sex === "F") out.push("india_women")
  return out
}

// Keeps the best N per list by rating (ties: more rated games first, then the lower FIDE ID).
export class TopLists {
  private lists = new Map<FideList, FidePlayer[]>()
  constructor(private n = TOP_N, private year = new Date().getUTCFullYear()) {
    for (const l of FIDE_LISTS) this.lists.set(l, [])
  }
  add(p: FidePlayer) {
    for (const l of listsFor(p, this.year)) {
      const arr = this.lists.get(l)!
      if (arr.length >= this.n && p.rating <= arr[arr.length - 1].rating) continue
      let i = arr.length
      while (i > 0 && better(p, arr[i - 1])) i--
      arr.splice(i, 0, p)
      if (arr.length > this.n) arr.pop()
    }
  }
  get(l: FideList) {
    return this.lists.get(l) ?? []
  }
}
const better = (a: FidePlayer, b: FidePlayer) => a.rating > b.rating || (a.rating === b.rating && (a.games > b.games || (a.games === b.games && a.fide_id < b.fide_id)))

// Splits a text stream into <player> records; feed chunks, get whole records back.
export class PlayerSplitter {
  private buf = ""
  push(chunk: string, out: (rec: string) => void) {
    this.buf += chunk
    let end: number
    while ((end = this.buf.indexOf("</player>")) !== -1) {
      const start = this.buf.lastIndexOf("<player>", end)
      if (start !== -1) out(this.buf.slice(start, end + 9))
      this.buf = this.buf.slice(end + 9)
    }
    // Nothing useful can be this long without a closing tag.
    if (this.buf.length > 100_000) this.buf = this.buf.slice(-10_000)
  }
}

// "Carlsen, Magnus" → "Magnus Carlsen".
export const displayName = (name: string) => {
  const i = name.indexOf(",")
  return i === -1 ? name : `${name.slice(i + 1).trim()} ${name.slice(0, i).trim()}`.trim()
}

// Streams one zipped XML list and returns its top lists.
export const readList = async (url: string, signal: AbortSignal) => {
  const res = await fetch(url, { signal, headers: { "user-agent": "The64Squares rankings (the64squares.in)" } })
  if (!res.ok || !res.body) throw new Error(`FIDE download failed: ${res.status}`)
  const modified = res.headers.get("last-modified")
  const top = new TopLists()
  const split = new PlayerSplitter()
  const decoder = new TextDecoder()
  let seen = 0
  const unzip = new Unzip((file) => {
    if (!/\.xml$/i.test(file.name)) return
    file.ondata = (err, chunk, final) => {
      if (err) throw err
      split.push(decoder.decode(chunk, { stream: !final }), (rec) => {
        seen++
        const p = parsePlayer(rec)
        if (p) top.add(p)
      })
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      unzip.push(new Uint8Array(0), true)
      break
    }
    unzip.push(value)
  }
  if (seen < 1000) throw new Error(`FIDE list looked empty (${seen} records)`)
  // FIDE lists are dated the 1st of the month.
  const d = modified ? new Date(modified) : new Date()
  const period = d.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })
  return { top, period, seen }
}


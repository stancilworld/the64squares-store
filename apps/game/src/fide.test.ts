import assert from "node:assert/strict"
import test from "node:test"
import { strToU8, zipSync } from "fflate"
import { PlayerSplitter, TopLists, displayName, listsFor, parsePlayer, readList } from "./fide-rules.js"

const rec = (p: { id: number; name: string; fed: string; sex: string; title?: string; rating: number; games?: number; birth: number; flag?: string }) =>
  `<player><fideid>${p.id}</fideid><name>${p.name}</name><country>${p.fed}</country><sex>${p.sex}</sex><title>${p.title ?? ""}</title><w_title></w_title><o_title></o_title><foa_title></foa_title><rating>${p.rating}</rating><games>${p.games ?? 0}</games><k>10</k><birthday>${p.birth}</birthday><flag>${p.flag ?? ""}</flag></player>`

test("FIDE: parses a player, skips inactive and unrated", () => {
  const p = parsePlayer(rec({ id: 1503014, name: "Carlsen, Magnus", fed: "NOR", sex: "M", title: "GM", rating: 2833, games: 9, birth: 1990 }))
  assert.deepEqual(p, { fide_id: 1503014, name: "Carlsen, Magnus", fed: "NOR", sex: "M", title: "GM", rating: 2833, games: 9, birth_year: 1990 })
  assert.equal(parsePlayer(rec({ id: 2, name: "A, B", fed: "IND", sex: "M", rating: 2500, birth: 1980, flag: "i" })), null)
  assert.equal(parsePlayer(rec({ id: 3, name: "A, B", fed: "IND", sex: "F", rating: 2300, birth: 1980, flag: "wi" })), null)
  assert.equal(parsePlayer(rec({ id: 4, name: "A, B", fed: "IND", sex: "M", rating: 0, birth: 1980 })), null)
  assert.equal(parsePlayer("<player><fideid>5</fideid><name>O&apos;Brien, Tom &amp; Co</name><rating>2000</rating><sex>M</sex><country>IRL</country></player>")?.name, "O'Brien, Tom & Co")
  assert.equal(displayName("Carlsen, Magnus"), "Magnus Carlsen")
  assert.equal(displayName("Vaishali R"), "Vaishali R")
})

test("FIDE: list membership", () => {
  const girl = { fide_id: 1, name: "x", fed: "IND", sex: "F" as const, title: null, rating: 2400, games: 1, birth_year: 2008 }
  assert.deepEqual(listsFor(girl, 2026), ["open", "women", "juniors", "girls", "india", "india_women"])
  assert.deepEqual(listsFor({ ...girl, sex: "M", fed: "USA", birth_year: 2000 }, 2026), ["open"])
  assert.deepEqual(listsFor({ ...girl, birth_year: null }, 2026), ["open", "women", "india", "india_women"])
})

test("FIDE: keeps the top N in order, ties by games then ID", () => {
  const t = new TopLists(3, 2026)
  const mk = (id: number, rating: number, games = 0) => ({ fide_id: id, name: `${id}`, fed: "IND", sex: "M" as const, title: null, rating, games, birth_year: 1990 })
  for (const p of [mk(1, 2500), mk(2, 2700), mk(3, 2600), mk(4, 2600, 5), mk(5, 2400), mk(6, 2800)]) t.add(p)
  assert.deepEqual(t.get("open").map((p) => p.fide_id), [6, 2, 4])
  assert.deepEqual(t.get("india").map((p) => p.fide_id), [6, 2, 4])
  assert.equal(t.get("women").length, 0)
})

test("FIDE: records split across chunks", () => {
  const xml = `<?xml version="1.0"?><playerslist>${rec({ id: 1, name: "A, B", fed: "IND", sex: "M", rating: 2000, birth: 1990 })}${rec({ id: 2, name: "C, D", fed: "IND", sex: "M", rating: 2100, birth: 1990 })}</playerslist>`
  const out: string[] = []
  const s = new PlayerSplitter()
  for (let i = 0; i < xml.length; i += 7) s.push(xml.slice(i, i + 7), (r) => out.push(r))
  assert.equal(out.length, 2)
  assert.equal(parsePlayer(out[1])?.fide_id, 2)
})

test("FIDE: reads a zipped list through the streaming download path", async () => {
  const players = Array.from({ length: 1500 }, (_, i) =>
    rec({ id: 1000 + i, name: `Player, No${i}`, fed: i % 10 === 0 ? "IND" : "FRA", sex: i % 3 === 0 ? "F" : "M", title: i < 5 ? "GM" : "", rating: 1400 + i, games: 2, birth: i % 4 === 0 ? 2010 : 1985 })
  ).join("\n")
  const zip = zipSync({ "standard_rating_list.xml": strToU8(`<?xml version="1.0"?>\n<playerslist>\n${players}\n</playerslist>`) })
  const real = globalThis.fetch
  globalThis.fetch = (async () => new Response(zip, { headers: { "last-modified": "Sun, 01 Nov 2026 06:00:00 GMT" } })) as typeof fetch
  try {
    const { top, period, seen } = await readList("https://example.test/list.zip", new AbortController().signal)
    assert.equal(seen, 1500)
    assert.equal(period, "November 2026")
    const open = top.get("open")
    assert.equal(open.length, 100)
    assert.equal(open[0].rating, 1400 + 1499)
    assert.ok(top.get("india").every((p) => p.fed === "IND"))
    assert.ok(top.get("women").every((p) => p.sex === "F"))
    assert.ok(top.get("juniors").every((p) => p.birth_year === 2010))
  } finally {
    globalThis.fetch = real
  }
})

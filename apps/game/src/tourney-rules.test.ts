import assert from "node:assert/strict"
import { describe, it, test } from "node:test"
import { bracketSize, buildBracket, type Entrant, finalRanking, matchState, pairRoundRobin, pairSwiss, rrRounds, rrTable, seedOrder, swissTable, type TGame } from "./tourney-rules.js"

const players = (n: number): Entrant[] => Array.from({ length: n }, (_, i) => ({ id: `cus_${i + 1}`, name: `P${i + 1}`, rating: 2000 - i * 50 }))

const game = (round: number, board: number, white: string, black: string | null, result: TGame["result"], extra: Partial<TGame> = {}): TGame => ({
  round,
  board,
  game_no: 1,
  white_id: white,
  black_id: black,
  result,
  forfeit: false,
  armageddon: false,
  game_id: `g${round}${board}`,
  ...extra,
})

// Plays a whole Swiss event: the higher-rated player always wins.
const simulate = (n: number, rounds: number) => {
  const ps = players(n)
  const rating = new Map(ps.map((p) => [p.id, p.rating]))
  const games: TGame[] = []
  for (let r = 1; r <= rounds; r++) {
    const pairs = pairSwiss(swissTable(ps, games, new Set(), rounds), r)
    pairs.forEach((p, i) => {
      if (!p.black) games.push(game(r, i + 1, p.white, null, null))
      else games.push(game(r, i + 1, p.white, p.black, rating.get(p.white)! > rating.get(p.black)! ? "1-0" : "0-1"))
    })
  }
  return { ps, games, table: swissTable(ps, games, new Set(), rounds) }
}

test("swiss: round 1 pairs top half against bottom half, alternating colours", () => {
  const pairs = pairSwiss(swissTable(players(8), [], new Set(), 5), 1)
  assert.equal(pairs.length, 4)
  const ids = pairs.map((p) => [p.white, p.black].sort().join("-")).sort()
  assert.deepEqual(ids, ["cus_1-cus_5", "cus_2-cus_6", "cus_3-cus_7", "cus_4-cus_8"])
})

test("swiss: nobody meets the same opponent twice and an odd player gets one bye", () => {
  const { table, games } = simulate(9, 5)
  for (const r of table) assert.equal(new Set(r.opponents).size, r.opponents.length, `${r.id} met someone twice`)
  const byes = games.filter((g) => g.black_id === null).map((g) => g.white_id)
  assert.equal(byes.length, 5)
  assert.equal(new Set(byes).size, 5)
  // The strongest player wins every game.
  assert.equal(table[0].id, "cus_1")
  assert.equal(table[0].points, 5)
})

test("swiss: colours stay balanced", () => {
  const { table } = simulate(16, 6)
  for (const r of table) assert.ok(Math.abs(r.whites - r.blacks) <= 2, `${r.id}: ${r.whites} whites, ${r.blacks} blacks`)
})

test("swiss: withdrawn players aren't paired", () => {
  const ps = players(6)
  const pairs = pairSwiss(swissTable(ps, [], new Set(["cus_2"]), 3), 1)
  assert.ok(!pairs.some((p) => p.white === "cus_2" || p.black === "cus_2"))
  assert.equal(pairs.filter((p) => p.black === null).length, 1)
})

test("swiss: Buchholz and Sonneborn-Berger", () => {
  const ps = players(4)
  const games = [game(1, 1, "cus_1", "cus_3", "1-0"), game(1, 2, "cus_2", "cus_4", "1/2-1/2"), game(2, 1, "cus_1", "cus_2", "1/2-1/2"), game(2, 2, "cus_3", "cus_4", "1-0")]
  const t = swissTable(ps, games, new Set(), 2)
  const p1 = t.find((r) => r.id === "cus_1")!
  assert.equal(p1.points, 1.5)
  // Opponents: P3 (1 point) and P2 (1 point); cut-1 drops the lowest.
  assert.equal(p1.buchholz, 1)
  // SB: beat P3 (1) + half of drawn P2 (1) = 1.5
  assert.equal(p1.sb, 1.5)
  assert.equal(t[0].id, "cus_1")
})

test("knockout: seeding puts the top seeds on opposite sides", () => {
  assert.deepEqual(seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6])
  assert.equal(bracketSize(5), 8)
  assert.equal(bracketSize(16), 16)
})

test("knockout: byes for top seeds, winners move on", () => {
  const ps = players(6)
  const b = buildBracket(ps, [], { games: 1, armageddon: true })
  assert.equal(b.size, 8)
  assert.equal(b.rounds.length, 3)
  const r1 = b.rounds[0].matches
  // Seeds 1 and 2 get byes.
  assert.equal(r1.filter((m) => m.decided_by === "bye").length, 2)
  assert.equal(b.rounds[1].name, "Semi-finals")
  assert.equal(b.rounds[2].name, "Final")
})

test("knockout: two-game match, then sudden death with draw odds for Black", () => {
  const opts = { games: 2, armageddon: true }
  assert.deepEqual(matchState("a", "b", [], opts).next, { white: "a", black: "b", armageddon: false })
  const g1 = { ...game(1, 1, "a", "b", "1-0"), game_no: 1 }
  assert.deepEqual(matchState("a", "b", [g1], opts).next, { white: "b", black: "a", armageddon: false })
  const g2 = { ...game(1, 1, "b", "a", "1-0"), game_no: 2 }
  const tied = matchState("a", "b", [g1, g2], opts)
  assert.deepEqual(tied.score, [1, 1])
  assert.deepEqual(tied.next, { white: "b", black: "a", armageddon: true })
  const g3 = { ...game(1, 1, "b", "a", "1/2-1/2"), game_no: 3, armageddon: true }
  const done = matchState("a", "b", [g1, g2, g3], opts)
  assert.equal(done.winner, "a")
  assert.equal(done.decided_by, "armageddon")
})

test("knockout: decided early, by forfeit, or by seed without sudden death", () => {
  const g1 = game(1, 1, "a", "b", "1-0")
  const g2 = { ...game(1, 1, "b", "a", "0-1"), game_no: 2 }
  assert.equal(matchState("a", "b", [g1, g2], { games: 3, armageddon: true }).winner, "a")
  const f = { ...game(1, 1, "a", "b", "0-1"), forfeit: true }
  const ff = matchState("a", "b", [f], { games: 2, armageddon: true })
  assert.equal(ff.winner, "b")
  assert.equal(ff.decided_by, "forfeit")
  const d = game(1, 1, "a", "b", "1/2-1/2")
  const seed = matchState("a", "b", [d], { games: 1, armageddon: false })
  assert.equal(seed.winner, "a")
  assert.equal(seed.decided_by, "seed")
})

test("knockout: a full bracket plays out to one winner", () => {
  const ps = players(8)
  const games: TGame[] = []
  const opts = { games: 1, armageddon: true }
  for (let r = 1; r <= 3; r++) {
    const b = buildBracket(ps, games, opts)
    for (const m of b.rounds[r - 1].matches) {
      if (!m.a || !m.b || m.winner) continue
      const st = matchState(m.a.id, m.b.id, m.games, opts)
      games.push({ ...game(r, m.board, st.next!.white, st.next!.black, "1-0"), game_no: 1 })
    }
  }
  const final = buildBracket(ps, games, opts).rounds[2].matches[0]
  assert.ok(final.winner)
})

test("final ranking: knockout places by the round a player went out", () => {
  const ps = players(4)
  // Seeds 1v4 and 2v3; 1 and 3 win, then 3 beats 1 in the final.
  const gs = [game(1, 1, "cus_1", "cus_4", "1-0"), game(1, 2, "cus_2", "cus_3", "0-1"), game(2, 1, "cus_1", "cus_3", "0-1")]
  const b = buildBracket(ps, gs, { games: 1, armageddon: false })
  const r = finalRanking("knockout", null, b)
  assert.deepEqual(
    r.map((x) => [x.id, x.rank]),
    [
      ["cus_3", 1],
      ["cus_1", 2],
      ["cus_2", 3],
      ["cus_4", 3],
    ]
  )
})

test("final ranking: swiss follows the standings", () => {
  const ps = players(3)
  const t = swissTable(ps, [game(1, 1, "cus_2", "cus_3", "1-0"), game(1, 2, "cus_1", null, "1-0")], new Set(), 1)
  const r = finalRanking("swiss", t, null)
  assert.equal(r.length, 3)
  assert.equal(r[2].id, "cus_3")
  assert.equal(r[2].rank, 3)
})

describe("round robin", () => {
  const field = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 16]) {
    it(`${n} players: everyone meets everyone once, one game a round, colours balanced`, () => {
      const ids = field(n)
      const rounds = rrRounds(n, 1)
      assert.equal(rounds, n % 2 ? n : n - 1)
      const met = new Map<string, number>()
      const whites = new Map<string, number>()
      const byes = new Map<string, number>()
      for (let r = 1; r <= rounds; r++) {
        const pairs = pairRoundRobin(ids, r)
        const seen = new Set<string>()
        for (const p of pairs) {
          for (const id of [p.white, p.black].filter(Boolean) as string[]) {
            assert.ok(!seen.has(id), `round ${r}: ${id} twice`)
            seen.add(id)
          }
          if (!p.black) {
            byes.set(p.white, (byes.get(p.white) ?? 0) + 1)
            continue
          }
          const key = [p.white, p.black].sort().join("-")
          met.set(key, (met.get(key) ?? 0) + 1)
          whites.set(p.white, (whites.get(p.white) ?? 0) + 1)
        }
        assert.equal(seen.size, n, `round ${r}: everyone is paired or has the bye`)
      }
      assert.equal(met.size, (n * (n - 1)) / 2)
      for (const v of met.values()) assert.equal(v, 1)
      for (const id of ids) {
        const games = n % 2 ? n - 1 : n - 1
        const w = whites.get(id) ?? 0
        assert.ok(Math.abs(w - (games - w)) <= 1, `${id}: ${w} whites of ${games}`)
        if (n % 2) assert.equal(byes.get(id), 1)
      }
    })
  }
  it("a double round robin repeats every pairing with the colours swapped", () => {
    const ids = field(6)
    const one = rrRounds(6, 1)
    assert.equal(rrRounds(6, 2), 2 * one)
    for (let r = 1; r <= one; r++) {
      const a = pairRoundRobin(ids, r)
      const b = pairRoundRobin(ids, r + one)
      assert.deepEqual(b.map((p) => [p.black, p.white]), a.map((p) => [p.white, p.black]))
    }
  })
  it("standings: points first, then Sonneborn-Berger, and final ranks follow them", () => {
    const es = field(3).map((id, i) => ({ id, name: id, rating: 1500 - i }))
    const g = (round: number, w: string, b: string | null, result: TGame["result"]): TGame => ({ round, board: 1, game_no: 1, white_id: w, black_id: b, result, forfeit: false, armageddon: false, game_id: null })
    // Everyone beats someone: equal points; SB decides.
    const games = [g(1, "p1", "p2", "1-0"), g(1, "p3", null, "1-0"), g(2, "p2", "p3", "1-0"), g(2, "p1", null, "1-0"), g(3, "p3", "p1", "1/2-1/2"), g(3, "p2", null, "1-0")]
    const table = rrTable(es, games, new Set(), 3)
    const ranks = finalRanking("round_robin", table, null)
    assert.equal(ranks.length, 3)
    assert.deepEqual(table.map((r) => r.id), ranks.map((r) => r.id))
    for (let i = 1; i < table.length; i++) assert.ok(table[i - 1].points > table[i].points || (table[i - 1].points === table[i].points && table[i - 1].sb >= table[i].sb))
  })
})

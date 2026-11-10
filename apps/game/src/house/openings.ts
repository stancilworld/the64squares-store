// Opening repertoires for House Players. Each persona plays a few of these as White and as
// Black, so the same player keeps choosing the same openings, as people do. Lines are main-line
// theory in SAN; once the opponent leaves the line, the player thinks for itself.

export type Opening = { key: string; name: string; side: "w" | "b"; lines: string[] }

const l = (s: string) => s.trim().split(/\s+/).filter((t) => !/^\d+\.$/.test(t)).join(" ")

export const OPENINGS: Opening[] = [
  // ---------------------------------------------------------------- as White
  {
    key: "italian",
    name: "Italian Game",
    side: "w",
    lines: [
      l("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 a4 Ba7 h3"),
      l("e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 O-O O-O Re1 d6 c3 Na5 Bb5 a6 Ba4"),
      l("e4 e5 Nf3 Nc6 Bc4 Bc5 O-O Nf6 d3 d6 c3 O-O Bb3 a6 Nbd2"),
      l("e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6 Be2 h6 Nf3"),
    ],
  },
  {
    key: "ruy",
    name: "Ruy Lopez",
    side: "w",
    lines: [
      l("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3"),
      l("e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8"),
      l("e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O f6 d4 exd4 Nxd4 c5 Nb3"),
    ],
  },
  {
    key: "scotch",
    name: "Scotch Game",
    side: "w",
    lines: [l("e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4"), l("e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Bc5 Be3 Qf6 c3 Nge7 Bc4")],
  },
  {
    key: "open-sicilian",
    name: "Open Sicilian",
    side: "w",
    lines: [
      l("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2"),
      l("e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5"),
      l("e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Be2 Nf6 O-O"),
    ],
  },
  {
    key: "white-vs-french",
    name: "French, Advance",
    side: "w",
    lines: [l("e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4 Nbd2 Na5"), l("e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 f4 c5 Nf3 Nc6 Be3")],
  },
  {
    key: "white-vs-caro",
    name: "Caro-Kann, Advance",
    side: "w",
    lines: [l("e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O"), l("e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7")],
  },
  {
    key: "white-vs-scandi",
    name: "Scandinavian",
    side: "w",
    lines: [l("e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6"), l("e4 d5 exd5 Nf6 d4 Nxd5 Nf3 g6 c4 Nb6")],
  },
  {
    key: "queens-gambit",
    name: "Queen's Gambit",
    side: "w",
    lines: [
      l("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5"),
      l("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O"),
      l("d4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 a4"),
      l("d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5"),
      l("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7"),
    ],
  },
  {
    key: "london",
    name: "London System",
    side: "w",
    lines: [
      l("d4 d5 Bf4 Nf6 e3 c5 c3 Nc6 Nd2 e6 Ngf3 Bd6 Bg3 O-O Bd3"),
      l("d4 Nf6 Bf4 g6 Nf3 Bg7 e3 O-O Be2 d6 h3 c5 c3"),
      l("d4 d5 Bf4 c5 e3 Nc6 c3 Qb6 Qb3 c4 Qc2 Bf5"),
      l("d4 Nf6 Bf4 e6 e3 c5 c3 d5 Nd2 Nc6 Ngf3 Bd6 Bg3 O-O Bd3"),
    ],
  },
  {
    key: "english",
    name: "English Opening",
    side: "w",
    lines: [l("c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6 O-O Be7"), l("c4 Nf6 Nc3 e6 Nf3 d5 d4 Be7 Bg5 O-O e3"), l("c4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 Nf3 e6 O-O Nge7")],
  },
  {
    key: "kia",
    name: "King's Indian Attack",
    side: "w",
    lines: [l("Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7 Nbd2 e5 e4"), l("Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6 e4 e5 Nc3")],
  },
  {
    key: "kings-gambit",
    name: "King's Gambit",
    side: "w",
    lines: [l("e4 e5 f4 exf4 Nf3 g5 h4 g4 Ne5 Nf6 d4 d6 Nd3"), l("e4 e5 f4 d5 exd5 exf4 Nf3 Nf6 Bc4 Nxd5 O-O")],
  },

  // ---------------------------------------------------------------- as Black against 1.e4
  {
    key: "sicilian",
    name: "Sicilian Defence",
    side: "b",
    lines: [
      l("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O"),
      l("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6"),
      l("e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6 Nc3 Bg7 Be3 Nf6 Bc4 O-O"),
      l("e4 c5 Nc3 Nc6 g3 g6 Bg2 Bg7 d3 d6 f4 e6 Nf3 Nge7"),
      l("e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6"),
      l("e4 c5 Bc4 e6 Nf3 Nc6 O-O Nf6 d3 d5 Bb3 Be7"),
    ],
  },
  {
    key: "french",
    name: "French Defence",
    side: "b",
    lines: [
      l("e4 e6 d4 d5 e5 c5 c3 Nc6 Nf3 Qb6 a3 c4 Nbd2 Na5"),
      l("e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 O-O"),
      l("e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2 cxd4 cxd4 f6"),
      l("e4 e6 d4 d5 exd5 exd5 Nf3 Nf6 Bd3 Bd6 O-O O-O"),
      l("e4 e6 Nf3 d5 Nc3 Nf6 e5 Nfd7 d4 c5"),
    ],
  },
  {
    key: "caro",
    name: "Caro-Kann Defence",
    side: "b",
    lines: [
      l("e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 Nd7 O-O Ne7"),
      l("e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7"),
      l("e4 c6 d4 d5 exd5 cxd5 Bd3 Nc6 c3 Nf6 Bf4 Bg4 Qb3"),
      l("e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3 e6 d4 Nf6"),
    ],
  },
  {
    key: "open-e5",
    name: "1...e5",
    side: "b",
    lines: [
      l("e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6"),
      l("e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O"),
      l("e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5"),
      l("e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Na5 Bb5+ c6 dxc6 bxc6"),
      l("e4 e5 Nc3 Nf6 f4 d5 fxe5 Nxe4 Nf3 Be7"),
      l("e4 e5 Bc4 Nf6 d3 c6 Nf3 d5 Bb3 Bd6"),
      l("e4 e5 Qh5 Nc6 Bc4 g6 Qf3 Nf6 Ne2 Bg7"),
    ],
  },
  {
    key: "scandi",
    name: "Scandinavian Defence",
    side: "b",
    lines: [l("e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6"), l("e4 d5 exd5 Qxd5 Nc3 Qd6 d4 Nf6 Nf3 a6 g3 Bg4")],
  },
  {
    key: "pirc",
    name: "Pirc Defence",
    side: "b",
    lines: [l("e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4"), l("e4 g6 d4 Bg7 Nc3 d6 f4 Nf6 Nf3 O-O Bd3")],
  },

  // ---------------------------------------------------------------- as Black against 1.d4 and others
  {
    key: "qgd",
    name: "Queen's Gambit Declined",
    side: "b",
    lines: [
      l("d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6"),
      l("d4 d5 c4 e6 Nf3 Nf6 Nc3 Be7 Bf4 O-O e3 c5"),
      l("d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O"),
      l("d4 d5 Nf3 Nf6 e3 e6 Bd3 c5 b3 Nc6 O-O Bd6"),
      l("c4 e6 Nc3 d5 d4 Nf6 Nf3 Be7 Bg5 O-O"),
    ],
  },
  {
    key: "slav",
    name: "Slav Defence",
    side: "b",
    lines: [l("d4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O"), l("d4 d5 c4 c6 Nc3 Nf6 e3 e6 Nf3 Nbd7 Bd3 dxc4 Bxc4 b5"), l("d4 d5 Bf4 c6 e3 Bf5 Nf3 e6 Bd3 Bxd3")],
  },
  {
    key: "kid",
    name: "King's Indian Defence",
    side: "b",
    lines: [
      l("d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7"),
      l("d4 Nf6 Nf3 g6 g3 Bg7 Bg2 O-O O-O d6 c4 Nbd7"),
      l("d4 Nf6 Bf4 g6 e3 Bg7 Nf3 O-O Be2 d6 h3"),
      l("c4 Nf6 Nc3 g6 e4 d6 d4 Bg7 Nf3 O-O"),
      l("Nf3 Nf6 g3 g6 Bg2 Bg7 O-O O-O d3 d6"),
    ],
  },
  {
    key: "nimzo",
    name: "Nimzo-Indian",
    side: "b",
    lines: [l("d4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7"), l("d4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O"), l("d4 Nf6 c4 e6 Nf3 b6 g3 Ba6 b3 Bb4+ Bd2 Be7")],
  },
  {
    key: "dutch",
    name: "Dutch Defence",
    side: "b",
    lines: [l("d4 f5 g3 Nf6 Bg2 e6 Nf3 d5 O-O Bd6 c4 c6"), l("d4 f5 c4 Nf6 Nc3 g6 Nf3 Bg7 g3 O-O Bg2 d6")],
  },
  {
    key: "vs-flank",
    name: "Against 1.c4 / 1.Nf3",
    side: "b",
    lines: [l("c4 e5 Nc3 Nf6 g3 d5 cxd5 Nxd5 Bg2 Nb6 Nf3 Nc6"), l("Nf3 d5 g3 Nf6 Bg2 c6 O-O Bg4 d3 Nbd7"), l("Nf3 d5 d4 Nf6 c4 e6 Nc3 Be7"), l("b3 e5 Bb2 Nc6 e3 d5 Bb5 Bd6")],
  },
]

export const OPENING_BY_KEY = new Map(OPENINGS.map((o) => [o.key, o]))

// Groups a persona picks from, so a repertoire is coherent (one answer to 1.e4, one to 1.d4).
export const WHITE_FIRST = { e4: ["italian", "ruy", "scotch", "open-sicilian", "white-vs-french", "white-vs-caro", "white-vs-scandi", "kings-gambit"], d4: ["queens-gambit", "london"], flank: ["english", "kia"] }
export const BLACK_VS_E4 = ["sicilian", "french", "caro", "open-e5", "scandi", "pirc"]
export const BLACK_VS_D4 = ["qgd", "slav", "kid", "nimzo", "dutch"]

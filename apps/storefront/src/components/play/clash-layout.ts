// Written by tools/pieces/clash-export.py from the render: where each flying piece sits in the
// 2:1 frame (fractions of its width and height), drawn farthest first, and the clash's centre.
import type { ClashPiece } from "./clash-fx"

export const CLASH: { clash: [number, number]; pieces: ClashPiece[] } = {
  clash: [0.5106, 0.4934],
  pieces: [
    { name: "pawn_back", l: 0.40991, t: 0.09869, r: 0.51711, b: 0.34829, depth: 0.6 },
    { name: "bishop", l: 0.4322, t: 0.10705, r: 0.58184, b: 0.4162, depth: 0.73 },
    { name: "pawn_side", l: 0.55688, t: 0.15608, r: 0.68525, b: 0.37884, depth: 0.87 },
    { name: "king", l: 0.3175, t: 0.12611, r: 0.49504, b: 0.52, depth: 1.0 },
    { name: "knight_b", l: 0.53706, t: 0.35402, r: 0.68473, b: 0.70536, depth: 1.13 },
    { name: "knight_w", l: 0.38088, t: 0.44628, r: 0.55701, b: 0.6876, depth: 1.27 },
    { name: "pawn_fall", l: 0.48159, t: 0.52242, r: 0.62371, b: 0.77618, depth: 1.4 },
  ],
}

"""Turns render-clash.py's PNGs into the WebP files the Play menu uses, and writes the layout.

    python3 clash-export.py out
"""
import json, os, sys
from PIL import Image

SRC = sys.argv[1]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "apps", "storefront")
DEST = os.path.join(ROOT, "public", "play-art", "clash")
os.makedirs(DEST, exist_ok=True)

L = json.load(open(os.path.join(SRC, "layout.json")))
plate = Image.open(os.path.join(SRC, "plate.png")).convert("RGB")
plate.save(os.path.join(DEST, "plate.webp"), quality=80, method=6)
plate.resize((900, 450), Image.LANCZOS).save(os.path.join(DEST, "plate-900.webp"), quality=80, method=6)
for name in L["order"]:
    Image.open(os.path.join(SRC, f"{name}.png")).save(os.path.join(DEST, f"{name}.webp"), quality=86, method=6, exact=True)

# Farthest pieces move least with the pointer, nearest most.
n = len(L["order"])
rows = []
for i, name in enumerate(L["order"]):
    l, t, r, b = L["bounds"][name]
    depth = round(0.6 + 0.8 * i / max(1, n - 1), 2)
    rows.append(f'    {{ name: "{name}", l: {l}, t: {t}, r: {r}, b: {b}, depth: {depth} }},')
ts = f"""// Written by tools/pieces/clash-export.py from the render: where each flying piece sits in the
// 2:1 frame (fractions of its width and height), drawn farthest first, and the clash's centre.
import type {{ ClashPiece }} from "./clash-fx"

export const CLASH: {{ clash: [number, number]; pieces: ClashPiece[] }} = {{
  clash: [{L["clash"][0]}, {L["clash"][1]}],
  pieces: [
{chr(10).join(rows)}
  ],
}}
"""
open(os.path.join(ROOT, "src", "components", "play", "clash-layout.ts"), "w").write(ts)
print("exported", len(rows), "pieces")

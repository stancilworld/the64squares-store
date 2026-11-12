# 3D Wood pieces

`render-wood3d.py` models the six chess pieces in Blender (lathe-turned bodies, a sculpted knight)
and renders them with a stylized wood finish. The pieces are original to The 64 Squares.

    python3 -m venv bl && ./bl/bin/pip install bpy==5.2.3
    ./bl/bin/python render-wood3d.py -- out          # all twelve, 400 px PNG
    ./bl/bin/python render-wood3d.py -- out wN       # just one

Then scale them into their squares (king 96% of the height, queen 92, bishop 88, knight 86,
rook 80, pawn 76; 2.5% bottom margin) and save as 240 px WebP into
`apps/storefront/public/pieces/wood3d/`. Change `MATS` for other finishes.

The Play menu art in `apps/storefront/public/play-art/` (wK, bK, wN, wR, wP, bQ) comes from
the same script with `RES = 800`, cropped to the piece and saved as 520 px WebP.

The board uses a second render of the set, `STYLE=tabletop` (the default): seen from the
player's side and above (46°), standing on an invisible floor that keeps a soft shadow, 400 x
600 px with one square across the width. Resize to 240 x 360 WebP into
`apps/storefront/public/pieces/wood3d-board/`; the board draws them 1.5 squares tall from the
bottom of each square (`tall` in `lib/chess/settings.ts`). `STYLE=upright` gives the old icons.

## Play online scene

`render-clash.py` renders the Play menu's "Play online" scene with the same pieces: a backdrop
(board and standing pieces) and each piece thrown into the air as its own transparent layer,
from one camera, plus `layout.json` (where each layer sits, and the clash's centre).

    ./bl/bin/python render-clash.py -- clash          # about 10 minutes on 2 cores
    PREVIEW=1 ./bl/bin/python render-clash.py -- clash full   # quick look at the whole picture
    python3 clash-export.py clash

`clash-export.py` writes the WebP files to `apps/storefront/public/play-art/clash/` and the
positions to `apps/storefront/src/components/play/clash-layout.ts`. The smoke, embers and
movement are drawn live by `components/play/clash-fx.ts`.

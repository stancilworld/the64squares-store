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

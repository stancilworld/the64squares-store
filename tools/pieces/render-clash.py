"""The Play menu's "Play online" scene: pieces thrown into the air by a clash in the middle of a
board, lit by its glow, with standing pieces around it. Uses the pieces and wood of
render-wood3d.py.

Renders a backdrop (the board and standing pieces, with the flying pieces' shadows and
reflections but not the pieces themselves) and each flying piece on its own, transparent, from
the same camera, so the page can stack them and move them a little for depth. Writes PNGs and
layout.json (where each piece sits, in % of the frame) to OUT.

    ./bl/bin/python render-clash.py -- out              # everything
    ./bl/bin/python render-clash.py -- out plate        # one layer
    PREVIEW=1 ./bl/bin/python render-clash.py -- out    # quick low-quality check

Then convert to WebP into apps/storefront/public/play-art/clash/ (see the README).
"""
import bpy, importlib.util, json, math, os, sys
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("wood3d", os.path.join(HERE, "render-wood3d.py"))
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[0] if args else "out"
ONLY = args[1] if len(args) > 1 else None
PREVIEW = os.environ.get("PREVIEW") == "1"
RES_X, RES_Y = (480, 240) if PREVIEW else (int(os.environ.get("RES", 1800)), int(os.environ.get("RES", 1800)) // 2)
SAMPLES = 12 if PREVIEW else int(os.environ.get("SAMPLES", 80))
SQ = 1.25  # one square
HEIGHT = {"P": 0.905, "R": 1.05, "N": 1.33, "B": 1.31, "Q": 1.52, "K": 1.77}

W.reset()
sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = True
sc.cycles.max_bounces = 6
sc.render.resolution_x, sc.render.resolution_y = RES_X, RES_Y
sc.view_settings.view_transform = "AgX"
sc.view_settings.look = "AgX - Punchy"
sc.view_settings.exposure = 0.55

# A near-black, slightly cool room (the page draws the smoke over it).
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.012, 0.014, 0.018, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.0

# Camera low over the near edge of the board, looking across it at the clash.
cam = bpy.data.cameras.new("cam"); cam.lens = 38
co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
co.location = Vector((0, -8.5, 2.3))
TARGET = Vector((0, 0.3, 1.25))
co.rotation_euler = (TARGET - co.location).to_track_quat("-Z", "Y").to_euler()
cam.dof.use_dof = True
cam.dof.focus_distance = (TARGET - co.location).length
cam.dof.aperture_fstop = 2.2

# The board: 12 x 12 squares (larger than the view), dark walnut and honey maple, varnished.
def board():
    bpy.ops.mesh.primitive_plane_add(size=12 * SQ, location=(SQ / 2, SQ / 2 + 2 * SQ, 0))
    ob = bpy.context.active_object
    m = bpy.data.materials.new("board"); m.use_nodes = True
    n = m.node_tree.nodes; l = m.node_tree.links
    bsdf = n["Principled BSDF"]
    tc = n.new("ShaderNodeTexCoord")
    chk = n.new("ShaderNodeTexChecker"); chk.inputs["Scale"].default_value = 12
    chk.inputs["Color1"].default_value = (*W.srgb("#8a6440"), 1)
    chk.inputs["Color2"].default_value = (*W.srgb("#24170f"), 1)
    # Grain: stretched noise darkening the squares a little.
    mp = n.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (40, 2.5, 1)
    noise = n.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 6; noise.inputs["Detail"].default_value = 8
    mix = n.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs["Factor"].default_value = 0.45
    l.new(tc.outputs["UV"], chk.inputs["Vector"])
    l.new(tc.outputs["Object"], mp.inputs["Vector"]); l.new(mp.outputs["Vector"], noise.inputs["Vector"])
    l.new(chk.outputs["Color"], mix.inputs["A"]); l.new(noise.outputs["Color"], mix.inputs["B"])
    l.new(mix.outputs["Result"], bsdf.inputs["Base Color"])
    # Worn varnish: glossy enough to catch the glow, scuffed so it smears.
    rough = n.new("ShaderNodeMapRange"); rough.inputs["To Min"].default_value = 0.18; rough.inputs["To Max"].default_value = 0.42
    l.new(noise.outputs["Fac"], rough.inputs["Value"]); l.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    bsdf.inputs["Specular IOR Level"].default_value = 0.6
    ob.data.materials.append(m)
    return ob

BOARD = board()
MAT = {c: W.wood(c, W.srgb(W.MATS[c][0]), W.srgb(W.MATS[c][1])) for c in ("w", "b")}

def piece(name, code, colour, loc, rot=(0, 0, 0), standing=False):
    """A piece as an empty holding its parts; it turns about its middle (or its base, standing)."""
    holder = bpy.data.objects.new(name, None); sc.collection.objects.link(holder)
    parts = W.BUILD[code]()
    lift = 0 if standing else -HEIGHT[code] / 2
    for o in parts:
        o.data.materials.clear(); o.data.materials.append(MAT[colour])
        o.location.z += lift
        o.parent = holder
    holder.location = loc
    holder.rotation_euler = tuple(math.radians(a) for a in rot)
    holder["parts"] = [o.name for o in parts]
    return holder

def sq(file, rank):
    """Centre of a square: files -3.5..3.5 left to right, ranks counted away from the camera."""
    return (file * SQ, rank * SQ)

# Standing round the clash (in the backdrop).
STANDING = [
    ("wR", -3.1, 2.4), ("bP", -2.0, 3.3), ("wR", -2.6, 5.0), ("wP", -1.6, -0.9),
    ("bR", 3.0, 3.6), ("bP", 2.3, 2.4), ("bP", 3.9, 1.6), ("wP", 1.8, -0.9), ("wB", -4.2, 4.2), ("bQ", 4.6, 5.2),
]
for i, (p, f, r) in enumerate(STANDING):
    x, y = sq(f, r)
    piece(f"stand{i}", p[1], p[0], (x, y, 0), (0, 0, (i * 37) % 60 - 30), standing=True)

# Thrown into the air, nearest last. (name, piece, position, rotation in degrees)
CX, CY = sq(0, 1.2)
FLYING = [
    ("king", "wK", (CX - 1.05, CY + 0.3, 2.05), (-8, -38, 12)),
    ("pawn_back", "wP", (CX - 0.25, CY + 1.0, 2.5), (14, 22, 0)),
    ("bishop", "bB", (CX + 0.2, CY + 0.6, 2.35), (10, 42, 18)),
    ("pawn_side", "wP", (CX + 1.25, CY + 0.35, 2.1), (6, 104, 20)),
    ("knight_b", "bN", (CX + 1.15, CY - 0.1, 1.05), (-6, 28, -32)),
    ("knight_w", "wN", (CX - 0.35, CY - 0.45, 0.95), (12, -72, 30)),
    ("pawn_fall", "bP", (CX + 0.55, CY - 0.85, 0.42), (0, 112, -24)),
]
flying = {name: piece(name, p[1], p[0], loc, rot) for name, p, loc, rot in FLYING}

# The clash: a hot orange light in the middle of it, a warm glow on the board, a cool rim
# behind and a dim fill from the camera side.
def light(name, kind, loc, energy, colour, size=0.5, rot=None):
    ld = bpy.data.lights.new(name, kind); ld.energy = energy; ld.color = colour
    if kind == "AREA": ld.size = size
    else: ld.shadow_soft_size = size
    lo = bpy.data.objects.new(name, ld); lo.location = loc; sc.collection.objects.link(lo)
    if rot: lo.rotation_euler = tuple(math.radians(a) for a in rot)
    return lo

light("clash", "POINT", (CX + 0.1, CY - 0.1, 1.15), 1100, (1.0, 0.52, 0.18), 0.25)
light("ember", "POINT", (CX + 0.4, CY - 0.6, 0.35), 260, (1.0, 0.42, 0.12), 0.2)
light("rim", "AREA", (0.5, CY + 6, 5.5), 900, (0.55, 0.65, 0.85), 5, (-55, 0, 180))
light("fill", "AREA", (-3, -7, 3.5), 140, (1.0, 0.85, 0.7), 6, (68, 0, -22))
light("side", "AREA", (6, CY, 3), 160, (1.0, 0.7, 0.45), 3, (60, 0, 90))

def parts_of(holder):
    return [bpy.data.objects[n] for n in holder["parts"]]

def render(name, transparent):
    sc.render.film_transparent = transparent
    sc.render.filepath = os.path.join(OUT, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("rendered", name, flush=True)

def bounds(holder):
    """Where a piece lands in the frame, as fractions (left, top, right, bottom)."""
    from bpy_extras.object_utils import world_to_camera_view
    bpy.context.view_layer.update()
    xs, ys = [], []
    for o in parts_of(holder):
        for v in o.data.vertices:
            p = world_to_camera_view(sc, co, o.matrix_world @ v.co)
            xs.append(p.x); ys.append(1 - p.y)
    return min(xs), min(ys), max(xs), max(ys)

os.makedirs(OUT, exist_ok=True)

# Everything in one picture, to judge the composition.
if ONLY == "full":
    render("full", False)
    sys.exit(0)

# The backdrop: flying pieces only cast shadows and show in the varnish. ("layout" renders
# nothing and only writes layout.json.)
if not ONLY or ONLY == "plate":
    for h in flying.values():
        for o in parts_of(h):
            o.visible_camera = False
    render("plate", False)
    for h in flying.values():
        for o in parts_of(h):
            o.visible_camera = True

# Each flying piece alone (everything else lights it but isn't drawn).
layout = {}
for name, h in flying.items():
    # Only the piece's own part of the frame is rendered (with room for its blur and glow).
    l, t, r, b = bounds(h)
    m = 0.012
    l, t, r, b = max(0, l - m), max(0, t - m * 2), min(1, r + m), min(1, b + m * 2)
    layout[name] = [round(v, 5) for v in (l, t, r, b)]
    if ONLY and ONLY not in (name, "pieces"): continue
    sc.render.use_border = True; sc.render.use_crop_to_border = True
    sc.render.border_min_x, sc.render.border_max_x = l, r
    sc.render.border_min_y, sc.render.border_max_y = 1 - b, 1 - t
    hidden = [o for o in bpy.data.objects if o.type == "MESH" and o not in parts_of(h)]
    for o in hidden: o.visible_camera = False; o.visible_glossy = False
    render(name, True)
    for o in hidden: o.visible_camera = True; o.visible_glossy = True
    sc.render.use_border = False

from bpy_extras.object_utils import world_to_camera_view
hot = world_to_camera_view(sc, co, bpy.data.objects["clash"].location)
with open(os.path.join(OUT, "layout.json"), "w") as f:
    json.dump({"clash": [round(hot.x, 4), round(1 - hot.y, 4)], "order": sorted(flying, key=lambda n: -(flying[n].location - co.location).length), "bounds": layout, "frame": [RES_X, RES_Y]}, f, indent=1)

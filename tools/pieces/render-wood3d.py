import bpy, math, sys, os
from mathutils import Vector

RES = int(os.environ.get("RES", 400))
# "tabletop": seen from the player's side and above, standing on the board with a soft shadow
# (tall images: the piece rises above its square). "upright": the old side view.
STYLE = os.environ.get("STYLE", "tabletop")
TALL = 1.5
# World units across one square (the base is 0.81 across, about 65% of a square).
SQUARE = 1.25

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def catmull(points, n=8):
    # Smooth a profile through its points.
    out = []
    P = [points[0]] + points + [points[-1]]
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]
        for k in range(n):
            t = k / n
            t2, t3 = t * t, t * t * t
            out.append(tuple(0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in range(2)))
    out.append(points[-1])
    return out

def lathe(name, profile, segs=96, smooth=True):
    pts = catmull(profile) if smooth else profile
    verts, faces = [], []
    rings = []
    for (r, z) in pts:
        if r < 1e-4:
            verts.append((0, 0, z)); rings.append([len(verts) - 1])
        else:
            ring = []
            for s in range(segs):
                a = 2 * math.pi * s / segs
                verts.append((r * math.cos(a), r * math.sin(a), z)); ring.append(len(verts) - 1)
            rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        if len(a) == 1 and len(b) == 1: continue
        if len(a) == 1:
            for s in range(segs): faces.append((a[0], b[s], b[(s + 1) % segs]))
        elif len(b) == 1:
            for s in range(segs): faces.append((a[s], b[0], a[(s + 1) % segs]))
        else:
            for s in range(segs): faces.append((a[s], b[s], b[(s + 1) % segs], a[(s + 1) % segs]))
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    me.validate()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    for p in me.polygons: p.use_smooth = True
    # Make normals point outwards.
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT"); bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode="OBJECT")
    ob.select_set(False)
    return ob

def cut(target, cutter):
    m = target.modifiers.new("cut", "BOOLEAN"); m.object = cutter; m.operation = "DIFFERENCE"; m.solver = "EXACT"
    bpy.context.view_layer.objects.active = target; bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.data.objects.remove(cutter)

def box(sx, sy, sz, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True)
    return o

def rounded_box(sx, sy, sz, loc, bevel=0.025):
    o = box(sx, sy, sz, loc)
    m = o.modifiers.new("b", "BEVEL"); m.width = bevel; m.segments = 4
    for p in o.data.polygons: p.use_smooth = True
    return o

def sphere(r, loc):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=48, ring_count=24)
    o = bpy.context.active_object; bpy.ops.object.shade_smooth(); return o

BASE = [(0, 0), (0.40, 0), (0.405, 0.035), (0.40, 0.07), (0.37, 0.095), (0.375, 0.12), (0.34, 0.15), (0.29, 0.18)]

def pawn():
    return [lathe("pawn", BASE + [(0.24, 0.22), (0.17, 0.33), (0.135, 0.44), (0.20, 0.47), (0.215, 0.50), (0.19, 0.53), (0.12, 0.56), (0.15, 0.60), (0.19, 0.67), (0.20, 0.74), (0.18, 0.82), (0.12, 0.88), (0.0, 0.905)])]

def rook():
    body = lathe("rook", BASE + [(0.26, 0.22), (0.225, 0.35), (0.21, 0.55), (0.225, 0.72), (0.27, 0.78), (0.30, 0.82), (0.30, 1.04), (0.235, 1.045), (0.225, 0.98), (0.0, 0.975)])
    for i in range(3):
        a = i * math.pi / 3
        cut(body, box(0.13, 0.8, 0.14, (0, 0, 1.04), (0, 0, a)))
    return [body]

def bishop():
    body = lathe("bishop", BASE + [(0.245, 0.22), (0.17, 0.36), (0.135, 0.52), (0.13, 0.60), (0.215, 0.63), (0.235, 0.66), (0.21, 0.69), (0.12, 0.72), (0.15, 0.78), (0.20, 0.88), (0.205, 0.98), (0.17, 1.10), (0.10, 1.20), (0.04, 1.25), (0.0, 1.255)])
    cut(body, box(0.045, 0.6, 0.25, (0.05, 0, 1.06), (0, math.radians(-40), 0)))
    top = sphere(0.055, (0, 0, 1.30))
    return [body, top]

def queen():
    body = lathe("queen", BASE + [(0.26, 0.22), (0.19, 0.38), (0.15, 0.60), (0.14, 0.76), (0.235, 0.80), (0.255, 0.83), (0.225, 0.86), (0.15, 0.89), (0.17, 0.98), (0.235, 1.18), (0.265, 1.27), (0.24, 1.30), (0.17, 1.32), (0.12, 1.38), (0.0, 1.40)])
    parts = [body]
    for i in range(9):
        a = 2 * math.pi * i / 9
        parts.append(sphere(0.042, (0.245 * math.cos(a), 0.245 * math.sin(a), 1.29)))
    parts.append(sphere(0.07, (0, 0, 1.45)))
    return parts

def king():
    body = lathe("king", BASE + [(0.27, 0.22), (0.20, 0.40), (0.155, 0.66), (0.15, 0.84), (0.245, 0.88), (0.265, 0.91), (0.235, 0.94), (0.16, 0.97), (0.18, 1.06), (0.245, 1.27), (0.26, 1.35), (0.22, 1.40), (0.12, 1.46), (0.08, 1.50), (0.0, 1.505)])
    return [body, rounded_box(0.075, 0.075, 0.30, (0, 0, 1.62)), rounded_box(0.22, 0.075, 0.075, (0, 0, 1.66))]

def knight():
    base = lathe("knight_base", BASE + [(0.27, 0.21), (0.25, 0.25), (0.0, 0.26)])
    # A horse head, drawn side-on, given depth, then rounded like a carved piece.
    outline = [(0.25, 0.22), (0.27, 0.45), (0.25, 0.66), (0.21, 0.85), (0.14, 1.00), (0.09, 1.10), (0.085, 1.21), (0.05, 1.33), (0.00, 1.23), (-0.04, 1.15), (-0.12, 1.09), (-0.22, 0.99), (-0.31, 0.87), (-0.36, 0.77), (-0.35, 0.69), (-0.28, 0.655), (-0.19, 0.69), (-0.11, 0.63), (-0.07, 0.55), (-0.12, 0.45), (-0.20, 0.34), (-0.23, 0.22)]
    pts = catmull(outline + [outline[0]], 6)
    cu = bpy.data.curves.new("head", "CURVE"); cu.dimensions = "2D"; cu.fill_mode = "BOTH"
    sp = cu.splines.new("POLY"); sp.points.add(len(pts) - 1)
    for i, (x, z) in enumerate(pts): sp.points[i].co = (x, z, 0, 1)
    sp.use_cyclic_u = True
    cu.extrude = 0.06; cu.bevel_depth = 0.09; cu.bevel_resolution = 8
    ob = bpy.data.objects.new("head", cu); bpy.context.collection.objects.link(ob)
    ob.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.view_layer.objects.active = ob; ob.select_set(True); bpy.ops.object.convert(target="MESH")
    bpy.ops.object.transform_apply(rotation=True)
    # Thinner towards the muzzle, fuller at the neck.
    me = ob.data
    for v in me.vertices:
        x = v.co.x
        k = 1.0 - max(0.0, min(1.0, (-x - 0.05) / 0.32)) * 0.38
        v.co.y *= k
    me.update()
    rm = ob.modifiers.new("solid", "REMESH"); rm.mode = "VOXEL"; rm.voxel_size = 0.008
    bpy.ops.object.modifier_apply(modifier=rm.name)
    sm = ob.modifiers.new("smooth", "SMOOTH"); sm.factor = 0.6; sm.iterations = 8
    bpy.ops.object.modifier_apply(modifier=sm.name)
    bpy.ops.object.shade_smooth(); ob.select_set(False)
    # Eyes and a mouth line, cut in.
    for y in (-0.14, 0.14):
        cut(ob, sphere(0.034, (-0.11, y, 1.0)))
    cut(ob, box(0.16, 0.5, 0.018, (-0.29, 0, 0.705), (0, math.radians(-8), 0)))
    # A mane: a ridge down the back of the neck.
    mcu = bpy.data.curves.new("mane", "CURVE"); mcu.dimensions = "3D"; mcu.bevel_depth = 0.06; mcu.bevel_resolution = 6
    msp = mcu.splines.new("POLY")
    mane = [(0.255, 0, 0.40), (0.26, 0, 0.62), (0.225, 0, 0.82), (0.165, 0, 0.98), (0.11, 0, 1.09), (0.085, 0, 1.19)]
    msp.points.add(len(mane) - 1)
    for i, (x, y, z) in enumerate(mane): msp.points[i].co = (x, y, z, 1)
    mob = bpy.data.objects.new("mane", mcu); bpy.context.collection.objects.link(mob)
    bpy.context.view_layer.objects.active = mob; mob.select_set(True); bpy.ops.object.convert(target="MESH"); bpy.ops.object.shade_smooth(); mob.select_set(False)
    return [base, ob, mob]

def wood(name, light, dark, scale=2.2):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; n = nt.nodes; l = nt.links
    bsdf = n["Principled BSDF"]
    tc = n.new("ShaderNodeTexCoord"); mp = n.new("ShaderNodeMapping"); mp.inputs["Scale"].default_value = (1, 1, 0.35)
    noise = n.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 3.0; noise.inputs["Detail"].default_value = 2
    wave = n.new("ShaderNodeTexWave"); wave.wave_type = "RINGS"; wave.rings_direction = "Z"; wave.inputs["Scale"].default_value = scale; wave.inputs["Distortion"].default_value = 2.0; wave.inputs["Detail"].default_value = 0.5; wave.inputs["Detail Roughness"].default_value = 0.3
    ramp = n.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*light, 1); ramp.color_ramp.elements[1].color = (*dark, 1)
    ramp.color_ramp.elements[0].position = 0.25; ramp.color_ramp.elements[1].position = 0.95
    # A gentle grain: the two colours are close, so the rings read as subtle variation, not stripes.
    l.new(tc.outputs["Object"], mp.inputs["Vector"]); l.new(mp.outputs["Vector"], wave.inputs["Vector"])
    l.new(wave.outputs["Fac"], ramp.inputs["Fac"]); l.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    # Satin-finished wood: a dielectric (no metal), rough enough that highlights are broad and
    # soft, a lowered specular level, and only a trace of a matte clear coat. (It was roughness
    # 0.42 with a 0.35, 0.12-rough clear coat: mirror-like hot spots that read as gold/chrome.)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = ROUGHNESS[name]
    bsdf.inputs["Specular IOR Level"].default_value = 0.38
    bsdf.inputs["Coat Weight"].default_value = 0.03
    bsdf.inputs["Coat Roughness"].default_value = 0.8
    bsdf.inputs["Emission Strength"].default_value = 0.0
    return m

def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((v / 12.92) if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c)

def scene():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"; sc.cycles.samples = int(os.environ.get("SAMPLES", 96)); sc.cycles.use_denoising = True; sc.cycles.device = "CPU"
    sc.render.film_transparent = True; sc.render.resolution_x = RES; sc.render.resolution_y = int(RES * TALL) if STYLE == "tabletop" else RES
    sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
    world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
    # Soft, slightly warm surroundings. (Neutral grey at 0.4 washed the dark pieces out to grey.)
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.92, 0.88, 0.82, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.4 if STYLE != "tabletop" else 0.26
    cam = bpy.data.cameras.new("cam"); cam.type = "ORTHO"; cam.ortho_scale = 1.78
    co = bpy.data.objects.new("cam", cam); sc.collection.objects.link(co); sc.camera = co
    if STYLE == "tabletop":
        # One square (1 x 1) fills the image's width; the piece's centre sits 42% of a square
        # above the image's bottom edge, so it stands in the lower part of its square.
        from mathutils import Euler
        el = math.radians(46)
        cam.ortho_scale = TALL * SQUARE
        co.rotation_euler = (math.radians(90) - el, 0, 0)
        m = Euler(co.rotation_euler).to_matrix()
        fwd = m @ Vector((0, 0, -1)); up = m @ Vector((0, 1, 0))
        co.location = Vector((0, 0, 0)) - fwd * 10 + up * (TALL / 2 - 0.42) * SQUARE
        # An invisible floor that only keeps the shadows.
        bpy.ops.mesh.primitive_plane_add(size=6, location=(0, 0, 0))
        bpy.context.active_object.is_shadow_catcher = True
        def light(kind, loc, energy, size, rot):
            ld = bpy.data.lights.new(kind, "AREA"); ld.energy = energy; ld.size = size
            lo = bpy.data.objects.new(kind, ld); lo.location = loc; lo.rotation_euler = rot; sc.collection.objects.link(lo)
        # Key light high and in front-left: a short, soft shadow falls behind the piece.
        # Same lights and directions as before, about 40% dimmer and broader, so a piece's lit
        # mid-tones land on its own colour instead of blowing out (the lights had been set
        # for the old darker, orange wood).
        light("key", (-1.0, -1.6, 6.0), 340, 3.6, (math.radians(15), 0, math.radians(-30)))
        light("fill", (3.5, -3.5, 2.5), 80, 4.5, (math.radians(62), 0, math.radians(45)))
        light("rim", (1, 4, 4), 170, 3.0, (math.radians(-45), 0, math.radians(170)))
        return
    el = math.radians(16)
    d = 10
    co.location = (0, -d * math.cos(el), 0.80 + d * math.sin(el)); co.rotation_euler = (math.radians(90) - el, 0, 0)
    def light(kind, loc, energy, size, rot):
        ld = bpy.data.lights.new(kind, "AREA"); ld.energy = energy; ld.size = size
        lo = bpy.data.objects.new(kind, ld); lo.location = loc; lo.rotation_euler = rot; sc.collection.objects.link(lo)
    # Same rig, dimmed and softened to match the tabletop pictures' satin look.
    light("key", (-3, -4, 5), 380, 4.0, (math.radians(45), 0, math.radians(-35)))
    light("fill", (4, -3, 2), 120, 4.5, (math.radians(70), 0, math.radians(50)))
    light("rim", (1, 4, 4), 360, 3.0, (math.radians(-45), 0, math.radians(170)))

BUILD = {"P": pawn, "R": rook, "N": knight, "B": bishop, "Q": queen, "K": king}
# Piece colours (sRGB hex, converted to linear for Blender by srgb()): warm ivory / champagne
# wood around #CBB18C and walnut / espresso around #493428, each a light and a dark tone for
# the grain. (They were #e3ac68/#c98a4b: saturated orange that rendered as gold.)
MATS = {"w": ("#d4be9c", "#bea580"), "b": ("#503a2d", "#382a23")}
ROUGHNESS = {"w": 0.70, "b": 0.68}

def main():
  OUT = sys.argv[sys.argv.index("--") + 1]
  ONLY = sys.argv[sys.argv.index("--") + 2] if len(sys.argv) > sys.argv.index("--") + 2 else None
  for colour in ("w", "b"):
    for code, fn in BUILD.items():
        if ONLY and f"{colour}{code}" != ONLY: continue
        reset(); scene()
        mat = wood(colour, srgb(MATS[colour][0]), srgb(MATS[colour][1]))
        for o in fn():
            o.data.materials.clear(); o.data.materials.append(mat)
        if code == "N":
            for o in bpy.data.objects:
                if o.type == "MESH": o.rotation_euler[2] += math.radians(-14 if colour == "w" else 14) if o.name != "knight_base" else 0
        bpy.context.scene.render.filepath = os.path.join(OUT, f"{colour}{code}.png")
        bpy.ops.render.render(write_still=True)
        print("rendered", colour, code, flush=True)

# Imported by render-clash.py for the models and wood; run directly to render the sets.
if __name__ == "__main__":
    main()

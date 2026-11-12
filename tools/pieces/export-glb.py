"""Exports the six piece shapes of render-wood3d.py as one small glTF file for the live 3D
scene on the Play menu (apps/storefront/public/play-art/pieces.glb). Each piece is one mesh
named by its letter (P, R, N, B, Q, K), standing on its base at the origin, simplified to keep
the file small. The page gives them their colours.

    ./bl/bin/python export-glb.py -- ../../apps/storefront/public/play-art/pieces.glb
"""
import bpy, importlib.util, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("wood3d", os.path.join(HERE, "render-wood3d.py"))
W = importlib.util.module_from_spec(spec)
spec.loader.exec_module(W)

OUT = sys.argv[sys.argv.index("--") + 1]
# Triangles kept per piece (the lathe bodies are very dense).
KEEP = {"P": 0.07, "R": 0.1, "N": 0.035, "B": 0.075, "Q": 0.06, "K": 0.075}

W.reset()
for code, build in W.BUILD.items():
    before = set(bpy.data.objects)
    parts = build()
    for o in bpy.data.objects:
        o.select_set(o in parts)
    bpy.context.view_layer.objects.active = parts[0]
    if len(parts) > 1:
        bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = code
    ob.data.name = code
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    d = ob.modifiers.new("dec", "DECIMATE"); d.ratio = KEEP[code]
    bpy.ops.object.modifier_apply(modifier=d.name)
    bpy.ops.object.shade_smooth_by_angle(angle=0.6)
    ob.location = (0, 0, 0)
    # Blender is Z-up; glTF (and the page) is Y-up: the exporter turns it.
    print(code, len(ob.data.polygons), "faces", flush=True)
    ob.select_set(False)

for o in bpy.data.objects:
    o.select_set(o.name in W.BUILD)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", use_selection=True, export_materials="NONE", export_normals=True, export_texcoords=False, export_apply=True)
print("wrote", OUT, os.path.getsize(OUT), "bytes")

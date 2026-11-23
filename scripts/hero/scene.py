"""Step 3: build the Mount Hood scene in Blender and render the hero images.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/hero/scene.py -- [--quick]

Reads .cache/ from prepare.py. Writes public/hero/hero-<theme>-<width>.webp, the static
fallback shown when the interactive hero (src/scripts/hero3d.ts) can't run.
"""
import json, math, pathlib, subprocess, sys

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CACHE = HERE / ".cache"
OUT = ROOT / "public" / "hero"

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
QUICK = "--quick" in argv
THEMES = ["light"]

W, H = (1200, 450) if QUICK else (2400, 900)
MESH_STEP = 2 if QUICK else 1

# Camera: west-north-west of the summit, roughly the view from Portland.
CAM_BEARING = 282     # degrees from the summit to the camera
CAM_DIST = 11500      # metres, horizontal
CAM_ALT = 2450        # metres above sea level
LENS, SENSOR = 30, 36 # mm (horizontal field of view ≈ 62°)
SUMMIT_ROW = 0.10     # where the summit sits, as a fraction of image height from the top
TREE_DENSITY = 1 / 650  # trees per m² at full forest cover

THEME = {
    "light": dict(
        sun=(1.0, 0.95, 0.88), sun_strength=2.4, sun_az=235, sun_el=32,
        sky_top=(0.16, 0.34, 0.62), sky_horizon=(0.62, 0.72, 0.80), sky_strength=0.75,
        haze=(0.58, 0.66, 0.73), haze_km=110, tree=(0.03, 0.07, 0.05), exposure=0.0,
    ),
}


def log(*a):
    print("[hero]", *a, flush=True)


# ---------------------------------------------------------------- scene setup
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    try:
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        scene.cycles.device = "GPU"
    except Exception as e:  # fall back to CPU
        log("GPU unavailable:", e)
    scene.cycles.samples = 24 if QUICK else 128
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 4
    scene.render.resolution_x, scene.render.resolution_y = W, H
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.view_transform = "Standard"
    return scene


def haze_mix(nt, shader_out, theme):
    """Blend a shader toward the haze colour with distance from the camera."""
    t = THEME[theme]
    cam = nt.nodes.new("ShaderNodeCameraData")
    div = nt.nodes.new("ShaderNodeMath"); div.operation = "DIVIDE"; div.inputs[1].default_value = -t["haze_km"] * 1000
    nt.links.new(cam.outputs["View Distance"], div.inputs[0])
    ex = nt.nodes.new("ShaderNodeMath"); ex.operation = "EXPONENT"
    nt.links.new(div.outputs[0], ex.inputs[0])
    inv = nt.nodes.new("ShaderNodeMath"); inv.operation = "SUBTRACT"; inv.inputs[0].default_value = 1
    nt.links.new(ex.outputs[0], inv.inputs[1])
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*t["haze"], 1)
    em.inputs["Strength"].default_value = t["sky_strength"]
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(inv.outputs[0], mix.inputs[0])
    nt.links.new(shader_out, mix.inputs[1])
    nt.links.new(em.outputs[0], mix.inputs[2])
    return mix.outputs[0]


def material(name, theme, albedo=None, color=None, roughness=0.7):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    if albedo:
        coord = nt.nodes.new("ShaderNodeTexCoord")
        img = nt.nodes.new("ShaderNodeTexImage")
        img.image = bpy.data.images.load(str(albedo))
        img.interpolation = "Cubic"
        img.extension = "EXTEND"
        nt.links.new(coord.outputs["Generated"], img.inputs["Vector"])
        nt.links.new(img.outputs["Color"], bsdf.inputs["Base Color"])
    else:
        bsdf.inputs["Base Color"].default_value = (*color, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(haze_mix(nt, bsdf.outputs[0], theme), out.inputs["Surface"])
    return m


def world(theme):
    t = THEME[theme]
    w = bpy.data.worlds.new("sky")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coord.outputs["Generated"], sep.inputs[0])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (*t["haze"], 1)
    ramp.color_ramp.elements[1].position = 0.28
    ramp.color_ramp.elements[1].color = (*t["sky_top"], 1)
    mid = ramp.color_ramp.elements.new(0.03)
    mid.color = (*t["sky_horizon"], 1)
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = t["sky_strength"]
    nt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(bg.outputs[0], out.inputs["Surface"])


def sun(theme):
    t = THEME[theme]
    data = bpy.data.lights.new("sun", "SUN")
    data.energy = t["sun_strength"]
    data.color = t["sun"]
    data.angle = math.radians(1.5)
    obj = bpy.data.objects.new("sun", data)
    bpy.context.scene.collection.objects.link(obj)
    az, el = math.radians(t["sun_az"]), math.radians(t["sun_el"])
    direction = Vector((-math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), -math.sin(el)))
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


# ---------------------------------------------------------------- terrain
def terrain(meta, cam_xy, fwd_xy):
    h = np.load(CACHE / "height.npy")[::MESH_STEP, ::MESH_STEP].astype(np.float32)
    forest = np.load(CACHE / "forest.npy")[::MESH_STEP, ::MESH_STEP].astype(np.float32)
    rows, cols = h.shape
    sp = meta["spacing"] * MESH_STEP
    sr, sc = meta["summit_rc"][0] / MESH_STEP, meta["summit_rc"][1] / MESH_STEP
    X, Y = np.meshgrid((np.arange(cols) - sc) * sp, -(np.arange(rows) - sr) * sp)
    co = np.stack([X, Y, h], -1).astype(np.float32).reshape(-1, 3)

    # faces: one quad per cell, counter-clockwise seen from above
    r, c = np.meshgrid(np.arange(rows - 1), np.arange(cols - 1), indexing="ij")
    a = (r * cols + c).ravel()
    quads = np.stack([a + cols, a + cols + 1, a + 1, a], -1).astype(np.int32)

    mesh = bpy.data.meshes.new("terrain")
    mesh.vertices.add(len(co))
    mesh.vertices.foreach_set("co", co.ravel())
    mesh.loops.add(quads.size)
    mesh.loops.foreach_set("vertex_index", quads.ravel())
    mesh.polygons.add(len(quads))
    mesh.polygons.foreach_set("loop_start", np.arange(0, quads.size, 4, dtype=np.int32))
    mesh.update(calc_edges=True)
    mesh.validate(verbose=False)
    mesh.shade_smooth()

    # Trees only where the camera can see, to keep the instance count down.
    dx, dy = X - cam_xy[0], Y - cam_xy[1]
    dist = np.hypot(dx, dy)
    ahead = (dx * fwd_xy[0] + dy * fwd_xy[1]) / np.maximum(dist, 1)
    half = math.atan(SENSOR / 2 / LENS) + math.radians(6)
    vis = (ahead > math.cos(half)) & (dist > 300) & (dist < 32000)
    attr = mesh.attributes.new("forest", "FLOAT", "POINT")
    attr.data.foreach_set("value", (forest * vis).ravel())
    log(f"terrain {rows}x{cols}, est. trees {int((forest * vis).sum() * sp * sp * TREE_DENSITY):,}")

    obj = bpy.data.objects.new("terrain", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def tree_object(theme):
    bm = bmesh.new()
    # A stylised fir: two stacked cones, exaggerated in size so they read from far away.
    bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=7.0, radius2=0, depth=20, matrix=Matrix.Translation((0, 0, 12)))
    bmesh.ops.create_cone(bm, cap_ends=True, segments=7, radius1=5.0, radius2=0, depth=16, matrix=Matrix.Translation((0, 0, 24)))
    mesh = bpy.data.meshes.new("tree")
    bm.to_mesh(mesh)
    bm.free()
    mesh.materials.append(material("tree", theme, color=THEME[theme]["tree"], roughness=0.9))
    obj = bpy.data.objects.new("tree", mesh)
    bpy.context.scene.collection.objects.link(obj)
    obj.hide_render = True
    obj.hide_viewport = True
    return obj


def scatter(terrain_obj, tree):
    ng = bpy.data.node_groups.new("forest", "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    n, l = ng.nodes, ng.links
    gin, gout = n.new("NodeGroupInput"), n.new("NodeGroupOutput")
    attr = n.new("GeometryNodeInputNamedAttribute"); attr.data_type = "FLOAT"; attr.inputs["Name"].default_value = "forest"
    mul = n.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = TREE_DENSITY
    l.new(attr.outputs["Attribute"], mul.inputs[0])
    dist = n.new("GeometryNodeDistributePointsOnFaces"); dist.distribute_method = "RANDOM"
    l.new(gin.outputs[0], dist.inputs["Mesh"])
    l.new(mul.outputs[0], dist.inputs["Density"])
    info = n.new("GeometryNodeObjectInfo"); info.inputs["Object"].default_value = tree; info.transform_space = "ORIGINAL"
    rot = n.new("FunctionNodeRandomValue"); rot.data_type = "FLOAT"
    rot.inputs["Min"].default_value, rot.inputs["Max"].default_value = 0, 6.283
    rot_xyz = n.new("ShaderNodeCombineXYZ"); l.new(rot.outputs["Value"], rot_xyz.inputs["Z"])
    scl = n.new("FunctionNodeRandomValue"); scl.data_type = "FLOAT"
    scl.inputs["Min"].default_value, scl.inputs["Max"].default_value = 0.6, 1.35
    scl.inputs["Seed"].default_value = 7
    inst = n.new("GeometryNodeInstanceOnPoints")
    l.new(dist.outputs["Points"], inst.inputs["Points"])
    l.new(info.outputs["Geometry"], inst.inputs["Instance"])
    l.new(rot_xyz.outputs[0], inst.inputs["Rotation"])
    l.new(scl.outputs["Value"], inst.inputs["Scale"])
    join = n.new("GeometryNodeJoinGeometry")
    l.new(inst.outputs["Instances"], join.inputs[0])
    l.new(gin.outputs[0], join.inputs[0])
    l.new(join.outputs[0], gout.inputs[0])
    mod = terrain_obj.modifiers.new("forest", "NODES")
    mod.node_group = ng


# ---------------------------------------------------------------- camera
def camera(meta):
    b = math.radians(CAM_BEARING)
    cam_xy = (math.sin(b) * CAM_DIST, math.cos(b) * CAM_DIST)
    fwd = (-math.sin(b), -math.cos(b))
    data = bpy.data.cameras.new("cam")
    data.lens, data.sensor_width, data.sensor_fit = LENS, SENSOR, "HORIZONTAL"
    data.clip_start, data.clip_end = 5, 120000
    # Keep the camera level (verticals stay vertical) and shift the frame up so
    # the summit lands at SUMMIT_ROW.
    tan_half_v = (SENSOR / 2 / LENS) * H / W
    want = (0.5 - SUMMIT_ROW) * 2 * tan_half_v
    have = (meta["summit_elev"] - CAM_ALT) / CAM_DIST
    data.shift_y = (have - want) * LENS / SENSOR
    obj = bpy.data.objects.new("cam", data)
    bpy.context.scene.collection.objects.link(obj)
    obj.location = (cam_xy[0], cam_xy[1], CAM_ALT)
    obj.rotation_euler = (math.radians(90), 0, math.pi - b)
    bpy.context.scene.camera = obj
    return obj, cam_xy, fwd


# ---------------------------------------------------------------- main
def main():
    meta = json.loads((CACHE / "scene.json").read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for theme in THEMES:
        scene = reset()
        scene.view_settings.exposure = THEME[theme]["exposure"]
        cam, cam_xy, fwd = camera(meta)
        world(theme)
        sun(theme)
        obj = terrain(meta, cam_xy, fwd)
        obj.data.materials.append(material("ground", theme, albedo=CACHE / f"albedo-{theme}.png", roughness=0.55))
        scatter(obj, tree_object(theme))
        png = CACHE / f"render-{theme}{'-quick' if QUICK else ''}.png"
        scene.render.filepath = str(png)
        log("rendering", theme, f"{W}x{H}", "quick" if QUICK else "")
        bpy.ops.render.render(write_still=True)
        if QUICK:
            continue
        for width in (2400, 1200):
            subprocess.run(["magick", str(png), "-resize", f"{width}x", "-quality", "80",
                            str(OUT / f"hero-{theme}-{width}.webp")], check=True)


main()

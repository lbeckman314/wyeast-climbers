"""Step 2: turn the elevation grid into inputs for the Blender scene.

Writes to .cache/:
  height.npy        float32 elevation (metres), every STEP-th cell, row 0 = north
  forest.npy        float32 0..1 tree density on the same grid
  albedo-<theme>.png  ground colour (snow / rock / forest floor) with the routes drawn in
  scene.json        grid spacing, summit position, route polylines (in metres)
"""
import json, math, pathlib, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fetch_dem import CACHE, SUMMIT, lonlat_to_px  # noqa: E402

STEP = 1  # mesh resolution: 1 = every cell (~13 m)

# Mirrors src/data/routes.ts: (id, label, bearing from summit, kind)
ROUTES = [
    ("north-face", "North Face", 355, "first-ascent"),
    ("eliot", "Eliot Glacier Headwall", 30, "first-ascent"),
    ("newton-clark", "Newton-Clark Headwall", 100, "reopened"),
    ("wyeast", "Wy'east Route", 135, "first-ascent"),
    ("south-side", "South Side", 180, "standard"),
    ("leuthold", "Leuthold Couloir", 232, "first-ascent"),
    ("sandy", "Sandy Glacier Headwall", 268, "first-ascent"),
    ("cathedral", "Cathedral Ridge", 312, "reopened"),
]
# Route colours per theme: the site's --accent / --warn / --ink-soft, deepened to read on snow.
ROUTE_COLORS = {
    "light": {"first-ascent": (178, 52, 38), "reopened": (196, 128, 10), "standard": (60, 64, 70)},
}


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def value_noise(shape, scales, seed):
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, np.float32)
    for s, w in scales:
        small = rng.random((shape[0] // s + 2, shape[1] // s + 2)).astype(np.float32)
        out += w * ndimage.zoom(small, s, order=3)[: shape[0], : shape[1]]
    return out / sum(w for _, w in scales)


def sample(img, r, c):
    r0, c0 = int(r), int(c)
    fr, fc = r - r0, c - c0
    return (img[r0, c0] * (1 - fr) * (1 - fc) + img[r0 + 1, c0] * fr * (1 - fc)
            + img[r0, c0 + 1] * (1 - fr) * fc + img[r0 + 1, c0 + 1] * fr * fc)


def main():
    d = np.load(CACHE / "dem.npz")
    elev = ndimage.gaussian_filter(d["elev"].astype(np.float32), 0.7)
    z = int(d["z"])
    spacing = 156543.03392 * math.cos(math.radians(SUMMIT[0])) / 2**z
    sx, sy = lonlat_to_px(SUMMIT[1], SUMMIT[0], z)
    r0, c0 = int(sy - float(d["y0"])), int(sx - float(d["x0"]))
    win = elev[r0 - 30 : r0 + 31, c0 - 30 : c0 + 31]
    dr, dc = np.unravel_index(np.argmax(win), win.shape)
    sr, sc = r0 - 30 + dr, c0 - 30 + dc

    # --- materials
    gy, gx = np.gradient(elev, spacing)
    slope = np.degrees(np.arctan(np.hypot(gx, gy)))
    n1 = value_noise(elev.shape, [(64, 1), (16, 0.6), (4, 0.4)], 1)
    n2 = value_noise(elev.shape, [(3, 1), (1, 0.7)], 2)
    treeline = 1750 + (n1 - 0.5) * 280
    forest = (1 - smoothstep(treeline - 150, treeline + 50, elev)) * (1 - smoothstep(30, 44, slope))
    forest *= smoothstep(0.25, 0.6, n1 * 0.6 + n2 * 0.4 + 0.15)  # clearings
    rock = smoothstep(36, 52, slope) * smoothstep(1500, 2100, elev) * (0.5 + 0.5 * n1)

    snow = np.array([238, 241, 245], np.float32)
    rockc = np.array([105, 100, 96], np.float32)
    floor = np.array([70, 92, 82], np.float32)  # forest floor seen between trees
    base = snow * (1 - rock[..., None]) + rockc * rock[..., None]
    base = base * (1 - 0.75 * forest[..., None]) + floor * (0.75 * forest[..., None])
    base *= (0.94 + 0.06 * n2)[..., None]

    # --- routes: climb from ~2000 m on the route's bearing to the summit
    sm = ndimage.gaussian_filter(elev, 5)
    gr, gc = np.gradient(sm)
    paths = {}
    for rid, _, bearing, _ in ROUTES:
        b = math.radians(bearing)
        dist = 300.0
        while sample(elev, sr - math.cos(b) * dist / spacing, sc + math.sin(b) * dist / spacing) > 2000 and dist < 9000:
            dist += 30
        r, c = sr - math.cos(b) * dist / spacing, sc + math.sin(b) * dist / spacing
        pts = [(r, c)]
        for _ in range(4000):
            tr, tc = sr - r, sc - c
            dd = math.hypot(tr, tc)
            if dd < 3:
                break
            g_r, g_c = sample(gr, r, c), sample(gc, r, c)
            g = math.hypot(g_r, g_c) or 1
            w = 0.55 if dd > 40 else 0.1
            vr, vc = w * g_r / g + (1 - w) * tr / dd, w * g_c / g + (1 - w) * tc / dd
            n = math.hypot(vr, vc)
            r, c = r + vr / n, c + vc / n
            pts.append((r, c))
        pts.append((sr, sc))
        paths[rid] = ndimage.gaussian_filter1d(np.array(pts), 6, axis=0, mode="nearest")

    rows, cols = elev.shape
    for theme, colors in ROUTE_COLORS.items():
        tex = base.copy()
        up = 2
        for rid, _, _, kind in ROUTES:
            mask = Image.new("L", (cols * up, rows * up))
            draw = ImageDraw.Draw(mask)
            pts = [(c * up, r * up) for r, c in paths[rid]]
            width = round(3.4 * up)
            if kind == "first-ascent":
                draw.line(pts, fill=255, width=width, joint="curve")
            else:
                dash, gap = (10, 7) if kind == "reopened" else (2.5, 6)
                acc, on = 0.0, True
                for a, b in zip(pts, pts[1:]):
                    if on:
                        draw.line([a, b], fill=255, width=width)
                    acc += math.dist(a, b) / up
                    if acc > (dash if on else gap):
                        acc, on = 0.0, not on
            m = np.asarray(mask.resize((cols, rows), Image.BILINEAR), np.float32)[..., None] / 255
            tex = tex * (1 - m) + np.array(colors[kind], np.float32) * m
        Image.fromarray(np.clip(tex, 0, 255).astype(np.uint8)).save(CACHE / f"albedo-{theme}.png")

    np.save(CACHE / "height.npy", elev[::STEP, ::STEP])
    np.save(CACHE / "forest.npy", forest[::STEP, ::STEP].astype(np.float32))
    meta = {
        "spacing": spacing * STEP,
        "rows": int(elev[::STEP].shape[0]),
        "cols": int(elev[:, ::STEP].shape[1]),
        "summit_rc": [sr / STEP, sc / STEP],
        "summit_elev": float(elev[sr, sc]),
        "routes": [
            {"id": rid, "name": name, "kind": kind, "bearing": bearing, "rc": (paths[rid] / STEP).round(2).tolist()}
            for rid, name, bearing, kind in ROUTES
        ],
    }
    (CACHE / "scene.json").write_text(json.dumps(meta))
    print("grid", elev.shape, "spacing %.2f m" % spacing, "summit", (sr, sc), "%.0f m" % elev[sr, sc])


if __name__ == "__main__":
    main()

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

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
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


def route_paths(elev, d, z, sr, sc):
    """Each route as grid (row, col) points from its low end to the summit, through the waypoints in
    route-waypoints.json, plus its bearing from the summit (degrees clockwise from north) where its
    label sits on the model (12% of the way along)."""
    spec = json.loads((HERE / "route-waypoints.json").read_text())
    osm = json.loads((CACHE / "osm-routes.json").read_text())["elements"]
    x0, y0 = float(d["x0"]), float(d["y0"])

    def rc(lat, lon):
        px, py = lonlat_to_px(lon, lat, z)
        return (py - y0, px - x0)

    def osm_line(name, above=None):
        ways = [e for e in osm if e["type"] == "way" and e.get("tags", {}).get("name") == name and e.get("geometry")]
        if not ways:
            raise SystemExit(f"route-waypoints.json: no OpenStreetMap way named {name!r} in .cache/osm-routes.json")
        pts = [rc(g["lat"], g["lon"]) for g in max(ways, key=lambda w: len(w["geometry"]))["geometry"]]
        if sample(elev, *pts[0]) > sample(elev, *pts[-1]):
            pts.reverse()  # lowest end first
        if above is not None:
            pts = [p for p in pts if sample(elev, *p) >= above]
        return pts

    paths, bearings = {}, {}
    for rid, *_ in ROUTES:
        pts = []
        for step in spec[rid]:
            pts += osm_line(step["osm"], step.get("above")) if isinstance(step, dict) else [rc(step[0], step[1])]
        pts.append((sr, sc))
        # one point per grid cell along the polyline, then a gentle smoothing that keeps both ends
        dense = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            n = max(1, int(math.dist(a, b)))
            dense += [(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n) for t in range(1, n + 1)]
        arr = np.array(dense)
        smooth = ndimage.gaussian_filter1d(arr, 3, axis=0, mode="nearest")
        smooth[0], smooth[-1] = arr[0], arr[-1]
        paths[rid] = smooth
        seg = np.hypot(*np.diff(smooth, axis=0).T)
        at = smooth[np.searchsorted(np.cumsum(seg), 0.12 * seg.sum())]
        bearings[rid] = round(math.degrees(math.atan2(at[1] - sc, -(at[0] - sr))) % 360)
    return paths, bearings


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

    # --- routes: through real-world waypoints (route-waypoints.json) to the summit
    paths, bearings = route_paths(elev, d, z, sr, sc)

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
            {"id": rid, "name": name, "kind": kind, "bearing": bearings[rid], "rc": (paths[rid] / STEP).round(2).tolist()}
            for rid, name, _, kind in ROUTES
        ],
    }
    (CACHE / "scene.json").write_text(json.dumps(meta))
    print("grid", elev.shape, "spacing %.2f m" % spacing, "summit", (sr, sc), "%.0f m" % elev[sr, sc])


if __name__ == "__main__":
    main()

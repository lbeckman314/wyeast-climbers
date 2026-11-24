"""Export compact terrain data for the interactive 3D hero (src/scripts/hero3d.ts).

Writes:
  public/hero/terrain.png      N×N RGB: R/G = height in metres (16-bit, R high byte), B = forest 0..255.
                               Covers a square of 2*RADIUS_KM around the summit, north up.
  public/hero/terrain-far.png  The same encoding at lower resolution over 2*FAR_RADIUS_KM, for the
                               forest that fades out around the mountain.
  src/data/hero-terrain.json   grid size, extent, and the route polylines in km
                               (x east, z south, y = elevation in metres), relative to the summit.

Run after fetch_dem.py and prepare.py (which supplies the forest map and route paths).
"""
import json, math, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage
import sys

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fetch_dem import lonlat_to_px  # noqa: E402

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CACHE = HERE / ".cache"
N = 320
RADIUS_KM = 7.6
FAR_N = 256
FAR_RADIUS_KM = 19.5


def main():
    meta = json.loads((CACHE / "scene.json").read_text())
    elev = np.load(CACHE / "height.npy")
    forest = np.load(CACHE / "forest.npy")
    sp = meta["spacing"]
    sr, sc = meta["summit_rc"]
    def export(n, radius_km, name):
        half = radius_km * 1000 / sp  # cells
        t = np.linspace(-half, half, n)
        R, C = np.meshgrid(sr + t, sc + t, indexing="ij")
        smooth = ndimage.gaussian_filter(elev, (2 * half / n) * 0.5)
        h = ndimage.map_coordinates(smooth, [R, C], order=1, mode="nearest")
        f = ndimage.map_coordinates(ndimage.gaussian_filter(forest, 2 * half / n), [R, C], order=1, mode="nearest")
        hm = np.clip(np.round(h), 0, 65535).astype(np.uint16)
        rgb = np.stack([(hm >> 8).astype(np.uint8), (hm & 255).astype(np.uint8), np.clip(f * 255, 0, 255).astype(np.uint8)], -1)
        out = ROOT / "public" / "hero" / name
        Image.fromarray(rgb).save(out, optimize=True)
        print(f"{name} {out.stat().st_size // 1024} KB, elev {h.min():.0f}..{h.max():.0f} m")
        return h, smooth

    far, _ = export(FAR_N, FAR_RADIUS_KM, "terrain-far.png")
    h, smooth = export(N, RADIUS_KM, "terrain.png")

    routes = []
    for r in meta["routes"]:
        pts = np.array(r["rc"])[::4]
        if len(pts) < 2:
            continue
        xs = (pts[:, 1] - sc) * sp / 1000
        zs = (pts[:, 0] - sr) * sp / 1000
        ys = ndimage.map_coordinates(smooth, [pts[:, 0], pts[:, 1]], order=1)
        inside = np.hypot(xs, zs) < RADIUS_KM * 0.97
        routes.append({
            "id": r["id"], "name": r["name"], "kind": r["kind"], "bearing": r["bearing"],
            "points": [[round(float(x), 3), round(float(y)), round(float(z), 3)] for x, y, z, ok in zip(xs, ys, zs, inside) if ok],
        })
    # Landmarks (src/data/landmarks.json): latitude/longitude -> km east (x) / south (z) of the summit,
    # through the same Web Mercator grid as the elevation data.
    dem = np.load(CACHE / "dem.npz")
    landmarks = []
    for lm in json.loads((ROOT / "src" / "data" / "landmarks.json").read_text()):
        if lm.get("at") == "summit" or lm["id"] == "summit":
            x = z = 0.0
        elif "lat" not in lm:
            continue  # placed from an OpenStreetMap point or trail instead (see locate() in hero3d.ts)
        else:
            px, py = lonlat_to_px(lm["lon"], lm["lat"], int(dem["z"]))
            x = (px - float(dem["x0"]) - sc) * sp / 1000
            z = (py - float(dem["y0"]) - sr) * sp / 1000
        landmarks.append({"id": lm["id"], "x": round(x, 3), "z": round(z, 3)})
        print(f"landmark {lm['id']}: {math.hypot(x, z):.1f} km from the summit")

    data = {
        "size": N, "radiusKm": RADIUS_KM, "farSize": FAR_N, "farRadiusKm": FAR_RADIUS_KM,
        "summitElev": round(float(h[N // 2, N // 2])), "minElev": int(h.min()), "routes": routes,
        "landmarks": landmarks,
    }
    (ROOT / "src" / "data" / "hero-terrain.json").write_text(json.dumps(data) + "\n")
    print(f"routes {len(routes)}")


if __name__ == "__main__":
    main()

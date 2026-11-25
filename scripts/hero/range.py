"""Terrain, routes and landmarks for the mountains around Hood (the map's Expand view).

Reads src/data/range.json (the mountains, their routes and landmarks) and .cache/osm-range.json
(OpenStreetMap, from osm-range.overpass). Writes:
  public/hero/range-<id>.png   same encoding as terrain.png (R/G height in metres, B forest)
  src/data/range-terrain.json  extents, offsets from Mount Hood, and route/landmark positions in km

Routes thread the steps in range.json: [lat, lon, note], {"osm": "<way name>"} (all ways of that
name near the mountain, lowest first) or {"way": <way id>}. "toSummit": false stops at the last step.
Lines are approximate: right feature, not a survey.
"""
import json, math, pathlib, sys, urllib.request
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fetch_dem import CACHE, SUMMIT, URL, lonlat_to_px  # noqa: E402
from prepare import smoothstep, value_noise  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
Z, N = 12, 288


def dem(lat, lon, km):
    dlat, dlon = km / 111.2, km / (111.2 * math.cos(math.radians(lat)))
    xa, ya = lonlat_to_px(lon - dlon, lat + dlat, Z)
    xb, yb = lonlat_to_px(lon + dlon, lat - dlat, Z)
    tx0, ty0, tx1, ty1 = (int(v // 256) for v in (xa, ya, xb, yb))
    rows = []
    for ty in range(ty0, ty1 + 1):
        row = []
        for tx in range(tx0, tx1 + 1):
            f = CACHE / f"{Z}-{tx}-{ty}.png"
            if not f.exists():
                req = urllib.request.Request(URL.format(z=Z, x=tx, y=ty), headers={"User-Agent": "terrain-render-script"})
                f.write_bytes(urllib.request.urlopen(req, timeout=30).read())
            a = np.asarray(Image.open(f).convert("RGB"), dtype=np.float32)
            row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
        rows.append(np.hstack(row))
    return np.vstack(rows), tx0 * 256, ty0 * 256


def main():
    osm = json.loads((CACHE / "osm-range.json").read_text())["elements"]
    out = []
    for i, p in enumerate(json.loads((ROOT / "src/data/range.json").read_text())):
        lat, lon, R = p["lat"], p["lon"], p["radiusKm"]
        cos = math.cos(math.radians(lat))
        grid, x0, y0 = dem(lat, lon, R + 0.5)
        t = np.linspace(-R, R, N)
        X, Y = np.meshgrid(t, t)  # km east, km south
        px = np.vectorize(lambda x, z: lonlat_to_px(lon + x / (111.2 * cos), lat - z / 111.2, Z))(X, Y)
        soft = ndimage.gaussian_filter(grid, 0.8)
        h = ndimage.map_coordinates(soft, [px[1] - y0, px[0] - x0], order=1, mode="nearest")
        cell = 2 * R * 1000 / (N - 1)
        gy, gx = np.gradient(h, cell)
        slope = np.degrees(np.arctan(np.hypot(gx, gy)))
        n = value_noise(h.shape, [(32, 1), (8, 0.6), (2, 0.4)], i + 1)
        line = p["treelineM"] + (n - 0.5) * 280
        forest = (1 - smoothstep(line - 150, line + 50, h)) * (1 - smoothstep(30, 44, slope)) * smoothstep(0.25, 0.55, n + 0.1)
        if "bare" in p:  # ground cleared by the 1980 blast: a wide fan north of the crater
            bx, bz = (p["bare"][1] - lon) * 111.2 * cos, (lat - p["bare"][0]) * 111.2
            ang = np.degrees(np.abs(np.arctan2(X - bx, -(Y - bz))))
            forest *= 1 - (1 - smoothstep(60, 85, ang)) * (1 - smoothstep(p["bare"][2], p["bare"][2] + 2, np.hypot(X - bx, Y - bz)))
        hm = np.clip(np.round(h), 0, 65535).astype(np.uint16)
        rgb = np.stack([(hm >> 8).astype(np.uint8), (hm & 255).astype(np.uint8), np.clip(forest * 255, 0, 255).astype(np.uint8)], -1)
        png = ROOT / "public/hero" / f"range-{p['id']}.png"
        Image.fromarray(rgb).save(png, optimize=True)

        km = lambda la, lo: ((lo - lon) * 111.2 * cos, (lat - la) * 111.2)
        z = lambda q: float(ndimage.map_coordinates(h, [[(q[1] / R + 1) / 2 * (N - 1)], [(q[0] / R + 1) / 2 * (N - 1)]], order=1, mode="nearest")[0])

        def ways(step):
            found = []
            for e in osm:
                if e["type"] != "way" or not e.get("geometry"):
                    continue
                if e["id"] != step.get("way") and e.get("tags", {}).get("name") != step.get("osm", 0):
                    continue
                pts = [km(g["lat"], g["lon"]) for g in e["geometry"]]
                if min(math.hypot(*q) for q in pts) > 6:
                    continue
                found.append(pts if z(pts[0]) <= z(pts[-1]) else pts[::-1])
            if not found:
                raise SystemExit(f"{p['id']}: nothing in OpenStreetMap data for {step}")
            found.sort(key=lambda q: z(q[0]))
            return [q for w in found for q in w]

        routes = []
        for r in p["routes"]:
            pts = []
            for s in r["path"]:
                pts += ways(s) if isinstance(s, dict) else [km(s[0], s[1])]
            if r.get("toSummit", True):
                pts.append((0.0, 0.0))
            dense = [pts[0]]
            for a, b in zip(pts, pts[1:]):
                k = max(1, int(math.dist(a, b) / 0.06))
                dense += [(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k) for j in range(1, k + 1)]
            arr = ndimage.gaussian_filter1d(np.array(dense), 1.5, axis=0, mode="nearest")
            arr = arr[np.hypot(arr[:, 0], arr[:, 1]) < R * 0.82]
            # even out the spacing: OpenStreetMap lines are much denser than the model
            keep = [arr[0]]
            for q in arr[1:]:
                if math.dist(q, keep[-1]) > 0.09:
                    keep.append(q)
            gap = max(math.dist(a, b) for a, b in zip(pts, pts[1:]))
            routes.append({"id": r["id"], "points": [[round(float(a), 3), round(float(b), 3)] for a, b in keep]})
            print(f"  {r['id']}: {len(keep)} pts, {z(keep[0]):.0f} -> {z(keep[-1]):.0f} m, longest jump {gap:.2f} km")
        lms = [dict(id=l["id"], x=round(km(l["lat"], l["lon"])[0], 3), z=round(km(l["lat"], l["lon"])[1], 3)) for l in p["landmarks"]]
        mid = math.radians((lat + SUMMIT[0]) / 2)
        out.append({"id": p["id"], "size": N, "radiusKm": R, "maxElev": round(float(h.max())), "minElev": round(float(h.min())),
                    "east": round((lon - SUMMIT[1]) * 111.2 * math.cos(mid), 2), "south": round((SUMMIT[0] - lat) * 111.2, 2),
                    "routes": routes, "landmarks": lms})
        print(p["id"], png.stat().st_size // 1024, "KB", round(float(h.min())), round(float(h.max())), [f"{math.hypot(l['x'], l['z']):.1f}" for l in lms])
    (ROOT / "src/data/range-terrain.json").write_text(json.dumps(out) + "\n")


if __name__ == "__main__":
    main()

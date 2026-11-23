"""Export Government Camp and south-slope features from OpenStreetMap for the 3D model.

    python scripts/hero/features.py      # after fetch_dem.py and prepare.py

Reads scripts/hero/.cache/osm-south.json (an Overpass API export; see README) and writes
src/data/hero-features.json with everything in model coordinates (km east = x, km south = z,
relative to the summit, through the same Web Mercator grid as the elevation data):

  roads      [{kind, pts}]   kind: highway | loop (the old highway through the village) |
                             street | historic (the 1930s Timberline West/East Leg roads)
  trails     {id: pts}       the Glade and Alpine ski trails
  buildings  [{x, z, w, d, a}] village footprints as rotated rectangles (a = angle, radians)
  points     {name: [x, z]}  named places used to position landmarks
  latlon     {name: [lat, lon]} the same points, for src/data/landmarks.json

Map data © OpenStreetMap contributors (ODbL).
"""
import json, math, pathlib, sys
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from fetch_dem import lonlat_to_px  # noqa: E402

ROOT = HERE.parents[1]
CACHE = HERE / ".cache"

# Government Camp village: buildings inside this box become footprints on the model
VILLAGE = (45.297, -121.768, 45.306, -121.735)  # south, west, north, east


def main():
    osm = json.loads((CACHE / "osm-south.json").read_text())["elements"]
    meta = json.loads((CACHE / "scene.json").read_text())
    dem = np.load(CACHE / "dem.npz")
    sp, (sr, sc), z = meta["spacing"], meta["summit_rc"], int(dem["z"])
    x0, y0 = float(dem["x0"]), float(dem["y0"])

    def km(lat, lon):
        px, py = lonlat_to_px(lon, lat, z)
        return [round((px - x0 - sc) * sp / 1000, 4), round((py - y0 - sr) * sp / 1000, 4)]

    def line(e, step_km=0.02):
        pts = [km(g["lat"], g["lon"]) for g in e.get("geometry", [])]
        out = pts[:1]
        for p in pts[1:]:  # drop points closer than step_km to keep the file small
            if math.dist(p, out[-1]) >= step_km:
                out.append(p)
        if pts and out[-1] != pts[-1]:
            out.append(pts[-1])
        return out

    def centre(e):
        if e["type"] == "node":
            return e["lat"], e["lon"]
        g = e.get("geometry") or []
        if not g:
            b = e.get("bounds")
            return (b["minlat"] + b["maxlat"]) / 2, (b["minlon"] + b["maxlon"]) / 2
        return sum(p["lat"] for p in g) / len(g), sum(p["lon"] for p in g) / len(g)

    roads, trails, buildings, latlon = [], {}, [], {}
    for e in osm:
        t = e.get("tags", {})
        name, hw = t.get("name", ""), t.get("highway")
        if e["type"] == "way" and hw:
            if name in ("Glade Trail #661", "Alpine Trail #660"):
                trails.setdefault("glade-trail" if name.startswith("Glade") else "alpine-trail", []).append(line(e))
                continue
            if hw in ("trunk", "primary"):
                kind = "highway"
            elif name.endswith("Government Camp Loop"):
                kind = "loop"
            elif name.startswith("Timberline West Leg") or name == "Timberline East Leg":
                kind = "historic"
            elif hw in ("secondary", "tertiary"):
                kind = "highway" if name == "Timberline Highway" else "street"
            elif hw in ("residential", "unclassified") and name:
                kind = "street"
            else:
                continue
            roads.append({"kind": kind, "name": name, "pts": line(e)})
        elif e["type"] == "way" and "building" in t and e.get("geometry"):
            lat, lon = centre(e)
            s, w, n, east = VILLAGE
            if not (s <= lat <= n and w <= lon <= east):
                continue
            pts = np.array([km(g["lat"], g["lon"]) for g in e["geometry"]])
            c = pts.mean(axis=0)
            # rotated rectangle from the footprint's principal axis
            u, _, vt = np.linalg.svd(pts - c, full_matrices=False)
            proj = (pts - c) @ vt.T
            w_, d_ = np.ptp(proj[:, 0]), np.ptp(proj[:, 1])
            if w_ * d_ < 0.00004:  # skip sheds (< ~40 m²)
                continue
            a = math.atan2(vt[0, 1], vt[0, 0])
            buildings.append({"x": round(float(c[0]), 4), "z": round(float(c[1]), 4),
                              "w": round(float(w_), 4), "d": round(float(d_), 4), "a": round(a, 3),
                              **({"name": name} if name else {})})
        if name in ("Huckleberry Inn", "Mazama Lodge", "Tyee Lodge", "Multorpor Restaurant and Lounge",
                    "Multorpor Mountain", "Tom Dick and Harry Mountain", "Mt. Hood Skibowl"):
            latlon[name] = [round(v, 6) for v in centre(e)]

    points = {k: km(*v) for k, v in latlon.items()}
    # lower (southern) end of the Alpine Trail: where it ended, at the Summit Ski Area
    alpine = [p for seg in trails.get("alpine-trail", []) for p in seg]
    if alpine:
        points["Alpine Trail lower end"] = max(alpine, key=lambda p: p[1])
    # Hill's Place (gone since 1969) stood directly across the loop road from the Battle Axe Inn,
    # whose site is the Huckleberry Inn: mirror that across the nearest point of the loop road.
    if "Huckleberry Inn" in points:
        hx, hz = points["Huckleberry Inn"]
        loop = [p for r in roads if r["kind"] == "loop" for p in r["pts"]]
        rx, rz = min(loop, key=lambda p: math.dist(p, (hx, hz)))
        points["Hill's Place (across the loop road)"] = [round(2 * rx - hx, 4), round(2 * rz - hz, 4)]
    # extent of the village (where trees are kept off the buildings)
    xs, zs = [b["x"] for b in buildings], [b["z"] for b in buildings]
    village = [round(min(xs), 3), round(min(zs), 3), round(max(xs), 3), round(max(zs), 3)] if buildings else None

    out = {"roads": roads, "trails": trails, "buildings": buildings, "points": points, "latlon": latlon, "village": village}
    (ROOT / "src" / "data" / "hero-features.json").write_text(json.dumps(out, separators=(",", ":")) + "\n")
    kinds = {}
    for r in roads:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print("roads", kinds, "| trails", {k: len(v) for k, v in trails.items()}, "| buildings", len(buildings))
    for k, v in points.items():
        print(f"  {k}: {v} km  ({latlon.get(k)})")


if __name__ == "__main__":
    main()

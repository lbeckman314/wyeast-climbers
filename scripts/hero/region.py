"""The Pacific Northwest map under the mountains in the Expand view.

Writes public/hero/region.png (R/G height in metres, 16-bit; B forest), public/hero/region-water.png
(R sea and sounds, G rivers) and src/data/region.json (extent in km from Hood, and places).
Positions use the same projection as range.py, so the mountains stand exactly on the map.
Elevation: AWS Terrain Tiles. Rivers: Natural Earth (public domain). Forest is an approximation.
"""
import json, math, pathlib, sys, urllib.request
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from fetch_dem import CACHE, SUMMIT, URL, lonlat_to_px  # noqa: E402
from prepare import smoothstep, value_noise  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
Z = 8
LAT, LON = (42.9, 48.3), (-125.6, -118.6)
W, H = 640, 720
NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/"
RIVERS = {"Columbia": 4.5, "Snake": 3, "Willamette": 2.5, "Deschutes": 2, "John Day": 1.6, "Yakima": 1.6, "Cowlitz": 1.6, "Rogue": 1.4, "Umpqua": 1.4}
PLACES = [  # name, lat, lon, kind
    ("Portland", 45.515, -122.679, "city"), ("Seattle", 47.606, -122.332, "city"), ("Tacoma", 47.253, -122.444, "city"),
    ("Olympia", 47.038, -122.901, "city"), ("Salem", 44.943, -123.035, "city"), ("Eugene", 44.052, -123.087, "city"),
    ("Bend", 44.058, -121.315, "city"), ("The Dalles", 45.595, -121.179, "city"),
    ("Yakima", 46.602, -120.506, "city"), ("Astoria", 46.188, -123.831, "city"),
    ("Washington", 46.75, -119.9, "area"), ("Oregon", 44.6, -119.9, "area"), ("Pacific Ocean", 45.5, -124.75, "sea"),
    ("Columbia River", 45.72, -120.6, "sea"), ("Puget Sound", 47.75, -122.45, "sea")]


def project(lat, lon):  # km east, km south of Hood
    return (lon - SUMMIT[1]) * 111.2 * math.cos(math.radians((lat + SUMMIT[0]) / 2)), (SUMMIT[0] - lat) * 111.2


def fetch(url, f):
    if not f.exists():
        f.write_bytes(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "terrain-render-script"}), timeout=60).read())
    return f


def main():
    xa, ya = lonlat_to_px(LON[0], LAT[1], Z)
    xb, yb = lonlat_to_px(LON[1], LAT[0], Z)
    tx0, ty0, tx1, ty1 = (int(v // 256) for v in (xa, ya, xb, yb))
    rows = []
    for ty in range(ty0, ty1 + 1):
        row = []
        for tx in range(tx0, tx1 + 1):
            a = np.asarray(Image.open(fetch(URL.format(z=Z, x=tx, y=ty), CACHE / f"{Z}-{tx}-{ty}.png")).convert("RGB"), np.float32)
            row.append(a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768)
        rows.append(np.hstack(row))
    grid = np.vstack(rows)
    # extent: the part of the bounding box that is full at every latitude
    west = max(project(la, LON[0])[0] for la in LAT)
    east = min(project(la, LON[1])[0] for la in LAT)
    north, south = project(LAT[1], 0)[1], project(LAT[0], 0)[1]
    X, Y = np.meshgrid(np.linspace(west, east, W), np.linspace(north, south, H))
    lat = SUMMIT[0] - Y / 111.2
    lon = SUMMIT[1] + X / (111.2 * np.cos(np.radians((lat + SUMMIT[0]) / 2)))
    n = 256 * 2**Z
    px = (lon + 180) / 360 * n - tx0 * 256
    py = (1 - np.log(np.tan(np.radians(lat)) + 1 / np.cos(np.radians(lat))) / math.pi) / 2 * n - ty0 * 256
    raw = ndimage.map_coordinates(grid, [py, px], order=1, mode="nearest")
    h = ndimage.gaussian_filter(np.maximum(raw, 0), 0.8)
    sea = raw <= 0.5
    lab, k = ndimage.label(sea)  # drop specks
    sizes = ndimage.sum(sea, lab, range(1, k + 1))
    sea = np.isin(lab, 1 + np.flatnonzero(sizes > 60))
    noise = value_noise(h.shape, [(32, 1), (8, 0.6), (2, 0.4)], 5)
    wet = 1 - smoothstep(-121.5, -120.9, lon + (noise - 0.5) * 0.6)  # the rain shadow east of the crest
    forest = np.maximum(wet * (0.3 + 0.7 * smoothstep(120, 420, h)), 0.85 * smoothstep(1100, 1500, h) * (1 - wet))
    forest *= (1 - smoothstep(1650, 1950, h)) * smoothstep(0.2, 0.5, noise + 0.12) * ~sea
    hm = (np.round(h / 8) * 8).astype(np.uint16)
    Image.fromarray(np.stack([(hm >> 8).astype(np.uint8), (hm & 255).astype(np.uint8), (np.clip(forest, 0, 1) * 255).astype(np.uint8)], -1)).save(ROOT / "public/hero/region.png", optimize=True)

    up = 3
    img = Image.new("L", (W * up, H * up))
    draw = ImageDraw.Draw(img)
    seen = set()
    for name in ("ne_10m_rivers_lake_centerlines.geojson", "ne_10m_rivers_north_america.geojson"):
        for f in json.loads(fetch(NE + name, CACHE / name).read_text())["features"]:
            p, g = f["properties"], f["geometry"]
            river = (p.get("name") or "").replace(" River", "")
            if not g or river not in RIVERS:
                continue
            for line in g["coordinates"] if g["type"] == "MultiLineString" else [g["coordinates"]]:
                pts = [project(la, lo) for lo, la, *_ in line if LON[0] < lo < LON[1] and LAT[0] < la < LAT[1]]
                if len(pts) > 1:
                    seen.add(river)
                    draw.line([((x - west) / (east - west) * W * up, (y - north) / (south - north) * H * up) for x, y in pts], fill=255, width=round(RIVERS[river] * up * 0.62), joint="curve")
    # Natural Earth's Columbia stops short of the tidal estuary
    draw.line([((x - west) / (east - west) * W * up, (y - north) / (south - north) * H * up) for x, y in (project(46.17, -123.19), project(46.16, -123.3), project(46.25, -123.43))], fill=255, width=round(4.5 * up * 0.62))
    rivers = np.asarray(img.resize((W, H), Image.LANCZOS))
    soft = (ndimage.gaussian_filter(sea.astype(np.float32), 0.7) * 255).astype(np.uint8)
    Image.fromarray(np.stack([soft, rivers, np.zeros_like(soft)], -1)).save(ROOT / "public/hero/region-water.png", optimize=True)
    places = [dict(name=a, kind=kd, x=round(project(la, lo)[0], 2), z=round(project(la, lo)[1], 2)) for a, la, lo, kd in PLACES]
    (ROOT / "src/data/region.json").write_text(json.dumps(dict(width=W, height=H, west=round(west, 2), east=round(east, 2), north=round(north, 2), south=round(south, 2), places=places)) + "\n")
    print("rivers", sorted(seen), "extent km", round(west), round(east), round(north), round(south), "sea %.2f" % sea.mean())


if __name__ == "__main__":
    main()

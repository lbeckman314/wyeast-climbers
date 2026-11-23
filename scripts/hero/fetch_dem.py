"""Download and stitch an elevation grid around Mount Hood.

Source: AWS Open Data "Terrain Tiles" (Terrarium encoding), which in the US is
derived from USGS 3DEP. Attribution: "Elevation: USGS 3DEP via AWS Terrain Tiles".

Writes .cache/dem.npz with:
  elev  float32 [rows, cols] metres, row 0 = north
  x0,y0 Web Mercator pixel origin at zoom Z (for converting lon/lat -> grid)
"""
import io, math, pathlib, urllib.request
import numpy as np
from PIL import Image

Z = 13
SUMMIT = (45.3735, -121.6959)  # lat, lon
HALF_KM = (24, 20)  # half-width east-west, half-height north-south
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
HERE = pathlib.Path(__file__).parent
CACHE = HERE / ".cache"


def lonlat_to_px(lon, lat, z=Z):
    n = 256 * 2**z
    x = (lon + 180) / 360 * n
    y = (1 - math.log(math.tan(math.radians(lat)) + 1 / math.cos(math.radians(lat))) / math.pi) / 2 * n
    return x, y


def main():
    CACHE.mkdir(exist_ok=True)
    lat, lon = SUMMIT
    dlat = HALF_KM[1] / 111.32
    dlon = HALF_KM[0] / (111.32 * math.cos(math.radians(lat)))
    xa, ya = lonlat_to_px(lon - dlon, lat + dlat)
    xb, yb = lonlat_to_px(lon + dlon, lat - dlat)
    tx0, ty0, tx1, ty1 = int(xa // 256), int(ya // 256), int(xb // 256), int(yb // 256)
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
    elev = np.vstack(rows).astype(np.float32)
    np.savez_compressed(CACHE / "dem.npz", elev=elev, x0=tx0 * 256, y0=ty0 * 256, z=Z)
    print(f"{(tx1 - tx0 + 1) * (ty1 - ty0 + 1)} tiles -> grid {elev.shape}, elev {elev.min():.0f}..{elev.max():.0f} m")


if __name__ == "__main__":
    main()

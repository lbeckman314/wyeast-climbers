"""Trace Mount Hood's real outline for the site mark and favicon.

    python scripts/hero/mark.py            # after fetch_dem.py and prepare.py

Projects the elevation data as seen from the west-north-west (roughly from Portland),
from far away (no perspective), takes the skyline and the snowcap on the facing slopes,
and writes simplified SVG paths to:
  src/components/Mark.astro   the header mark (uses currentColor + var(--paper))
  public/favicon.svg          the browser-tab icon
  scripts/hero/.cache/{mark,favicon}-preview.png

Both are drawn as a solid mountain with a snowcap on its upper slopes, cropped tight
to the shape so they read from a distance.
"""
import json, math, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure

HERE = pathlib.Path(__file__).resolve().parent
ROOT = HERE.parents[1]
CACHE = HERE / ".cache"

VIEW_BEARING = 282   # degrees from the summit toward the viewer (Portland is ~282°)
VIEW_ELEV = 4        # degrees the viewer looks down; a little shows the snowcap on the face
EXAG = 1.8           # vertical stretch so the shape reads small (true proportions look flat)
PX = 900             # working raster width
# Crops:
#   base_elev      metres where the shape is cut off at the bottom
#   half_width_km  km of flank either side of the summit
#   snow_elev      typical snowline in metres (it dips lower in gullies, sits higher on ridges)
#   rim            mountain colour kept around the snowcap, as a fraction of the width
#   detail         larger = simpler outlines (the favicon needs fewer, bolder points)
HEADER = dict(base_elev=1600, half_width_km=5.0, snow_elev=2600, rim=0.016, detail=1.0)
FAVICON = dict(base_elev=1900, half_width_km=3.3, snow_elev=2950, rim=0.03, detail=2.5)
FAVICON_ACCENT = "#b23426"  # matches --accent in src/styles/global.css
PAPER = "#f5f0e6"            # matches --paper


def trace(base_elev, half_width_km, snow_elev, rim, detail, preview_name):
    meta = json.loads((CACHE / "scene.json").read_text())
    elev = np.load(CACHE / "height.npy").astype(np.float32)
    forest = np.load(CACHE / "forest.npy").astype(np.float32)
    sp = meta["spacing"]
    sr, sc = meta["summit_rc"]
    rows, cols = elev.shape
    # hollows (gullies, glacier troughs) hold snow lower down than ridges do
    hollow = elev - ndimage.gaussian_filter(elev, 10)
    rr, cc = np.mgrid[0:rows, 0:cols]
    x = (cc - sc) * sp / 1000            # km east
    y = -(rr - sr) * sp / 1000           # km north
    keep = np.hypot(x, y) < 14           # the mountain, not its neighbours
    x, y, z, f, hl = x[keep], y[keep], elev[keep] / 1000, forest[keep], hollow[keep]

    b = math.radians(VIEW_BEARING)
    to_viewer = np.array([math.sin(b), math.cos(b)])           # unit vector, map coords
    right = np.array([to_viewer[1], -to_viewer[0]])            # viewer's right
    lat = x * right[0] + y * right[1]                          # screen x (km)
    depth = x * to_viewer[0] + y * to_viewer[1]                # + = toward the viewer
    e = math.radians(VIEW_ELEV)
    up = (z - base_elev / 1000) * EXAG * math.cos(e) + depth * math.sin(e)  # screen y (km)

    # raster: painter's order (far to near) so the facing slope wins
    km_per_px = 2 * half_width_km / PX
    top_km = (meta["summit_elev"] / 1000 - base_elev / 1000) * EXAG + 0.3
    H = int(top_km / km_per_px) + 2
    px = ((lat + half_width_km) / km_per_px).astype(int)
    py = (H - 1 - up / km_per_px).astype(int)
    ok = (px >= 0) & (px < PX) & (py >= 0) & (py < H)
    order = np.argsort(depth[ok])                              # far first
    snowline = snow_elev + np.clip(hl, -40, 40) * 8            # ±~300 m: teeth down the gullies
    snowy = ((f < 0.3) & (z * 1000 > snowline)).astype(np.uint8) + 1   # 1 = forest/rock, 2 = snow
    img = np.zeros((H, PX), np.uint8)
    img[py[ok][order], px[ok][order]] = snowy[ok][order]
    # fill pinholes left by the sampling, and everything below the skyline
    land = ndimage.binary_closing(img > 0, iterations=2)
    land = np.maximum.accumulate(land, axis=0)
    img = np.where(land & (img == 0), ndimage.grey_dilation(img, size=3), img)
    img[land & (img == 0)] = 1
    k = max(2, round(2 * detail))
    snow = ndimage.binary_opening(ndimage.binary_closing(img == 2, iterations=k + 1), iterations=k)
    # keep a rim of the mountain colour around the snow so the peak reads on a paper background
    snow &= ndimage.binary_erosion(land, iterations=max(2, int(PX * rim)))

    # crop away the empty sky above the summit
    top = int(np.argmax(land.any(axis=1)))
    land, snow = land[top:], snow[top:]
    H = land.shape[0]

    preview = np.full((H, PX, 3), 235, np.uint8)
    preview[land] = (178, 52, 38)
    preview[snow] = (245, 240, 230)
    Image.fromarray(preview).save(CACHE / preview_name)

    # vectorise: outline of land and of the snowcap, simplified
    def outline(mask, tol):
        padded = np.pad(mask.astype(float), 1)
        cs = measure.find_contours(padded, 0.5)
        c = max(cs, key=len) - 1                               # (row, col)
        return measure.approximate_polygon(c, tolerance=tol)

    land_c = outline(land, tol=PX * 0.003 * detail)
    snow_c = outline(snow, tol=PX * 0.004 * detail)
    print(f"{preview_name}: {PX}x{H}, land {len(land_c)} pts, snow {len(snow_c)} pts")
    return land_c, snow_c, H


def to_path(c, s, ox=0.0, oy=0.0):
    pts = [f"{ox + col * s:.1f} {oy + row * s:.1f}" for row, col in c]
    return "M" + " L".join(pts) + " Z"


if __name__ == "__main__":
    # Header mark: 64 wide, cropped to the shape (no margins).
    land_c, snow_c, H = trace(**HEADER, preview_name="mark-preview.png")
    s = 64 / PX
    (ROOT / "src" / "components" / "Mark.astro").write_text(f"""---
// Mount Hood's outline as seen from Portland (west-north-west), traced from USGS 3DEP
// elevation data by scripts/hero/mark.py, with heights stretched {EXAG}x so it reads small.
---
<svg viewBox="0 0 64 {H * s:.1f}" aria-hidden="true" fill="none">
  <path d="{to_path(land_c, s)}" fill="currentColor" />
  <path d="{to_path(snow_c, s)}" fill="var(--paper)" />
</svg>
""")

    # Favicon: the peak fills the tile from near the top edge to the bottom; the lower
    # flanks run off the sides.
    land_c, snow_c, H = trace(**FAVICON, preview_name="favicon-preview.png")
    s2 = 58 / H
    ox, oy = 32 - (PX / 2) * s2, 6
    (ROOT / "public" / "favicon.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<clipPath id="t"><rect width="64" height="64" rx="12"/></clipPath>'
        f'<rect width="64" height="64" rx="12" fill="{PAPER}"/>'
        f'<g clip-path="url(#t)">'
        f'<path d="{to_path(land_c, s2, ox, oy)}" fill="{FAVICON_ACCENT}"/>'
        f'<path d="{to_path(snow_c, s2, ox, oy)}" fill="{PAPER}"/>'
        f"</g></svg>\n"
    )
    print("wrote Mark.astro and favicon.svg")

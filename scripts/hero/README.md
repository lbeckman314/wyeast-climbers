# Homepage hero

The hero is an interactive halftone model of Mount Hood (`src/scripts/hero3d.ts`, built with
three.js), cut out like a museum model, with the club's routes. Readers can drag to turn it.
It lazy-loads after the page and falls back to a static Blender render when WebGL isn't available.

| File | Made by | Used for |
|---|---|---|
| `public/hero/terrain.png` | `terrain3d.py` | Heights (R/G, 16-bit metres) and forest density (B) for the 3D model |
| `src/data/hero-terrain.json` | `terrain3d.py` | Model extent, route lines and landmark positions |
| `public/hero/hero-light-{2400,1200}.webp` | `scene.py` (Blender) | Static fallback image |

## Rebuild the data

Needs Python 3 with `numpy`, `scipy` and `Pillow` (`pip install -r scripts/hero/requirements.txt`).
The fallback images also need [Blender](https://www.blender.org/) 5.x and ImageMagick (`magick`).

```sh
python scripts/hero/fetch_dem.py     # once: ~200 elevation tiles (~60 MB) into scripts/hero/.cache/
python scripts/hero/prepare.py       # forest map and route lines
python scripts/hero/terrain3d.py     # data for the 3D model
/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/hero/scene.py   # fallback images (~3 min)
```

The first Blender run on a Mac spends several minutes compiling GPU shaders. Add `-- --quick`
for a 20-second preview in `scripts/hero/.cache/render-light-quick.png`.

## Things to tweak

- **The 3D model's look:** the top of `src/scripts/hero3d.ts`, including `EXAG` (vertical exaggeration),
  the `PALETTE`, tree count, the halftone dot size (`uDot`), contour spacing
  (`uContour`), and the starting view (`START_BEARING`).
- **The model's extent and detail:** `RADIUS_KM` and `N` in `terrain3d.py`.
- **Snow line, forest and rock:** `prepare.py`.
- **Routes:** listed in `prepare.py` (keep in sync with `src/data/routes.ts`). Each line is approximate.
  It starts at about 2,000 m on the route's bearing and climbs to the summit, so it shows roughly
  which face a route is on, not the exact line. To draw a route exactly, replace its computed path
  with real coordinates.

## Government Camp, roads and ski trails

Roads, the Glade and Alpine ski trails, peaks and Government Camp's building footprints come from
OpenStreetMap (map data © OpenStreetMap contributors, ODbL). `osm-south.overpass` is the query:

```sh
curl -s --data-urlencode "data@scripts/hero/osm-south.overpass" https://overpass-api.de/api/interpreter \
  -o scripts/hero/.cache/osm-south.json      # the public server is sometimes busy: retry after a minute
python scripts/hero/features.py            # -> src/data/hero-features.json
```

The model draws today's footprints and street layout; the 1930s places on it (Battle Axe Inn, Hill's
Place, the ski areas and trails) are positioned from the Mount Hood Museum's *Guide to the Skisterical
Map* and OpenStreetMap, as their cards say.

## Landmarks

Landmarks on the model are listed in `src/data/landmarks.json`: name, a position (latitude/longitude,
`"at": "summit"`, `"point"`: a named place from `hero-features.json`, or `"trail"`: a ski trail), a one-line summary, the
source ids it rests on (from `src/content/sources.yaml`; the build fails on an unknown id) and an optional
timeline entry to link to. After adding or moving one, re-run `python scripts/hero/terrain3d.py` so its
position on the model is recomputed.

## Data

Elevation comes from [AWS Terrain Tiles](https://registry.opendata.aws/terrain-tiles/), which in
the US are derived from USGS 3DEP (public domain). Credit it as "Elevation: USGS 3DEP".

## Link-preview image

`public/og.jpg` (1200×630, used for `og:image`) is a frame of the live 3D model over the stage's sky.
`og-image.cjs` explains how to capture a frame and frames it: `node scripts/hero/og-image.cjs capture.png public/og.jpg`.
`public/apple-touch-icon.png` is `public/favicon.svg` rendered square at 180×180.

## Climbing routes

Each route's line runs through real-world waypoints listed in `route-waypoints.json`: OpenStreetMap
features (Illumination Saddle, Pulpit Rock, Horseshoe Rock, Hawkins Ridge, the glaciers and headwalls)
and, for the South Side and Cathedral Ridge, OpenStreetMap's own lines for the climb and the ridge.
`prepare.py` threads each route through its waypoints to the summit, and `terrain3d.py` drapes it on the
terrain. The lines are approximate (right face, right features), not surveys of the exact line.

To refresh the OpenStreetMap data, post `osm-routes.overpass` to the Overpass API and save the result as
`.cache/osm-routes.json`, then run `prepare.py` and `terrain3d.py`. After moving a route, copy the bearings
`prepare.py` computes (see `src/data/hero-terrain.json`) into `src/data/routes.ts`.

## The surrounding mountains (Expand)

The Expand button opens Rainier, St. Helens, Adams, Jefferson and the Three Sisters
(`src/scripts/range3d.ts`, loaded only then). Names, cards, sources, routes and landmarks are in
`src/data/range.json`; `range.py` turns them into `public/hero/range-<id>.png` and
`src/data/range-terrain.json`:

```sh
curl -s --data-urlencode "data@scripts/hero/osm-range.overpass" https://overpass-api.de/api/interpreter \
  -o scripts/hero/.cache/osm-range.json
python scripts/hero/range.py      # fetches elevation tiles as needed
```

The mountains stand on a map of the Pacific Northwest (`src/scripts/region3d.ts`), made by
`python scripts/hero/region.py`: terrain from the same elevation tiles, rivers from Natural Earth
(public domain), and a list of towns at the top of the script. Forest and dry country are approximate.

The map is to scale (`SPREAD` in `range3d.ts`) and each mountain is at its true position, drawn
1 / `SPREAD` (4) times larger than the map around it. Relief is drawn taller in the all-mountains view
(`WIDE_RELIEF` in `hero3d.ts`). Treelines (`treelineM`) and lines without an OpenStreetMap way are approximate.

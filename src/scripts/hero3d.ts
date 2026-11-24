/**
 * Interactive halftone model of Mount Hood for the homepage hero.
 *
 * The terrain comes from public/hero/terrain.png (height in R/G, forest in B) and the
 * routes from src/data/hero-terrain.json, both made by scripts/hero/terrain3d.py.
 * The look follows the Turboencabulator's comic shading: flat colour, mid-tones as a
 * 45° halftone in a slightly darker shade, ink dots only in deep shadow, with the light
 * fixed relative to the camera so the shading reads like a drawing as the model turns.
 * The detailed mountain sits in a wider, coarser forest that fades into the page.
 * Drag to turn, scroll or pinch to zoom; it slowly turns on its own unless the reader
 * prefers reduced motion.
 *
 * mountHero() returns a small controller (select a route, zoom, reset, toggles) used by
 * the stage UI in src/components/Hero.astro.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import terrain from "../data/hero-terrain.json";
import { routes as routeInfo } from "../data/routes";
import landmarkData from "../data/landmarks.json";
import features from "../data/hero-features.json";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { landmarkIcons, type LandmarkShape } from "../data/landmarkShapes";
import { buildLandmark } from "./landmark-models";

const EXAG = 1.8; // vertical exaggeration
const RINGS = 150;        // rings across the detailed mountain
const OUTER_RINGS = 70;   // rings across the surrounding forest
const SEGMENTS = 380;
// The opening view: from the south, above Government Camp, looking up past Timberline Lodge to the summit.
const START_BEARING = 196; // degrees clockwise from north that the camera sits at
const START_POLAR = 66; // degrees down from straight overhead (90 = level with the horizon)
// How much of the model the opening view fits, in mountain radii: START_HEIGHT from the middle to the
// top/bottom edge of the stage, and at least START_WIDTH to each side (which is what sets it on phones).
const START_HEIGHT = 1.15;
const START_WIDTH = 0.7;
const START_FOCUS = 0.42; // how far the view's centre sits from the mountain's core toward Government Camp

const PALETTE = {
  ink: "#1e2226", snow: "#f8f3e7", rock: "#c4b9a3", forest: "#7d977f", tree: "#45604f",
  first: "#b23426", reopened: "#c4800a", standard: "#4b4f53", inkAmt: 0.6,
  // landmark buildings
  stone: "#ece4d3", timber: "#c9a983", roof: "#6b5a51",
  // Government Camp: roads, ski trails, cars, snowbanks
  road: "#8b847b", trail: "#3f6e8c", car: "#3b3330", smoke: "#f4efe6",
};

// ---------------------------------------------------------------- shader
const vertex = /* glsl */ `
  attribute float aElev;
  attribute float aForest;
  varying vec3 vN;
  varying vec3 vW;
  varying float vElev;
  varying float vForest;
  void main() {
    mat4 m = modelMatrix;
    #ifdef USE_INSTANCING
      m = modelMatrix * instanceMatrix;
    #endif
    vec4 w = m * vec4(position, 1.0);
    vW = w.xyz;
    vN = normalize(mat3(m) * normal);
    vElev = aElev;
    vForest = aForest;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

const fragment = /* glsl */ `
  uniform vec3 uLightView; // light direction in view space (fixed relative to the camera)
  uniform vec3 uInk;
  uniform vec3 uBase;      // flat colour (trees)
  uniform vec3 uSnow;
  uniform vec3 uRock;
  uniform vec3 uForest;
  uniform float uMode;     // 0 terrain, 2 flat (trees)
  uniform float uDot;      // halftone cell size in device pixels
  uniform float uInkAmt;
  uniform float uContour;  // metres between contour lines
  uniform float uLines;    // contour line strength (0 = off)
  uniform float uFade0;    // km from the summit where the surroundings start to fade...
  uniform float uFade1;    // ...and where they are gone
  varying vec3 vN;
  varying vec3 vW;
  varying float vElev;
  varying float vForest;

  // 45° halftone screen: coverage 0..1 -> dot mask
  float dots(float amount) {
    vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / uDot;
    float r = sqrt(clamp(amount, 0.0, 1.0)) * 0.71;
    float aa = 0.9 / uDot;
    return 1.0 - smoothstep(r - aa, r + aa, length(fract(p) - 0.5));
  }

  float gridLine(float v, float width) {
    float d = abs(fract(v + 0.5) - 0.5) / max(fwidth(v), 1e-5);
    return 1.0 - smoothstep(0.0, width, d);
  }

  void main() {
    float dist = length(vW.xz);
    float fade = 1.0 - smoothstep(uFade0, uFade1, dist);
    if (fade <= 0.002) discard;

    vec3 n = normalize(vN);
    if (!gl_FrontFacing) n = -n;
    vec3 nView = normalize((viewMatrix * vec4(n, 0.0)).xyz);
    float diff = max(dot(nView, normalize(uLightView)), 0.0);
    float dark = 1.0 - (0.3 + 0.7 * diff);   // 0 (lit) .. 0.7 (facing away)

    vec3 base;
    if (uMode < 0.5) {
      float slope = 1.0 - n.y;
      float rock = smoothstep(0.42, 0.62, slope) * smoothstep(1700.0, 2100.0, vElev);
      base = mix(uSnow, uRock, rock * 0.85);
      base = mix(base, uForest, vForest * 0.85);
      dark += vForest * 0.1;
    } else {
      base = uBase;
    }

    // mid-tones: a darker shade of the surface colour; deep shadow: ink
    vec3 col = mix(base, base * 0.8, dots(smoothstep(0.16, 0.5, dark) * 0.85));
    col = mix(col, uInk, dots(smoothstep(0.42, 0.72, dark) * 0.5) * uInkAmt);

    if (uMode < 0.5) {
      float minor = gridLine(vElev / uContour, 1.0);
      float major = gridLine(vElev / (uContour * 5.0), 1.5);
      col = mix(col, uInk, max(minor * 0.14, major * 0.32) * (1.0 - vForest * 0.6) * uLines);
    } else {
      // ink the silhouette of the little trees
      vec3 V = normalize(cameraPosition - vW);
      col = mix(col, uInk, smoothstep(0.75, 0.95, 1.0 - abs(dot(n, V))) * 0.6);
    }
    gl_FragColor = vec4(col, fade);
  }
`;

function material(mode: number) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    transparent: true, // the surroundings fade into the page
    uniforms: {
      uLightView: { value: new THREE.Vector3(-0.45, 0.72, 0.52).normalize() },
      uInk: { value: new THREE.Color() },
      uBase: { value: new THREE.Color() },
      uSnow: { value: new THREE.Color() },
      uRock: { value: new THREE.Color() },
      uForest: { value: new THREE.Color() },
      uMode: { value: mode },
      uDot: { value: 4.4 },
      uInkAmt: { value: 0.75 },
      uContour: { value: 100 },
      uLines: { value: 1 },
      uFade0: { value: 9 },
      uFade1: { value: 18 },
    },
  });
}

// ---------------------------------------------------------------- data
async function loadHeights(url: string, n: number, R: number) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, n, n).data;
  const h = new Float32Array(n * n);
  const f = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    h[i] = px[i * 4] * 256 + px[i * 4 + 1];
    f[i] = px[i * 4 + 2] / 255;
  }
  // bilinear sample at x (east) / z (south) in km from the summit
  const sample = (arr: Float32Array, x: number, z: number) => {
    const u = Math.min(Math.max(((x / R + 1) / 2) * (n - 1), 0), n - 1.001);
    const v = Math.min(Math.max(((z / R + 1) / 2) * (n - 1), 0), n - 1.001);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const a = arr[j * n + i] * (1 - fu) + arr[j * n + i + 1] * fu;
    const b = arr[(j + 1) * n + i] * (1 - fu) + arr[(j + 1) * n + i + 1] * fu;
    return a * (1 - fv) + b * fv;
  };
  return { elev: (x: number, z: number) => sample(h, x, z), forest: (x: number, z: number) => sample(f, x, z) };
}

// ---------------------------------------------------------------- build
export interface HeroController {
  select(id: string | null): void;
  zoomBy(factor: number): void;
  reset(): void;
  setAutoRotate(on: boolean): void;
  setLabels(on: boolean): void;
  setTrees(on: boolean): void;
  setContours(on: boolean): void;
  /** Parts of the stage covered by page UI (header, open card), in CSS px. The model frames
   *  itself, and whatever is selected, in the part that's left. */
  setInsets(insets: Partial<Insets>): void;
}
export interface Insets { top: number; right: number; bottom: number; left: number }

export async function mountHero(
  container: HTMLElement,
  opts: {
    onSelect?: (id: string | null) => void;
    /** starting insets (see HeroController.setInsets) */
    insets?: Partial<Insets>;
    onInteract?: () => void;
    /** ids of the routes and landmarks on the side of the mountain facing the camera (sent when it changes) */
    onFacing?: (ids: string[]) => void;
  } = {},
): Promise<HeroController | undefined> {
  const canvas = document.createElement("canvas");
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  } catch {
    container.classList.add("no-webgl");
    return;
  }
  THREE.ColorManagement.enabled = false;
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // palette colours are used as-is
  const dpr = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(dpr);

  const R = terrain.radiusKm;
  const RF = terrain.farRadiusKm;
  const reduceMotionAtStart = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [near, far] = await Promise.all([
    loadHeights("/hero/terrain.png", terrain.size, R),
    loadHeights("/hero/terrain-far.png", terrain.farSize, RF),
  ]);
  // detailed data on the mountain, coarser data for the forest around it
  const elev = (x: number, z: number) => (Math.hypot(x, z) <= R ? near : far).elev(x, z);
  const forest = (x: number, z: number) => (Math.hypot(x, z) <= R ? near : far).forest(x, z);
  const baseElev = terrain.minElev - 350;
  const toY = (m: number) => ((m - baseElev) / 1000) * EXAG;
  const scene = new THREE.Scene();
  const mats = {
    terrain: material(0), tree: material(2), stone: material(2), timber: material(2), roof: material(2),
    road: material(2), trail: material(2), car: material(2), snowbank: material(2),
  };
  for (const m of Object.values(mats)) {
    m.uniforms.uFade0.value = R * 1.15;
    m.uniforms.uFade1.value = RF * 0.93;
  }

  // terrain: a polar grid, dense on the mountain and stretching out across the forest
  {
    const radius = (i: number) => (i <= RINGS ? (R * i) / RINGS : R * Math.pow(RF / R, (i - RINGS) / OUTER_RINGS));
    const verts: number[] = [], el: number[] = [], fo: number[] = [], idx: number[] = [];
    verts.push(0, toY(elev(0, 0)), 0); el.push(elev(0, 0)); fo.push(forest(0, 0));
    for (let i = 1; i <= RINGS + OUTER_RINGS; i++) {
      const r = radius(i);
      for (let j = 0; j < SEGMENTS; j++) {
        const a = (j / SEGMENTS) * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        const e = elev(x, z);
        verts.push(x, toY(e), z); el.push(e); fo.push(forest(x, z));
      }
    }
    const ring = (i: number, j: number) => 1 + (i - 1) * SEGMENTS + (j % SEGMENTS);
    for (let j = 0; j < SEGMENTS; j++) idx.push(0, ring(1, j + 1), ring(1, j));
    for (let i = 1; i < RINGS + OUTER_RINGS; i++)
      for (let j = 0; j < SEGMENTS; j++) {
        const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), d = ring(i + 1, j + 1);
        idx.push(a, b, c, b, d, c);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute("aElev", new THREE.Float32BufferAttribute(el, 1));
    g.setAttribute("aForest", new THREE.Float32BufferAttribute(fo, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, mats.terrain));
  }

  // trees: little firs scattered by the forest map
  let trees: THREE.InstancedMesh;
  {
    const cone = new THREE.ConeGeometry(0.085, 0.3, 5);
    cone.translate(0, 0.15, 0);
    const n = cone.attributes.position.count;
    for (const name of ["aElev", "aForest"]) cone.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    const rand = mulberry32(7);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const mats4: THREE.Matrix4[] = [];
    const R0 = R, R1 = RF * 0.88;
    // keep trees off the landmark buildings, the village, and the roads and ski trails
    const clearings = (terrain.landmarks ?? []).map((l) => [l.x, l.z, 0.3]);
    const [vx0, vz0, vx1, vz1] = features.village ?? [0, 0, -1, -1];
    const clearCells = new Set<string>(); // 50 m cells along roads and trails
    const cell = (x: number, z: number) => `${Math.round(x / 0.05)},${Math.round(z / 0.05)}`;
    for (const r of features.roads) if (r.kind !== "street") for (const [x, z] of r.pts) clearCells.add(cell(x, z));
    for (const segs of Object.values(features.trails)) for (const seg of segs) for (const [x, z] of seg) clearCells.add(cell(x, z));
    for (let k = 0; k < 200000 && mats4.length < 4200; k++) {
      // about 1,000 trees on the mountain itself, the rest spread through the forest around it
      const inner = mats4.length < 1000;
      const r = inner ? Math.sqrt(rand()) * R0 : Math.sqrt(R0 * R0 + rand() * (R1 * R1 - R0 * R0)), a = rand() * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (rand() > forest(x, z) * 0.75) continue;
      if (clearings.some(([lx, lz, rr]) => Math.hypot(x - lx, z - lz) < rr)) continue;
      if (x > vx0 - 0.08 && x < vx1 + 0.08 && z > vz0 - 0.08 && z < vz1 + 0.08) continue;
      if (clearCells.has(cell(x, z))) continue;
      const sc = (inner ? 0.7 : 0.55) + rand() * 0.6;
      p.set(x, toY(elev(x, z)) - 0.01, z);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * 6.28);
      s.set(sc, sc, sc);
      mats4.push(m.compose(p, q, s).clone());
    }
    trees = new THREE.InstancedMesh(cone, mats.tree, mats4.length);
    mats4.forEach((mm, i) => trees.setMatrixAt(i, mm));
    scene.add(trees);
  }

  // routes: raised lines with an ink casing, one material pair per route so a route can be highlighted
  type RouteObj = { id: string; kind: string; line: THREE.MeshBasicMaterial; ink: THREE.MeshBasicMaterial; meshes: THREE.Mesh[]; focus: THREE.Vector3 };
  const routeObjs = new Map<string, RouteObj>();
  // bearing: which side of the mountain the label is on (NaN = always shown); used to hide labels facing away
  // minor: village-scale labels, shown only once the camera is close
  const anchors: { id: string; el: HTMLElement; pos: THREE.Vector3; bearing: number; landmark?: boolean; minor?: boolean }[] = [];
  const labels = document.createElement("div");
  labels.className = "hero3d-labels";
  for (const r of terrain.routes) {
    const pts = r.points.map(([x, , z]) => new THREE.Vector3(x, toY(elev(x, z)) + 0.035, z));
    if (pts.length < 2) continue;
    const curve = new THREE.CatmullRomCurve3(pts);
    const len = curve.getLength();
    const obj: RouteObj = {
      id: r.id, kind: r.kind, meshes: [],
      line: new THREE.MeshBasicMaterial({ transparent: true }),
      ink: new THREE.MeshBasicMaterial({ side: THREE.BackSide, transparent: true }),
      focus: curve.getPointAt(0.45),
    };
    const [dash, gap] = r.kind === "reopened" ? [0.22, 0.15] : r.kind === "standard" ? [0.07, 0.14] : [len, 0];
    for (let t = 0; t < len; t += dash + gap) {
      const a = t / len, b = Math.min((t + dash) / len, 1);
      const seg = new THREE.CatmullRomCurve3(Array.from({ length: 12 }, (_, i) => curve.getPointAt(a + ((b - a) * i) / 11)));
      const segs = Math.max(4, Math.round(((b - a) * len) / 0.06));
      const line = new THREE.Mesh(new THREE.TubeGeometry(seg, segs, 0.03, 6), obj.line);
      const ink = new THREE.Mesh(new THREE.TubeGeometry(seg, segs, 0.052, 6), obj.ink);
      line.userData.route = ink.userData.route = r.id;
      obj.meshes.push(line, ink);
      scene.add(line, ink);
    }
    routeObjs.set(r.id, obj);
    const el = document.createElement("button");
    el.type = "button";
    el.className = `hero3d-label ${r.kind}`;
    el.innerHTML = `<i></i>${r.name}`;
    el.addEventListener("click", () => controller.select(selected === r.id ? null : r.id));
    labels.append(el);
    anchors.push({ id: r.id, el, pos: curve.getPointAt(0.12).add(new THREE.Vector3(0, 0.05, 0)), bearing: r.bearing });
  }
  // ---------------------------------------------------------------- landmarks
  // Small stylised models of each landmark, scaled up (~3x, like the trees) so they read at map
  // scale, shaded like the rest of the model with an ink outline. Click a model or its label to
  // fly there. The summit's label is the existing "Mount Hood" one.
  const landmarkPos = new Map<string, THREE.Vector3>();
  const landmarkMeshes: THREE.Mesh[] = [];
  const hullMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide });
  const SINK = 0.03; // walls run a little below ground so buildings sit into slopes

  const prep = <G extends THREE.BufferGeometry>(g: G) => {
    const n = g.attributes.position.count;
    for (const name of ["aElev", "aForest"]) g.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(n), 1));
    return g;
  };
  // triangular roof, ridge along x, base at y = 0
  const gable = (width: number, height: number, length: number) => {
    const shape = new THREE.Shape([new THREE.Vector2(-width / 2, 0), new THREE.Vector2(width / 2, 0), new THREE.Vector2(0, height)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
    g.translate(0, 0, -length / 2);
    g.rotateY(Math.PI / 2);
    return g;
  };
  // walls: a box whose bottom sits SINK below the ground and top at height h
  const walls = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h + SINK, d).translate(0, (h - SINK) / 2, 0);

  type Part = [THREE.BufferGeometry, THREE.ShaderMaterial, number, number, number, number?];
  const build = (id: string, parts: Part[], at: THREE.Vector3, scale = 1) => {
    const group = new THREE.Group();
    group.position.copy(at);
    group.scale.setScalar(scale);
    for (const [geo, mat, x, y, z, ry = 0] of parts) {
      prep(geo);
      const mesh = new THREE.Mesh(geo, mat);
      const hull = new THREE.Mesh(geo, hullMat);
      for (const m of [mesh, hull]) {
        m.position.set(x, y, z);
        m.rotation.y = ry;
      }
      hull.scale.setScalar(1.08);
      mesh.userData.route = id; // picked like a route line
      landmarkMeshes.push(mesh);
      group.add(hull, mesh);
    }
    scene.add(group);
    return group;
  };
  const ground = (x: number, z: number) => toY(elev(x, z));

  // scale: on top of the ~3x already in the sizes below (the village stays 1 so each house stays on its own ground)
  const models: Record<string, (x: number, z: number) => { parts: Part[]; top: number; scale?: number }> = {
    // central six-sided stone hall with a tall roof and chimney; two long gabled wings
    "timberline-lodge": () => {
      const parts: Part[] = [
        [new THREE.CylinderGeometry(0.07, 0.07, 0.075 + SINK, 6).translate(0, (0.075 - SINK) / 2, 0), mats.stone, 0, 0, 0],
        [new THREE.ConeGeometry(0.09, 0.11, 6).translate(0, 0.055, 0), mats.roof, 0, 0.075, 0],
        [new THREE.BoxGeometry(0.026, 0.07, 0.026).translate(0, 0.035, 0), mats.stone, 0, 0.13, 0.01],
      ];
      for (const side of [-1, 1]) {
        const x = side * 0.16, ry = side * -0.14; // wings angle slightly back
        parts.push([walls(0.2, 0.05, 0.058), mats.timber, x, 0, 0.012, ry]);
        parts.push([gable(0.072, 0.055, 0.21), mats.roof, x, 0.05, 0.012, ry]);
      }
      return { parts, top: 0.2, scale: 1.5 };
    },
    // small stone hut with a steep roof and chimney
    "silcox-hut": () => ({
      parts: [
        [walls(0.08, 0.04, 0.052), mats.stone, 0, 0, 0],
        [gable(0.064, 0.05, 0.09), mats.roof, 0, 0.04, 0],
        [new THREE.BoxGeometry(0.016, 0.045, 0.016).translate(0, 0.0225, 0), mats.stone, 0.026, 0.06, 0],
      ],
      top: 0.1,
      scale: 1.3,
    }),
    // timber inn with a gabled roof and a smaller wing
    "cloud-cap-inn": () => ({
      parts: [
        [walls(0.1, 0.045, 0.066), mats.timber, 0, 0, 0],
        [gable(0.078, 0.052, 0.11), mats.roof, 0, 0.045, 0],
        [walls(0.05, 0.035, 0.05), mats.timber, 0.03, 0, 0.056],
        [gable(0.058, 0.04, 0.06), mats.roof, 0.03, 0.035, 0.056, Math.PI / 2],
      ],
      top: 0.11,
      scale: 1.3,
    }),
    // Battle Axe Inn: the village's largest building, a rustic log hotel; its 50-by-90-foot
    // Rec Hall was later joined to the main lodge
    "battle-axe-inn": () => ({
      parts: [
        [walls(0.15, 0.06, 0.08), mats.timber, 0, 0, 0],
        [gable(0.094, 0.07, 0.165), mats.roof, 0, 0.06, 0],
        [new THREE.BoxGeometry(0.026, 0.11, 0.026).translate(0, 0.055, 0), mats.stone, 0.05, 0.02, 0.04],
        [walls(0.08, 0.045, 0.13), mats.timber, -0.035, 0, -0.1],
        [gable(0.09, 0.05, 0.14), mats.roof, -0.035, 0.045, -0.1, Math.PI / 2],
      ],
      top: 0.14,
      scale: 1.2,
    }),
    // Hill's Place: a small roadside café
    "hills-place": () => ({
      parts: [
        [walls(0.07, 0.035, 0.05), mats.timber, 0, 0, 0],
        [gable(0.06, 0.035, 0.078), mats.roof, 0, 0.035, 0],
      ],
      top: 0.08,
      scale: 1.2,
    }),
    // Mazama Lodge: a big club lodge with a steep roof
    "mazama-lodge": () => ({
      parts: [
        [walls(0.13, 0.055, 0.07), mats.stone, 0, 0, 0],
        [gable(0.084, 0.07, 0.14), mats.roof, 0, 0.055, 0],
        [new THREE.BoxGeometry(0.022, 0.1, 0.022).translate(0, 0.05, 0), mats.stone, -0.04, 0.03, 0.02],
      ],
      top: 0.13,
      scale: 1.2,
    }),
    // Multorpor ski jump on the north-facing slope, just east of the lodge: an inrun ramp on trestles
    multorpor: () => {
      const parts: Part[] = [];
      const steep = 0.5; // ramp tilt (rad), dropping toward the north
      parts.push([new THREE.BoxGeometry(0.03, 0.008, 0.32).rotateX(-steep), mats.timber, 0.16, 0.09, 0]);
      for (const t of [-0.12, -0.04, 0.04, 0.12]) {
        const h = Math.max(0.09 + t * Math.tan(steep), 0.01);
        parts.push([new THREE.BoxGeometry(0.008, h, 0.008).translate(0, h / 2, 0), mats.timber, 0.16, 0, t]);
      }
      return { parts, top: 0.2, scale: 1.2 };
    },
  };

  // where each landmark is: lat/lon (via terrain3d.py), a named OpenStreetMap point, or a ski trail
  const featurePoints = features.points as Record<string, number[]>;
  const featureTrails = features.trails as Record<string, number[][][]>;
  const locate = (l: (typeof landmarkData)[number]): [number, number] | null => {
    const p = terrain.landmarks?.find((x) => x.id === l.id);
    if (p) return [p.x, p.z];
    if ("point" in l && l.point && featurePoints[l.point]) return featurePoints[l.point] as [number, number];
    if ("trail" in l && l.trail && featureTrails[l.trail]) {
      const pts = featureTrails[l.trail].flat();
      return pts[Math.floor(pts.length * 0.45)] as [number, number];
    }
    return null;
  };

  for (const info of landmarkData) {
    const at = locate(info);
    if (!at) continue;
    const id = info.id;
    const model = models[id];
    const [mx, mz] = at;
    if (model) {
      const { parts, top, scale = 1 } = model(mx, mz);
      build(id, parts, new THREE.Vector3(mx, ground(mx, mz) - SINK / 2, mz), scale);
      if (id !== "summit") landmarkPos.set(id, new THREE.Vector3(mx, ground(mx, mz) + top * scale, mz));
    }
    if (id === "summit") continue; // labelled by the "Mount Hood" label below
    const isTrail = "trail" in info;
    const el = document.createElement("button");
    el.type = "button";
    el.className = `hero3d-label landmark${isTrail ? " trail" : ""}`;
    el.innerHTML = `<i></i>${info.name}`;
    el.addEventListener("click", () => controller.select(selected === id ? null : id));
    labels.append(el);
    const bearing = (THREE.MathUtils.radToDeg(Math.atan2(mx, -mz)) + 360) % 360;
    const pos = landmarkPos.get(id) ?? new THREE.Vector3(mx, ground(mx, mz) + 0.1, mz);
    landmarkPos.set(id, pos);
    const minor = "point" in info || isTrail;
    anchors.push({ id, el, pos: pos.clone().add(new THREE.Vector3(0, 0.04, 0)), bearing, landmark: true, minor });
  }

  // ---------------------------------------------------------------- Government Camp
  // Roads and ski trails draped on the terrain, the village's buildings from their real
  // footprints, cars along the loop road, and chimney smoke. (Map data © OpenStreetMap contributors.)
  // a strip of the given width following the ground along a polyline
  const ribbon = (pts: number[][], width: number, lift: number, offset = 0) => {
    const pos: number[] = [], nor: number[] = [], idx: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, z] = pts[i];
      const [px, pz] = pts[Math.max(0, i - 1)], [nx, nz] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = nx - px, dz = nz - pz;
      const l = Math.hypot(dx, dz) || 1;
      dx /= l; dz /= l;
      for (const side of [1, -1]) {
        const o = offset + (side * width) / 2;
        const X = x - dz * o, Z = z + dx * o;
        pos.push(X, ground(X, Z) + lift, Z);
        nor.push(0, 1, 0);
      }
      if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setIndex(idx);
    return prep(g);
  };
  // split a polyline into dashes (km)
  const dashes = (pts: number[][], dash: number, gap: number) => {
    const out: number[][][] = [];
    let cur: number[][] = [pts[0]], run = 0, on = true;
    for (let i = 1; i < pts.length; i++) {
      run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (on) cur.push(pts[i]);
      if (run >= (on ? dash : gap)) {
        if (on && cur.length > 1) out.push(cur);
        on = !on; run = 0; cur = [pts[i]];
      }
    }
    if (on && cur.length > 1) out.push(cur);
    return out;
  };

  const roadWidth: Record<string, number> = { highway: 0.045, loop: 0.05, historic: 0.028, street: 0.022 };
  const roadGeos: THREE.BufferGeometry[] = [], bankGeos: THREE.BufferGeometry[] = [];
  for (const r of features.roads) {
    if (r.pts.length < 2) continue;
    const w = roadWidth[r.kind] ?? 0.02;
    roadGeos.push(ribbon(r.pts, w, 0.012));
    if (r.kind === "loop") for (const side of [1, -1]) bankGeos.push(ribbon(r.pts, 0.014, 0.016, side * (w / 2 + 0.009)));
  }
  if (roadGeos.length) scene.add(new THREE.Mesh(mergeGeometries(roadGeos), mats.road));
  if (bankGeos.length) scene.add(new THREE.Mesh(mergeGeometries(bankGeos), mats.snowbank));

  // ski trails: dashed blue, clickable
  for (const [id, segs] of Object.entries(featureTrails)) {
    if (!landmarkData.some((l) => l.id === id)) continue;
    const geos = segs.flatMap((seg) => dashes(seg, 0.07, 0.045).map((d) => ribbon(d, 0.03, 0.02)));
    if (!geos.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(geos), mats.trail);
    mesh.userData.route = id;
    landmarkMeshes.push(mesh);
    scene.add(mesh);
  }

  // village buildings from footprints (drawn ~2.2x like the rest), skipping the landmark sites
  const villageSkip = ["battle-axe-inn", "hills-place", "mazama-lodge"].map((id) => landmarkPos.get(id)).filter(Boolean) as THREE.Vector3[];
  const wallGeos: THREE.BufferGeometry[] = [], roofGeos: THREE.BufferGeometry[] = [], hullGeos: THREE.BufferGeometry[] = [];
  const chimneyTops: THREE.Vector3[] = [];
  const S = 2.2, q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  features.buildings.forEach((b, i) => {
    if (villageSkip.some((v) => Math.hypot(v.x - b.x, v.z - b.z) < 0.09)) return;
    const w = Math.max(b.w * S, 0.03), d = Math.max(b.d * S, 0.025), h = 0.025 + Math.min(w, d) * 0.35;
    const y = ground(b.x, b.z) - SINK / 2;
    // ridge along the longer side
    const along = w >= d;
    const roofW = (along ? d : w) + 0.012, roofL = (along ? w : d) + 0.012;
    q.setFromAxisAngle(up, -b.a);
    const m4 = new THREE.Matrix4().compose(new THREE.Vector3(b.x, y, b.z), q, new THREE.Vector3(1, 1, 1));
    wallGeos.push(prep(walls(w, h, d)).applyMatrix4(m4));
    roofGeos.push(prep(gable(roofW, roofW * 0.6, roofL).rotateY(along ? 0 : Math.PI / 2).translate(0, h, 0)).applyMatrix4(m4));
    // bolder ink outline for the village: hulls scaled about each building's centre
    const hm = new THREE.Matrix4().compose(new THREE.Vector3(b.x, y, b.z), q, new THREE.Vector3(1.14, 1.14, 1.14));
    hullGeos.push(prep(walls(w, h, d)).applyMatrix4(hm));
    if (i % 20 === 0) chimneyTops.push(new THREE.Vector3(b.x, y + h + roofW * 0.6 + 0.01, b.z));
  });
  if (wallGeos.length) {
    const vWalls = new THREE.Mesh(mergeGeometries(wallGeos.map((g) => g.toNonIndexed())), mats.timber);
    const vRoofs = new THREE.Mesh(mergeGeometries(roofGeos.map((g) => (g.index ? g.toNonIndexed() : g))), mats.roof);
    const vHull = new THREE.Mesh(mergeGeometries(hullGeos.map((g) => g.toNonIndexed())), hullMat);
    for (const m of [vWalls, vRoofs]) { m.userData.route = "government-camp"; landmarkMeshes.push(m); }
    scene.add(vHull, vWalls, vRoofs);
  }

  // parked cars along both sides of the loop road, as in photos of busy 1930s ski weekends
  {
    const carGeo = prep(new THREE.BoxGeometry(0.03, 0.014, 0.014).translate(0, 0.007, 0));
    const spots: THREE.Matrix4[] = [];
    for (const r of features.roads) {
      if (r.kind !== "loop") continue;
      let run = 0;
      for (let i = 1; i < r.pts.length && spots.length < 160; i++) {
        const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i];
        const seg = Math.hypot(bx - ax, bz - az) || 1;
        run += seg;
        if (run < 0.05) continue;
        run = 0;
        const dx = (bx - ax) / seg, dz = (bz - az) / seg, ang = Math.atan2(-dz, dx);
        for (const side of [1, -1]) {
          const o = side * (roadWidth.loop / 2 - 0.006);
          const x = bx - dz * o, z = bz + dx * o;
          spots.push(new THREE.Matrix4().compose(new THREE.Vector3(x, ground(x, z) + 0.012, z), new THREE.Quaternion().setFromAxisAngle(up, ang), new THREE.Vector3(1, 1, 1)));
        }
      }
    }
    if (spots.length) {
      const cars = new THREE.InstancedMesh(carGeo, mats.car, spots.length);
      spots.forEach((m, k) => cars.setMatrixAt(k, m));
      scene.add(cars);
    }
  }

  // chimney smoke: a few puffs rising and fading from lodge and village chimneys
  const smokeMat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
  const puffs: { mesh: THREE.Mesh; base: THREE.Vector3; phase: number; mat: THREE.MeshBasicMaterial }[] = [];
  if (!reduceMotionAtStart) {
    const lodgeChimney = landmarkPos.get("timberline-lodge")?.clone().add(new THREE.Vector3(0, 0.02, 0.015));
    const innChimney = landmarkPos.get("battle-axe-inn")?.clone().add(new THREE.Vector3(0.06, 0, 0.05));
    const mazamaChimney = landmarkPos.get("mazama-lodge")?.clone().add(new THREE.Vector3(-0.05, 0, 0.025));
    const sources = [lodgeChimney, innChimney, mazamaChimney, ...chimneyTops].filter(Boolean) as THREE.Vector3[];
    const puffGeo = new THREE.IcosahedronGeometry(1, 1);
    for (const base of sources) {
      for (let k = 0; k < 3; k++) {
        const mat = smokeMat.clone();
        const mesh = new THREE.Mesh(puffGeo, mat);
        scene.add(mesh);
        puffs.push({ mesh, base, phase: k / 3 + Math.random() * 0.1, mat });
      }
    }
  }
  const stepSmoke = (t: number) => {
    for (const p of puffs) {
      const k = (t * 0.18 + p.phase) % 1;
      p.mesh.position.set(p.base.x + 0.05 * k, p.base.y + 0.16 * k, p.base.z - 0.02 * k);
      p.mesh.scale.setScalar(0.008 + 0.02 * k);
      p.mat.opacity = 0.4 * (1 - k) * Math.min(1, k * 6);
      p.mat.color.copy(smokeMat.color);
    }
  };

  const summitEl = document.createElement("div");
  summitEl.className = "hero3d-summit";
  summitEl.innerHTML = `<strong>Mount Hood</strong><span>11,249 ft</span>`;
  labels.append(summitEl);
  const summitPos = new THREE.Vector3(0, toY(terrain.summitElev) + 0.25, 0);
  if (landmarkData.some((l) => l.id === "summit")) {
    landmarkPos.set("summit", summitPos.clone());
    summitEl.classList.add("selectable");
    summitEl.setAttribute("role", "button");
    summitEl.tabIndex = 0;
    const pick = () => controller.select(selected === "summit" ? null : "summit");
    summitEl.addEventListener("click", pick);
    summitEl.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  }

  // ---------------------------------------------------------------- colours
  const applyPalette = () => {
    const p = PALETTE;
    const set = (m: THREE.ShaderMaterial, base: string) => {
      m.uniforms.uInk.value.set(p.ink);
      m.uniforms.uBase.value.set(base);
      m.uniforms.uSnow.value.set(p.snow);
      m.uniforms.uRock.value.set(p.rock);
      m.uniforms.uForest.value.set(p.forest);
      m.uniforms.uInkAmt.value = p.inkAmt;
      m.uniforms.uDot.value = 4.4 * dpr;
    };
    set(mats.terrain, p.snow);
    set(mats.tree, p.tree);
    set(mats.stone, p.stone);
    set(mats.timber, p.timber);
    set(mats.roof, p.roof);
    set(mats.road, p.road);
    set(mats.trail, p.trail);
    set(mats.car, p.car);
    set(mats.snowbank, p.snow);
    smokeMat.color.set(p.smoke);
    const kindColor: Record<string, string> = { "first-ascent": p.first, reopened: p.reopened, standard: p.standard };
    for (const o of routeObjs.values()) {
      o.line.color.set(kindColor[o.kind]);
      o.ink.color.set(p.ink);
    }
    hullMat.color.set(p.ink);
    render();
  };

  // ---------------------------------------------------------------- camera
  const camera = new THREE.PerspectiveCamera(26, 1, 0.3, 600);
  const controls = new OrbitControls(camera, canvas);
  controls.enableZoom = true;
  controls.zoomSpeed = 0.8;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.minPolarAngle = THREE.MathUtils.degToRad(50);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(82);
  controls.rotateSpeed = 0.6;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = -0.35;
  // Every touch on the model turns, tilts or zooms it; the page scrolls from the title band along the
  // bottom of the stage (see .stage-title in Hero.astro) and the header.
  canvas.style.touchAction = "none";
  let wantRotate = !reduceMotion;
  let resumeTimer = 0;
  controls.addEventListener("start", () => { controls.autoRotate = false; tween = null; clearTimeout(resumeTimer); opts.onInteract?.(); });
  controls.addEventListener("end", () => {
    if (wantRotate && !selected) resumeTimer = window.setTimeout(() => (controls.autoRotate = wantRotate && !selected), 6000);
  });

  // The wheel zooms only while the whole stage is on screen. Zooming out past the full
  // view (or scrolling while the stage is partly scrolled away) scrolls the page instead.
  container.addEventListener("wheel", (e) => {
    const top = container.getBoundingClientRect().top;
    const atMax = camera.position.distanceTo(controls.target) >= controls.maxDistance * 0.995;
    if (top < -4 || (e.deltaY > 0 && atMax)) e.stopPropagation();
  }, { capture: true, passive: true });

  // Click (not drag) on a route line selects it.
  const ray = new THREE.Raycaster();
  let down: { x: number; y: number } | null = null;
  canvas.addEventListener("pointerdown", (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("pointerup", (e) => {
    const start = down;
    down = null; // only a press that started on the map counts
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
    const r = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const meshes = [...[...routeObjs.values()].flatMap((o) => o.meshes), ...landmarkMeshes];
    const hit = ray.intersectObjects(meshes, false)[0];
    // a click on a route selects it; a click on the map anywhere else closes the selection
    if (hit) controller.select(hit.object.userData.route);
    else if (selected) controller.select(null);
  });
  // Show a pointer over route lines so it's clear they can be clicked.
  let hoverQueued = false;
  canvas.addEventListener("pointermove", (e) => {
    if (hoverQueued || e.buttons) return;
    hoverQueued = true;
    requestAnimationFrame(() => {
      hoverQueued = false;
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const hit = ray.intersectObjects([...[...routeObjs.values()].flatMap((o) => o.meshes), ...landmarkMeshes], false)[0];
      canvas.style.cursor = hit ? "pointer" : "";
    });
  });
  controls.addEventListener("change", () => render());

  const peak = toY(terrain.summitElev);
  const home = new THREE.Vector3(0, peak * 0.36, 0);
  const HOME_POLAR = THREE.MathUtils.degToRad(62);
  let fitDist = 0;
  // where the camera looks and sits on load and on reset (fitDist must be known)
  const startTarget = () => {
    const camp = landmarkPos.get("government-camp");
    return camp ? home.clone().lerp(camp, START_FOCUS) : home.clone();
  };
  let startDist = 0;
  const startView = () => new THREE.Spherical(startDist, THREE.MathUtils.degToRad(START_POLAR), bearingToTheta(START_BEARING));
  // OrbitControls measures theta from +z toward +x; bearings run clockwise from north (-z).
  const bearingToTheta = (deg: number) => Math.PI - THREE.MathUtils.degToRad(deg);

  // ---------------------------------------------------------------- camera moves
  let tween: { t0: number; dur: number; fromT: THREE.Vector3; toT: THREE.Vector3; from: THREE.Spherical; to: THREE.Spherical } | null = null;
  const flyTo = (target: THREE.Vector3, sph: THREE.Spherical) => {
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
    // turn the short way round
    let dTheta = sph.theta - from.theta;
    dTheta = ((dTheta + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    const to = new THREE.Spherical(sph.radius, sph.phi, from.theta + dTheta);
    tween = { t0: performance.now(), dur: reduceMotion ? 0 : 1300, fromT: controls.target.clone(), toT: target.clone(), from, to };
    render();
  };
  const stepTween = () => {
    if (!tween) return;
    const k = tween.dur ? Math.min((performance.now() - tween.t0) / tween.dur, 1) : 1;
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    controls.target.lerpVectors(tween.fromT, tween.toT, e);
    const s = new THREE.Spherical(
      THREE.MathUtils.lerp(tween.from.radius, tween.to.radius, e),
      THREE.MathUtils.lerp(tween.from.phi, tween.to.phi, e),
      THREE.MathUtils.lerp(tween.from.theta, tween.to.theta, e),
    );
    camera.position.setFromSpherical(s).add(controls.target);
    if (k >= 1) tween = null;
  };

  let selected: string | null = null;
  const highlight = () => {
    // routes fade only while a route is selected (not a landmark)
    const routeSelected = selected !== null && routeObjs.has(selected);
    for (const o of routeObjs.values()) {
      const dim = routeSelected && o.id !== selected;
      o.line.opacity = o.ink.opacity = dim ? 0.18 : 1;
    }
    labels.classList.toggle("has-selection", selected !== null);
    for (const a of anchors) a.el.classList.toggle("active", a.id === selected);
    summitEl.classList.toggle("active", selected === "summit");
  };

  const controller: HeroController = {
    select(id) {
      if (id) opts.onInteract?.();
      selected = id && (routeObjs.has(id) || landmarkPos.has(id)) ? id : null;
      highlight();
      opts.onSelect?.(selected);
      clearTimeout(resumeTimer);
      if (!selected) {
        controls.autoRotate = wantRotate;
        return;
      }
      controls.autoRotate = false;
      if (landmarkPos.has(selected)) {
        // look at the landmark from its own side of the mountain (the summit: from where we are)
        const pos = landmarkPos.get(selected)!;
        const theta = selected === "summit"
          ? new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target)).theta
          : bearingToTheta((THREE.MathUtils.radToDeg(Math.atan2(pos.x, -pos.z)) + 360) % 360);
        // aim close to the landmark itself so it lands near the middle of the view
        flyTo(home.clone().lerp(pos, 0.9), new THREE.Spherical(fitDist * 0.5, THREE.MathUtils.degToRad(62), theta));
        return;
      }
      const o = routeObjs.get(selected)!;
      const a = anchors.find((x) => x.id === selected)!;
      const target = home.clone().lerp(o.focus, 0.55);
      flyTo(target, new THREE.Spherical(fitDist * 0.52, THREE.MathUtils.degToRad(64), bearingToTheta(a.bearing)));
    },
    zoomBy(f) {
      const off = camera.position.clone().sub(controls.target);
      const r = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance);
      flyTo(controls.target, new THREE.Spherical().setFromVector3(off.setLength(r)));
    },
    reset() {
      selected = null;
      highlight();
      opts.onSelect?.(null);
      controls.autoRotate = wantRotate;
      flyTo(startTarget(), startView());
    },
    setAutoRotate(on) {
      wantRotate = on;
      controls.autoRotate = on && !selected;
    },
    setLabels(on) { labels.classList.toggle("off", !on); },
    setTrees(on) { trees.visible = on; render(); },
    setContours(on) { mats.terrain.uniforms.uLines.value = on ? 1 : 0; render(); },
    setInsets(next) {
      const topChanged = next.top !== undefined && next.top !== insets.top;
      Object.assign(insets, next);
      if (topChanged) frame(); // the opening view's fit depends on the space under the header
      offsetMoving = true;
    },
  };

  // The picture is shifted (a view offset) so the model centres in the part of the stage that page
  // UI leaves free: up a little for the title along the bottom, down for the header over the top,
  // and away from an open card. It glides there when that changes.
  const insets: Insets = { top: 0, right: 0, bottom: 0, left: 0, ...opts.insets };
  const offset = { x: 0, y: 0 };
  let offsetMoving = false;
  const offsetTarget = () => {
    const h = container.clientHeight;
    return { x: -(insets.left - insets.right) / 2, y: h * 0.07 - (insets.top - insets.bottom) / 2 };
  };
  const applyOffset = () => {
    const w = container.clientWidth, h = container.clientHeight;
    camera.setViewOffset(w, h, offset.x, offset.y, w, h);
    camera.updateProjectionMatrix();
  };
  const stepOffset = () => {
    const t = offsetTarget();
    const k = reduceMotion ? 1 : 0.14;
    offset.x += (t.x - offset.x) * k;
    offset.y += (t.y - offset.y) * k;
    if (Math.abs(t.x - offset.x) < 0.5 && Math.abs(t.y - offset.y) < 0.5) { offset.x = t.x; offset.y = t.y; offsetMoving = false; }
    applyOffset();
  };

  const frame = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    Object.assign(offset, offsetTarget());
    applyOffset();
    const polar = HOME_POLAR;
    // fit the opening view to the space below the header (as if the stage were that tall)
    const vfov0 = THREE.MathUtils.degToRad(camera.fov);
    const vfov = 2 * Math.atan(Math.tan(vfov0 / 2) * Math.max(0.4, (h - insets.top) / h));
    const hfov = 2 * Math.atan(Math.tan(vfov0 / 2) * camera.aspect);
    const halfV = ((R * 2 * Math.cos(polar) + peak * Math.sin(polar)) / 2) * 1.12;
    const halfH = R * 1.0;
    const dist = Math.max(halfV / Math.tan(vfov / 2), halfH / Math.tan(hfov / 2));
    const first = fitDist === 0;
    fitDist = dist;
    startDist = Math.min(dist, Math.max((R * START_HEIGHT) / Math.tan(vfov / 2), (R * START_WIDTH) / Math.tan(hfov / 2)));
    controls.maxDistance = dist * 1.15;
    controls.minDistance = dist * 0.1; // close enough to pick out Government Camp's buildings
    if (first) {
      controls.target.copy(startTarget());
      camera.position.setFromSpherical(startView()).add(controls.target);
    } else if (!selected) {
      camera.position.sub(controls.target).clampLength(controls.minDistance, dist).add(controls.target);
    }
    camera.updateProjectionMatrix();
    controls.update();
    render();
  };

  // ---------------------------------------------------------------- render loop
  const v = new THREE.Vector3();
  const place = (el: HTMLElement, pos: THREE.Vector3, show: boolean) => {
    v.copy(pos).project(camera);
    const x = (v.x * 0.5 + 0.5) * container.clientWidth, y = (-v.y * 0.5 + 0.5) * container.clientHeight;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    el.classList.toggle("hidden", !show);
  };
  let queued = false;
  let lastFacing = "";
  function render() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      renderer.render(scene, camera);
      // only label routes on the side facing the camera
      const camBearing = (THREE.MathUtils.radToDeg(Math.atan2(camera.position.x, -camera.position.z)) + 360) % 360;
      const facing: string[] = [];
      for (const a of anchors) {
        const diff = Math.abs(((a.bearing - camBearing + 540) % 360) - 180);
        // landmarks lower on the flanks stay visible a little further round than route labels
        const faces = diff < (a.landmark ? 95 : 75);
        if (faces) facing.push(a.id);
        const near = !a.minor || camera.position.distanceTo(a.pos) < fitDist * 0.45;
        place(a.el, a.pos, selected ? a.id === selected : near && faces);
      }
      place(summitEl, summitPos, true);
      const key = facing.join(",");
      if (key !== lastFacing) { lastFacing = key; opts.onFacing?.(facing); }
      declutter();
    });
  }

  // Nudge overlapping labels apart (lower one moves down).
  function declutter() {
    const shown = anchors.map((a) => a.el).filter((el) => !el.classList.contains("hidden"));
    for (const el of shown) el.style.marginTop = "";
    const boxes = shown
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el, top0: r.top, top: r.top, left: r.left, right: r.right, h: r.height };
      })
      .sort((a, b) => a.top - b.top);
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      for (let j = 0; j < i; j++) {
        const a = boxes[j];
        if (b.left < a.right + 4 && b.right > a.left - 4 && b.top < a.top + a.h + 4 && b.top + b.h > a.top - 4)
          b.top = a.top + a.h + 4;
      }
    }
    for (const b of boxes) if (b.top !== b.top0) b.el.style.marginTop = `${(b.top - b.top0).toFixed(1)}px`;
  }

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(container);
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden) return;
    if (tween) { stepTween(); render(); }
    if (offsetMoving) { stepOffset(); render(); }
    if (puffs.length) { stepSmoke(performance.now() / 1000); render(); }
    controls.update();
  });

  container.append(canvas, labels);
  new ResizeObserver(frame).observe(container);
  applyPalette();
  frame();
  requestAnimationFrame(() => container.classList.add("ready"));
  return controller;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

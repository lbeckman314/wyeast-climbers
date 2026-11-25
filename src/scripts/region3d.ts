/**
 * The Pacific Northwest under the mountains in the all-mountains view: terrain, sea, rivers,
 * places and a scale bar, from public/hero/region*.png and src/data/region.json (made by
 * scripts/hero/region.py). It is to scale: one world unit is 1 / SPREAD km, and every mountain
 * stands on its true position. The mountains themselves are drawn 1 / SPREAD times larger.
 */
import * as THREE from "three";
import region from "../data/region.json";
import { SPREAD } from "./range3d";

const RELIEF = 0.75; // world units per km of height
const NX = 260, NZ = 292;
const SCALE_MILES = 50;

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  void main() {
    vUv = uv; vN = normal; vW = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const fragment = /* glsl */ `
  uniform sampler2D uLand;   // B: forest
  uniform sampler2D uWater;  // R: sea, G: rivers
  uniform vec3 uInk, uGrass, uDry, uForest, uSnow, uSea;
  uniform vec3 uLightView;
  uniform float uDot, uOpacity;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vW;
  float dots(float amount) {
    vec2 p = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / uDot;
    float r = sqrt(clamp(amount, 0.0, 1.0)) * 0.71;
    float aa = 0.9 / uDot;
    return 1.0 - smoothstep(r - aa, r + aa, length(fract(p) - 0.5));
  }
  void main() {
    // the map fades into the page at its edges
    vec2 e = min(vUv, 1.0 - vUv);
    float fade = smoothstep(0.0, 0.16, e.x) * smoothstep(0.0, 0.12, e.y) * uOpacity;
    if (fade <= 0.002) discard;
    vec3 water = texture2D(uWater, vUv).rgb;
    float forest = texture2D(uLand, vUv).b;
    vec3 n = normalize((viewMatrix * vec4(normalize(vN), 0.0)).xyz);
    float dark = 1.0 - (0.3 + 0.7 * max(dot(n, normalize(uLightView)), 0.0));
    vec3 col = mix(uGrass, uDry, smoothstep(0.50, 0.68, vUv.x));
    col = mix(col, uForest, forest * 0.62);
    col = mix(col, uSnow, smoothstep(1700.0, 2100.0, vW.y / ${RELIEF.toFixed(2)} * 1000.0) * 0.8);
    col = mix(col, col * 0.82, dots(smoothstep(0.2, 0.5, dark)));
    float river = smoothstep(0.25, 0.6, water.g);
    float sea = smoothstep(0.45, 0.55, water.r);
    col = mix(col, uSea * 0.82, river);
    col = mix(col, uSea, sea);
    // an ink line along the coast
    float d = abs(water.r - 0.5) / max(fwidth(water.r), 1e-4);
    col = mix(col, uInk, (1.0 - smoothstep(0.4, 1.3, d)) * 0.55);
    gl_FragColor = vec4(col, fade);
  }
`;

export interface Place { name: string; kind: string; pos: THREE.Vector3 }
export interface Region {
  mesh: THREE.Mesh;
  bar: THREE.Group;
  material: THREE.ShaderMaterial;
  places: Place[];
  /** height of the map around a mountain, which its edges settle onto */
  groundAt(x: number, z: number): number;
}

async function pixels(url: string) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = region.width; c.height = region.height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return { canvas: c, px: ctx.getImageData(0, 0, c.width, c.height).data };
}

/** spots: the mountains' centres and radii (world units); the map is level beneath them */
export async function buildRegion(spots: { x: number; z: number; r: number }[], look: {
  ink: string; grass: string; dry: string; forest: string; snow: string; sea: string; dot: number; light: THREE.Vector3;
}): Promise<Region> {
  const [land, water] = await Promise.all([pixels("/hero/region.png"), pixels("/hero/region-water.png")]);
  const { west, east, north, south, width, height } = region;
  const elev = (kx: number, kz: number) => {
    const i = Math.min(Math.max(Math.round(((kx - west) / (east - west)) * (width - 1)), 0), width - 1);
    const j = Math.min(Math.max(Math.round(((kz - north) / (south - north)) * (height - 1)), 0), height - 1);
    const o = (j * width + i) * 4;
    return land.px[o] * 256 + land.px[o + 1];
  };
  const raw = (x: number, z: number) => (elev(x / SPREAD, z / SPREAD) / 1000) * RELIEF;
  const levels = spots.map((s) => {
    let sum = 0;
    for (let k = 0; k < 24; k++) sum += raw(s.x + Math.cos(k * 0.2618) * s.r, s.z + Math.sin(k * 0.2618) * s.r);
    return { ...s, y: sum / 24 };
  });
  const ground = (x: number, z: number) => {
    let y = raw(x, z);
    for (const s of levels) y = THREE.MathUtils.lerp(s.y, y, THREE.MathUtils.smoothstep(Math.hypot(x - s.x, z - s.z), s.r * 0.75, s.r * 1.15));
    return y;
  };

  const n = NX * NZ, pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx: number[] = [];
  for (let j = 0; j < NZ; j++)
    for (let i = 0; i < NX; i++) {
      const u = i / (NX - 1), v = j / (NZ - 1), k = j * NX + i;
      const x = (west + (east - west) * u) * SPREAD, z = (north + (south - north) * v) * SPREAD;
      pos.set([x, ground(x, z), z], k * 3);
      uv.set([u, 1 - v], k * 2);
      if (i && j) idx.push(k - NX - 1, k - 1, k - NX, k - NX, k - 1, k);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const tex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.anisotropy = 4; return t; };
  const color = (c: string) => ({ value: new THREE.Color(c) });
  const material = new THREE.ShaderMaterial({
    vertexShader: vertex, fragmentShader: fragment, transparent: true,
    uniforms: {
      uLand: { value: tex(land.canvas) }, uWater: { value: tex(water.canvas) },
      uInk: color(look.ink), uGrass: color(look.grass), uDry: color(look.dry), uForest: color(look.forest), uSnow: color(look.snow), uSea: color(look.sea),
      uLightView: { value: look.light }, uDot: { value: look.dot }, uOpacity: { value: 0 },
    },
  });
  const mesh = new THREE.Mesh(g, material);
  // Drawn first, and then forgotten by the depth buffer, so the enlarged mountains always sit on top.
  mesh.renderOrder = -2;
  mesh.onAfterRender = (r) => r.clearDepth();

  // scale bar, lying on the sea off the Washington coast
  const bar = new THREE.Group();
  const len = SCALE_MILES * 1.609344 * SPREAD;
  const ink = new THREE.MeshBasicMaterial({ color: look.ink, transparent: true }), pale = new THREE.MeshBasicMaterial({ color: look.snow, transparent: true });
  const block = (a: number, b: number, w: number, m: THREE.Material, y: number, order: number) => {
    const q = new THREE.Mesh(new THREE.PlaneGeometry(w, b - a).rotateX(-Math.PI / 2), m);
    q.position.set(0, y, (a + b) / 2);
    q.renderOrder = order;
    bar.add(q);
  };
  block(-0.15, len + 0.15, 1.1, ink, 0.02, 0);
  block(len / 2, len, 0.8, pale, 0.06, 1);
  const barX = -205 * SPREAD, barZ = -150 * SPREAD;
  bar.position.set(barX, 0.05, barZ);

  const places: Place[] = region.places.map((p) => ({ name: p.name, kind: p.kind, pos: new THREE.Vector3(p.x * SPREAD, ground(p.x * SPREAD, p.z * SPREAD) + 0.1, p.z * SPREAD) }));
  places.unshift({ name: `${SCALE_MILES} miles`, kind: "scale", pos: new THREE.Vector3(barX, 0.2, barZ + len / 2) });
  return { mesh, bar, material, places, groundAt: (x, z) => levels.find((s) => s.x === x && s.z === z)?.y ?? raw(x, z) };
}

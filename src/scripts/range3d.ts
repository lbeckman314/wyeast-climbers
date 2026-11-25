/**
 * The mountains around Hood, for the map's Expand view: terrain, trees, routes and landmark
 * markers for each, built from src/data/range.json (words) and range-terrain.json (shapes, made
 * by scripts/hero/range.py). Loaded only when the reader first presses Expand.
 *
 * Every mountain is drawn to the same scale as Hood at its true map position (see region3d.ts),
 * on a map SPREAD times the scale, so they read in one view.
 */
import * as THREE from "three";
import range from "../data/range.json";
import shapes from "../data/range-terrain.json";

export const SPREAD = 0.25;
const RINGS = 120, SEGMENTS = 280, TREES = 650;

type Heights = { elev(x: number, z: number): number; forest(x: number, z: number): number };
export interface RangeDeps {
  toY(m: number): number;
  terrainMaterial(): THREE.ShaderMaterial;
  treeMaterial(): THREE.ShaderMaterial;
  markerMaterial: THREE.ShaderMaterial;
  hullMaterial: THREE.Material;
  lineColor: string;
  inkColor: string;
  loadHeights(url: string, n: number, R: number): Promise<Heights>;
  rand(seed: number): () => number;
}
export interface RangeRoute { id: string; line: THREE.MeshBasicMaterial; ink: THREE.MeshBasicMaterial; meshes: THREE.Mesh[]; focus: THREE.Vector3; bearing: number; label: THREE.Vector3 }
export interface Peak {
  id: string; name: string; ft: number;
  center: THREE.Vector3; radius: number; top: THREE.Vector3;
  group: THREE.Group;
  /** terrain and trees, which fade in and out */
  mats: THREE.ShaderMaterial[];
  terrain: THREE.ShaderMaterial;
  shape: { east: number; south: number };
  /** routes and markers, shown only while this mountain is open */
  extras: THREE.Group;
  routes: RangeRoute[];
  marks: { id: string; name: string; pos: THREE.Vector3; bearing: number }[];
  pickable: THREE.Mesh[];
}

const bearingOf = (x: number, z: number) => (THREE.MathUtils.radToDeg(Math.atan2(x, -z)) + 360) % 360;

export async function buildRange(d: RangeDeps): Promise<Peak[]> {
  return Promise.all(range.map(async (info, k) => {
    const shape = shapes.find((s) => s.id === info.id)!;
    const R = shape.radiusKm;
    const h = await d.loadHeights(`/hero/range-${info.id}.png`, shape.size, R);
    const center = new THREE.Vector3(shape.east * SPREAD, 0, shape.south * SPREAD);
    const group = new THREE.Group(), extras = new THREE.Group();
    group.position.copy(center);
    group.add(extras);
    const ground = (x: number, z: number) => d.toY(h.elev(x, z));

    const mats = [d.terrainMaterial(), d.treeMaterial()];
    for (const m of mats) {
      m.uniforms.uCenter.value.set(center.x, center.z);
      m.uniforms.uFade0.value = R * 0.72;
      m.uniforms.uFade1.value = R * 0.97;
    }

    // terrain: a polar grid, like Hood's
    {
      const n = 1 + RINGS * SEGMENTS;
      const pos = new Float32Array(n * 3), el = new Float32Array(n), fo = new Float32Array(n);
      const idx: number[] = [];
      const put = (i: number, x: number, z: number) => {
        const e = h.elev(x, z);
        pos.set([x, d.toY(e), z], i * 3);
        el[i] = e; fo[i] = h.forest(x, z);
      };
      put(0, 0, 0);
      for (let i = 1; i <= RINGS; i++)
        for (let j = 0; j < SEGMENTS; j++) {
          const a = (j / SEGMENTS) * Math.PI * 2, r = (R * 0.98 * i) / RINGS;
          put(1 + (i - 1) * SEGMENTS + j, Math.cos(a) * r, Math.sin(a) * r);
        }
      const ring = (i: number, j: number) => 1 + (i - 1) * SEGMENTS + (j % SEGMENTS);
      for (let j = 0; j < SEGMENTS; j++) idx.push(0, ring(1, j + 1), ring(1, j));
      for (let i = 1; i < RINGS; i++)
        for (let j = 0; j < SEGMENTS; j++) {
          const a = ring(i, j), b = ring(i, j + 1), c = ring(i + 1, j), e = ring(i + 1, j + 1);
          idx.push(a, b, c, b, e, c);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aElev", new THREE.BufferAttribute(el, 1));
      g.setAttribute("aForest", new THREE.BufferAttribute(fo, 1));
      g.setIndex(idx);
      g.computeVertexNormals();
      group.add(new THREE.Mesh(g, mats[0]));
    }

    const blank = (g: THREE.BufferGeometry) => {
      const n = g.attributes.position.count;
      for (const name of ["aElev", "aForest"]) g.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(n), 1));
      return g;
    };
    // trees
    {
      const rand = d.rand(k + 11);
      const cone = blank(new THREE.ConeGeometry(0.085, 0.3, 5).translate(0, 0.15, 0));
      const list: THREE.Matrix4[] = [];
      for (let t = 0; t < 40000 && list.length < TREES; t++) {
        const r = Math.sqrt(rand()) * R * 0.93, a = rand() * Math.PI * 2;
        const x = Math.cos(a) * r, z = Math.sin(a) * r;
        if (rand() > h.forest(x, z) * 0.75) continue;
        const s = 0.6 + rand() * 0.6;
        list.push(new THREE.Matrix4().makeScale(s, s, s).setPosition(x, ground(x, z) - 0.01, z));
      }
      const trees = new THREE.InstancedMesh(cone, mats[1], list.length);
      list.forEach((m, i) => trees.setMatrixAt(i, m));
      group.add(trees);
    }

    const pickable: THREE.Mesh[] = [];
    const world = (v: THREE.Vector3) => v.clone().add(center);
    const routes: RangeRoute[] = shape.routes.map((r) => {
      const curve = new THREE.CatmullRomCurve3(r.points.map(([x, z]) => new THREE.Vector3(x, ground(x, z) + 0.04, z)));
      const line = new THREE.MeshBasicMaterial({ transparent: true, color: d.lineColor });
      const ink = new THREE.MeshBasicMaterial({ transparent: true, color: d.inkColor, side: THREE.BackSide });
      const n = r.points.length * 3;
      const meshes = [new THREE.Mesh(new THREE.TubeGeometry(curve, n, 0.034, 6), line), new THREE.Mesh(new THREE.TubeGeometry(curve, n, 0.058, 6), ink)];
      for (const m of meshes) { m.userData.route = r.id; pickable.push(m); extras.add(m); }
      const focus = curve.getPointAt(0.55), label = curve.getPointAt(0.45);
      return { id: r.id, line, ink, meshes, focus: world(focus), bearing: bearingOf(focus.x, focus.z), label: world(label) };
    });

    const gem = blank(new THREE.OctahedronGeometry(0.11));
    const marks = shape.landmarks.map((l) => {
      const at = new THREE.Vector3(l.x, ground(l.x, l.z) + 0.12, l.z);
      const mesh = new THREE.Mesh(gem, d.markerMaterial), hull = new THREE.Mesh(gem, d.hullMaterial);
      hull.scale.setScalar(1.25);
      for (const m of [mesh, hull]) { m.position.copy(at); extras.add(m); }
      mesh.userData.route = l.id;
      pickable.push(mesh);
      return { id: l.id, name: info.landmarks.find((x) => x.id === l.id)!.name, pos: world(at),
        // NaN (always labelled) for summits, which show from every side
        bearing: "noSummit" in info || Math.hypot(l.x, l.z) < 0.95 ? NaN : bearingOf(l.x, l.z) };
    });

    const top = new THREE.Vector3(center.x, d.toY(shape.maxElev) + ("noSummit" in info ? 1.3 : 0.3), center.z);
    return { id: info.id, name: info.name, ft: info.ft, center, radius: R, top, group, mats, terrain: mats[0], shape, extras, routes, marks, pickable };
  }));
}

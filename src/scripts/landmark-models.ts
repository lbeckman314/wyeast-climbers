/**
 * Stylised miniatures of the landmarks on the hero model. They are built from simple
 * three.js solids so they inherit the museum-model look of the terrain and trees, but
 * their massing follows the real structures (enlarged so they read at map scale):
 * Timberline's hexagonal headhouse, big chimney and uneven wings; Silcox's high-gabled
 * L with chimneys at each gable; Cloud Cap's low, C-shaped shingle roof and two chimneys;
 * Government Camp's scatter of cabins; and a small summit cairn.
 */
import * as THREE from "three";
import type { LandmarkShape } from "../data/landmarkShapes";

export interface LandmarkPalette {
  ink: string;
  paper: string;
  rock: string;
  accent: string;
}

export interface LandmarkModel {
  group: THREE.Group;
  /** Height above the terrain, for placing the HTML label. */
  height: number;
  setActive(active: boolean): void;
}

type Mats = {
  wall: THREE.MeshBasicMaterial;
  roof: THREE.MeshBasicMaterial;
  stone: THREE.MeshBasicMaterial;
  trim: THREE.MeshBasicMaterial;
};

function box(
  parent: THREE.Object3D,
  mat: THREE.Material,
  w: number, h: number, d: number,
  x: number, y: number, z: number,
  ry = 0,
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

/** A triangular prism: ridge along z, gable ends facing ±z. */
function gableGeometry(w: number, d: number, rise: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

/** A low hipped roof: two slopes and two end hips, ridge along x. */
function hipGeometry(w: number, d: number, rise: number) {
  const hw = w / 2, hd = d / 2, r = Math.max(0, (w - d) / 2);
  const a = [-hw, 0, -hd], b = [hw, 0, -hd], c = [-hw, 0, hd], d2 = [hw, 0, hd];
  const e = [-r, rise, 0], f = [r, rise, 0];
  const p: number[] = [];
  const tri = (u: number[], v: number[], t: number[]) => p.push(...u, ...v, ...t);
  tri(a, b, f); tri(a, f, e);       // north slope
  tri(e, f, d2); tri(e, d2, c);     // south slope
  tri(a, e, c); tri(f, b, d2);      // hip ends
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

function roof(
  parent: THREE.Object3D,
  mat: THREE.Material,
  kind: "gable" | "hip",
  w: number, d: number, rise: number,
  x: number, y: number, z: number, ry = 0,
) {
  const m = new THREE.Mesh(kind === "gable" ? gableGeometry(w, d, rise) : hipGeometry(w, d, rise), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  parent.add(m);
  return m;
}

function chimney(parent: THREE.Object3D, mats: Mats, x: number, y: number, z: number, h = 0.07) {
  box(parent, mats.stone, 0.034, h, 0.034, x, y, z);
  box(parent, mats.trim, 0.05, 0.01, 0.05, x, y + h, z);
}

function cabin(
  parent: THREE.Object3D,
  mats: Mats,
  o: { w: number; d: number; h: number; x: number; z: number; ry?: number; rise?: number; kind?: "gable" | "hip" },
) {
  const ry = o.ry ?? 0, rise = o.rise ?? o.w * 0.35;
  box(parent, mats.wall, o.w, o.h, o.d, o.x, 0, o.z, ry);
  box(parent, mats.stone, o.w + 0.018, 0.018, o.d + 0.018, o.x, -0.014, o.z, ry);
  roof(parent, mats.roof, o.kind ?? "gable", o.w + 0.035, o.d + 0.03, rise, o.x, o.h, o.z, ry);
}

export function buildLandmark(shape: LandmarkShape, p: LandmarkPalette): LandmarkModel {
  const mats: Mats = {
    wall: new THREE.MeshBasicMaterial({ color: p.rock }),
    roof: new THREE.MeshBasicMaterial({ color: p.ink, side: THREE.DoubleSide }),
    stone: new THREE.MeshBasicMaterial({ color: p.ink }),
    trim: new THREE.MeshBasicMaterial({ color: p.paper }),
  };
  const group = new THREE.Group();

  switch (shape) {
    // Timberline: a steep hexagonal headhouse with its great chimney, two unequal wings
    // and a couple of dormers breaking the roof line.
    case "lodge": {
      box(group, mats.stone, 0.26, 0.02, 0.24, 0, -0.015, 0);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.13, 6), mats.wall);
      head.position.y = 0.065;
      group.add(head);
      const headRoof = new THREE.Mesh(new THREE.ConeGeometry(0.155, 0.13, 6), mats.roof);
      headRoof.position.y = 0.195;
      group.add(headRoof);
      chimney(group, mats, 0, 0.18, 0, 0.13);

      // longer wing to the west, shorter one to the south-east
      cabin(group, mats, { w: 0.27, d: 0.1, h: 0.085, x: -0.2, z: 0.015, rise: 0.06 });
      cabin(group, mats, { w: 0.16, d: 0.1, h: 0.075, x: 0.185, z: 0.085, ry: -0.4, rise: 0.05 });
      cabin(group, mats, { w: 0.055, d: 0.045, h: 0.035, x: -0.23, z: 0.075, rise: 0.045 });
      cabin(group, mats, { w: 0.055, d: 0.045, h: 0.035, x: -0.12, z: 0.075, rise: 0.045 });
      break;
    }

    // Silcox: low stone walls under a high gable, with a projecting wing to make the L,
    // a terrace, and the two chimneys that straddle the ridge at the gable ends.
    case "hut": {
      box(group, mats.stone, 0.3, 0.018, 0.26, 0, -0.015, 0.02);
      cabin(group, mats, { w: 0.24, d: 0.1, h: 0.07, x: 0, z: -0.02, rise: 0.12 });
      cabin(group, mats, { w: 0.11, d: 0.14, h: 0.07, x: 0.07, z: 0.09, ry: Math.PI / 2, rise: 0.06 });
      chimney(group, mats, -0.115, 0.075, -0.02, 0.09);
      chimney(group, mats, 0.115, 0.075, -0.02, 0.09);
      box(group, mats.trim, 0.19, 0.012, 0.06, -0.05, 0.002, 0.12);
      break;
    }

    // Cloud Cap: one storey, three low sections meeting at angles in a C, a massive
    // stone base below, broad shingled roofs and its two big chimneys.
    case "inn": {
      box(group, mats.stone, 0.38, 0.03, 0.25, 0, -0.025, 0.01);
      cabin(group, mats, { w: 0.17, d: 0.085, h: 0.06, x: 0, z: -0.06, kind: "hip", rise: 0.04 });
      cabin(group, mats, { w: 0.15, d: 0.085, h: 0.06, x: -0.12, z: 0.035, ry: 0.5, kind: "hip", rise: 0.035 });
      cabin(group, mats, { w: 0.15, d: 0.085, h: 0.06, x: 0.12, z: 0.035, ry: -0.5, kind: "hip", rise: 0.035 });
      chimney(group, mats, -0.08, 0.065, -0.06, 0.075);
      chimney(group, mats, 0.09, 0.065, -0.05, 0.075);
      box(group, mats.trim, 0.2, 0.01, 0.035, 0, 0.004, 0.115);
      break;
    }

    // Government Camp is a village, not one building: cabins strung along the road.
    case "village": {
      box(group, mats.stone, 0.055, 0.006, 0.6, 0.02, -0.001, 0, 0.22);
      const cabins = [
        { w: 0.15, d: 0.1, h: 0.055, x: -0.13, z: -0.19, ry: 0.18, rise: 0.06 },
        { w: 0.12, d: 0.09, h: 0.05, x: 0.16, z: -0.13, ry: -0.25, rise: 0.05 },
        { w: 0.19, d: 0.11, h: 0.07, x: -0.03, z: 0.045, ry: 0.1, rise: 0.07 },
        { w: 0.1, d: 0.085, h: 0.045, x: 0.18, z: 0.16, ry: 0.35, rise: 0.045 },
        { w: 0.13, d: 0.09, h: 0.05, x: -0.16, z: 0.22, ry: -0.15, rise: 0.05 },
      ];
      for (const c of cabins) cabin(group, mats, c);
      break;
    }

    // The summit has no pin in the list, but a small cairn makes it a landmark on the
    // model too, sitting just under the existing "Mount Hood" label.
    case "summit": {
      const stones = [
        { r: 0.062, y: 0.018, s: [1.3, 0.55, 1.05], rot: 0.4, mat: mats.wall },
        { r: 0.046, y: 0.057, s: [1.05, 0.7, 0.95], rot: 1.1, mat: mats.wall },
        { r: 0.032, y: 0.095, s: [1, 0.85, 1], rot: 0.2, mat: mats.roof },
      ];
      for (const s of stones) {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s.r, 0), s.mat);
        m.position.set(0, s.y, 0);
        m.scale.set(...s.s);
        m.rotation.set(0.2, s.rot, 0.1);
        group.add(m);
      }
      break;
    }
  }

  const height = new THREE.Box3().setFromObject(group).max.y;
  return {
    group,
    height,
    setActive(active) {
      mats.roof.color.set(active ? p.accent : p.ink);
      mats.stone.color.set(active ? p.accent : p.ink);
    },
  };
}

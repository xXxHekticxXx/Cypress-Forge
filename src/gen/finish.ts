// Finishes that age any piece: moss, burnt, decaying, vines and cobwebs. They work on the finished piece by
// shooting rays at it to find its surfaces, so they fit every era and every shape.
import * as THREE from 'three';
import { Builder, Rng, fbm, noise3, barkTube, type Part } from './core';
import { rubble } from './floors';

export type Finish = 'clean' | 'moss' | 'burnt' | 'decay' | 'vines' | 'cobwebs';

function caster(parts: Part[]) {
  const meshes = parts.filter((p) => p.mat !== 'glow').map((p) => {
    p.geo.computeBoundingSphere();
    p.geo.computeBoundingBox();
    const m = new THREE.Mesh(p.geo);
    m.updateMatrixWorld();
    return m;
  });
  const rc = new THREE.Raycaster();
  return (from: THREE.Vector3, dir: THREE.Vector3) => {
    rc.set(from, dir);
    const hit = rc.intersectObjects(meshes, false)[0];
    if (!hit || !hit.face) return null;
    return { p: hit.point, n: hit.face.normal.clone() };
  };
}

function boxOf(parts: Part[]) {
  const b = new THREE.Box3();
  for (const p of parts) { p.geo.computeBoundingBox(); b.union(p.geo.boundingBox!); }
  return b;
}

/** Bend/char/rot wood without breaking the mesh: every vertex moves by a function of its position only. */
function warp(g: THREE.BufferGeometry, f: (v: THREE.Vector3) => THREE.Vector3) {
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const o = f(v);
    pos.setXYZ(i, v.x + o.x, v.y + o.y, v.z + o.z);
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
}

const WOOD = new Set(['wood', 'wood2', 'cloth', 'bark']);

export function applyFinish(b: Builder, finish: Finish, amt: number, seed: number) {
  if (finish === 'clean' || amt <= 0.01) return;
  const rng = new Rng(seed + 404);
  const box = boxOf(b.parts);
  const size = box.getSize(new THREE.Vector3());
  const area = size.x * size.z + size.y * (size.x + size.z);

  if (finish === 'burnt' || finish === 'decay') {
    const keep: Part[] = [];
    for (const p of b.parts) {
      p.geo.computeBoundingBox();
      const bb = p.geo.boundingBox!;
      const big = bb.getSize(new THREE.Vector3());
      const c = bb.getCenter(new THREE.Vector3());
      const small = big.x * big.y * big.z < 600;
      if (WOOD.has(p.mat)) {
        // some planks burnt through / rotted away
        if (small && rng.chance(amt * (finish === 'burnt' ? 0.25 : 0.2))) continue;
        if (finish === 'burnt') {
          // alligator-cracked charcoal
          warp(p.geo, (v) => {
            const cell = Math.abs(noise3(v.x * 0.9, v.y * 0.9, v.z * 0.9, seed)) < 0.08 ? 0.45 : 0;
            const dir = v.clone().sub(c).normalize();
            return dir.multiplyScalar(-(cell + 0.25 * amt * Math.abs(fbm(v.x * 0.3, v.y * 0.3, v.z * 0.3, seed, 2))));
          });
          if (rng.chance(0.4 + amt * 0.6)) p.mat = 'char';
        } else {
          // sagging and soft rot
          const span = Math.max(big.x, big.z);
          warp(p.geo, (v) => {
            const t = (Math.max(Math.abs(v.x - c.x), Math.abs(v.z - c.z)) / Math.max(1, span / 2));
            const sag = -amt * 1.6 * (1 - Math.min(1, t * t)) * (span > 20 ? 1 : 0.3);
            const dir = v.clone().sub(c).normalize();
            return new THREE.Vector3(0, sag, 0).addScaledVector(dir, -0.3 * amt * Math.max(0, fbm(v.x * 0.25, v.y * 0.25, v.z * 0.25, seed + 2, 2)));
          });
        }
      } else if (finish === 'burnt' && (p.mat === 'stone' || p.mat === 'stone2' || p.mat === 'metal') && rng.chance(amt * 0.5)) {
        p.mat = 'char'; // soot-blackened
      } else if (finish === 'decay' && (p.mat === 'metal' || p.mat === 'metal2') && rng.chance(amt * 0.7)) {
        p.mat = 'rust';
      }
      keep.push(p);
    }
    b.parts = keep;
    if (finish === 'decay') {
      // roots and rubble creep in
      for (let i = 0; i < Math.round(amt * 6); i++) rubble(b, rng.range(box.min.x + 3, box.max.x - 3), rng.range(box.min.z + 3, box.max.z - 3), box.min.y + 3, rng.range(1.5, 3), rng, 2);
    }
    if (finish === 'burnt') return;
  }

  const hit = caster(b.parts);
  const down = new THREE.Vector3(0, -1, 0);

  if (finish === 'moss' || finish === 'decay') {
    // clumps on top surfaces and low on the sides (moss likes shade and damp)
    const n = Math.round(area * amt * (finish === 'moss' ? 0.05 : 0.02));
    for (let i = 0; i < n; i++) {
      const top = rng.chance(0.55);
      let h;
      if (top) h = hit(new THREE.Vector3(rng.range(box.min.x, box.max.x), box.max.y + 5, rng.range(box.min.z, box.max.z)), down);
      else {
        const side = rng.int(0, 3);
        const y = box.min.y + Math.pow(rng.next(), 1.8) * size.y;
        const dirs = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0)];
        const d = dirs[side];
        const from = new THREE.Vector3(d.x ? -d.x * (size.x + 10) + box.getCenter(new THREE.Vector3()).x : rng.range(box.min.x, box.max.x), y, d.z ? -d.z * (size.z + 10) + box.getCenter(new THREE.Vector3()).z : rng.range(box.min.z, box.max.z));
        h = hit(from, d);
      }
      if (!h) continue;
      const s = rng.range(1.6, 4.2);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), h.n);
      const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
      b.block(s, s * 0.35, s * rng.range(0.7, 1.2), 'moss', { x: h.p.x, y: h.p.y, z: h.p.z, rx: e.x, ry: e.y, rz: e.z }, { bevel: s * 0.16, noise: s * 0.14 + 0.25, freq: 0.9, seed: rng.int(1, 9999), res: 0.7 });
    }
  }

  if (finish === 'vines' || finish === 'decay') {
    const n = Math.max(2, Math.round((size.x + size.z) / 10 * amt * (finish === 'vines' ? 1 : 0.4)));
    for (let i = 0; i < n; i++) {
      const dz = rng.chance(0.5) ? 1 : -1;
      const x = rng.range(box.min.x + 2, box.max.x - 2);
      const startY = box.max.y - rng.range(1, 4);
      const h0 = hit(new THREE.Vector3(x, startY, box.getCenter(new THREE.Vector3()).z + dz * (size.z + 10)), new THREE.Vector3(0, 0, -dz));
      if (!h0) continue;
      const pts: THREE.Vector3[] = [];
      const len = rng.range(size.y * 0.35, size.y * 0.9);
      const steps = Math.max(4, Math.round(len / 3));
      for (let k = 0; k <= steps; k++) {
        const y = startY - (k / steps) * len;
        const xx = x + Math.sin(k * 0.9 + i) * 1.5;
        const hk = hit(new THREE.Vector3(xx, y, h0.p.z + dz * 12), new THREE.Vector3(0, 0, -dz));
        const z = hk ? hk.p.z + dz * 0.5 : h0.p.z + dz * 0.5;
        pts.push(new THREE.Vector3(xx, y, z));
      }
      b.add(barkTube(new THREE.CatmullRomCurve3(pts), 0.6, 0.45, steps * 3, 6, rng.int(1, 999), 0.2), 'leaf');
      for (let k = 1; k < pts.length; k++) if (rng.chance(0.8)) {
        const p = pts[k];
        b.block(2.4, 0.7, 1.6, 'leaf', { x: p.x + rng.soft() * 1.2, y: p.y, z: p.z + dz * 0.4, ry: rng.range(0, 3), rx: Math.PI / 2 * 0.8 * dz, rz: rng.soft() }, { bevel: 0.3, noise: 0.2, seed: rng.int(1, 999), res: 0.7 });
      }
    }
  }

  if (finish === 'cobwebs' || (finish === 'decay' && amt > 0.5)) {
    // webs strung in corners: radial threads plus a spiral, thick enough to print (0.7 mm)
    const n = Math.max(1, Math.round(amt * 4 * (finish === 'cobwebs' ? 1 : 0.4)));
    for (let i = 0; i < n; i++) {
      const x = rng.range(box.min.x + 4, box.max.x - 4), z = rng.range(box.min.z + 4, box.max.z - 4);
      const a = hit(new THREE.Vector3(x, box.max.y + 5, z), down);
      if (!a) continue;
      const out = new THREE.Vector3(rng.soft(), 0, rng.soft()).normalize();
      const center = a.p.clone().add(new THREE.Vector3(out.x * 5, -5, out.z * 5));
      const anchors: THREE.Vector3[] = [];
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * Math.PI * 2;
        anchors.push(center.clone().add(new THREE.Vector3(Math.cos(ang) * 6 * out.z, Math.sin(ang) * 5, -Math.cos(ang) * 6 * out.x)));
      }
      for (const an of anchors) b.rod(center, an, 0.35, 'cloth', 4);
      for (let ring = 1; ring <= 3; ring++) for (let k = 0; k < 6; k++) {
        const p0 = center.clone().lerp(anchors[k], ring / 4), p1 = center.clone().lerp(anchors[(k + 1) % 6], ring / 4);
        b.rod(p0, p1, 0.3, 'cloth', 4);
      }
      b.rod(anchors[0], a.p, 0.35, 'cloth', 4);
    }
  }
}

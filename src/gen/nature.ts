// Caves and forests: rock walls with overhangs and stalactites, stalagmites, boulders, pools,
// and trees with real bark, roots and branches, logs, stumps, undergrowth and a fallen tree caught in another.
import * as THREE from 'three';
import { Builder, Rng, LOOK, barkTube, lathe, noise3, fbm, heightSlab, clamp } from './core';
import { floorSurface, rubble, crystalCluster, tuft, type Ctx } from './floors';

// ---------- rock ----------

function rock(b: Builder, w: number, h: number, d: number, at: { x: number; y: number; z: number; rx?: number; ry?: number; rz?: number }, rng: Rng, mat: 'stone' | 'stone2' = 'stone') {
  b.block(w, h, d, mat, at, { bevel: Math.min(w, h, d) * 0.28, noise: Math.min(w, h, d) * 0.22 + 0.4, freq: 0.22, seed: rng.int(1, 99999), res: 1.1, chip: 0.6 });
}

/** A hanging (down) or standing (up) dripstone. Rings of mineral build-up and a thin tip. */
function dripstone(b: Builder, x: number, y: number, z: number, len: number, r: number, down: boolean, rng: Rng) {
  const prof: [number, number][] = [[0, 0]];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const rr = r * Math.pow(1 - t, 0.8) * (1 + 0.12 * Math.sin(t * 19 + rng.next() * 6)) + 0.3 * (1 - t);
    prof.push([Math.max(0.25, rr), t * len]);
  }
  prof.push([0, len + 0.3]);
  const g = lathe(prof, 12);
  // a slight bend so they don't look machined
  const pos = g.attributes.position as THREE.BufferAttribute;
  const bend = rng.soft() * 0.08;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) + bend * pos.getY(i) * pos.getY(i) * 0.1);
  g.computeVertexNormals();
  b.add(g, 'stone2', { x, y, z, rx: down ? Math.PI : 0 });
}

function vine(b: Builder, start: THREE.Vector3, len: number, out: THREE.Vector3, rng: Rng) {
  const pts: THREE.Vector3[] = [];
  const n = Math.max(4, Math.round(len / 3));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(start.clone().add(new THREE.Vector3(Math.sin(t * 7 + rng.next() * 3) * 1.2, -t * len, Math.cos(t * 5) * 0.4).addScaledVector(out, 0.4 + Math.sin(t * Math.PI) * 1.5)));
  }
  b.add(barkTube(new THREE.CatmullRomCurve3(pts), 0.55, 0.4, n * 4, 6, rng.int(1, 999), 0.2), 'leaf');
  for (let i = 1; i < n; i++) {
    const p = pts[i];
    b.block(2.2, 0.6, 1.4, 'leaf', { x: p.x + rng.soft(), y: p.y, z: p.z + out.z * 0.6, ry: rng.range(0, 3), rz: rng.soft() * 0.6 }, { bevel: 0.25, noise: 0.25, seed: rng.int(1, 999), res: 0.6 });
  }
}

/** Rough cave wall with an overhanging lip and stalactites under it. Front face is +Z. */
function caveWall(b: Builder, L: number, H: number, T: number, y0: number, c: Ctx, vines: boolean) {
  const rng = c.rng.fork(31);
  // strata: big irregular slabs, each pushed in or out a little
  let y = 0;
  while (y < H - 3) {
    const h = Math.min(rng.range(6, 10), H - y);
    let x = -L / 2;
    while (x < L / 2 - 1) {
      const len = Math.min(rng.range(8, 16), L / 2 - x);
      rock(b, len + 1.2, h + 1, T + rng.range(-1, 3), { x: x + len / 2, y: y0 + y + h / 2, z: rng.range(-0.5, 1.5), rz: rng.soft() * 0.06 }, rng, rng.chance(0.5) ? 'stone' : 'stone2');
      x += len;
    }
    y += h;
  }
  // overhang lip along the top
  const lipD = T + 7;
  let x = -L / 2;
  while (x < L / 2 - 1) {
    const len = Math.min(rng.range(9, 15), L / 2 - x);
    rock(b, len + 1.5, rng.range(5, 7), lipD, { x: x + len / 2, y: y0 + H - 2.5, z: 3.5 }, rng);
    x += len;
  }
  // stalactites hanging from the lip
  const n = Math.round(L / 6);
  for (let i = 0; i < n; i++) {
    const sx = -L / 2 + 3 + rng.next() * (L - 6), sz = rng.range(T / 2, T / 2 + 6);
    dripstone(b, sx, y0 + H - 4.5, sz, rng.range(4, 12), rng.range(1.1, 2.2), true, rng);
  }
  if (vines) for (let i = 0; i < Math.round(L / 12); i++) vine(b, new THREE.Vector3(-L / 2 + 4 + rng.next() * (L - 8), y0 + H - 4, T / 2 + 6.5), rng.range(14, H * 0.8), new THREE.Vector3(0, 0, 1), rng);
  // fallen scree at the foot
  for (let i = 0; i < L / 10; i++) rubble(b, rng.range(-L / 2 + 3, L / 2 - 3), T / 2 + rng.range(2, 5), y0, rng.range(1.6, 3.2), rng, 2);
}

export function cave(b: Builder, item: string, W: number, D: number, H: number, y0: number, floorStrip: boolean, c: Ctx) {
  const rng = c.rng.fork(33);
  const sq = c.sq;
  const T = 14;
  switch (item) {
    case 'wall': {
      if (floorStrip) {
        floorSurface(b, 'rough', W, D, y0, c);
        caveWall(b.sub({ z: -D / 2 + T / 2 }), W, H, T, y0 + 2.5, c, true);
      } else caveWall(b, W, H, T, y0, c, true);
      break;
    }
    case 'corner': {
      floorSurface(b, 'rough', W, D, y0, c);
      caveWall(b.sub({ z: -D / 2 + T / 2 }), W, H, T, y0 + 2.5, c, true);
      caveWall(b.sub({ x: -W / 2 + T / 2, z: T / 2, ry: Math.PI / 2 }), D - T, H, T, y0 + 2.5, { ...c, rng: c.rng.fork(9) }, false);
      break;
    }
    case 'arch': {
      // a natural rock arch over a passage; stalactites hang under the span
      floorSurface(b, 'rough', W, D, y0, c);
      const pw = Math.min(14, W * 0.22);
      for (const e of [-1, 1]) {
        let y = 0;
        while (y < H - 4) {
          const h = rng.range(6, 9);
          rock(b, pw + rng.range(-1, 2), h + 1, D * 0.7 + rng.range(-2, 2), { x: e * (W / 2 - pw / 2 - 1) + rng.soft(), y: y0 + 2 + y + h / 2, z: 0 }, rng, rng.chance(0.5) ? 'stone' : 'stone2');
          y += h;
        }
      }
      const span = W - pw * 2;
      for (let x = -W / 2 + pw * 0.6; x < W / 2 - pw * 0.6; x += 7) {
        const t = (x + W / 2) / W;
        const yy = H - 4 + Math.sin(t * Math.PI) * 4;
        rock(b, 9, 9, D * 0.72, { x: x + 3.5, y: y0 + yy, z: 0, rz: rng.soft() * 0.2 }, rng);
      }
      for (let i = 0; i < span / 5; i++) dripstone(b, rng.range(-span / 2 + 2, span / 2 - 2), y0 + H - 7, rng.range(-D * 0.3, D * 0.3), rng.range(4, 11), rng.range(1, 2), true, rng);
      break;
    }
    case 'stalagmites': {
      floorSurface(b, 'rough', W, D, y0, c);
      const n = Math.round((W * D) / 120) + 3;
      for (let i = 0; i < n; i++) {
        const big = i < 2;
        dripstone(b, rng.range(-W / 2 + 4, W / 2 - 4), y0 + 2, rng.range(-D / 2 + 4, D / 2 - 4), big ? rng.range(H * 0.5, H * 0.8) : rng.range(6, 16), big ? rng.range(3, 4.5) : rng.range(1.5, 2.8), false, rng);
      }
      break;
    }
    case 'boulders': {
      floorSurface(b, 'rough', W, D, y0, c);
      const n = Math.round((W * D) / 260) + 2;
      for (let i = 0; i < n; i++) {
        const s = rng.range(7, 16) * (i === 0 ? 1.3 : 1);
        rock(b, s, s * rng.range(0.6, 0.85), s * rng.range(0.7, 1), { x: rng.range(-W / 2 + s / 2, W / 2 - s / 2), y: y0 + 2 + s * 0.3, z: rng.range(-D / 2 + s / 2, D / 2 - s / 2), ry: rng.range(0, 3), rx: rng.soft() * 0.3 }, rng, rng.chance(0.5) ? 'stone' : 'stone2');
      }
      for (let i = 0; i < n * 3; i++) rubble(b, rng.range(-W / 2 + 3, W / 2 - 3), rng.range(-D / 2 + 3, D / 2 - 3), y0 + 2, rng.range(1.2, 3), rng, 1);
      break;
    }
    case 'pool': {
      // the floor rises into a rim of rock around a still pool
      const rx = W * 0.32, rz = D * 0.3;
      const g = heightSlab(W, D, 0.6, (x, z) => {
        const r = Math.hypot(x / rx, z / rz);
        const rim = r < 1 ? 1.2 : 3 + fbm(x * 0.08, z * 0.08, 0, c.seed, 4) * 1.4 + Math.exp(-Math.pow((r - 1.1) / 0.18, 2)) * 1.6;
        return rim;
      });
      b.add(g, 'stone2', { y: y0 });
      const wg = new THREE.CylinderGeometry(1, 1, 1, 48);
      b.add(wg, 'water', { y: y0 + 2.2, sx: rx * 1.02, sz: rz * 1.02, sy: 1.6 });
      for (let i = 0; i < 6; i++) { const a = rng.range(0, Math.PI * 2); rock(b, rng.range(3, 6), rng.range(2, 4), rng.range(3, 6), { x: Math.cos(a) * rx * 1.15, y: y0 + 3.5, z: Math.sin(a) * rz * 1.15, ry: a }, rng); }
      for (let i = 0; i < 4; i++) dripstone(b, rng.range(-W / 2 + 3, W / 2 - 3), y0 + 3, (rng.chance(0.5) ? 1 : -1) * rng.range(rz * 1.2, D / 2 - 3), rng.range(5, 10), rng.range(1.2, 2), false, rng);
      break;
    }
    case 'crystals':
    case 'floor':
    default: {
      floorSurface(b, item === 'crystals' ? 'crystal' : 'rough', W, D, y0, c);
      for (let i = 0; i < (W * D) / 500 + 1; i++) dripstone(b, rng.range(-W / 2 + 4, W / 2 - 4), y0 + 2, rng.range(-D / 2 + 4, D / 2 - 4), rng.range(3, 8), rng.range(1.2, 2.2), false, rng);
      // a shallow puddle in the lowest spot
      if (item === 'floor' && rng.chance(0.7)) b.add(new THREE.CylinderGeometry(1, 1, 1, 40), 'water', { x: rng.range(-W / 5, W / 5), z: rng.range(-D / 5, D / 5), y: y0 + 2.4, sx: rng.range(5, 9), sz: rng.range(4, 7), sy: 0.6 });
    }
  }
}

// ---------- trees ----------

function trunkCurve(x: number, z: number, y0: number, h: number, lean: THREE.Vector3, rng: Rng) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push(new THREE.Vector3(x + lean.x * t * h + Math.sin(t * 3 + rng.next() * 2) * 1.2, y0 - 1 + t * h, z + lean.z * t * h + Math.cos(t * 2.5 + rng.next() * 2) * 1.2));
  }
  return new THREE.CatmullRomCurve3(pts);
}

function roots(b: Builder, x: number, z: number, y0: number, r: number, rng: Rng) {
  const n = rng.int(4, 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.soft() * 0.4;
    const len = r * rng.range(2.4, 3.6);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x + Math.cos(a) * r * 0.4, y0 + r * 1.4, z + Math.sin(a) * r * 0.4),
      new THREE.Vector3(x + Math.cos(a) * r * 1.2, y0 + r * 0.5, z + Math.sin(a) * r * 1.2),
      new THREE.Vector3(x + Math.cos(a) * len, y0 - 0.3, z + Math.sin(a) * len),
    ]);
    b.add(barkTube(curve, r * 0.45, r * 0.12, 12, 10, rng.int(1, 999), 0.6), 'bark');
  }
}

function branch(b: Builder, from: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, depth: number, rng: Rng, tips: THREE.Vector3[]) {
  const pts = [from.clone()];
  const d = dir.clone().normalize();
  for (let i = 1; i <= 4; i++) {
    d.add(new THREE.Vector3(rng.soft() * 0.25, 0.08, rng.soft() * 0.25)).normalize();
    pts.push(pts[i - 1].clone().addScaledVector(d, len / 4));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  b.add(barkTube(curve, r, r * 0.55, 10, Math.max(6, Math.round(r * 5)), rng.int(1, 9999), 0.7), 'bark');
  const end = pts[4];
  if (depth <= 0 || r < 0.7) { tips.push(end); return; }
  const kids = rng.int(2, 3);
  for (let k = 0; k < kids; k++) {
    const t = rng.range(0.55, 1);
    const at = curve.getPointAt(t);
    const nd = d.clone().add(new THREE.Vector3(rng.soft() * 0.9, rng.range(0.1, 0.6), rng.soft() * 0.9));
    branch(b, at, nd, len * rng.range(0.55, 0.75), r * 0.6, depth - 1, rng, tips);
  }
}

/** Leafy clump: a lumpy blob with a leaf-litter surface (prints as texture, paints as foliage). */
function foliage(b: Builder, p: THREE.Vector3, s: number, rng: Rng) {
  // several overlapping rounded lumps per clump read as leaves rather than a box
  for (let k = 0; k < 3; k++) {
    const ss = s * (k ? 0.62 : 0.85);
    b.block(ss, ss * 0.72, ss, 'leaf', { x: p.x + (k ? rng.soft() * s * 0.35 : 0), y: p.y + (k ? rng.soft() * s * 0.15 : 0), z: p.z + (k ? rng.soft() * s * 0.35 : 0), ry: rng.range(0, 3) },
      { bevel: ss * 0.47, noise: ss * 0.12 + 0.7, freq: 0.75, seed: rng.int(1, 99999), res: 0.8 });
  }
}

export function tree(b: Builder, kind: string, x: number, z: number, y0: number, H: number, rng: Rng) {
  const r0 = kind === 'pine' ? H * 0.04 : H * 0.055;
  const lean = new THREE.Vector3(rng.soft() * 0.05, 0, rng.soft() * 0.05);
  const tips: THREE.Vector3[] = [];
  if (kind === 'pine') {
    const curve = trunkCurve(x, z, y0, H * 0.96, lean, rng);
    b.add(barkTube(curve, r0, r0 * 0.15, 30, 12, rng.int(1, 999), 1), 'bark');
    roots(b, x, z, y0, r0, rng);
    // tiers of drooping needle skirts, smaller towards the top
    const tiers = 7;
    for (let i = 0; i < tiers; i++) {
      const t = 0.22 + (i / tiers) * 0.72;
      const c = curve.getPointAt(Math.min(1, t));
      const R = H * 0.3 * (1 - (i / tiers) * 0.82);
      const h = H * 0.15;
      const g = new THREE.ConeGeometry(R, h, 56, 5);
      const pos = g.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let k = 0; k < pos.count; k++) {
        v.fromBufferAttribute(pos, k);
        const a = Math.atan2(v.z, v.x);
        const rr = Math.hypot(v.x, v.z);
        // jagged needle edge and bough lumps
        const jag = 1 + 0.2 * Math.pow(Math.abs(Math.sin(a * 13 + i)), 3) + 0.08 * Math.abs(Math.sin(a * 37 + i * 2)) + 0.12 * noise3(v.x * 0.6, v.y * 0.6, v.z * 0.6, i + 3);
        pos.setXYZ(k, v.x * jag, v.y - (rr / R) * h * 0.18, v.z * jag);
      }
      g.computeVertexNormals();
      b.add(g, 'leaf', { x: c.x, y: c.y + h * 0.3, z: c.z, ry: rng.range(0, 3) });
    }
    return;
  }
  const trunkH = kind === 'dead' ? H * 0.7 : H * 0.5;
  const curve = trunkCurve(x, z, y0, trunkH, lean, rng);
  b.add(barkTube(curve, r0, r0 * 0.6, 24, 14, rng.int(1, 999), 1), 'bark');
  roots(b, x, z, y0, r0, rng);
  const top = curve.getPointAt(1);
  const main = kind === 'dead' ? 3 : 4;
  for (let i = 0; i < main; i++) {
    const a = (i / main) * Math.PI * 2 + rng.soft();
    const from = curve.getPointAt(rng.range(0.75, 1));
    branch(b, from, new THREE.Vector3(Math.cos(a), kind === 'dead' ? 0.8 : 1.1, Math.sin(a)), H * (kind === 'dead' ? 0.32 : 0.3), r0 * 0.6, kind === 'dead' ? 2 : 1, rng, tips);
  }
  if (kind === 'dead') {
    // broken-off stubs
    for (let i = 0; i < 3; i++) { const p = curve.getPointAt(rng.range(0.3, 0.7)); branch(b, p, new THREE.Vector3(rng.soft(), 0.4, rng.soft()), H * 0.08, r0 * 0.35, 0, rng, []); }
    return;
  }
  // canopy: clumps at every branch tip plus a crown over the top
  for (const t of tips) foliage(b, t, H * rng.range(0.16, 0.24), rng);
  foliage(b, top.clone().add(new THREE.Vector3(0, H * 0.32, 0)), H * 0.3, rng);
  for (let i = 0; i < 6; i++) {
    const a = rng.range(0, Math.PI * 2);
    foliage(b, top.clone().add(new THREE.Vector3(Math.cos(a) * H * 0.2, H * rng.range(0.15, 0.4), Math.sin(a) * H * 0.2)), H * rng.range(0.18, 0.26), rng);
  }
}

function log(b: Builder, a: THREE.Vector3, d: THREE.Vector3, len: number, r: number, rng: Rng, rings = true) {
  const pts = [];
  for (let i = 0; i <= 4; i++) pts.push(a.clone().addScaledVector(d, (i / 4) * len).add(new THREE.Vector3(0, Math.sin(i) * 0.3, 0)));
  const curve = new THREE.CatmullRomCurve3(pts);
  b.add(barkTube(curve, r, r * 0.92, 16, 16, rng.int(1, 999), 1), 'bark');
  if (rings) for (const [t, s] of [[0, -1], [1, 1]] as const) {
    const p = curve.getPointAt(t), tg = curve.getTangentAt(t).multiplyScalar(s);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tg);
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    for (let k = 1; k <= 3; k++) b.add(new THREE.TorusGeometry(r * (k / 4), 0.22, 4, 24), 'wood', { x: p.x + tg.x * 0.15, y: p.y + tg.y * 0.15, z: p.z + tg.z * 0.15, rx: e.x, ry: e.y, rz: e.z });
  }
}

export function forest(b: Builder, item: string, W: number, D: number, H: number, y0: number, c: Ctx) {
  const rng = c.rng.fork(91);
  // forest floor: dirt, leaf litter and grass
  const top = floorSurface(b, 'dirt', W, D, y0, c);
  const g = top - 0.6;
  switch (item) {
    case 'pine':
    case 'oak':
    case 'dead':
      tree(b, item, 0, 0, g, H, rng);
      break;
    case 'fallen': {
      // tree A stands; tree B was uprooted and leans into A's branches
      const ax = -W / 2 + W * 0.28;
      const tipsBefore = b.parts.length;
      tree(b, 'oak', ax, -D * 0.1, g, H, rng);
      void tipsBefore;
      const rest = new THREE.Vector3(ax + 4, g + H * 0.52, -D * 0.1 + 2);
      const root = new THREE.Vector3(W / 2 - W * 0.16, g + 4, D * 0.18);
      const dir = rest.clone().sub(root);
      const len = dir.length() * 1.12;
      dir.normalize();
      const pts = [];
      for (let i = 0; i <= 6; i++) pts.push(root.clone().addScaledVector(dir, (i / 6) * len).add(new THREE.Vector3(0, Math.sin((i / 6) * Math.PI) * 2, Math.sin(i) * 0.8)));
      const curve = new THREE.CatmullRomCurve3(pts);
      const r0 = H * 0.045;
      b.add(barkTube(curve, r0, r0 * 0.35, 30, 14, rng.int(1, 999), 1), 'bark');
      // torn-up root plate with dirt clinging to it
      b.block(r0 * 5, r0 * 5, r0 * 2.2, 'ground', { x: root.x + 1, y: root.y + r0, z: root.z, ry: Math.atan2(-dir.z, dir.x) + Math.PI / 2 }, { bevel: r0 * 1.4, noise: r0 * 0.7, freq: 0.3, seed: 7, res: 1 });
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        b.add(barkTube(new THREE.CatmullRomCurve3([root.clone(), root.clone().add(new THREE.Vector3(Math.cos(a) * r0 * 2, Math.sin(a) * r0 * 2.4, rng.soft() * r0)), root.clone().add(new THREE.Vector3(Math.cos(a) * r0 * 3.4, Math.sin(a) * r0 * 3 - 1, rng.soft() * r0 * 2))]), r0 * 0.4, r0 * 0.1, 10, 8, rng.int(1, 999), 0.6), 'bark');
      }
      // its own broken branches and a few dead leaves
      for (let i = 0; i < 3; i++) {
        const p = curve.getPointAt(rng.range(0.45, 0.85));
        branch(b, p, new THREE.Vector3(rng.soft(), rng.range(0.3, 0.9), rng.soft()), H * 0.14, r0 * 0.4, 1, rng, []);
      }
      b.add(new THREE.CylinderGeometry(1, 1, 1, 30), 'ground', { x: root.x - 2, y: g + 0.3, z: root.z, sx: r0 * 4, sz: r0 * 3, sy: 1.2 });
      break;
    }
    case 'logs': {
      const r = 4.2;
      const len = Math.min(W, D) * 0.8;
      const rows = [3, 2, 1];
      let yy = g + r;
      rows.forEach((n, row) => {
        for (let i = 0; i < n; i++) log(b, new THREE.Vector3(-len / 2, yy, (i - (n - 1) / 2) * r * 2.05), new THREE.Vector3(1, 0, rng.soft() * 0.03), len, r * rng.range(0.9, 1.05), rng);
        yy += r * 1.75;
        void row;
      });
      for (const s of [-1, 1]) b.block(2, 10, 2, 'wood2', { x: 0, y: g + 5, z: s * r * 3.3 }, { bevel: 0.3, noise: 0.3, seed: 3 }); // stakes
      break;
    }
    case 'log': {
      const len = Math.max(W, D) * 0.85;
      log(b, new THREE.Vector3(-len / 2, g + 4.2, rng.soft() * 3), new THREE.Vector3(1, 0, 0.12), len, 5, rng);
      for (let i = 0; i < 3; i++) branch(b, new THREE.Vector3(rng.range(-len / 3, len / 3), g + 7, 0), new THREE.Vector3(rng.soft(), 0.9, rng.soft()), 10, 1.2, 0, rng, []);
      // bracket fungus on the side
      for (let i = 0; i < 4; i++) b.lathe([[0, 0], [2.4, 0], [2.6, 0.5], [0, 1.2]], 'cloth', { x: rng.range(-len / 4, len / 4), y: g + 4 + rng.range(-1, 2), z: 5.2, rx: Math.PI / 2 - 0.2 }, 16);
      break;
    }
    case 'stump': {
      const r = Math.min(W, D) * 0.18;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, g - 1, 0), new THREE.Vector3(0.6, g + 6, 0.3), new THREE.Vector3(0, g + 11, 0)]);
      b.add(barkTube(curve, r, r * 0.9, 10, 18, rng.int(1, 99), 1), 'bark');
      // jagged broken top
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; b.cyl(0, r * 0.32, rng.range(2, 6), 'wood', { x: Math.cos(a) * r * 0.6, z: Math.sin(a) * r * 0.6, y: g + 11 + 1.5, rz: rng.soft() * 0.2 }, 5); }
      for (let k = 1; k <= 4; k++) b.add(new THREE.TorusGeometry(r * (k / 5), 0.25, 4, 30), 'wood', { y: g + 11.1, rx: Math.PI / 2 });
      roots(b, 0, 0, g, r * 0.8, rng);
      break;
    }
    case 'undergrowth':
    default: {
      // ferns: arching fronds made of little leaflets
      for (let f = 0; f < 3; f++) {
        const fx = rng.range(-W / 3, W / 3), fz = rng.range(-D / 3, D / 3);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2 + rng.soft() * 0.3;
          const len = rng.range(9, 14);
          const pts = [];
          for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push(new THREE.Vector3(fx + Math.cos(a) * len * t, g + Math.sin(t * Math.PI * 0.8) * len * 0.5, fz + Math.sin(a) * len * t)); }
          const curve = new THREE.CatmullRomCurve3(pts);
          b.add(barkTube(curve, 0.45, 0.25, 12, 6, rng.int(1, 999), 0), 'leaf');
          for (let k = 1; k < 10; k++) {
            const p = curve.getPointAt(k / 10);
            for (const s of [-1, 1]) b.block(0.9, 0.45, 3 * (1 - k / 12), 'leaf', { x: p.x - Math.sin(a) * s * 1.3, y: p.y, z: p.z + Math.cos(a) * s * 1.3, ry: -a + s * 0.5 }, { bevel: 0.2, res: 0.8 });
          }
        }
      }
      // bushes
      for (let i = 0; i < 2; i++) foliage(b, new THREE.Vector3(rng.range(-W / 2.6, W / 2.6), g + 4, rng.range(-D / 2.6, D / 2.6)), rng.range(9, 13), rng);
      // mushrooms
      for (let i = 0; i < 6; i++) {
        const mx = rng.range(-W / 2.4, W / 2.4), mz = rng.range(-D / 2.4, D / 2.4), s = rng.range(0.7, 1.3);
        b.cyl(0.7 * s, 0.9 * s, 4 * s, 'cloth', { x: mx, z: mz, y: g + 2 * s }, 10);
        b.lathe([[0, 0], [2.6 * s, 0], [2.4 * s, 0.9 * s], [1.4 * s, 1.9 * s], [0, 2.2 * s]], 'accent', { x: mx, z: mz, y: g + 3.6 * s }, 18);
      }
      for (let i = 0; i < (W * D) / 60; i++) tuft(b, rng.range(-W / 2 + 2, W / 2 - 2), rng.range(-D / 2 + 2, D / 2 - 2), g, rng);
    }
  }
  void clamp;
  void crystalCluster;
}

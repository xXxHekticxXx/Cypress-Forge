// Scatter props at 28 mm scale. Each one is built standing on y=0 around the origin and returns its
// footprint radius so several can be spread out without touching.
import * as THREE from 'three';
import { Builder, Rng, fbm, lathe, fluted, polyShape, roundRect, tube, arcTorus } from './core';
import { topBox, rubble, crystalCluster, tuft, type Ctx } from './floors';

type Prop = (b: Builder, r: Rng, c: Ctx) => number;

const grainTop = (sd: number, k = 1) => (x: number, z: number) => -0.16 * k * Math.pow(Math.abs(Math.sin(z * 2.6 + fbm(x * 0.05, z * 0.3, 0, sd, 2) * 4)), 10);

function plankBox(b: Builder, w: number, h: number, d: number, r: Rng, mat: 'wood' | 'wood2' = 'wood') {
  // a crate: core + planks on every side + corner posts
  b.block(w - 1, h - 1, d - 1, 'wood2', { y: h / 2 }, { bevel: 0.3, res: 2 });
  const pw = h / 3;
  for (let i = 0; i < 3; i++) for (const side of [-1, 1]) {
    const y = pw * (i + 0.5);
    b.add(topBox(w - 2, 0.9, pw - 0.5, 0.4, grainTop(r.int(1, 999))), r.chance(0.5) ? mat : 'wood2', { y, z: side * (d / 2 - 0.9), rx: side * Math.PI / 2 });
    b.add(topBox(d - 2, 0.9, pw - 0.5, 0.4, grainTop(r.int(1, 999))), r.chance(0.5) ? mat : 'wood2', { y, x: side * (w / 2 - 0.9), rz: -side * Math.PI / 2, ry: Math.PI / 2 });
  }
  b.add(topBox(w - 2, 0.9, d - 2, 0.4, grainTop(r.int(1, 999))), mat, { y: h - 0.9 });
  for (const ex of [-1, 1]) for (const ez of [-1, 1]) b.block(1.8, h, 1.8, 'wood2', { x: ex * (w / 2 - 0.9), z: ez * (d / 2 - 0.9), y: h / 2 }, { bevel: 0.3, noise: 0.15, seed: r.int(1, 99) });
}

const P: Record<string, Prop> = {
  barrel(b, r) {
    const R = 5.2, H = 14;
    const prof: [number, number][] = [[0, 0]];
    for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push([R * (0.86 + 0.14 * Math.sin(t * Math.PI)), t * H]); }
    prof.push([0, H]);
    b.lathe(prof, r.chance(0.5) ? 'wood' : 'wood2', {}, 28);
    for (const t of [0.12, 0.38, 0.62, 0.88]) b.add(new THREE.TorusGeometry(R * (0.86 + 0.14 * Math.sin(t * Math.PI)) + 0.15, 0.45, 6, 28), 'metal2', { y: t * H, rx: Math.PI / 2 });
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; b.box(0.25, H * 0.9, 0.4, 'wood2', { x: Math.cos(a) * R * 0.98, z: Math.sin(a) * R * 0.98, y: H / 2, ry: -a }); }
    b.cyl(R * 0.82, R * 0.82, 0.6, 'wood2', { y: H - 0.2 }, 28);
    if (r.chance(0.4)) b.cyl(0.8, 0.8, 1.2, 'wood', { x: R * 0.4, y: H + 0.3 }, 10); // bung
    return R;
  },
  crate(b, r) {
    const s = r.range(10, 13);
    plankBox(b, s, s, s, r);
    for (const side of [-1, 1]) b.box(s * 1.3, 1, 1.4, 'wood2', { z: side * (s / 2 + 0.1), y: s / 2, rz: Math.PI / 4 * side }); // cross brace
    return s * 0.75;
  },
  chest(b, r) {
    const w = 13, d = 8, h = 6;
    plankBox(b, w, h, d, r, 'wood');
    // rounded lid
    const lid = new THREE.Shape();
    lid.absarc(0, 0, d / 2, 0, Math.PI, false);
    lid.closePath();
    b.extrude(lid, w, 'wood', { y: h, ry: Math.PI / 2 });
    for (const x of [-w / 2 + 1.5, 0, w / 2 - 1.5]) b.add(arcTorus(d / 2 + 0.2, 0.45, 6, 20, Math.PI), 'brass', { x, y: h, ry: Math.PI / 2 });
    b.boxOn(2.4, 2.8, 0.9, 'brass', { y: h - 1.6, z: d / 2 + 0.2 });
    // spilled coins
    for (let i = 0; i < 9; i++) b.cyl(0.9, 0.9, 0.35, 'brass', { x: r.range(-6, 6), z: d / 2 + r.range(1, 5), y: 0.2 + i * 0.05, rx: r.soft() * 0.2 }, 10);
    return 8;
  },
  table(b, r) {
    const w = 25, d = 14, h = 13;
    b.add(topBox(w, 1.6, d, 0.4, grainTop(r.int(1, 99))), 'wood', { y: h - 1.6 });
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) b.block(1.8, h - 1.6, 1.8, 'wood2', { x: ex * (w / 2 - 2), z: ez * (d / 2 - 2), y: (h - 1.6) / 2 }, { bevel: 0.3, noise: 0.15, seed: r.int(1, 99) });
    for (const ez of [-1, 1]) b.box(w - 4, 1.2, 1, 'wood2', { z: ez * (d / 2 - 2), y: 3 });
    // tankards and a plate
    b.cyl(1.5, 1.6, 3, 'metal2', { x: -6, y: h + 1.5 }, 14);
    b.cyl(1.5, 1.6, 3, 'metal2', { x: 5, z: 3, y: h + 1.5 }, 14);
    b.cyl(3, 3, 0.5, 'metal', { x: 0, z: -2, y: h + 0.25 }, 20);
    return 14;
  },
  bench(b, r) {
    const w = 22, d = 5, h = 7;
    b.add(topBox(w, 1.4, d, 0.4, grainTop(r.int(1, 99))), 'wood', { y: h - 1.4 });
    for (const ex of [-1, 1]) b.block(1.6, h - 1.4, d - 0.6, 'wood2', { x: ex * (w / 2 - 2.5), y: (h - 1.4) / 2 }, { bevel: 0.3, seed: 3 });
    return 11;
  },
  brazier(b, r, c) {
    // tripod with a bowl of coals
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.rod(new THREE.Vector3(Math.cos(a) * 5, 0, Math.sin(a) * 5), new THREE.Vector3(Math.cos(a) * 2.6, 11, Math.sin(a) * 2.6), 0.6, 'metal2', 8);
    }
    b.lathe([[0, 10], [2, 10], [4.6, 12], [5.2, 14], [4.6, 14.2], [0, 13]], 'metal', {}, 24);
    for (let i = 0; i < 9; i++) b.sphere(1.1, i % 3 ? 'stone2' : 'glow', { x: r.soft() * 2.6, z: r.soft() * 2.6, y: 13.6 }, 8);
    for (let i = 0; i < 4; i++) b.cyl(0, 1.2, 4, 'glow', { x: r.soft() * 1.5, z: r.soft() * 1.5, y: 16, rx: r.soft() * 0.2 }, 6); // flames (snip off for plain)
    return 5.5;
  },
  sacks(b, r) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 6.2 + r.soft(), lying = i === 2;
      b.block(6, lying ? 4.5 : 8, 5, 'cloth', { x, y: lying ? 2.2 : 4, z: r.soft(), ry: r.soft() * 0.4, rz: lying ? 1.4 : 0 }, { bevel: 2.2, noise: 0.5, freq: 0.4, seed: r.int(1, 999), res: 1 });
      b.cyl(0.9, 1.4, 1.6, 'cloth', { x: lying ? x + 4.5 : x, y: lying ? 2.3 : 8.6, rz: lying ? Math.PI / 2 : 0 }, 10);
    }
    return 10;
  },
  bookcase(b, r) {
    const w = 20, d = 6, h = 28;
    b.block(w, h, d, 'wood2', { y: h / 2 }, { bevel: 0.4, res: 2 });
    for (let s = 0; s < 4; s++) {
      const y = 2 + s * 6.4;
      b.box(w - 2.4, 5.2, d - 1, 'wood', { y: y + 2.6, z: 0.8 }); // recess back
      let x = -w / 2 + 1.6;
      while (x < w / 2 - 2.2) {
        const bw = r.range(0.9, 1.8), bh = r.range(3.6, 4.9);
        b.boxOn(bw - 0.15, bh, d - 2, r.pick(['accent', 'cloth', 'wood', 'brass'] as const), { x: x + bw / 2, y, z: 1.2, rz: r.chance(0.1) ? 0.2 : 0 });
        x += bw;
      }
    }
    return 11;
  },
  rubble(b, r) {
    for (let i = 0; i < 9; i++) rubble(b, r.soft() * 5, r.soft() * 5, 0, r.range(2, 4.5), r, 1);
    b.block(9, 3, 4, 'stone', { y: 1.6, ry: r.range(0, 3), rz: 0.3 }, { bevel: 0.6, noise: 0.5, seed: 4 });
    return 9;
  },
  amphora(b, r) {
    const prof: [number, number][] = [[0, 0], [1.4, 0], [1.6, 1], [3.6, 5], [3.9, 8], [3.2, 11], [1.3, 13], [1.1, 15.5], [1.8, 16], [1.6, 16.6], [0, 16.4]];
    b.lathe(prof, r.chance(0.6) ? 'accent' : 'cloth', {}, 28);
    for (const s of [-1, 1]) b.add(arcTorus(1.6, 0.45, 6, 16, Math.PI), 'accent', { x: s * 1.8, y: 13.6, ry: s > 0 ? 0 : Math.PI, rz: -Math.PI / 2 });
    return 4.2;
  },
  urn(b, r) {
    b.lathe([[0, 0], [3, 0], [3.2, 1.2], [2.2, 2], [4.6, 6], [4.8, 8], [3.4, 10.5], [3.8, 11.5], [0, 11.2]], 'stone', {}, 32);
    b.add(new THREE.TorusGeometry(4.75, 0.35, 6, 32), 'brass', { y: 7, rx: Math.PI / 2 });
    return 5;
  },
  drum(b, r) {
    // fallen column drums
    for (let i = 0; i < 2; i++) b.add(fluted(6.5, 7, 16, 0.6, 1, 3), 'stone', { x: i * 15 - 7, y: i ? 6.5 : 3.5, rx: i ? Math.PI / 2 : 0, ry: r.range(0, 1) });
    return 14;
  },
  altar(b, r) {
    b.block(20, 3, 12, 'stone2', { y: 1.5 }, { bevel: 0.6, noise: 0.25, seed: 2 });
    b.block(16, 8, 9, 'stone', { y: 7 }, { bevel: 0.6, noise: 0.25, seed: 3 });
    b.block(19, 2, 11, 'stone2', { y: 12 }, { bevel: 0.5, noise: 0.2, seed: 4 });
    for (const x of [-6, 6]) b.cyl(1.2, 1.4, 4, 'cloth', { x, y: 15 }, 12);
    b.lathe([[0, 13], [2.6, 13], [3.2, 14.5], [0, 14.2]], 'brass', {}, 20);
    return 11;
  },
  statue(b, r) {
    b.block(14, 10, 14, 'stone2', { y: 5 }, { bevel: 0.8, noise: 0.3, seed: 5 });
    b.block(16, 2, 16, 'stone', { y: 1 }, { bevel: 0.6, noise: 0.2, seed: 6 });
    b.block(15, 1.6, 15, 'stone', { y: 10.8 }, { bevel: 0.5, noise: 0.2, seed: 7 });
    // broken-off legs and feet of a giant statue
    for (const x of [-3, 3]) {
      b.block(4, 2.2, 6, 'stone', { x, y: 12.6, z: 1 }, { bevel: 1, noise: 0.3, seed: 8 });
      b.block(3.4, r.range(4, 9), 3.4, 'stone', { x, y: 15 + 2, z: -0.5 }, { bevel: 1.2, noise: 0.5, seed: r.int(1, 99), chip: 1 });
    }
    return 9;
  },
  cannon(b, r) {
    // carriage
    for (const s of [-1, 1]) b.add(topBox(16, 1.4, 6, 0.4, grainTop(r.int(1, 99))), 'wood', { z: s * 3.2, y: 5, rx: s * Math.PI / 2 });
    b.box(12, 1.6, 5, 'wood2', { y: 2.6 });
    for (const x of [-5, 5]) for (const s of [-1, 1]) b.cyl(2.6, 2.6, 1.4, 'wood2', { x, z: s * 4.4, y: 2.6, rx: Math.PI / 2 }, 16);
    // barrel
    const prof: [number, number][] = [[0, 0], [2.6, 0], [2.6, 1], [3.2, 1.5], [2.9, 3], [2.4, 10], [2.2, 17], [2.7, 18], [2.5, 19], [1.2, 19], [1.2, 17], [0, 17]];
    b.lathe(prof, 'metal2', { x: 8, y: 7, rz: Math.PI / 2 + 0.08 }, 24);
    b.sphere(1.4, 'metal2', { x: 8.6, y: 7.1 }, 10);
    for (let i = 0; i < 4; i++) b.sphere(1.5, 'metal2', { x: -6 - (i % 2) * 3, z: 7 + Math.floor(i / 2) * 3, y: 1.5 + (i === 3 ? 2.2 : 0) }, 10);
    return 13;
  },
  anchor(b) {
    b.cyl(0.9, 0.9, 18, 'metal2', { y: 1.2, rz: Math.PI / 2 }, 12);
    b.add(arcTorus(8, 1, 8, 24, Math.PI), 'metal2', { x: -8, y: 1.2, rx: Math.PI / 2, rz: Math.PI / 2 });
    for (const s of [-1, 1]) b.add(new THREE.ConeGeometry(2, 3.4, 4), 'metal2', { x: -8, z: s * 8.2, y: 1.2, rx: Math.PI / 2 * s, ry: 0 });
    b.box(1.6, 1.6, 12, 'wood', { x: 7, y: 1.2 });
    b.add(new THREE.TorusGeometry(1.8, 0.5, 8, 16), 'metal2', { x: 10.5, y: 1.2, rx: Math.PI / 2 });
    return 12;
  },
  ropecoil(b) {
    for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(4.2 - i * 0.3, 0.9, 8, 28), 'cloth', { y: 0.9 + i * 1.5, rx: Math.PI / 2, rz: i * 0.4 });
    b.cyl(3.2, 3.2, 0.8, 'cloth', { y: 0.4 }, 20);
    return 5.5;
  },
  gears(b, r) {
    const gear = (R: number, teeth: number, t: number, y: number, x: number, z: number) => {
      b.cyl(R, R, t, 'brass', { x, y, z }, 40);
      for (let i = 0; i < teeth; i++) { const a = (i / teeth) * Math.PI * 2; b.box(1.6, t, 1.6, 'brass', { x: x + Math.cos(a) * (R + 0.6), z: z + Math.sin(a) * (R + 0.6), y, ry: -a }); }
      b.cyl(R * 0.35, R * 0.35, t + 0.8, 'metal2', { x, y, z }, 16);
    };
    gear(7, 18, 2, 1, 0, 0);
    gear(4.6, 12, 2, 3.2, 2, 1);
    gear(3, 9, 1.6, 5, 0.5, -1);
    return 8.5;
  },
  boiler(b) {
    b.lathe([[0, 0], [7, 0], [7.4, 1], [7.4, 18], [6.4, 21], [3, 23], [0, 23]], 'metal', {}, 32);
    for (const y of [3, 9, 15]) b.add(new THREE.TorusGeometry(7.5, 0.5, 6, 32), 'brass', { y, rx: Math.PI / 2 });
    b.cyl(1.6, 1.6, 10, 'brass', { y: 26 }, 14);
    b.cyl(2.6, 2.6, 2, 'metal2', { y: 31 }, 14);
    b.cyl(2.6, 2.6, 1, 'brass', { z: 7.4, y: 12, rx: Math.PI / 2 }, 24);
    b.cyl(2, 2, 1.2, 'cloth', { z: 7.7, y: 12, rx: Math.PI / 2 }, 24);
    b.block(5, 4, 1, 'metal2', { z: 7.4, y: 5 }, { bevel: 0.3 });
    return 8;
  },
  valve(b) {
    b.cyl(2, 2, 20, 'brass', { y: 4, rz: Math.PI / 2 }, 16);
    b.cyl(2, 2, 14, 'brass', { x: 9, y: 11, }, 16);
    b.sphere(2.4, 'metal2', { x: 9, y: 4 }, 14);
    for (const x of [-6, 2]) b.cyl(2.9, 2.9, 1.4, 'metal2', { x, y: 4, rz: Math.PI / 2 }, 16);
    b.box(3.4, 3.4, 3.4, 'metal2', { x: -1.6, y: 4 });
    b.cyl(0.6, 0.6, 4, 'metal2', { x: -1.6, y: 7.4 }, 8);
    b.add(new THREE.TorusGeometry(3, 0.5, 8, 24), 'accent', { x: -1.6, y: 9.6, rx: Math.PI / 2 });
    for (let i = 0; i < 4; i++) b.box(6, 0.5, 0.5, 'accent', { x: -1.6, y: 9.6, ry: (i * Math.PI) / 4 });
    for (const x of [-9, 9]) b.block(4, 4, 6, 'metal2', { x, y: 2 }, { bevel: 0.5 });
    return 11;
  },
  tesla(b) {
    b.block(10, 3, 10, 'metal2', { y: 1.5 }, { bevel: 0.6 });
    b.cyl(2.4, 3, 14, 'brass', { y: 10 }, 20);
    for (let i = 0; i < 10; i++) b.add(new THREE.TorusGeometry(2.7 - i * 0.04, 0.35, 6, 20), 'brass', { y: 4.5 + i * 1.2, rx: Math.PI / 2 });
    b.add(new THREE.TorusGeometry(4, 1.6, 12, 32), 'metal', { y: 18.5, rx: Math.PI / 2 });
    b.sphere(1.4, 'glow', { y: 20.4 }, 12);
    return 5.5;
  },
  workbench(b, r) {
    P.table(b, r, undefined as any);
    b.block(5, 4, 4, 'metal2', { x: 8, y: 15 }, { bevel: 0.4 }); // vice
    b.cyl(0.5, 0.5, 6, 'metal2', { x: -4, y: 13.4, rz: Math.PI / 2 }, 8);
    return 14;
  },
  drum2(b, r) { return P.drum(b, r, undefined as any); },
  oil(b, r) {
    const R = 5, H = 14;
    b.cyl(R, R, H, r.chance(0.5) ? 'accent' : 'metal', { y: H / 2 }, 28);
    for (const y of [H * 0.33, H * 0.66]) b.add(new THREE.TorusGeometry(R + 0.1, 0.4, 6, 28), 'metal2', { y, rx: Math.PI / 2 });
    b.add(new THREE.TorusGeometry(R - 0.3, 0.4, 6, 28), 'metal2', { y: H, rx: Math.PI / 2 });
    b.cyl(0.9, 0.9, 0.6, 'metal2', { x: 2.4, y: H + 0.2 }, 10);
    return R;
  },
  barrier(b) {
    b.extrude(polyShape([[-6, 0], [6, 0], [6, 1.5], [2.6, 5], [1.8, 14], [-1.8, 14], [-2.6, 5], [-6, 1.5]]), 30, 'stone', { ry: Math.PI / 2 }, 0.3);
    b.boxOn(6, 0.3, 1.2, 'accent', { y: 10, z: 1.9, x: -8, rx: -0.03 });
    return 15;
  },
  sandbags(b, r) {
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - (row ? 1 : 0); i++) {
      b.block(7.4, 3, 4.6, 'cloth', { x: -11 + i * 7.6 + (row % 2) * 3.8, y: 1.5 + row * 2.7, z: r.soft() * 0.3, ry: r.soft() * 0.06 }, { bevel: 1.3, noise: 0.35, freq: 0.5, seed: r.int(1, 999), res: 0.9 });
    }
    return 15;
  },
  pallet(b, r) {
    for (let i = 0; i < 5; i++) b.add(topBox(20, 0.8, 2.6, 0.4, grainTop(r.int(1, 99))), 'wood', { z: -6 + i * 3, y: 2.6 });
    for (const z of [-6, 0, 6]) b.box(20, 1.8, 2, 'wood2', { z, y: 1.4 });
    for (let i = 0; i < 3; i++) {
      const s = r.range(6, 8.5);
      b.block(s, s * 0.8, s, 'cloth', { x: -5 + i * 5.5, y: 3.4 + s * 0.4 + (i === 2 ? 0 : 0), z: r.soft() * 2 }, { bevel: 0.4, noise: 0.2, seed: r.int(1, 99) });
      b.box(s * 0.9, 0.2, 1.2, 'accent', { x: -5 + i * 5.5, y: 3.4 + s * 0.8 + 0.1, z: r.soft() * 2 });
    }
    return 11;
  },
  cone(b) {
    b.boxOn(5.6, 0.7, 5.6, 'accent', {});
    b.cyl(0.6, 2.2, 8, 'accent', { y: 4.5 }, 20);
    for (const y of [3.6, 5.8]) b.add(new THREE.TorusGeometry(2.2 - (y - 0.7) * 0.2 + 0.05, 0.25, 6, 20), 'cloth', { y, rx: Math.PI / 2 });
    return 3.5;
  },
  generator(b, r) {
    b.block(18, 9, 10, 'accent', { y: 6 }, { bevel: 0.8, res: 2 });
    for (const x of [-8, 8]) b.add(arcTorus(4.4, 0.6, 6, 20, Math.PI), 'metal2', { x, y: 6.5, ry: Math.PI / 2 });
    for (const x of [-6, 6]) for (const z of [-3.5, 3.5]) b.cyl(1.6, 1.6, 1.2, 'metal2', { x, z, y: 1.6, rx: Math.PI / 2 }, 14);
    for (let i = 0; i < 6; i++) b.box(0.6, 5, 0.6, 'metal2', { x: -4 + i * 1.4, y: 6.5, z: 5.2 });
    b.cyl(1, 1, 5, 'metal2', { x: 6, z: -2, y: 12.5 }, 10);
    return 10;
  },
  vending(b, r) {
    b.block(14, 28, 10, 'metal', { y: 14 }, { bevel: 0.8, res: 2.5 });
    b.block(9, 20, 1, 'glow', { x: -1.5, y: 16, z: 5 }, { bevel: 0.3, res: 2 });
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) b.boxOn(1.6, 3, 0.8, r.pick(['accent', 'brass', 'cloth'] as const), { x: -4.5 + k * 3, y: 8 + i * 4.6, z: 5.6 });
    b.box(2.6, 6, 0.8, 'metal2', { x: 5, y: 17, z: 5.2 });
    b.box(8, 2.6, 0.8, 'metal2', { x: -1.5, y: 3.5, z: 5.2 });
    return 9;
  },
  terminal(b) {
    b.block(8, 14, 6, 'metal', { y: 7 }, { bevel: 0.6, res: 2 });
    b.block(10, 7, 2, 'metal2', { y: 17, z: 1, rx: -0.3 }, { bevel: 0.5, res: 2 });
    b.box(8, 5, 0.6, 'glow', { y: 17.2, z: 2.2, rx: -0.3 });
    b.block(9, 1.2, 4, 'metal2', { y: 12, z: 4, rx: 0.3 }, { bevel: 0.3 });
    for (let i = 0; i < 3; i++) b.cyl(0.5, 0.5, 6, 'accent', { x: -3 + i * 1.4, y: 3, z: -4, rx: 0.4 }, 6);
    return 6;
  },
  hazard(b, r) {
    for (let i = 0; i < 3; i++) {
      const g = new Builder();
      P.oil(g, r, undefined as any);
      for (const p of g.parts) b.add(p.geo, i === 1 ? 'accent' : p.mat, { x: (i - 1) * 10.6, z: i === 1 ? 4 : 0 });
      b.boxOn(4, 0.4, 0.4, 'accent', { x: (i - 1) * 10.6, y: 7, z: 5 + (i === 1 ? 4 : 0) });
    }
    b.cyl(5, 5.5, 0.6, 'glow', { x: 5, z: 9, y: 0.3 }, 24); // spill
    return 16;
  },
  scicrate(b, r) {
    const s = r.range(11, 14);
    b.block(s, s * 0.8, s, 'metal', { y: s * 0.4 }, { bevel: 1.2, res: 2.2 });
    for (const sd of [-1, 1]) {
      b.block(s - 4, s * 0.8 - 4, 0.8, 'metal2', { y: s * 0.4, z: sd * (s / 2), }, { bevel: 0.3, res: 2 });
      b.box(s - 6, 0.8, 0.5, 'glow', { y: s * 0.65, z: sd * (s / 2 + 0.4) });
      b.box(0.6, s * 0.8 - 3, 0.5, 'accent', { x: s / 2 - 3, y: s * 0.4, z: sd * (s / 2 + 0.4) });
    }
    for (const ex of [-1, 1]) for (const ez of [-1, 1]) b.block(2.6, s * 0.8 + 0.4, 2.6, 'metal2', { x: ex * (s / 2 - 0.9), z: ez * (s / 2 - 0.9), y: s * 0.4 }, { bevel: 0.5 });
    return s * 0.75;
  },
  spool(b) {
    for (const z of [-4, 4]) b.cyl(7, 7, 1.4, 'wood', { y: 7, z, rx: Math.PI / 2 }, 32);
    b.cyl(4, 4, 7, 'wood2', { y: 7, rx: Math.PI / 2 }, 20);
    for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(5, 0.8, 6, 28), 'metal2', { y: 7, z: -2.4 + i * 1.6 });
    return 7.5;
  },
  sign(b, r) {
    b.cyl(0.8, 0.8, 24, 'metal2', { y: 12 }, 10);
    b.block(12, 7, 1.6, 'metal2', { y: 21, x: 5 }, { bevel: 0.4, res: 2 });
    for (let i = 0; i < 2; i++) b.box(9 - i * 2, 1, 1, 'glow', { y: 22.5 - i * 2.6, x: 5, z: 1.1 });
    b.cyl(4, 4, 1.4, 'metal2', { y: 0.7 }, 20);
    return 6;
  },
  cargopod(b) {
    const prof: [number, number][] = [[0, -13]];
    for (let i = 1; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push([Math.sin(a) * 6, -7 - Math.cos(a) * 6]); }
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * (Math.PI / 2); prof.push([Math.cos(a) * 6, 7 + Math.sin(a) * 6]); }
    prof.push([0, 13]);
    b.lathe(prof, 'metal', { y: 6.5, rz: Math.PI / 2 }, 28);
    for (const x of [-5, 5]) b.add(new THREE.TorusGeometry(6.3, 0.8, 8, 32), 'metal2', { x, y: 6.5, ry: Math.PI / 2 });
    b.box(10, 0.8, 0.6, 'accent', { y: 10, z: 5.4, rx: -0.5 });
    for (const x of [-8, 8]) b.block(4, 2, 12, 'metal2', { x, y: 1 }, { bevel: 0.4 });
    b.box(1, 3, 0.8, 'glow', { y: 6.5, z: 6.2, x: 0 });
    return 13;
  },
  console(b) {
    b.extrude(polyShape([[-5, 0], [5, 0], [5, 9], [2, 14], [-5, 14]]), 18, 'metal', { ry: Math.PI / 2, x: 0 }, 0.4);
    b.box(16, 0.6, 5, 'glow', { y: 11.6, z: 3.3, rx: -1.03 });
    for (let i = 0; i < 6; i++) b.box(1.4, 0.8, 1.4, i % 2 ? 'accent' : 'metal2', { x: -6 + i * 2.4, y: 9.3, z: 5.1 });
    b.box(16, 4, 0.6, 'metal2', { y: 4, z: 5.2 });
    return 11.5;
  },
  powercell(b) {
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * 7;
      b.cyl(2.8, 2.8, 12, 'metal', { x, y: 6 }, 20);
      b.cyl(2.2, 2.2, 8, 'glow', { x, y: 6 }, 20);
      for (let k = 0; k < 4; k++) b.box(0.8, 9, 0.8, 'metal2', { x: x + Math.cos(k * 1.57 + 0.78) * 2.6, z: Math.sin(k * 1.57 + 0.78) * 2.6, y: 6 });
      b.cyl(1.4, 1.4, 1.2, 'metal2', { x, y: 12.6 }, 12);
    }
    b.block(22, 2, 7, 'metal2', { y: 1 }, { bevel: 0.4 });
    return 11;
  },
  barricade(b, r) {
    b.extrude(polyShape([[-3, 0], [3, 0], [3, 2], [1.4, 11], [-1.4, 11], [-3, 2]]), 24, 'metal', { ry: Math.PI / 2 }, 0.4);
    for (const x of [-8, 0, 8]) b.box(6, 2.4, 0.6, 'accent', { x, y: 7, z: 1.9, rx: -0.15 });
    for (const x of [-10, 10]) b.block(3, 3, 8, 'metal2', { x, y: 1.5 }, { bevel: 0.5 });
    b.box(20, 0.6, 0.6, 'glow', { y: 10.8 });
    return 13;
  },
  holotable(b) {
    b.lathe([[0, 0], [6, 0], [6, 1], [3, 2.5], [3, 9], [9, 10], [9, 11.5], [0, 11.5]], 'metal', {}, 40);
    b.cyl(8, 8, 0.6, 'glow', { y: 11.6 }, 40);
    b.lathe([[0, 12], [5, 12], [2, 17], [3.5, 20], [0, 22]], 'glow', {}, 24); // the hologram (snip off to print plain)
    return 9.5;
  },
  crystalcluster(b, r) {
    rubble(b, 0, 0, 0, 3.5, r, 4);
    crystalCluster(b, 0, 0.5, 0, r, 1.1);
    return 7;
  },
  eggs(b, r) {
    for (let i = 0; i < 5; i++) {
      const x = r.soft() * 7, z = r.soft() * 7, s = r.range(0.8, 1.1);
      b.lathe([[0, 0], [2.4 * s, 0.4], [3.8 * s, 3.5 * s], [3.4 * s, 7 * s], [1.8 * s, 9.6 * s], [0, 10.2 * s]], 'organic', { x, z, rx: r.soft() * 0.2, rz: r.soft() * 0.2 }, 20);
      if (r.chance(0.4)) b.sphere(1, 'glow', { x, z, y: 10 * s }, 8);
    }
    b.block(16, 2, 14, 'organic', { y: 0.4 }, { bevel: 0.9, noise: 0.8, freq: 0.3, seed: 3 });
    return 9;
  },
  stalks(b, r) {
    for (let i = 0; i < 4; i++) {
      const x = r.soft() * 6, z = r.soft() * 6, h = r.range(12, 24);
      const pts = [];
      for (let k = 0; k <= 8; k++) pts.push(new THREE.Vector3(x + Math.sin(k * 0.6 + i) * 1.4, (k / 8) * h, z + Math.cos(k * 0.5 + i) * 1.2));
      b.add(tube(new THREE.CatmullRomCurve3(pts), 24, 0.9, 8, false), 'organic');
      b.sphere(2.4, 'glow', { x: pts[8].x, y: h, z: pts[8].z, sy: 0.8 }, 14);
      b.sphere(1, 'organic', { x, z, y: 0 }, 8);
    }
    b.block(14, 1.6, 14, 'organic', { y: 0.3 }, { bevel: 0.7, noise: 0.6, freq: 0.3, seed: 4 });
    return 8;
  },
  bones(b, r) {
    // giant ribcage arching out of the ground
    for (let i = 0; i < 5; i++) {
      const z = -10 + i * 5;
      for (const s of [-1, 1]) {
        const pts = [];
        for (let k = 0; k <= 10; k++) {
          const t = k / 10;
          pts.push(new THREE.Vector3(s * (4 + Math.sin(t * Math.PI * 0.9) * 8), Math.sin(t * Math.PI) * 15 * (1 - i * 0.08), z));
        }
        b.add(tube(new THREE.CatmullRomCurve3(pts), 24, 1.1 - k0(t0(i)), 8, false), 'cloth');
      }
    }
    b.cyl(1.6, 1.6, 26, 'cloth', { y: 0.8, rx: Math.PI / 2 }, 12);
    return 14;
  },
};
function t0(i: number) { return i; }
function k0(i: number) { return i * 0.08; }

// era aliases
P.drum = P.drum;
P.oildrum = P.oil;

export function scatter(b: Builder, item: string, count: number, c: Ctx) {
  const fn = P[item === 'drum' && c ? 'drum' : item] ?? P.crate;
  const rng = c.rng.fork(41);
  // modern "drum" = oil drum, ancient "drum" = column drum
  const f = item === 'drum' && c.era !== 'ancient' ? P.oil : fn;
  const placed: { x: number; z: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const g = new Builder();
    const r = f(g, rng.fork(i), c);
    let x = 0, z = 0;
    if (placed.length) {
      let ok = false;
      for (let t = 0; t < 200 && !ok; t++) {
        const a = rng.range(0, Math.PI * 2);
        const reach = Math.max(...placed.map((q) => Math.hypot(q.x, q.z) + q.r)) + r + 2;
        const d = rng.range(r + placed[0].r + 1.5, reach);
        x = Math.cos(a) * d; z = Math.sin(a) * d;
        ok = placed.every((q) => Math.hypot(q.x - x, q.z - z) > q.r + r + 1.5);
      }
      if (!ok) { x = placed.reduce((m, q) => Math.max(m, q.x + q.r), 0) + r + 2; z = 0; }
    }
    placed.push({ x, z, r });
    const ry = rng.range(0, Math.PI * 2);
    for (const p of g.parts) b.add(p.geo, p.mat, { x, z, ry });
  }
  return placed;
}

export const PROP_NAMES = Object.keys(P);
export { roundRect, tuft };

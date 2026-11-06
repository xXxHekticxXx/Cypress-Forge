// Dungeon furniture (bars, cells, cages, chains, rack, stocks, a chained skeleton) and traps for every era.
import * as THREE from 'three';
import { Builder, Rng, polyShape, lathe, arcTorus, tube } from './core';
import { floorSurface, rubble, rivetRow, crystalCluster, tuft, type Ctx } from './floors';
import { wall } from './walls';

/** A chain of oval links, alternately turned, overlapping slightly so it prints as one strand. */
export function chain(b: Builder, from: THREE.Vector3, to: THREE.Vector3, sag = 0, link = 3.2, thick = 0.55) {
  const pts: THREE.Vector3[] = [];
  const n = Math.max(2, Math.round(from.distanceTo(to) / (link * 0.78)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(from.clone().lerp(to, t).add(new THREE.Vector3(0, -Math.sin(t * Math.PI) * sag, 0)));
  }
  for (let i = 0; i < n; i++) {
    const a = pts[i], c = pts[i + 1];
    const mid = a.clone().add(c).multiplyScalar(0.5);
    const dir = c.clone().sub(a).normalize();
    const g = new THREE.TorusGeometry(link * 0.32, thick, 6, 14);
    g.scale(1.45, 1, 1);
    // align the long axis of the link with the chain, turn every other link 90°
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
    const twist = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), i % 2 ? Math.PI / 2 : 0);
    g.applyQuaternion(twist);
    g.applyQuaternion(q);
    g.translate(mid.x, mid.y, mid.z);
    b.add(g, 'metal2');
  }
}

function ironBars(b: Builder, x0: number, x1: number, y0: number, h: number, z: number, gap = 4) {
  const n = Math.max(2, Math.round((x1 - x0) / gap));
  for (let i = 0; i <= n; i++) b.cyl(0.8, 0.8, h, 'metal2', { x: x0 + ((x1 - x0) * i) / n, y: y0 + h / 2, z }, 10);
  for (const f of [0.08, 0.55, 0.94]) {
    b.box(x1 - x0 + 2, 1.4, 2.2, 'metal', { x: (x0 + x1) / 2, y: y0 + h * f, z });
    for (let i = 0; i <= n; i++) b.sphere(0.55, 'metal2', { x: x0 + ((x1 - x0) * i) / n, y: y0 + h * f, z: z + 1.15, sz: 0.6 }, 8);
  }
}

function stonePost(b: Builder, x: number, y0: number, h: number, w: number, z: number, rng: Rng) {
  let y = 0;
  while (y < h - 0.5) {
    const ch = Math.min(rng.range(5, 7), h - y);
    b.block(w, ch - 0.6, w, rng.chance(0.5) ? 'stone' : 'stone2', { x, y: y0 + y + ch / 2, z }, { bevel: 0.8, noise: 0.45, freq: 0.4, seed: rng.int(1, 9999), chip: 0.4 });
    y += ch;
  }
}

export function dungeon(b: Builder, item: string, W: number, D: number, H: number, y0: number, c: Ctx) {
  const rng = c.rng.fork(61);
  const sq = c.sq;
  switch (item) {
    case 'bars':
    case 'celldoor': {
      const top = floorSurface(b, 'flagstone', W, D, y0, c);
      const z = -D / 2 + 6;
      const pw = 7;
      stonePost(b, -W / 2 + pw / 2, top, H, pw, z, rng);
      stonePost(b, W / 2 - pw / 2, top, H, pw, z, rng);
      b.block(W, 5, pw, 'stone', { y: top + H + 2.5, z }, { bevel: 0.8, noise: 0.4, seed: rng.int(1, 999), chip: 0.4 });
      if (item === 'bars') ironBars(b, -W / 2 + pw, W / 2 - pw, top, H, z);
      else {
        const dw = Math.min(sq * 0.9, W - pw * 2 - 4);
        ironBars(b, -W / 2 + pw, -dw / 2 - 1, top, H, z);
        ironBars(b, dw / 2 + 1, W / 2 - pw, top, H, z);
        // the barred door, hung on hinges and padlocked
        const door = new Builder();
        ironBars(door, -dw / 2, dw / 2, 0, H * 0.82, 0, 3.4);
        for (const y of [0.2, 0.7]) door.cyl(1.2, 1.2, 3, 'metal2', { x: -dw / 2 - 1.2, y: H * 0.82 * y }, 10);
        door.box(3.2, 4, 2.2, 'metal2', { x: dw / 2 - 1, y: H * 0.42, z: 1.6 });
        door.add(arcTorus(1.2, 0.45, 6, 12, Math.PI), 'metal2', { x: dw / 2 - 1, y: H * 0.42 + 2, z: 1.6 });
        for (const p of door.parts) b.add(p.geo, p.mat, { y: top, z, x: 0 });
      }
      break;
    }
    case 'cage': {
      // a gibbet: post, arm, chain and a hanging cage
      const top = floorSurface(b, 'flagstone', W, D, y0, c);
      const px = -W / 2 + 6;
      const postH = H * 1.35;
      b.block(4.4, postH, 4.4, 'wood', { x: px, y: top + postH / 2 }, { bevel: 0.6, noise: 0.35, freq: 0.5, seed: 2, chip: 0.4 });
      b.block(W - 8, 4, 4, 'wood', { x: px + (W - 8) / 2 - 2, y: top + postH - 2 }, { bevel: 0.5, noise: 0.3, seed: 3 });
      b.block(3.4, 14, 3.4, 'wood2', { x: px + 6, y: top + postH - 8, rz: -0.75 }, { bevel: 0.4, noise: 0.3, seed: 4 }); // brace
      for (const s of [-1, 1]) b.block(3, 3, 12, 'wood2', { x: px, y: top + 1.5, z: s * 5 }, { bevel: 0.4, seed: 5 });
      const cx = W / 2 - 13, cageTop = top + postH - 14, cageH = H * 0.6, R = 7;
      chain(b, new THREE.Vector3(cx, top + postH - 4, 0), new THREE.Vector3(cx, cageTop + 4, 0));
      for (const y of [0, cageH * 0.5, cageH]) b.add(new THREE.TorusGeometry(R, 0.7, 6, 32), 'metal2', { x: cx, y: cageTop - cageH + y, rx: Math.PI / 2 });
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        b.cyl(0.6, 0.6, cageH, 'metal2', { x: cx + Math.cos(a) * R, z: Math.sin(a) * R, y: cageTop - cageH / 2 }, 8);
        b.add(arcTorus(R, 0.6, 6, 12, Math.PI / 2), 'metal2', { x: cx, y: cageTop, ry: -a, rx: 0, rz: 0, sz: 1 }); // dome bars
      }
      b.cyl(R, R, 1.2, 'metal', { x: cx, y: cageTop - cageH, }, 32);
      b.add(new THREE.TorusGeometry(1.6, 0.6, 6, 16), 'metal2', { x: cx, y: cageTop + R + 1.5 });
      // what's left of the last prisoner
      b.sphere(2.2, 'bone', { x: cx + 2, y: cageTop - cageH + 2.6 }, 14);
      for (let i = 0; i < 4; i++) b.cyl(0.6, 0.6, 7, 'bone', { x: cx - 2 + i, y: cageTop - cageH + 1.4, z: -2 + i, rz: Math.PI / 2, ry: i }, 8);
      break;
    }
    case 'shackles':
    case 'bones': {
      const T = 10;
      const top = floorSurface(b, 'flagstone', W, D, y0, c);
      wall(b.sub({ z: -D / 2 + T / 2 }), { L: W, H, T, y0: top, style: 'fieldstone', top: 'flat', opening: 'none', c: { ...c, rng: c.rng.fork(3) } });
      const wz = -D / 2 + T + 0.8;
      const pairs = item === 'bones' ? [0] : [-W / 4, W / 4];
      for (const x of pairs) for (const e of [-1, 1]) {
        const ring = new THREE.Vector3(x + e * 5, top + H * 0.62, wz);
        b.box(3, 4, 1.2, 'metal2', { x: ring.x, y: ring.y + 1, z: wz - 0.4 });
        b.add(new THREE.TorusGeometry(1.6, 0.55, 6, 16), 'metal2', { x: ring.x, y: ring.y - 1.2, z: wz + 0.4 });
        const cuff = new THREE.Vector3(x + e * 4, top + H * 0.32, wz + 3.2);
        chain(b, ring.clone().add(new THREE.Vector3(0, -2.8, 0.6)), cuff, 2.5);
        b.add(new THREE.TorusGeometry(2.2, 0.9, 6, 18), 'metal', { x: cuff.x, y: cuff.y - 2.4, z: cuff.z, rx: 1.2 });
      }
      if (item === 'bones') {
        // skeleton slumped against the wall, wrists still in the irons
        const sx = 0, sz = wz + 5;
        b.lathe([[0, 0], [2.6, 0], [3, 2.6], [2.2, 4.4], [0, 4.8]], 'bone', { x: sx, y: top + H * 0.32 + 0.6, z: sz - 1, rx: -0.35 }, 18); // skull
        for (let i = 0; i < 6; i++) b.add(arcTorus(3.6 - i * 0.2, 0.45, 5, 14, Math.PI * 1.2), 'bone', { x: sx, y: top + H * 0.24 - i * 1.6, z: sz - 1.2, rx: Math.PI / 2 + 0.3, rz: -Math.PI * 0.1 });
        b.cyl(0.9, 0.9, H * 0.3, 'bone', { x: sx, y: top + H * 0.16, z: sz - 2.8, rx: 0.25 }, 8);
        for (const e of [-1, 1]) {
          b.rod(new THREE.Vector3(sx + e * 3.5, top + H * 0.25, sz - 1.5), new THREE.Vector3(sx + e * 4, top + H * 0.32 - 2, wz + 3.4), 0.6, 'bone', 8);
          b.rod(new THREE.Vector3(sx + e * 2, top + 3, sz), new THREE.Vector3(sx + e * 3, top + 1.2, sz + 11), 0.8, 'bone', 8);
          b.sphere(1.2, 'bone', { x: sx + e * 3, y: top + 1.2, z: sz + 11.5, sy: 0.6 }, 10);
        }
        b.block(9, 3, 6, 'bone', { x: sx, y: top + 2.2, z: sz }, { bevel: 1.2, noise: 0.4, seed: 5 }); // pelvis
        rubble(b, sx + 8, sz + 4, top, 1.6, rng, 4);
      }
      break;
    }
    case 'drain': {
      const top = floorSurface(b, 'flagstone', W, D, y0, c);
      const g = Math.min(W, D) * 0.34;
      b.block(g + 4, 1.2, g + 4, 'stone2', { y: top - 0.2 }, { bevel: 0.4, noise: 0.2, seed: 2 });
      for (let i = 0; i <= 6; i++) b.boxOn(1, 1.6, g, 'metal2', { x: -g / 2 + (i * g) / 6, y: top - 0.6 });
      for (const e of [-1, 1]) b.boxOn(g, 1.6, 1.4, 'metal', { z: e * g / 2, y: top - 0.6 });
      // gutter channels running to the drain
      for (const e of [-1, 1]) for (const s of [-1, 1]) b.boxOn(1.4, 0.8, (D - g) / 2 - 3, 'stone2', { x: e * 2.2, z: s * ((D - g) / 4 + g / 2), y: top });
      break;
    }
    case 'rack': {
      const top = floorSurface(b, 'flagstone', W, D, y0, c);
      const L = W * 0.85, h = 13;
      for (const s of [-1, 1]) {
        b.block(L, 3, 3, 'wood', { y: top + h, z: s * 6 }, { bevel: 0.5, noise: 0.35, seed: 3 + s, chip: 0.3 });
        for (const e of [-1, 1]) b.block(3, h, 3, 'wood2', { x: e * (L / 2 - 2), y: top + h / 2, z: s * 6 }, { bevel: 0.5, noise: 0.3, seed: 6 + e });
      }
      for (let i = 0; i < 5; i++) b.block(2.6, 1.4, 12, 'wood', { x: -L / 2 + 8 + i * ((L - 16) / 4), y: top + h + 0.6 }, { bevel: 0.4, noise: 0.25, seed: 10 + i });
      for (const e of [-1, 1]) {
        b.cyl(2, 2, 15, 'wood2', { x: e * (L / 2 - 2), y: top + h + 2, rx: Math.PI / 2 }, 14);
        for (let k = 0; k < 4; k++) b.box(1.2, 9, 1.2, 'wood', { x: e * (L / 2 - 2), y: top + h + 2, z: 8, rz: (k * Math.PI) / 4 }); // spoked handle
        for (const s of [-1, 1]) chain(b, new THREE.Vector3(e * (L / 2 - 2), top + h + 3.6, s * 2.5), new THREE.Vector3(e * (L / 2 - 9), top + h + 2, s * 2.5), 0.3, 2.6, 0.45);
      }
      break;
    }
    case 'stocks':
    default: {
      const top = floorSurface(b, 'cobble', W, D, y0, c);
      const w = Math.min(W * 0.8, 40), h = 16;
      for (const e of [-1, 1]) b.block(3.4, h + 6, 3.4, 'wood2', { x: e * (w / 2 + 1.7), y: top + (h + 6) / 2 }, { bevel: 0.5, noise: 0.35, seed: 4 + e, chip: 0.3 });
      const board = polyShape([[-w / 2, -3.2], [w / 2, -3.2], [w / 2, 3.2], [-w / 2, 3.2]]);
      for (const xh of [-w / 4, 0, w / 4]) {
        const p = new THREE.Path();
        p.absarc(xh, 0, xh === 0 ? 2.6 : 1.4, 0, Math.PI * 2, true);
        board.holes.push(p);
      }
      b.extrude(board, 3, 'wood', { y: top + h, z: 0 }, 0.3);
      b.box(w + 2, 1, 3.4, 'metal2', { y: top + h, z: 0 });
      b.block(w + 10, 2.4, 4, 'wood2', { y: top + h + 5, z: 0 }, { bevel: 0.4, noise: 0.3, seed: 9 });
      b.block(w * 0.8, 2, 6, 'wood', { y: top + 5, z: 8 }, { bevel: 0.4, noise: 0.25, seed: 10 });
      for (const e of [-1, 1]) b.block(2, 5, 5, 'wood2', { x: e * w * 0.32, y: top + 2.5, z: 8 }, { bevel: 0.3, seed: 11 });
    }
  }
}

// ---------- traps ----------

function spikes(b: Builder, x0: number, z0: number, w: number, d: number, y: number, h: number, mat: 'metal2' | 'wood' | 'bone' = 'metal2', step = 3.2) {
  for (let x = x0 + step / 2; x < x0 + w; x += step) for (let z = z0 + step / 2; z < z0 + d; z += step) b.cyl(0, 0.9, h, mat, { x, z, y: y + h / 2 }, 6);
}

export function trap(b: Builder, item: string, W: number, D: number, y0: number, c: Ctx) {
  const rng = c.rng.fork(71);
  const floor = (style: string) => floorSurface(b, style, W, D, y0, c);
  switch (item) {
    case 'spikepit': {
      // a pit framed by floor stones; spikes stand in it, broken cover planks on the edge
      const pw = W * 0.6, pd = D * 0.6;
      const lift = 6;
      const ring = new Builder();
      const style = c.era === 'ancient' ? 'ashlar' : 'flagstone';
      for (const [x, z, w, d] of [[0, -(pd / 2 + (D - pd) / 4), W, (D - pd) / 2], [0, pd / 2 + (D - pd) / 4, W, (D - pd) / 2], [-(pw / 2 + (W - pw) / 4), 0, (W - pw) / 2, pd], [pw / 2 + (W - pw) / 4, 0, (W - pw) / 2, pd]] as const) {
        ring.boxOn(w, lift, d, 'mortar', { x, z, y: y0 });
        const f = new Builder();
        floorSurface(f, style, w, d, 0, c);
        for (const p of f.parts) ring.add(p.geo, p.mat, { x, z, y: y0 + lift });
      }
      b.parts.push(...ring.parts);
      b.boxOn(pw, 1, pd, 'stone2', { y: y0 });
      spikes(b, -pw / 2, -pd / 2, pw, pd, y0 + 1, lift + 3);
      for (let i = 0; i < 3; i++) b.block(pw * 0.5, 1, 3, 'wood', { x: rng.range(-pw / 4, pw / 4), y: y0 + lift + 1.5, z: -pd / 2 + i * 3.6, ry: rng.soft() * 0.3, rz: rng.soft() * 0.3 }, { bevel: 0.3, noise: 0.3, seed: i, chip: 1 });
      break;
    }
    case 'boulder': {
      const top = floor('ashlar');
      // ramp trough and the great stone ball
      for (const s of [-1, 1]) b.block(W, 4, 4, 'stone2', { y: top + 2, z: s * (D * 0.32) }, { bevel: 0.6, noise: 0.3, seed: 3 + s });
      b.block(Math.min(W, D) * 0.52, Math.min(W, D) * 0.52, Math.min(W, D) * 0.52, 'stone', { x: -W * 0.18, y: top + Math.min(W, D) * 0.26 }, { bevel: Math.min(W, D) * 0.25, noise: 1.2, freq: 0.15, seed: 9, res: 1.2 });
      b.block(6, 1, 6, 'stone2', { x: W * 0.3, y: top + 0.3 }, { bevel: 0.3, noise: 0.2, seed: 4 }); // trigger plate
      break;
    }
    case 'darts':
    case 'pressure': {
      const top = floor(c.era === 'ancient' ? 'ashlar' : 'flagstone');
      // a slightly sunken plate, and a wall strip full of dart holes
      b.block(W * 0.36, 0.8, D * 0.36, 'stone2', { y: top - 0.2 }, { bevel: 0.3, noise: 0.15, seed: 4 });
      const T = 8;
      wall(b.sub({ z: -D / 2 + T / 2 }), { L: W, H: 30, T, y0: top, style: c.era === 'ancient' ? 'ashlar' : 'brick', top: 'flat', opening: 'none', c: { ...c, rng: c.rng.fork(2) } });
      for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) {
        b.cyl(1.1, 1.1, 1.2, 'metal2', { x: -W * 0.3 + i * W * 0.12, y: top + 10 + k * 6, z: -D / 2 + T + 0.4, rx: Math.PI / 2 }, 12);
        b.cyl(0.55, 0.55, 1.4, 'char', { x: -W * 0.3 + i * W * 0.12, y: top + 10 + k * 6, z: -D / 2 + T + 0.6, rx: Math.PI / 2 }, 10);
      }
      break;
    }
    case 'beartrap': {
      const top = floor('dirt');
      for (let t = 0; t < 2; t++) {
        const x = t ? W * 0.2 : -W * 0.2, z = t ? D * 0.15 : -D * 0.15;
        b.add(new THREE.TorusGeometry(5, 0.6, 6, 30), 'metal2', { x, z, y: top + 0.6, rx: Math.PI / 2 });
        for (const s of [-1, 1]) {
          b.add(arcTorus(5, 0.6, 6, 16, Math.PI), 'metal2', { x, z, y: top + 0.8, ry: s > 0 ? 0 : Math.PI, rx: -0.5 * s + Math.PI / 2 - Math.PI / 2 });
          for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI + 0.2; b.cyl(0, 0.7, 2.2, 'metal2', { x: x + Math.cos(a) * 5 * s, z: z + Math.sin(a) * 1.4, y: top + 2.2 }, 5); }
        }
        b.cyl(1.6, 1.6, 0.8, 'metal', { x, z, y: top + 0.5 }, 16);
        chain(b, new THREE.Vector3(x + 5, top + 0.8, z), new THREE.Vector3(x + 11, top + 0.8, z + 3));
        b.cyl(0.8, 0.8, 4, 'metal2', { x: x + 11.5, z: z + 3, y: top + 1.6 }, 8);
      }
      break;
    }
    case 'pendulum': {
      const top = floor('flagstone');
      const h = 44;
      for (const e of [-1, 1]) b.block(4, h, 4, 'wood', { x: e * (W / 2 - 3), y: top + h / 2 }, { bevel: 0.5, noise: 0.35, seed: 3 + e, chip: 0.3 });
      b.block(W - 2, 4, 4, 'wood', { y: top + h }, { bevel: 0.5, noise: 0.3, seed: 6 });
      const pivot = new THREE.Vector3(0, top + h - 2, 0), swing = 0.45;
      const end = new THREE.Vector3(Math.sin(swing) * 26, top + h - 2 - Math.cos(swing) * 26, 0);
      b.rod(pivot, end, 0.9, 'metal2', 8);
      // crescent axe blade
      const blade = new THREE.Shape();
      blade.moveTo(-9, 0);
      blade.quadraticCurveTo(0, -9, 9, 0);
      blade.quadraticCurveTo(0, -4, -9, 0);
      b.extrude(blade, 1.2, 'metal', { x: end.x, y: end.y + 1.5, rz: swing }, 0.2);
      b.cyl(1.6, 1.6, 6, 'metal2', { y: pivot.y, rx: Math.PI / 2 }, 12);
      break;
    }
    case 'trapdoor':
    case 'nettrap': {
      const top = floor('deck');
      const tw = Math.min(W, D) * 0.5;
      b.boxOn(tw + 2, 0.8, tw + 2, 'char', { y: top - 0.6 }); // the dark hole
      // hinged-open door standing up on one side
      const door = new Builder();
      door.block(tw, tw, 1.6, 'wood', {}, { bevel: 0.3, noise: 0.3, seed: 5 });
      for (const y of [-tw / 3, tw / 3]) door.box(tw, 1.6, 0.8, 'metal2', { y, z: 1.1 });
      for (const p of door.parts) b.add(p.geo, p.mat, { z: -tw / 2 - 1.5, y: top + tw / 2, rx: 0.15 });
      if (item === 'nettrap') {
        // the net, sprung and hanging from a beam
        b.block(W * 0.9, 3, 3, 'wood', { y: top + 46, z: tw / 2 + 5 }, { bevel: 0.4, noise: 0.3, seed: 8 });
        for (const e of [-1, 1]) b.block(3, 46, 3, 'wood2', { x: e * (W * 0.45 - 1.5), y: top + 23, z: tw / 2 + 5 }, { bevel: 0.4, noise: 0.3, seed: 9 + e });
        const cx = 0, cy = top + 30, cz = tw / 2 + 5;
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.rod(new THREE.Vector3(cx, top + 44, cz), new THREE.Vector3(cx + Math.cos(a) * 6, cy - 6, cz + Math.sin(a) * 6), 0.4, 'cloth', 5); }
        for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(3 + k * 1.4, 0.4, 4, 24), 'cloth', { x: cx, y: cy + 2 - k * 4, z: cz, rx: Math.PI / 2 });
      }
      break;
    }
    case 'powder': {
      const top = floor('planks');
      for (let i = 0; i < 4; i++) {
        const R = 4.2, H = 10;
        const x = (i % 2) * 9 - 4.5, z = Math.floor(i / 2) * 9 - 4.5;
        b.lathe([[0, 0], [R * 0.85, 0], [R, H / 2], [R * 0.85, H], [0, H]], 'wood', { x, z, y: top }, 24);
        for (const f of [0.15, 0.85]) b.add(new THREE.TorusGeometry(R * 0.9, 0.4, 5, 24), 'metal2', { x, z, y: top + H * f, rx: Math.PI / 2 });
      }
      const pts = [];
      for (let i = 0; i <= 10; i++) pts.push(new THREE.Vector3(4.5 + i * 2, top + 0.6, 4.5 + Math.sin(i) * 3));
      b.add(tube(new THREE.CatmullRomCurve3(pts), 30, 0.5, 6), 'cloth');
      b.sphere(0.6, 'cloth', { x: pts[0].x, y: pts[0].y, z: pts[0].z }, 6);
      b.sphere(0.6, 'cloth', { x: pts[10].x, y: pts[10].y, z: pts[10].z }, 6);
      b.cyl(0, 1.2, 3, 'glow', { x: pts[10].x, y: top + 2, z: pts[10].z }, 6);
      break;
    }
    case 'sawblade': {
      const top = floor('ironplate');
      b.boxOn(W * 0.75, 1, 4, 'char', { y: top - 0.6 }); // slot
      const R = Math.min(W, D) * 0.26;
      b.cyl(R, R, 1, 'metal', { y: top + R * 0.45, rx: Math.PI / 2 }, 48);
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; b.cyl(0, 1.2, 2.4, 'metal', { x: Math.cos(a) * (R + 0.9), y: top + R * 0.45 + Math.sin(a) * (R + 0.9), rz: a - Math.PI / 2 }, 4); }
      b.cyl(R * 0.25, R * 0.25, 2.4, 'brass', { y: top + R * 0.45, rx: Math.PI / 2 }, 20);
      for (const e of [-1, 1]) b.block(W * 0.75, 1.2, 1.2, 'accent', { z: e * 4, y: top + 0.3 }, { bevel: 0.2 });
      break;
    }
    case 'steamvent': {
      const top = floor('ironplate');
      b.cyl(7, 7.5, 1.6, 'brass', { y: top + 0.8 }, 32);
      for (let i = -3; i <= 3; i++) b.box(12, 0.9, 1.1, 'metal2', { z: i * 1.8, y: top + 1.8 });
      // a column of steam (snip off for a plain vent)
      for (let i = 0; i < 6; i++) b.sphere(4 + i * 0.6, 'cloth', { y: top + 5 + i * 4.5, x: Math.sin(i) * 1.5, sy: 0.8 }, 14);
      break;
    }
    case 'teslatrap': {
      const top = floor('ironplate');
      for (const e of [-1, 1]) {
        const x = e * W * 0.32;
        b.block(7, 3, 7, 'metal2', { x, y: top + 1.5 }, { bevel: 0.5 });
        b.cyl(1.6, 2, 20, 'brass', { x, y: top + 13 }, 16);
        for (let k = 0; k < 8; k++) b.add(new THREE.TorusGeometry(2.2, 0.35, 5, 16), 'brass', { x, y: top + 6 + k * 1.6, rx: Math.PI / 2 });
        b.add(new THREE.TorusGeometry(3.4, 1.4, 10, 24), 'metal', { x, y: top + 24, rx: Math.PI / 2 });
      }
      // arc between the pylons
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(-W * 0.32 + (i / 12) * W * 0.64, top + 24 + Math.sin(i * 1.7) * 1.6, Math.cos(i * 2.3) * 1.2));
      b.add(tube(new THREE.CatmullRomCurve3(pts), 40, 0.55, 6), 'glow');
      for (const p of [pts[0], pts[12]]) b.sphere(0.7, 'glow', { x: p.x, y: p.y, z: p.z }, 6);
      break;
    }
    case 'landmine': {
      const top = floor('dirt');
      b.cyl(4.2, 4.6, 1.6, 'metal2', { y: top + 0.4 }, 28);
      b.cyl(1.4, 1.4, 1, 'metal', { y: top + 1.4 }, 16);
      for (let i = 0; i < 4; i++) b.box(1, 0.6, 8, 'metal', { y: top + 1.2, ry: (i * Math.PI) / 4 });
      b.block(10, 1.2, 10, 'ground', { y: top }, { bevel: 2, noise: 0.6, seed: 4 });
      break;
    }
    case 'claymore': {
      const top = floor('dirt');
      b.block(6, 4, 1.6, 'grass', { x: -W * 0.3, y: top + 3, rx: -0.15 }, { bevel: 0.4 });
      for (const e of [-1, 1]) b.rod(new THREE.Vector3(-W * 0.3 + e * 2, top + 1.4, 0.3), new THREE.Vector3(-W * 0.3 + e * 2.6, top - 0.4, 1.4), 0.3, 'metal2', 4);
      b.cyl(0.6, 0.6, 3, 'wood', { x: W * 0.35, y: top + 1.5 }, 6);
      b.rod(new THREE.Vector3(-W * 0.3, top + 2, 0.8), new THREE.Vector3(W * 0.35, top + 2.6, 0), 0.25, 'cloth', 4);
      break;
    }
    case 'barbed': {
      const top = floor('dirt');
      const R = 5, L = W * 0.9;
      const pts = [];
      for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * Math.PI * 2 * 9; pts.push(new THREE.Vector3(-L / 2 + t * L, top + R + Math.sin(a) * R, Math.cos(a) * R)); }
      b.add(tube(new THREE.CatmullRomCurve3(pts), 400, 0.35, 5), 'metal2');
      for (let i = 0; i < 60; i++) { const p = pts[i * 2]; b.box(1.6, 0.3, 0.3, 'metal2', { x: p.x, y: p.y, z: p.z, rz: i, ry: i * 0.7 }); }
      for (const p of [pts[0], pts[120]]) b.sphere(0.5, 'metal2', { x: p.x, y: p.y, z: p.z }, 6);
      for (const e of [-1, 1]) b.block(2, 14, 2, 'wood', { x: e * L * 0.4, y: top + 7, z: -R - 1 }, { bevel: 0.3, noise: 0.3, seed: 3 });
      break;
    }
    case 'laser':
    case 'forcefield': {
      const top = floor(c.era === 'cyber' ? 'cyberpanel' : 'hexdeck');
      const h = 34;
      for (const e of [-1, 1]) {
        b.block(5, h, 5, 'metal2', { x: e * (W / 2 - 4), y: top + h / 2 }, { bevel: 0.6, res: 2 });
        b.box(1, h - 6, 5.6, 'glow', { x: e * (W / 2 - 4) - e * 2.6, y: top + h / 2 });
      }
      if (item === 'laser') for (let k = 0; k < 5; k++) b.cyl(0.35, 0.35, W - 13, 'glow', { y: top + 5 + k * 6, rz: Math.PI / 2 + (k % 2 ? 0.08 : -0.08) }, 6);
      else b.box(W - 13, h - 8, 0.8, 'glow', { y: top + h / 2 }); // the field (snip off to print plain)
      break;
    }
    case 'shockfloor': {
      const top = floor('grate');
      for (let i = 0; i < 4; i++) b.add(new THREE.TorusGeometry(Math.min(W, D) * (0.1 + i * 0.08), 0.5, 5, 40), 'glow', { y: top + 0.4, rx: Math.PI / 2 });
      for (const e of [-1, 1]) b.block(6, 4, 8, 'accent', { x: e * W * 0.38, y: top + 2 }, { bevel: 0.5, res: 2 });
      break;
    }
    case 'turret': {
      const top = floor('cyberpanel');
      b.cyl(7, 8, 3, 'metal2', { y: top + 1.5 }, 32);
      b.sphere(6, 'metal', { y: top + 6, sy: 0.8 }, 24);
      for (const e of [-1, 1]) b.cyl(0.9, 0.9, 12, 'metal2', { x: e * 1.6, y: top + 7, z: 7, rx: Math.PI / 2 }, 10);
      b.box(4, 1.2, 0.6, 'glow', { y: top + 8, z: 5.2 });
      break;
    }
    case 'plasmavent': {
      const top = floor('scifiplate');
      b.cyl(8, 8.5, 1.4, 'metal2', { y: top + 0.7 }, 6);
      for (let i = 0; i < 6; i++) b.box(1, 1, 7, 'metal', { y: top + 1.6, ry: (i * Math.PI) / 6 });
      b.cyl(5, 5, 0.6, 'glow', { y: top + 1.2 }, 6);
      break;
    }
    case 'airlock': {
      const top = floor('hexdeck');
      const R = Math.min(W, D) * 0.3;
      b.cyl(R + 2, R + 2, 1.2, 'accent', { y: top + 0.4 }, 8);
      for (let i = 0; i < 8; i++) b.extrude(polyShape([[0, 0], [R, -R * 0.42], [R, R * 0.42]]), 1, 'metal', { y: top + 1.4, rx: -Math.PI / 2, ry: (i * Math.PI) / 4 }, 0.2);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.box(3, 0.6, 1, 'glow', { x: Math.cos(a) * (R + 3.5), z: Math.sin(a) * (R + 3.5), y: top + 0.3, ry: -a }); }
      break;
    }
    case 'acid': {
      const rx = W * 0.32, rz = D * 0.28;
      floorSurface(b, 'alien', W, D, y0, c);
      b.add(new THREE.CylinderGeometry(1, 1, 1, 40), 'glow', { y: y0 + 3, sx: rx, sz: rz, sy: 1 });
      for (let i = 0; i < 10; i++) { const a = rng.range(0, Math.PI * 2); b.sphere(rng.range(0.8, 1.6), 'glow', { x: Math.cos(a) * rx * rng.range(0.2, 0.8), z: Math.sin(a) * rz * rng.range(0.2, 0.8), y: y0 + 3.6, sy: 0.6 }, 10); }
      rubble(b, rx + 4, 0, y0 + 3, 2, rng, 3);
      break;
    }
    case 'tentacle': {
      const top = floor('alien');
      b.add(new THREE.CylinderGeometry(1, 1, 1, 40), 'char', { y: top, sx: W * 0.26, sz: D * 0.26, sy: 1 });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + rng.soft();
        const pts = [];
        for (let k = 0; k <= 10; k++) { const t = k / 10; pts.push(new THREE.Vector3(Math.cos(a) * W * 0.12 + Math.sin(t * 5 + i) * 4, top + t * 30, Math.sin(a) * D * 0.12 + Math.cos(t * 4 + i) * 4)); }
        b.add(barkTubeSafe(pts, 3, 0.6, rng), 'organic');
      }
      break;
    }
    case 'sporepod':
    default: {
      const top = floor('alien');
      for (let i = 0; i < 4; i++) {
        const x = rng.range(-W / 3, W / 3), z = rng.range(-D / 3, D / 3), s = rng.range(0.8, 1.3);
        b.lathe([[0, 0], [3 * s, 0], [4.6 * s, 4 * s], [3.4 * s, 8 * s], [1.4 * s, 9 * s], [0, 9.6 * s]], 'organic', { x, z, y: top - 0.4 }, 20);
        b.sphere(1.6 * s, 'glow', { x, z, y: top + 9 * s }, 12);
      }
      crystalCluster(b, W * 0.3, top, -D * 0.3, rng, 0.5);
      void tuft; void rivetRow; void lathe;
    }
  }
}

import { barkTube } from './core';
function barkTubeSafe(pts: THREE.Vector3[], r0: number, r1: number, rng: Rng) {
  return barkTube(new THREE.CatmullRomCurve3(pts), r0, r1, 24, 12, rng.int(1, 999), 0.3);
}

// Floor surfaces. Each one fills a w×d area (centred on the origin) starting at height y, and returns the
// height of its walking surface. Grid squares stay readable in every style so minis line up.
import * as THREE from 'three';
import { Builder, Rng, block, fbm, heightSlab, noise3, clamp, smoothstep, tube, lathe, LOOK } from './core';

export type Ctx = { rng: Rng; sq: number; wear: number; detail: number; seed: number; era: string; courses: number; bricksPer: number; planksPer: number };

const frac = (v: number) => v - Math.floor(v);

/** Top-displaced box (planks, panels): `top(x,z)` returns an offset in mm added to the top face. */
export function topBox(w: number, h: number, d: number, res: number, top: (x: number, z: number) => number, bevel = 0.4) {
  const g = heightSlab(w, d, res, (x, z) => {
    const edge = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z));
    const roll = bevel > 0 ? Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, bevel - edge) / bevel, 2))) : 1;
    return Math.max(0.3, (h - bevel) + bevel * roll + top(x, z));
  });
  return g;
}

export function floorSurface(b: Builder, style: string, w: number, d: number, y: number, c: Ctx): number {
  const f = FLOORS[style] ?? FLOORS.flagstone;
  return f(b, w, d, y, c);
}

type FloorFn = (b: Builder, w: number, d: number, y: number, c: Ctx) => number;

// ---------- stone ----------

function flagstone(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { rng, sq, wear, detail } = c;
  const gap = LOOK.joint * 1.1;
  b.boxOn(w, 1, d, 'mortar', { y });
  const nx = Math.max(1, Math.round(w / sq)), nz = Math.max(1, Math.round(d / sq));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const cw = w / nx, cd = d / nz;
      const x0 = -w / 2 + i * cw, z0 = -d / 2 + j * cd;
      // split each square into 1–4 stones
      const rects: [number, number, number, number][] = [];
      const split = (x: number, z: number, sw: number, sd: number, depth: number) => {
        if (depth > 1 || (sw < sq * 0.55 && sd < sq * 0.55) || rng.chance(0.25 + depth * 0.3)) return rects.push([x, z, sw, sd]);
        if (sw >= sd) {
          const k = rng.range(0.35, 0.65);
          split(x, z, sw * k, sd, depth + 1);
          split(x + sw * k, z, sw * (1 - k), sd, depth + 1);
        } else {
          const k = rng.range(0.35, 0.65);
          split(x, z, sw, sd * k, depth + 1);
          split(x, z + sd * k, sw, sd * (1 - k), depth + 1);
        }
      };
      split(x0, z0, cw, cd, 0);
      for (const [x, z, sw, sd] of rects) {
        const missing = wear > 0.3 && rng.chance((wear - 0.3) * 0.25);
        const h = (missing ? 0.6 : rng.range(1.5, 2.1) * LOOK.popout) * detail;
        const tilt = wear * 0.02;
        b.block(sw - gap, h + 1, sd - gap, missing ? 'mortar' : rng.chance(0.5) ? 'stone' : 'stone2', {
          x: x + sw / 2, z: z + sd / 2, y: y + (h + 1) / 2, rx: rng.soft() * tilt, rz: rng.soft() * tilt, ry: rng.soft() * 0.02,
        }, { bevel: 0.7, noise: 0.45 * detail, freq: 0.45, seed: rng.int(1, 9999), flatTop: true, chip: wear, res: 1.4 });
        if (missing && rng.chance(0.7)) rubble(b, x + sw / 2, z + sd / 2, y + 1, Math.min(sw, sd) * 0.35, rng, 3);
      }
    }
  return y + 2 * detail + 1;
}

function ashlar(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { rng, sq, wear, detail } = c;
  b.boxOn(w, 1, d, 'mortar', { y });
  const nz = Math.max(1, Math.round(d / sq));
  for (let j = 0; j < nz * 2; j++) {
    const rowD = d / (nz * 2);
    let x = -w / 2;
    const off = j % 2 ? sq / 2 : 0;
    const cuts = [-w / 2];
    for (let k = off || sq; k < w; k += sq) cuts.push(-w / 2 + k);
    cuts.push(w / 2);
    for (let k = 0; k < cuts.length - 1; k++) {
      x = cuts[k];
      const sw = cuts[k + 1] - x;
      if (sw < 2) continue;
      const h = 1.8 * detail;
      b.block(sw - 0.5, h + 1, rowD - 0.5, rng.chance(0.5) ? 'stone' : 'stone2', { x: x + sw / 2, z: -d / 2 + j * rowD + rowD / 2, y: y + (h + 1) / 2 },
        { bevel: 0.5, noise: (0.12 + wear * 0.4) * detail, freq: 0.3, seed: rng.int(1, 9999), flatTop: true, chip: wear * 0.8, res: 1.6 });
    }
  }
  if (wear > 0.4) for (let i = 0; i < Math.round(wear * 6); i++) rubble(b, rng.range(-w / 2 + 4, w / 2 - 4), rng.range(-d / 2 + 4, d / 2 - 4), y + 2.5 * detail, 2, rng, 2);
  return y + 1.8 * detail + 1;
}

function mosaic(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { rng, sq, wear } = c;
  b.boxOn(w, 1.2, d, 'mortar', { y });
  const t = sq / 10; // ten tesserae per square
  const nx = Math.round(w / t), nz = Math.round(d / t);
  const cx = nx / 2, cz = nz / 2;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      if (wear > 0.2 && fbm(i * 0.25, j * 0.25, 1, c.seed, 2) > 1 - wear * 1.1) continue; // worn patches
      const border = i < 2 || j < 2 || i >= nx - 2 || j >= nz - 2;
      const ring = Math.abs(Math.hypot(i - cx + 0.5, j - cz + 0.5) - Math.min(cx, cz) * 0.55) < 1;
      const meander = (i + j) % 4 === 0 && (i === 3 || j === 3 || i === nx - 4 || j === nz - 4);
      const pattern = border || ring || meander;
      const h = pattern ? 1.25 : 1;
      b.boxOn(t - 0.45 + rng.soft() * 0.1, h, t - 0.45 + rng.soft() * 0.1, pattern ? 'accent' : rng.chance(0.5) ? 'stone' : 'stone2', {
        x: -w / 2 + (i + 0.5) * t, z: -d / 2 + (j + 0.5) * t, y: y + 1.2, ry: rng.soft() * 0.06,
      });
    }
  return y + 2.4;
}

function brickFloor(b: Builder, w: number, d: number, y: number, c: Ctx) {
  // basket weave: each quarter square holds two bricks, turned every other quarter
  const { rng, sq, wear, detail } = c;
  b.boxOn(w, 1, d, 'mortar', { y });
  const q = sq / Math.max(1, Math.round(c.bricksPer / 1.5));
  const nx = Math.round(w / q), nz = Math.round(d / q);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const turn = (i + j) % 2 === 0;
      for (let k = 0; k < 2; k++) {
        if (wear > 0.35 && rng.chance((wear - 0.35) * 0.2)) continue;
        const bw = turn ? q - 0.8 : q / 2 - 0.8, bd = turn ? q / 2 - 0.8 : q - 0.8;
        const x = -w / 2 + i * q + (turn ? q / 2 : q / 4 + (k * q) / 2);
        const z = -d / 2 + j * q + (turn ? q / 4 + (k * q) / 2 : q / 2);
        const h = 1.6 * detail;
        b.block(bw, h + 1, bd, rng.chance(0.5) ? 'stone' : 'stone2', { x, z, y: y + (h + 1) / 2 },
          { bevel: 0.45, noise: 0.25 * detail, freq: 0.6, seed: rng.int(1, 9999), flatTop: true, chip: wear, res: 1.3 });
      }
    }
  return y + 1.6 * detail + 1;
}

function cobble(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { rng, wear, detail } = c;
  b.boxOn(w, 1.2, d, 'mortar', { y });
  const s = c.sq / Math.max(3, c.bricksPer * 2);
  const nx = Math.floor(w / s), nz = Math.floor(d / s);
  const ox = (w - nx * s) / 2, oz = (d - nz * s) / 2;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      if (wear > 0.3 && rng.chance((wear - 0.3) * 0.3)) continue;
      const sw = s * rng.range(0.78, 0.95), sd = s * rng.range(0.78, 0.95), h = rng.range(1.6, 2.2) * detail;
      b.block(sw, h + 1, sd, rng.chance(0.5) ? 'stone' : 'stone2', {
        x: -w / 2 + ox + (i + 0.5) * s + rng.soft() * 0.35, z: -d / 2 + oz + (j + 0.5) * s + (i % 2 ? s / 2 : 0) * 0 + rng.soft() * 0.35,
        y: y + (h + 1) / 2 + 0.2, ry: rng.range(0, Math.PI),
      }, { bevel: Math.min(sw, sd) * 0.32, noise: 0.35 * detail, freq: 0.8, seed: rng.int(1, 9999), res: 1.1, flatTop: true });
    }
  return y + 2.2 * detail + 1.2;
}

function rough(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { detail, seed, wear, rng } = c;
  const g = heightSlab(w - 0.3, d - 0.3, 0.6, (x, z) => {
    const n = fbm(x * 0.06, z * 0.06, 0, seed, 5);
    const ridge = 1 - Math.abs(noise3(x * 0.12, z * 0.12, 3, seed + 5));
    const crack = smoothstep(0.92, 0.99, ridge) * 1.2;
    const edge = Math.min(w / 2 - Math.abs(x), d / 2 - Math.abs(z));
    const settle = smoothstep(0, 3, edge);
    return 2 + (n * 1.6 * detail + 0.8) * settle - crack * detail * settle;
  });
  b.add(g, 'stone2', { y });
  for (let i = 0; i < 4 + wear * 10; i++) rubble(b, rng.range(-w / 2 + 3, w / 2 - 3), rng.range(-d / 2 + 3, d / 2 - 3), y + 2.5, 1.6, rng, 2);
  return y + 3;
}

function dirt(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { detail, seed, rng } = c;
  const g = heightSlab(w - 0.3, d - 0.3, 0.6, (x, z) => {
    const ruts = Math.abs(Math.sin(x * 0.18 + fbm(x * 0.03, z * 0.03, 2, seed) * 2)) * 0.3;
    return 1.8 + fbm(x * 0.08, z * 0.08, 0, seed, 4) * 0.9 * detail + ruts;
  });
  b.add(g, 'ground', { y });
  for (let i = 0; i < 18; i++) rubble(b, rng.range(-w / 2 + 2, w / 2 - 2), rng.range(-d / 2 + 2, d / 2 - 2), y + 1.8, 0.9, rng, 1);
  // straw / grass tufts
  for (let i = 0; i < (w * d) / 120; i++) tuft(b, rng.range(-w / 2 + 2, w / 2 - 2), rng.range(-d / 2 + 2, d / 2 - 2), y + 1.8, rng);
  return y + 2.4;
}

// ---------- wood ----------

function plankRun(b: Builder, w: number, d: number, y: number, c: Ctx, pw: number, caulk: number, deck: boolean) {
  const { rng, wear, detail, sq } = c;
  b.boxOn(w, 1, d, 'wood2', { y });
  const rows = Math.round(d / pw);
  const realW = d / rows;
  for (let j = 0; j < rows; j++) {
    let x = -w / 2;
    // stagger plank ends, keep joints on square lines now and then
    const lens: number[] = [];
    let left = w;
    const first = rng.range(0.4, 1.6) * sq;
    let L = Math.min(first, left);
    while (left > 0.5) {
      lens.push(L);
      left -= L;
      L = Math.min(left, rng.range(1.2, 2.6) * sq);
      if (left - L < 6) L = left;
    }
    for (const len of lens) {
      if (len < 2) { x += len; continue; }
      const sd = rng.int(1, 9999);
      const broken = wear > 0.4 && rng.chance((wear - 0.4) * 0.3);
      const h = (broken ? 0.4 : 1.2 + 0.5 * LOOK.popout) * detail;
      const grain = (gx: number, gz: number) => {
        const g = Math.sin(gz * 3.1 + fbm(gx * 0.04, gz * 0.4, 0, sd, 3) * 5);
        const lines = -(0.12 + LOOK.tex * 0.25) * detail * Math.pow(Math.abs(g), 8);
        const knot = Math.hypot((gx - (sd % 13) + 6) * 0.5, gz) < 1 ? -0.25 : 0;
        return lines + knot + wear * 0.25 * fbm(gx * 0.2, gz * 0.2, 7, sd, 2);
      };
      const g = topBox(len - caulk, h + 1, realW - caulk, 0.45, grain, 0.35);
      b.add(g, rng.chance(0.5) ? 'wood' : 'wood2', { x: x + len / 2, z: -d / 2 + j * realW + realW / 2, y, ry: rng.soft() * 0.004 });
      // nails / trenails
      for (const e of [-1, 1]) {
        const nx = x + len / 2 + e * (len / 2 - 1.6);
        if (deck) b.cyl(0.55, 0.55, 0.6, 'wood2', { x: nx, y: y + h + 1 + 0.1, z: -d / 2 + j * realW + realW / 2 }, 10);
        else for (const s of [-1, 1]) b.cyl(0.4, 0.4, 0.5, 'metal2', { x: nx, y: y + h + 1 + 0.1, z: -d / 2 + j * realW + realW / 2 + s * realW * 0.25 }, 8);
      }
      x += len;
    }
  }
  return y + 1.7 * detail + 1;
}

function planks(b: Builder, w: number, d: number, y: number, c: Ctx) {
  return plankRun(b, w, d, y, c, c.sq / c.planksPer, LOOK.joint * 0.7, false);
}

function deck(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const top = plankRun(b, w, d, y, c, c.sq / (c.planksPer + 1), LOOK.joint * 0.9, true);
  // a cargo grating hatch on larger decks
  if (w >= c.sq * 2 && d >= c.sq * 2) {
    const hw = c.sq * 1.1;
    b.boxOn(hw + 3, top - y + 1.2, hw + 3, 'wood2', { y });
    const bars = 7;
    for (let i = 0; i < bars; i++) {
      const o = -hw / 2 + (i + 0.5) * (hw / bars);
      b.boxOn(1.1, 0.9, hw, 'wood', { x: o, y: top + 1.2 });
      b.boxOn(hw, 0.9, 1.1, 'wood', { z: o, y: top + 1.2 });
    }
  }
  return top;
}

// ---------- metal ----------

export function rivetRow(b: Builder, x0: number, z0: number, x1: number, z1: number, y: number, every: number, r = 0.6) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const n = Math.max(1, Math.round(len / every));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    b.add(new THREE.SphereGeometry(r, 8, 6), 'metal2', { x: x0 + (x1 - x0) * t, y, z: z0 + (z1 - z0) * t, sy: 0.8 });
  }
}

function ironplate(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { rng, sq, wear, detail } = c;
  b.boxOn(w, 1, d, 'metal2', { y });
  const nx = Math.max(1, Math.round(w / sq)), nz = Math.max(1, Math.round(d / sq));
  const h = 1.4 * detail;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = -w / 2 + (i + 0.5) * sq, z = -d / 2 + (j + 0.5) * sq;
      const tread = (i + j) % 2 === 1;
      const sd = rng.int(1, 9999);
      const g = topBox(sq - 0.8, h + 1, sq - 0.8, 0.4, (px, pz) => {
        let v = wear * 0.35 * fbm(px * 0.15, pz * 0.15, 0, sd, 3); // dents and rust pitting
        if (tread) {
          const u = frac((px + pz) / 3.2), t = frac((px - pz) / 3.2);
          const dia = Math.abs(u - 0.5) < 0.12 && Math.abs(t - 0.5) < 0.35 ? 0.35 : 0;
          v += dia * detail;
        }
        return v;
      }, 0.6);
      b.add(g, rng.chance(0.5) ? 'metal' : 'metal2', { x, z, y });
      const e = sq / 2 - 2;
      const ry = y + h + 1;
      rivetRow(b, x - e, z - e, x + e, z - e, ry, 3.4);
      rivetRow(b, x - e, z + e, x + e, z + e, ry, 3.4);
      rivetRow(b, x - e, z - e + 3.4, x - e, z + e - 3.4, ry, 3.4);
      rivetRow(b, x + e, z - e + 3.4, x + e, z + e - 3.4, ry, 3.4);
    }
  return y + h + 1;
}

function grate(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { sq, rng, wear } = c;
  // lower floor seen through the grating, then frames and bars per square
  b.boxOn(w, 1, d, 'metal2', { y });
  const nx = Math.max(1, Math.round(w / sq)), nz = Math.max(1, Math.round(d / sq));
  const H = 3;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = -w / 2 + (i + 0.5) * sq, z = -d / 2 + (j + 0.5) * sq;
      const s = sq - 0.6;
      for (const e of [-1, 1]) {
        b.boxOn(s, H, 1.6, 'metal', { x, z: z + e * (s / 2 - 0.8), y: y + 1 });
        b.boxOn(1.6, H, s, 'metal', { x: x + e * (s / 2 - 0.8), z, y: y + 1 });
      }
      const bars = 8;
      for (let k = 1; k < bars; k++) {
        if (wear > 0.5 && rng.chance(wear * 0.15)) continue;
        const o = -s / 2 + (k * s) / bars;
        b.boxOn(0.9, H - 0.4, s - 2, 'metal', { x: x + o, z, y: y + 1 });
      }
      for (let k = 1; k < 4; k++) b.boxOn(s - 2, H - 1.2, 0.8, 'metal2', { x, z: z - s / 2 + (k * s) / 4, y: y + 1 });
      // pipes below
      if (rng.chance(0.4)) b.cyl(1.2, 1.2, s - 3, 'brass', { x, z: z + rng.range(-5, 5), y: y + 2.2, rx: Math.PI / 2 }, 12);
    }
  return y + 1 + H;
}

// ---------- modern ----------

/** Distance to a random crack network inside a slab (in mm). */
function crackField(seed: number, wear: number) {
  const rng = new Rng(seed);
  const lines: [number, number, number, number][] = [];
  const n = Math.round(wear * 9);
  for (let i = 0; i < n; i++) {
    let x = rng.range(-50, 50), z = rng.range(-50, 50), a = rng.range(0, Math.PI * 2);
    for (let k = 0; k < 8; k++) {
      const len = rng.range(3, 8);
      const nx = x + Math.cos(a) * len, nz = z + Math.sin(a) * len;
      lines.push([x, z, nx, nz]);
      x = nx; z = nz; a += rng.soft() * 0.9;
    }
  }
  return (px: number, pz: number) => {
    let best = 99;
    for (const [x0, z0, x1, z1] of lines) {
      const dx = x1 - x0, dz = z1 - z0;
      const t = clamp(((px - x0) * dx + (pz - z0) * dz) / (dx * dx + dz * dz), 0, 1);
      best = Math.min(best, Math.hypot(px - x0 - dx * t, pz - z0 - dz * t));
    }
    return best;
  };
}

function concrete(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { seed, wear, detail, sq } = c;
  const crack = crackField(seed, wear + 0.15);
  const slab = sq * 2;
  const g = heightSlab(w - 0.3, d - 0.3, 0.5, (x, z) => {
    let h = 2.2 + fbm(x * 0.1, z * 0.1, 0, seed, 3) * 0.12 * detail;
    const jx = Math.abs(frac((x + w / 2) / slab + 0.5) - 0.5) * slab, jz = Math.abs(frac((z + d / 2) / slab + 0.5) - 0.5) * slab;
    if (Math.min(jx, jz) < 0.45) h -= 0.7; // expansion joints
    const k = crack(x, z);
    if (k < 0.45) h -= 0.9 * detail * (1 - k / 0.45);
    // pothole / spalling
    const spall = fbm(x * 0.07, z * 0.07, 5, seed, 3);
    if (spall > 0.55 - wear * 0.25) h -= Math.min(1.4, (spall - (0.55 - wear * 0.25)) * 8) * detail;
    return h;
  });
  b.add(g, 'stone', { y });
  return y + 2.2;
}

function asphalt(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { seed, wear, detail, rng } = c;
  const crack = crackField(seed + 3, wear + 0.25);
  const g = heightSlab(w - 0.3, d - 0.3, 0.5, (x, z) => {
    let h = 2 + noise3(x * 0.9, z * 0.9, 0, seed) * 0.08 * detail; // aggregate grit
    const k = crack(x, z);
    if (k < 0.5) h -= 0.8 * (1 - k / 0.5);
    return h;
  });
  b.add(g, 'stone2', { y });
  // painted lane marking (raised slightly so it can be painted)
  if (rng.chance(0.7)) for (let x = -w / 2 + 4; x < w / 2 - 8; x += 14) b.boxOn(8, 0.3, 1.8, 'accent', { x: x + 4, y: y + 2 });
  // manhole
  if (w >= 50 && rng.chance(0.6)) {
    const mx = rng.range(-w / 4, w / 4), mz = rng.range(-d / 4, d / 4);
    b.cyl(7, 7, 0.6, 'metal', { x: mx, z: mz, y: y + 2.1 }, 32);
    for (let k = -2; k <= 2; k++) b.boxOn(11 - Math.abs(k) * 2, 0.35, 0.8, 'metal2', { x: mx, z: mz + k * 2.2, y: y + 2.4 });
  }
  return y + 2;
}

function tile(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { seed, wear, rng, sq } = c;
  const t = sq / 2;
  const missing = new Set<string>();
  const nx = Math.round(w / t), nz = Math.round(d / t);
  for (let i = 0; i < nx * nz * wear * 0.15; i++) missing.add(`${rng.int(0, nx - 1)},${rng.int(0, nz - 1)}`);
  const g = heightSlab(w - 0.3, d - 0.3, 0.4, (x, z) => {
    const i = Math.floor((x + w / 2) / t), j = Math.floor((z + d / 2) / t);
    if (missing.has(`${i},${j}`)) return 1.2 + fbm(x * 0.4, z * 0.4, 0, seed) * 0.2;
    const gx = Math.abs(frac((x + w / 2) / t) - 0.5) * t, gz = Math.abs(frac((z + d / 2) / t) - 0.5) * t;
    const grout = Math.max(gx, gz) > t / 2 - 0.35;
    return grout ? 1.6 : 2 + (wear > 0.5 ? noise3(i, j, 0, seed) * 0.12 : 0);
  });
  b.add(g, 'stone', { y });
  return y + 2;
}

function cyberpanel(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { seed, sq, rng, wear } = c;
  const crack = crackField(seed, wear);
  const g = heightSlab(w - 0.3, d - 0.3, 0.45, (x, z) => {
    const px = frac((x + w / 2) / sq), pz = frac((z + d / 2) / sq);
    let h = 2.2;
    if (Math.min(px, 1 - px, pz, 1 - pz) * sq < 0.6) h -= 0.8; // panel seams
    const inner = Math.abs(px - 0.5) < 0.3 && Math.abs(pz - 0.5) < 0.3;
    if (inner) h += 0.25; // raised inner plate
    // vent slots in some squares
    const si = Math.floor((x + w / 2) / sq), sj = Math.floor((z + d / 2) / sq);
    if ((si * 7 + sj * 3 + seed) % 4 === 0 && Math.abs(px - 0.5) < 0.32 && Math.abs(pz - 0.5) < 0.25 && frac(pz * 9) < 0.45) h -= 0.8;
    if (crack(x, z) < 0.4) h -= 0.8;
    return h;
  });
  b.add(g, 'metal', { y });
  // hazard chevrons along one edge, cable run along another
  const stripes = Math.floor(w / 4);
  for (let i = 0; i < stripes; i++) b.boxOn(1.8, 0.35, 4, 'accent', { x: -w / 2 + 2 + i * 4, z: -d / 2 + 3, y: y + 2.2, ry: 0.6 });
  if (rng.chance(0.8)) {
    for (let k = 0; k < 3; k++) {
      const z = d / 2 - 3.5 - k * 1.7;
      const pts = [];
      for (let i = 0; i <= 12; i++) pts.push(new THREE.Vector3(-w / 2 + 1 + (i / 12) * (w - 2), y + 2.9 + Math.sin(i * 1.3 + k) * 0.25, z + Math.sin(i * 0.7 + k * 2) * 0.6));
      b.add(tube(new THREE.CatmullRomCurve3(pts), 40, 0.75, 8, false), k === 1 ? 'accent' : 'metal2');
    }
  }
  // neon strip
  b.boxOn(w - 6, 0.6, 1, 'glow', { z: 0, y: y + 1.8 });
  return y + 2.2;
}

function hexdeck(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { seed, sq, rng, wear, detail } = c;
  const R = sq / 4; // hex size
  const hex = (x: number, z: number) => {
    // axial hex grid distance to nearest cell centre and edge
    const q = ((Math.sqrt(3) / 3) * x - z / 3) / R, r = ((2 / 3) * z) / R;
    let rx = Math.round(q), ry = Math.round(-q - r), rz = Math.round(r);
    const dx = Math.abs(rx - q), dy = Math.abs(ry + q + r), dz = Math.abs(rz - r);
    if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
    const cx = R * Math.sqrt(3) * (rx + rz / 2), cz = R * 1.5 * rz;
    const lx = Math.abs(x - cx), lz = Math.abs(z - cz);
    const edge = R * 0.866 - Math.max(lx, lx * 0.5 + lz * 0.866);
    return { edge, id: rx * 31 + rz * 17 };
  };
  const g = heightSlab(w - 0.3, d - 0.3, 0.4, (x, z) => {
    const { edge, id } = hex(x, z);
    let h = 2.4;
    if (edge < 0.45) h -= 0.8;
    else if (edge < 0.9) h -= 0.25; // chamfer
    const kind = Math.abs(id + seed) % 7;
    if (kind === 0 && edge > 1.6) h += 0.4; // raised plate
    if (kind === 3 && edge > 1.4 && frac((x + z) * 0.8) < 0.4) h -= 0.6; // vented plate
    if (wear > 0 && fbm(x * 0.15, z * 0.15, 0, seed, 2) > 0.7 - wear * 0.4) h -= 0.5 * detail; // scorch dents
    return h;
  });
  b.add(g, 'metal', { y });
  // light strips between squares
  for (let i = 1; i < Math.round(w / sq); i++) b.boxOn(0.9, 0.5, d - 4, 'glow', { x: -w / 2 + i * sq, y: y + 1.8 });
  if (rng.chance(0.5)) rivetRow(b, -w / 2 + 2, -d / 2 + 2, w / 2 - 2, -d / 2 + 2, y + 2.4, 3);
  return y + 2.4;
}

function scifiplate(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { sq, rng, wear, seed } = c;
  const g = heightSlab(w - 0.3, d - 0.3, 0.4, (x, z) => {
    const px = frac((x + w / 2) / sq), pz = frac((z + d / 2) / sq);
    const e = Math.min(px, 1 - px, pz, 1 - pz) * sq;
    let h = 2.4;
    if (e < 0.5) h -= 0.9;
    else if (e < 1.2) h -= 0.3 * (1.2 - e) / 0.7;
    // recessed centre panel with a chamfered border
    const ix = Math.abs(px - 0.5) * sq, iz = Math.abs(pz - 0.5) * sq;
    const inner = Math.max(ix, iz);
    if (inner < sq * 0.28) h -= 0.45;
    if (Math.abs(inner - sq * 0.28) < 0.3) h -= 0.2;
    if (wear > 0 && fbm(x * 0.2, z * 0.2, 4, seed, 2) > 0.75 - wear * 0.4) h -= 0.4;
    return h;
  });
  b.add(g, 'metal', { y });
  const nx = Math.max(1, Math.round(w / sq)), nz = Math.max(1, Math.round(d / sq));
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = -w / 2 + (i + 0.5) * sq, z = -d / 2 + (j + 0.5) * sq;
      // bolts in the corners, a greeble or light in the centre
      for (const [ex, ez] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.cyl(0.8, 0.8, 0.5, 'metal2', { x: x + ex * (sq / 2 - 2.6), z: z + ez * (sq / 2 - 2.6), y: y + 2.5 }, 6);
      const k = rng.int(0, 3);
      if (k === 0) b.boxOn(sq * 0.3, 0.6, 1.2, 'glow', { x, z, y: y + 1.9 });
      if (k === 1) { b.boxOn(4, 0.9, 3, 'metal2', { x: x - 3, z, y: y + 1.9 }); b.boxOn(2, 1.2, 5, 'metal2', { x: x + 2, z, y: y + 1.9 }); }
    }
  return y + 2.4;
}

// ---------- alien ----------

function alien(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const { seed, detail, rng } = c;
  const g = heightSlab(w - 0.3, d - 0.3, 0.5, (x, z) => {
    const ridged = 1 - Math.abs(noise3(x * 0.09, z * 0.09, 0, seed));
    const veins = Math.pow(1 - Math.abs(noise3(x * 0.2, z * 0.2, 9, seed + 2)), 8);
    return 1.8 + ridged * 0.9 * detail + veins * 0.7 * detail + fbm(x * 0.5, z * 0.5, 1, seed, 2) * 0.12;
  });
  b.add(g, 'organic', { y });
  for (let i = 0; i < (w * d) / 300; i++) {
    const r = rng.range(0.8, 2);
    b.sphere(r, rng.chance(0.3) ? 'glow' : 'organic', { x: rng.range(-w / 2 + 3, w / 2 - 3), z: rng.range(-d / 2 + 3, d / 2 - 3), y: y + 2.2, sy: 0.6 }, 12);
  }
  return y + 2.8;
}

function crystalFloor(b: Builder, w: number, d: number, y: number, c: Ctx) {
  const top = rough(b, w, d, y, c);
  const { rng } = c;
  for (let i = 0; i < Math.round((w * d) / 700) + 1; i++) {
    const x = rng.range(-w / 2 + 5, w / 2 - 5), z = rng.range(-d / 2 + 5, d / 2 - 5);
    crystalCluster(b, x, top - 0.5, z, rng, 0.45);
  }
  return top;
}

// ---------- shared bits ----------

export function rubble(b: Builder, x: number, z: number, y: number, size: number, rng: Rng, n: number) {
  for (let i = 0; i < n; i++) {
    const s = size * rng.range(0.5, 1);
    b.block(s, s * rng.range(0.5, 0.9), s * rng.range(0.6, 1), rng.chance(0.5) ? 'stone' : 'stone2', {
      x: x + rng.soft() * size, z: z + rng.soft() * size, y: y + s * 0.3, rx: rng.range(0, 3), ry: rng.range(0, 3), rz: rng.range(0, 3),
    }, { bevel: s * 0.2, noise: s * 0.15, freq: 1, seed: rng.int(1, 9999), res: Math.max(0.5, s / 3) });
  }
}

export function tuft(b: Builder, x: number, z: number, y: number, rng: Rng) {
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const h = rng.range(1.5, 3.2);
    b.cyl(0.05, 0.45, h, 'grass', { x: x + rng.soft() * 0.8, z: z + rng.soft() * 0.8, y: y + h / 2 - 0.2, rx: rng.soft() * 0.5, rz: rng.soft() * 0.5 }, 5);
  }
}

export function crystalCluster(b: Builder, x: number, y: number, z: number, rng: Rng, scale = 1) {
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const h = rng.range(5, 13) * scale, r = rng.range(1.2, 2.4) * scale;
    const g = lathePoint(r, h);
    b.add(g, 'crystal', { x: x + rng.soft() * 2 * scale, z: z + rng.soft() * 2 * scale, y, rx: rng.soft() * 0.6, rz: rng.soft() * 0.6, ry: rng.range(0, 3) });
  }
}

function lathePoint(r: number, h: number) {
  // six-sided crystal: body widening up to a pointed tip, one closed solid
  return lathe([[0, 0], [r * 0.85, 0], [r, h * 0.7], [0, h]], 6);
}

export const FLOORS: Record<string, FloorFn> = {
  flagstone, ashlar, mosaic, brick: brickFloor, cobble, rough, dirt, planks, deck, ironplate, grate, concrete, asphalt, tile,
  cyberpanel, hexdeck, scifiplate, alien, crystal: crystalFloor,
};
export { frac, block };

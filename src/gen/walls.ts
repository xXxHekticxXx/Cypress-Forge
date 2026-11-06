// Walls, corners and doors. A wall runs along X (centred), is T thick along Z and stands on y0.
// Masonry walls are built course by course from blocks that go right through the wall, so both faces are
// detailed; other styles have a core with panels, timbers, pipes or ribs on both faces.
import * as THREE from 'three';
import { Builder, Rng, fbm, noise3, clamp, polyShape, smoothstep, tube, arcTorus, inPoly, LOOK } from './core';
import { rubble, crystalCluster, topBox, type Ctx } from './floors';

const MODERN = ['cinder', 'concretewall', 'cyberwall'];

export type Opening = string;

export type WallSpec = {
  L: number; H: number; T: number; y0: number;
  style: string; top: string; opening: Opening; pos?: 'center' | 'left' | 'right' | 'two';
  c: Ctx;
};

type HoleDef = {
  kind: Opening;
  x: number; w: number;
  bottom: number;  // from y0
  spring: number;  // where an arch starts (or the top of a square opening)
  arch: boolean;   // round top
  pointed?: boolean;
  poly: [number, number][];
  reaches: boolean; // opens at the floor (a doorway)
  cy?: number; r?: number;
  blob?: (a: number) => number;
};
/** The first opening, plus every opening in `all` (twin windows, two doors…). */
type Hole = HoleDef & { all: HoleDef[] };

function archPts(x: number, hw: number, spring: number, pointed: boolean, n = 24): [number, number][] {
  const pts: [number, number][] = [];
  if (!pointed) {
    for (let i = 1; i < n; i++) { const a = Math.PI - (i / n) * Math.PI; pts.push([x + Math.cos(a) * hw, spring + Math.sin(a) * hw]); }
  } else {
    // equilateral (Gothic) arch: two arcs of radius w meeting at a point
    const R = hw * 2;
    for (let i = 1; i <= n / 2; i++) { const a = Math.PI - (i / (n / 2)) * (Math.PI / 3); pts.push([x + hw + Math.cos(a) * R, spring + Math.sin(a) * R]); }
    for (let i = n / 2 - 1; i >= 1; i--) { const a = (i / (n / 2)) * (Math.PI / 3); pts.push([x - hw + Math.cos(a) * R, spring + Math.sin(a) * R]); }
  }
  return pts;
}

function def(kind: Opening, x: number, w: number, bottom: number, spring: number, arch: boolean, pointed = false): HoleDef {
  const hw = w / 2;
  const b = bottom <= 0.01 ? -2 : bottom; // doorways reach below the floor line so tests near y=0 work
  const poly: [number, number][] = [[x - hw, b], [x + hw, b], [x + hw, spring], ...(arch || pointed ? archPts(x, hw, spring, pointed) : []), [x - hw, spring]];
  return { kind, x, w, bottom, spring, arch: arch || pointed, pointed, poly, reaches: bottom <= 0.01 };
}

export function holeTop(d: HoleDef) {
  return d.pointed ? d.spring + d.w * 0.866 : d.arch ? d.spring + d.w / 2 : d.spring;
}

function makeHole(s: WallSpec): Hole | null {
  const { L, H, c } = s;
  let opening = s.opening;
  const sq = c.sq;
  if (['none', 'crumbled', 'secret'].includes(opening) || L < sq * 0.9) return null;
  if (opening === 'door') opening = 'square';
  if (opening === 'doorArch') opening = 'arch';
  const maxTop = H - 5;
  const two = s.pos === 'two' && L >= sq * 1.9;
  const xs = two ? [-L / 4, L / 4] : [s.pos === 'left' && L >= sq * 1.9 ? -L / 4 : s.pos === 'right' && L >= sq * 1.9 ? L / 4 : 0];
  const roomAll = two ? L / 2 - 6 : L - 8;
  const defs: HoleDef[] = [];
  for (let x of xs) {
    // never let an opening run past the end of the wall
    if (opening === 'double' && !two) x = 0;
    const room = Math.min(roomAll, 2 * (L / 2 - Math.abs(x)) - 8);
    switch (opening) {
      case 'square': { const w = Math.min(sq * 0.86, room); defs.push(def('square', x, w, 0, Math.min(sq * 1.45, maxTop), false)); break; }
      case 'double': { const w = Math.min(sq * 1.55, room); defs.push(def('double', x, w, 0, Math.min(sq * 1.5, maxTop), false)); break; }
      case 'arch': { const w = Math.min(sq * 0.9, room); defs.push(def('arch', x, w, 0, Math.min(sq * 1.12, maxTop - w / 2), true)); break; }
      case 'pointed': { const w = Math.min(sq * 0.86, room); defs.push(def('pointed', x, w, 0, Math.min(sq * 0.95, maxTop - w * 0.866), false, true)); break; }
      case 'window': { const w = Math.min(sq * 0.42, room); const bot = Math.min(sq * 0.85, H * 0.45); defs.push(def('window', x, w, bot, Math.min(bot + sq * 0.5, maxTop - w / 2), true)); break; }
      case 'slit': { const w = 2.8; const bot = Math.min(sq * 0.7, H * 0.35); defs.push(def('slit', x, w, bot, Math.min(bot + sq * 0.85, maxTop - 2), true)); break; }
      case 'barred': { const w = Math.min(sq * 0.6, room); const bot = Math.min(sq * 0.8, H * 0.4); defs.push(def('barred', x, w, bot, Math.min(bot + sq * 0.6, maxTop), false)); break; }
      case 'murder': { const w = Math.min(sq * 0.26, room); const bot = Math.min(H * 0.68, maxTop - w - 2); defs.push(def('murder', x, w, bot, bot + w, false)); break; }
      case 'twin': { const w = Math.min(sq * 0.3, room / 2.6); const bot = Math.min(sq * 0.85, H * 0.45); for (const e of [-1, 1]) defs.push(def('twin', x + e * w * 0.75, w, bot, Math.min(bot + sq * 0.45, maxTop - w / 2), true)); break; }
      case 'round': {
        const r = Math.min(sq * 0.27, room / 2, (H - 8) / 2.4);
        const cy = Math.min(H * 0.6, H - r - 5);
        const poly: [number, number][] = [];
        for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; poly.push([x + Math.cos(a) * r, cy + Math.sin(a) * r]); }
        defs.push({ kind: 'round', x, w: r * 2, bottom: cy - r, spring: cy + r, arch: false, poly, reaches: false, cy, r });
        break;
      }
      default: {
        // broken: a ragged blast hole
        const rng = c.rng.fork(77 + defs.length);
        const r = Math.min(sq * 0.55, H * 0.32, (two ? L / 2 : L) * 0.32);
        const seed = rng.int(1, 9999);
        const cy = H * 0.5, hx = x + rng.range(-L * 0.06, L * 0.06);
        const blob = (a: number) => r * (0.75 + 0.35 * noise3(Math.cos(a) * 1.6, Math.sin(a) * 1.6, 0, seed));
        const poly: [number, number][] = [];
        for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; poly.push([hx + Math.cos(a) * blob(a), cy + Math.sin(a) * blob(a)]); }
        defs.push({ kind: 'broken', x: hx, w: r * 2, bottom: cy - r, spring: cy + r, arch: false, poly, reaches: false, cy, r, blob });
      }
    }
  }
  return { ...defs[0], all: defs };
}

/** Is (x, y-from-y0) inside an opening, grown by margin m? */
function inHole(h: Hole | null, x: number, y: number, m: number) {
  if (!h) return false;
  for (const d of h.all) {
    if (inPoly(d.poly, x, y)) return true;
    if (m > 0) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (inPoly(d.poly, x + Math.cos(a) * m, y + Math.sin(a) * m)) return true;
    }
  }
  return false;
}

function topProfile(s: WallSpec, hole: Hole | null = null): (x: number) => number {
  const raw = rawTop(s);
  if (!hole) return raw;
  // keep openings inside the wall even when the top is ruined: a lintel's worth of wall over each one
  const keep = hole.all.map((d) => ({ x: d.x, reach: d.w / 2 + 6, need: Math.min(s.H, holeTop(d) + (d.reaches ? 6 : 4)) }));
  return (x) => {
    let y = raw(x);
    for (const k of keep) if (Math.abs(x - k.x) < k.reach) y = Math.max(y, k.need);
    return y;
  };
}

function rawTop(s: WallSpec): (x: number) => number {
  const { H, top, c, L } = s;
  if (top === 'crenel') {
    const merlon = 8, gap = 6.5, drop = 7;
    return (x) => {
      const t = ((x + L / 2) % (merlon + gap) + (merlon + gap)) % (merlon + gap);
      return t < merlon ? H : H - drop;
    };
  }
  if (s.opening === 'crumbled') {
    // a V-shaped breach crumbling down from the top
    const seed = c.seed + 17;
    const gx = c.rng.fork(19).range(-L * 0.15, L * 0.15), gw = Math.min(c.sq * 0.75, L * 0.3);
    const base = rawTopNoGap(s);
    return (x) => {
      const t = Math.abs(x - gx) / gw;
      const dip = t < 1 ? (1 - t * t) * H * 0.62 : 0;
      return Math.max(H * 0.3, base(x) - dip - (t < 1.3 ? Math.abs(noise3(x * 0.5, 2, 0, seed)) * 3 : 0));
    };
  }
  return rawTopNoGap(s);
}

function rawTopNoGap(s: WallSpec): (x: number) => number {
  const { H, top, c, L } = s;
  if (top === 'crenel') {
    const merlon = 8, gap = 6.5, drop = 7;
    return (x) => {
      const t = ((x + L / 2) % (merlon + gap) + (merlon + gap)) % (merlon + gap);
      return t < merlon ? H : H - drop;
    };
  }
  if (top === 'broken') {
    const seed = c.seed + 31;
    const depth = H * (0.25 + c.wear * 0.35);
    return (x) => H - depth * clamp(0.55 + fbm(x * 0.05, 0, 0, seed, 3) * 1.4, 0, 1) - Math.abs(noise3(x * 0.4, 1, 0, seed)) * 2;
  }
  return () => H;
}

/** Outline of the wall face (x along the wall, y up) with the openings cut in. */
function outline(s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { L } = s;
  const pts: [number, number][] = [[-L / 2, 0]];
  const doors = (hole?.all ?? []).filter((d) => d.reaches).sort((a, b) => a.x - b.x);
  for (const d of doors) {
    const hw = d.w / 2;
    pts.push([d.x - hw, 0], [d.x - hw, d.spring]);
    if (d.arch) pts.push(...archPts(d.x, hw, d.spring, !!d.pointed).slice().reverse().map(([x, y]) => [2 * d.x - x, y] as [number, number]));
    pts.push([d.x + hw, d.spring], [d.x + hw, 0]);
  }
  pts.push([L / 2, 0]);
  const steps = Math.max(8, Math.round(L / 0.8));
  for (let i = 0; i <= steps; i++) {
    const x = L / 2 - (i / steps) * L;
    pts.push([x, topY(x)]);
  }
  const shape = polyShape(pts);
  let hi = 0;
  for (const d of hole?.all ?? []) {
    if (d.reaches) continue;
    // nudge each extra hole a hair so no two share a straight edge line (keeps the triangulation watertight)
    const dy = hi++ * 0.07;
    const p = new THREE.Path();
    d.poly.forEach(([x, y], i) => (i ? p.lineTo(x, y + dy) : p.moveTo(x, y + dy)));
    shape.holes.push(p);
  }
  return shape;
}

/** Runs of x where a band [ya,yb] is solid wall (not in the opening, under the top). */
function freeRuns(s: WallSpec, hole: Hole | null, topY: (x: number) => number, ya: number, yb: number, margin: (y: number) => number, needTop = 0.6) {
  const runs: [number, number][] = [];
  const step = 0.4;
  let start: number | null = null;
  const probes = [ya + 0.3, (ya + yb) / 2, yb - 0.3];
  for (let x = -s.L / 2; x <= s.L / 2 + 1e-6; x += step) {
    const ok = topY(x) >= ya + (yb - ya) * needTop && !probes.some((y) => inHole(hole, x, y, margin(y)));
    if (ok && start === null) start = x;
    if ((!ok || x + step > s.L / 2 + 1e-6) && start !== null) {
      const end = ok ? s.L / 2 : x - step;
      if (end - start > 1.2) runs.push([start, end]);
      start = null;
    }
  }
  return runs;
}

// ---------- the wall ----------

export function wall(b: Builder, s: WallSpec) {
  const style = s.style;
  const hole = makeHole(s);
  const topY = topProfile(s, hole);
  const masonry = ['brick', 'ashlar', 'fieldstone', 'cinder', 'concretewall', 'pipes', 'cyberwall', 'crystalwall'].includes(style);
  const coreInset = masonry ? 1.0 : style === 'bulkhead' ? 2.2 : style === 'organic' ? 1.5 : 1.2;
  const shape = outline(s, hole, topY);
  const coreT = Math.max(2, s.T - coreInset * 2);
  b.extrude(shape, coreT, masonry ? 'mortar' : style === 'timber' ? 'cloth' : style === 'organic' ? 'organic' : style === 'planks' ? 'wood2' : 'metal2', { y: s.y0 });

  if (masonry) masonryCourses(b, s, hole, topY);
  else if (style === 'timber') timber(b, s, hole, topY);
  else if (style === 'planks') plankWall(b, s, hole, topY);
  else if (style === 'iron') ironWall(b, s, hole, topY);
  else if (style === 'bulkhead' || style === 'scifipanel') bulkhead(b, s, hole, topY);
  else if (style === 'organic') organicWall(b, s, hole, topY);

  // extras per style
  if (style === 'pipes') pipesOn(b, s, hole, topY);
  if (style === 'cyberwall') cyberExtras(b, s, hole, topY);
  if (style === 'crystalwall') {
    const r = s.c.rng.fork(5);
    for (let i = 0; i < Math.max(1, Math.round(s.L / 30)); i++) {
      const x = r.range(-s.L / 2 + 6, s.L / 2 - 6);
      if (inHole(hole, x, s.H * 0.5, 4)) continue;
      const side = r.chance(0.5) ? 1 : -1;
      const g = new Builder();
      crystalCluster(g, 0, 0, 0, r, 0.8);
      for (const p of g.parts) b.add(p.geo, 'crystal', { x, y: s.y0 + r.range(s.H * 0.2, s.H * 0.8), z: side * s.T / 2, rx: side * Math.PI / 2.4 });
    }
  }
  wallTop(b, s, topY, hole);
  doorFrame(b, s, hole);
  // rubble at the foot of ruined walls
  if (s.top === 'broken' || hole?.kind === 'broken' || s.c.wear > 0.55) {
    const r = s.c.rng.fork(9);
    const n = Math.round(2 + s.c.wear * 6 + (hole?.kind === 'broken' ? 4 : 0));
    for (let i = 0; i < n; i++) {
      const x = hole?.kind === 'broken' && i < 4 ? hole.x + r.soft() * (hole.r ?? 5) : r.range(-s.L / 2 + 3, s.L / 2 - 3);
      const side = r.chance(0.5) ? 1 : -1;
      rubble(b, x, side * (s.T / 2 + r.range(1.5, 4)), s.y0, r.range(1.5, 3), r, 2);
    }
  }
}

function masonryCourses(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { style, T, y0, c } = s;
  const rng = c.rng.fork(1);
  const d = c.detail;
  // brick size comes from the settings: rows per inch and bricks per square
  const bh = 25.4 / Math.max(2, c.courses), bl = c.sq / Math.max(1, c.bricksPer);
  const J = LOOK.joint;
  const spec: Record<string, { ch: [number, number]; len: [number, number]; noise: number; joint: number; bond: boolean; mats: ('stone' | 'stone2')[] }> = {
    brick: { ch: [bh, bh], len: [bl, bl], noise: 0.25, joint: J, bond: true, mats: ['stone', 'stone2'] },
    pipes: { ch: [bh, bh], len: [bl, bl], noise: 0.25, joint: J, bond: true, mats: ['stone', 'stone2'] },
    ashlar: { ch: [bh * 1.8, bh * 2.2], len: [bl * 1.2, bl * 2.4], noise: 0.18, joint: J * 0.8, bond: false, mats: ['stone', 'stone2'] },
    fieldstone: { ch: [bh, bh * 1.8], len: [bl * 0.6, bl * 1.5], noise: 0.75, joint: J * 1.1, bond: false, mats: ['stone', 'stone2'] },
    crystalwall: { ch: [bh, bh * 1.9], len: [bl * 0.7, bl * 1.6], noise: 0.75, joint: J * 1.1, bond: false, mats: ['stone', 'stone2'] },
    cinder: { ch: [bh * 0.9, bh * 0.9], len: [bl * 0.85, bl * 0.85], noise: 0.12, joint: J * 0.7, bond: true, mats: ['stone', 'stone2'] },
    concretewall: { ch: [s.H / 3, s.H / 3], len: [c.sq, c.sq], noise: 0.1, joint: J * 0.7, bond: false, mats: ['stone', 'stone'] },
    cyberwall: { ch: [s.H / 4, s.H / 4], len: [c.sq / 2, c.sq], noise: 0.08, joint: J * 0.8, bond: true, mats: ['metal', 'metal2'] as any },
  };
  const k = spec[style] ?? spec.brick;
  // keep clear of the arch stones above each arched opening
  const margin = (y: number) => (hole && hole.all.some((d) => d.arch && d.kind !== 'slit' && y > d.spring - 1) && !MODERN.includes(style) ? 5.6 : hole?.kind === 'broken' ? 0.2 : 0.35);
  let y = 0, course = 0;
  const maxTop = Math.max(...Array.from({ length: 41 }, (_, i) => topY(-s.L / 2 + (i / 40) * s.L)));
  while (y < maxTop - 0.5) {
    let ch = rng.range(k.ch[0], k.ch[1]);
    if (maxTop - y - ch < k.ch[0] * 0.6) ch = maxTop - y;
    // windows: keep a course line at the sill so stones don't straddle it
    const runs = freeRuns(s, hole, topY, y, y + ch, margin);
    for (const [a, z] of runs) {
      let x = a;
      let first = true;
      while (x < z - 0.8) {
        let len = rng.range(k.len[0], k.len[1]);
        if (k.bond && first && course % 2 === 1) len = k.len[0] / 2;
        first = false;
        if (z - x - len < k.len[0] * 0.45) len = z - x;
        const top = Math.min(y + ch, topY(x + len / 2));
        const hgt = top - y;
        if (hgt > 1.2) {
          const broken = s.top === 'broken' && top < y + ch - 0.5;
          const sd = rng.int(1, 9999);
          const mat = k.mats[rng.int(0, 1)] as any;
          const missing = c.wear > 0.45 && rng.chance((c.wear - 0.45) * 0.08);
          const proud = style === 'fieldstone' || style === 'crystalwall' ? rng.range(-0.3, 0.5) : 0;
          const depth = T - 2 + 2 * Math.max(0.15, LOOK.popout) + proud * 2; // pop-out past the mortar core
          if (!missing) b.block(len - k.joint, hgt - k.joint, depth, mat, {
            x: x + len / 2, y: y0 + y + hgt / 2, z: style === 'fieldstone' ? rng.soft() * 0.3 : 0,
            rz: style === 'fieldstone' ? rng.soft() * 0.04 : 0,
          }, {
            bevel: style === 'concretewall' ? 0.4 : Math.min(0.9, hgt * 0.15), noise: (k.noise + c.wear * 0.25 + (broken ? 0.6 : 0)) * d,
            freq: style === 'ashlar' ? 0.25 : 0.45, seed: sd, chip: c.wear + (broken ? 0.6 : 0), res: style === 'concretewall' ? 2 : 1.3,
          });
          // cinder blocks show their hollow cores on broken tops; concrete shows tie holes
          if (style === 'concretewall') for (const ex of [-1, 1]) for (const ez of [-1, 1])
            b.cyl(0.9, 0.9, 0.5, 'stone2', { x: x + len / 2 + ex * len * 0.3, y: y0 + y + hgt / 2 + (hgt > 10 ? 0 : 0), z: ez * (T / 2 + 0.05), rx: Math.PI / 2 }, 12);
        }
        x += len;
      }
    }
    y += ch;
    course++;
  }
  // arch stones / lintels / sills for every opening (modern walls get a steel frame instead, see doorFrame)
  if (hole && !MODERN.includes(style)) for (const h of hole.all) {
    if (h.kind === 'broken' || h.kind === 'round') {
      if (h.kind === 'round') {
        const R = h.r! + 2.6, n = Math.max(8, Math.round((Math.PI * 2 * R) / 4.6));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          b.block((Math.PI * 2 * R) / n - 0.5, 5, T + 0.6, 'stone', { x: h.x + Math.cos(a) * R, y: y0 + h.cy! + Math.sin(a) * R, rz: a - Math.PI / 2 }, { bevel: 0.6, noise: 0.2 * d, seed: rng.int(1, 9999), res: 1.2 });
        }
      }
      continue;
    }
    const hw = h.w / 2;
    if (h.arch && h.kind !== 'slit') {
      // stones radiating around the arch (round or pointed), keystone on top
      const ring = archPts(h.x, hw, h.spring, !!h.pointed, 40);
      const total = ring.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) : 0), 0);
      const n = Math.max(5, Math.round(total / 4.6) | 1);
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n) * (ring.length - 1);
        const k0 = Math.floor(t), f = t - k0;
        const p0 = ring[k0], p1 = ring[Math.min(ring.length - 1, k0 + 1)];
        const px = p0[0] + (p1[0] - p0[0]) * f, py = p0[1] + (p1[1] - p0[1]) * f;
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]); // tangent
        const nx = -Math.sin(ang), ny = Math.cos(ang);    // outward normal
        const key = i === (n - 1) / 2;
        b.block(total / n - 0.5 + (key ? 1 : 0), key ? 6.5 : 5.2, T - 2 + 2 * LOOK.popout + 0.6, 'stone', {
          x: px + nx * (2.6 + (key ? 0.6 : 0)), y: y0 + py + ny * (2.6 + (key ? 0.6 : 0)), rz: ang,
        }, { bevel: 0.6, noise: 0.2 * d + c.wear * 0.2, seed: rng.int(1, 9999), res: 1.2 });
      }
      for (const e of [-1, 1]) b.block(6.5, 3, T + 0.6, 'stone2', { x: h.x + e * (hw + 2.6), y: y0 + h.spring - 1.5 }, { bevel: 0.5, noise: 0.15, seed: rng.int(1, 999) });
    } else {
      b.block(h.w + 9, 5, T + 0.6, 'stone', { x: h.x, y: y0 + holeTop(h) + 2.5 }, { bevel: 0.7, noise: 0.2 * d, seed: rng.int(1, 9999) });
    }
    if (!h.reaches) b.block(h.w + 5, 2.4, T + 2.4, 'stone', { x: h.x, y: y0 + h.bottom - 1.2 }, { bevel: 0.5, noise: 0.15, seed: 5 });
  }
}

function timber(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { L, T, y0, c, H } = s;
  const rng = c.rng.fork(2);
  // plaster texture panels on both faces
  const runs = freeRuns(s, hole, topY, 3, H - 3, () => 0.5, 0.9);
  for (const [a, z] of runs) for (const side of [-1, 1]) {
    const w = z - a;
    b.block(w, H - 6, 1, 'cloth', { x: (a + z) / 2, y: y0 + H / 2, z: side * (T / 2 - 1.4) }, { bevel: 0.3, noise: 0.35 * c.detail, freq: 0.25, seed: rng.int(1, 9999), res: 1.5 });
  }
  const beam = (x0: number, yA: number, x1: number, yB: number, wdt: number) => {
    const len = Math.hypot(x1 - x0, yB - yA);
    const ang = Math.atan2(yB - yA, x1 - x0);
    for (const side of [-1, 1])
      b.block(len, wdt, 2.2, rng.chance(0.5) ? 'wood' : 'wood2', { x: (x0 + x1) / 2, y: y0 + (yA + yB) / 2, z: side * (T / 2 - 0.6), rz: ang },
        { bevel: 0.45, noise: 0.3 * c.detail + c.wear * 0.3, freq: 0.6, seed: rng.int(1, 9999), res: 1.2, chip: c.wear });
  };
  beam(-L / 2, 2.2, L / 2, 2.2, 4.4);   // sole plate
  const topLine = Math.min(...Array.from({ length: 21 }, (_, i) => topY(-L / 2 + (i / 20) * L)));
  beam(-L / 2, topLine - 2.2, L / 2, topLine - 2.2, 4.4);
  const posts: number[] = [];
  for (let x = -L / 2 + 2.2; x <= L / 2 - 2.2 + 0.01; x += c.sq / 2) posts.push(Math.min(x, L / 2 - 2.2));
  if (posts[posts.length - 1] < L / 2 - 2.3) posts.push(L / 2 - 2.2);
  for (const x of posts) if (!inHole(hole, x, H / 2, 3) && !inHole(hole, x, 6, 3)) beam(x, 4.4, x, topLine - 4.4, 4);
  const mid = H * 0.48;
  for (let i = 0; i < posts.length - 1; i++) {
    const x0 = posts[i] + 2, x1 = posts[i + 1] - 2;
    const cx = (x0 + x1) / 2;
    if (inHole(hole, cx, mid, 3) || inHole(hole, x0, mid, 3) || inHole(hole, x1, mid, 3)) continue;
    beam(x0, mid, x1, mid, 3.6);
    if (i % 2 === 0) beam(x0, 4.4, x1, mid - 1.8, 3.2);
    else beam(x0, topLine - 4.4, x1, mid + 1.8, 3.2);
  }
}

function plankWall(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, c, H } = s;
  const rng = c.rng.fork(3);
  const ph = Math.max(2.6, (c.sq / c.planksPer) * 0.82);
  for (let y = 0; y < H - 1; y += ph) {
    const runs = freeRuns(s, hole, topY, y, Math.min(H, y + ph), () => 0.4);
    for (const [a, z] of runs) {
      for (const side of [-1, 1]) {
        const hgt = Math.min(ph, Math.min(topY((a + z) / 2), H) - y) - 0.5;
        if (hgt < 1) continue;
        const sd = rng.int(1, 9999);
        const g = topBox(z - a, 1.4, hgt, 0.45, (gx, gz) => -0.2 * c.detail * Math.pow(Math.abs(Math.sin(gz * 2.6 + fbm(gx * 0.05, gz * 0.3, 0, sd, 2) * 4)), 10) + c.wear * 0.3 * fbm(gx * 0.2, gz * 0.2, 1, sd, 2), 0.3);
        b.add(g, rng.chance(0.5) ? 'wood' : 'wood2', { x: (a + z) / 2, y: y0 + y + hgt / 2 + 0.25, z: side * (T / 2 - 1.4), rx: side * Math.PI / 2 + side * 0.04 });
      }
    }
  }
  // frame posts with treenails
  for (const x of [-s.L / 2 + 2.5, s.L / 2 - 2.5]) for (const side of [-1, 1])
    b.block(5, H, 1.8, 'wood2', { x, y: y0 + H / 2, z: side * (T / 2 - 0.2) }, { bevel: 0.5, noise: 0.3, seed: rng.int(1, 999) });
}

function ironWall(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, c, H } = s;
  const rng = c.rng.fork(4);
  const bands = [[0, H * 0.33], [H * 0.33, H * 0.72], [H * 0.72, H]] as const;
  for (const [ya, yb] of bands) {
    const runs = freeRuns(s, hole, topY, ya, yb, () => 0.8);
    for (const [a, z] of runs) {
      let x = a;
      while (x < z - 1) {
        const len = Math.min(z - x, c.sq);
        const top = Math.min(yb, topY(x + len / 2));
        const hgt = top - ya - 0.6;
        if (hgt > 1.5) for (const side of [-1, 1]) {
          const sd = rng.int(1, 9999);
          const g = topBox(len - 0.7, 1.2, hgt, 0.5, (px, pz) => c.wear * 0.4 * fbm(px * 0.15, pz * 0.15, 2, sd, 3), 0.4);
          b.add(g, rng.chance(0.5) ? 'metal' : 'metal2', { x: x + len / 2, y: y0 + ya + hgt / 2 + 0.3, z: side * (T / 2 - 1.2), rx: side * Math.PI / 2 });
          const zz = side * (T / 2 + 0.05);
          const e = 1.6;
          const yy0 = y0 + ya + 0.3 + e, yy1 = y0 + ya + 0.3 + hgt - e;
          const rr = (x0: number, yA: number, x1: number, yB: number) => {
            const n = Math.max(1, Math.round(Math.hypot(x1 - x0, yB - yA) / 3.6));
            for (let i = 0; i <= n; i++) b.sphere(0.6, 'metal2', { x: x0 + ((x1 - x0) * i) / n, y: yA + ((yB - yA) * i) / n, z: zz, sz: 0.7 }, 8);
          };
          rr(x + e, yy0, x + len - e, yy0);
          rr(x + e, yy1, x + len - e, yy1);
        }
        x += len;
      }
    }
  }
}

function bulkhead(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, c, H, L } = s;
  const rng = c.rng.fork(5);
  const hull = s.style === 'scifipanel';
  // lower and upper trim bands
  for (const [ya, yb, mat] of [[0, 6, 'metal2'], [H - 5, H, 'metal2']] as const) {
    for (const [a, z] of freeRuns(s, hole, topY, ya, yb, () => 0.5)) for (const side of [-1, 1])
      b.block(z - a, yb - ya, 1.6, mat, { x: (a + z) / 2, y: y0 + (ya + yb) / 2, z: side * (T / 2 - 1) }, { bevel: 0.5, res: 2 });
  }
  // panels between ribs
  const ribEvery = c.sq / (hull ? 1 : 2);
  for (const [a, z] of freeRuns(s, hole, topY, 7, H - 6, () => 1.2)) {
    let x = a;
    while (x < z - 2) {
      const len = Math.min(ribEvery, z - x);
      for (const side of [-1, 1]) {
        const zz = side * (T / 2 - 1.3);
        const ph = H - 13.5;
        b.block(len - 1.6, ph, 1.2, 'metal', { x: x + len / 2, y: y0 + 7 + ph / 2 - 0.3, z: zz }, { bevel: 0.6, res: 2, noise: c.wear * 0.3, seed: rng.int(1, 999) });
        // inset detail: vents, light bars, greebles
        const kind = rng.int(0, hull ? 2 : 4);
        const cx = x + len / 2, cy = y0 + 7 + ph / 2;
        if (kind === 0) for (let i = -3; i <= 3; i++) b.box(len * 0.55, 0.7, 0.9, 'metal2', { x: cx, y: cy + i * 1.6, z: zz + side * 0.9 });
        if (kind === 1) b.box(1.4, ph * 0.6, 0.8, 'glow', { x: cx, y: cy, z: zz + side * 0.8 });
        if (kind === 2) { b.box(len * 0.4, 4, 1.2, 'metal2', { x: cx - 1, y: cy + 5, z: zz + side * 1 }); b.box(2.4, 6, 1.6, 'metal2', { x: cx + len * 0.2, y: cy - 4, z: zz + side * 1 }); }
        if (kind === 3) { b.cyl(3, 3, 1, 'metal2', { x: cx, y: cy, z: zz + side * 0.9, rx: Math.PI / 2 }, 24); b.cyl(1.6, 1.6, 1.4, 'glow', { x: cx, y: cy, z: zz + side * 1.1, rx: Math.PI / 2 }, 20); }
        if (hull) for (let rx = x + 2; rx < x + len - 1; rx += 3.4) for (const ry of [7.6, H - 6.6]) b.sphere(0.55, 'metal2', { x: rx, y: y0 + ry, z: zz + side * 0.6, sz: 0.7 }, 8);
      }
      x += len;
    }
  }
  // ribs (chamfered, proud of the panels)
  const ribs: number[] = [];
  for (let x = -L / 2 + 1.5; x <= L / 2 - 1.5 + 0.01; x += ribEvery) ribs.push(x);
  if (ribs[ribs.length - 1] < L / 2 - 1.6) ribs.push(L / 2 - 1.5);
  const rib = polyShape([[-1.8, 0], [1.8, 0], [1.2, 1.2], [-1.2, 1.2]]);
  for (const x of ribs) {
    const hgt = Math.min(H, topY(x));
    if (inHole(hole, x, hgt / 2, 2) || inHole(hole, x, 4, 2)) continue;
    for (const side of [-1, 1]) b.extrude(rib, hgt, 'metal2', { x, y: y0 + hgt / 2, z: side * (T / 2 - 1.2), rx: Math.PI / 2, rz: 0, ry: side < 0 ? Math.PI : 0 });
  }
  // conduits along the bottom band
  if (!hull) for (const side of [-1, 1]) for (const [a, z] of freeRuns(s, hole, topY, 1, 5, () => 0.5)) {
    b.cyl(0.9, 0.9, z - a, 'brass', { x: (a + z) / 2, y: y0 + 3.2, z: side * (T / 2 + 0.6), rz: Math.PI / 2 }, 10);
  }
}

function organicWall(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, c, H, L } = s;
  const rng = c.rng.fork(6);
  // fleshy plates
  for (let y = 0; y < H - 2; y += 9) {
    for (const [a, z] of freeRuns(s, hole, topY, y, Math.min(H, y + 9), () => 1)) for (const side of [-1, 1]) {
      const hgt = Math.min(9, topY((a + z) / 2) - y) - 0.4;
      if (hgt < 1.5) continue;
      b.block(z - a, hgt, 2.2, 'organic', { x: (a + z) / 2, y: y0 + y + hgt / 2, z: side * (T / 2 - 1.3) },
        { bevel: Math.min(1.2, hgt / 3), noise: 1.1 * c.detail, freq: 0.18, seed: rng.int(1, 9999), res: 1.4 });
    }
  }
  // ribs: curved tubes bulging out of both faces
  const n = Math.max(2, Math.round(L / 9));
  for (let i = 0; i < n; i++) {
    const x = -L / 2 + ((i + 0.5) * L) / n + rng.soft() * 1.5;
    const hgt = Math.min(H, topY(x)) - 1;
    if (inHole(hole, x, hgt / 2, 2.5) || inHole(hole, x, 5, 2.5)) continue;
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        pts.push(new THREE.Vector3(x + Math.sin(t * 3 + i) * 1.2, y0 + t * hgt, side * (T / 2 - 0.6 + Math.sin(t * Math.PI) * 2.2)));
      }
      b.add(tube(new THREE.CatmullRomCurve3(pts), 30, 1.3, 10, false), 'organic');
      b.sphere(1.3, 'organic', { x: pts[0].x, y: pts[0].y, z: pts[0].z }, 10);
      b.sphere(1.3, 'organic', { x: pts[10].x, y: pts[10].y, z: pts[10].z }, 10);
    }
  }
  for (let i = 0; i < L / 8; i++) {
    const x = rng.range(-L / 2 + 3, L / 2 - 3), y = rng.range(4, H - 6);
    if (inHole(hole, x, y, 3) || y > topY(x) - 3) continue;
    b.sphere(rng.range(1, 2.2), rng.chance(0.4) ? 'glow' : 'organic', { x, y: y0 + y, z: (rng.chance(0.5) ? 1 : -1) * (T / 2 + 0.6) }, 12);
  }
}

function pipesOn(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, c, H } = s;
  const rng = c.rng.fork(7);
  const z = T / 2 + 2.6;
  for (const [yy, r] of [[H * 0.72, 2.1], [H * 0.6, 1.4]] as const) {
    for (const [a, e] of freeRuns(s, hole, topY, yy - r - 1, yy + r + 1, () => 2)) {
      if (e - a < 6) continue;
      b.cyl(r, r, e - a, 'brass', { x: (a + e) / 2, y: y0 + yy, z, rz: Math.PI / 2 }, 16);
      for (const ex of [a + 0.7, e - 0.7]) b.cyl(r + 0.9, r + 0.9, 1.4, 'metal2', { x: ex, y: y0 + yy, z, rz: Math.PI / 2 }, 16);
      for (let x = a + 3; x < e - 2; x += c.sq / 2) {
        b.cyl(r + 0.8, r + 0.8, 1.4, 'metal2', { x, y: y0 + yy, z, rz: Math.PI / 2 }, 16);
        b.box(1.6, 1.6, 2.8, 'metal2', { x, y: y0 + yy - r - 0.4, z: z - 1.6 }); // bracket
      }
    }
  }
  // gauge and valve wheel
  const x = rng.range(-s.L / 2 + 6, s.L / 2 - 6);
  if (!inHole(hole, x, H * 0.4, 6)) {
    b.cyl(3.2, 3.2, 1.2, 'brass', { x, y: y0 + H * 0.4, z: T / 2 + 0.6, rx: Math.PI / 2 }, 28);
    b.cyl(2.5, 2.5, 1.4, 'cloth', { x, y: y0 + H * 0.4, z: T / 2 + 0.8, rx: Math.PI / 2 }, 28);
    b.box(0.4, 2, 0.6, 'accent', { x: x + 0.5, y: y0 + H * 0.4 + 0.7, z: T / 2 + 1.6, rz: -0.6 });
    b.add(new THREE.TorusGeometry(3.4, 0.6, 8, 24), 'accent', { x: x + 7, y: y0 + H * 0.72, z: z + 3.2 });
    b.cyl(0.6, 0.6, 3.5, 'metal2', { x: x + 7, y: y0 + H * 0.72, z: z + 1.6, rx: Math.PI / 2 }, 8);
  }
}

function cyberExtras(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, c, H, L } = s;
  const rng = c.rng.fork(8);
  // neon strip and a sign box on the front, hanging cables
  for (const [a, z] of freeRuns(s, hole, topY, H * 0.78, H * 0.82, () => 1)) b.box(z - a - 2, 0.9, 1, 'glow', { x: (a + z) / 2, y: y0 + H * 0.8, z: T / 2 + 0.4 });
  const sx = rng.range(-L / 2 + 8, L / 2 - 8);
  if (!inHole(hole, sx, H * 0.55, 8)) {
    b.block(12, 7, 2.2, 'metal2', { x: sx, y: y0 + H * 0.55, z: T / 2 + 1 }, { bevel: 0.5, res: 2 });
    for (let i = 0; i < 3; i++) b.box(8 - i * 1.5, 0.8, 0.8, 'glow', { x: sx, y: y0 + H * 0.55 - 2 + i * 2, z: T / 2 + 2.4 });
  }
  for (let k = 0; k < 2; k++) {
    const x0 = rng.range(-L / 2 + 2, 0), x1 = rng.range(0, L / 2 - 2);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y0 + H - 3 - Math.sin(t * Math.PI) * (6 + k * 4), T / 2 + 1 + k * 0.8));
    }
    b.add(tube(new THREE.CatmullRomCurve3(pts), 40, 0.6, 8, false), k ? 'accent' : 'metal2');
    for (const p of [pts[0], pts[12]]) b.sphere(0.8, 'metal2', { x: p.x, y: p.y, z: p.z }, 8);
  }
  // AC unit
  if (L >= c.sq * 2) {
    const x = rng.range(-L / 4, L / 4);
    if (!inHole(hole, x, H * 0.3, 8)) {
      b.block(10, 8, 6, 'metal', { x, y: y0 + H * 0.3, z: T / 2 + 3 }, { bevel: 0.5, res: 2 });
      b.cyl(3, 3, 0.8, 'metal2', { x, y: y0 + H * 0.3, z: T / 2 + 6.2, rx: Math.PI / 2 }, 24);
      for (let i = 0; i < 4; i++) b.box(5.6, 0.5, 0.4, 'metal2', { x, y: y0 + H * 0.3, z: T / 2 + 6.7, rz: (i * Math.PI) / 4 });
    }
  }
}

function wallTop(b: Builder, s: WallSpec, topY: (x: number) => number, hole: Hole | null) {
  const { top, T, y0, H, L, c } = s;
  const rng = c.rng.fork(11);
  if (top === 'cornice') {
    b.block(L, 2.6, T + 3, 'stone', { y: y0 + H + 1.3 }, { bevel: 0.6, noise: 0.15 + c.wear * 0.4, seed: 3, res: 1.6 });
    b.block(L, 1.4, T + 1.6, 'stone2', { y: y0 + H - 1 }, { bevel: 0.4, noise: 0.1, seed: 4 });
    for (let x = -L / 2 + 2; x < L / 2 - 1; x += 3.2) for (const side of [-1, 1]) b.box(1.4, 1.6, 1, 'stone2', { x, y: y0 + H - 2.6, z: side * (T / 2 + 0.6) }); // dentils
  }
  if (top === 'rail') {
    b.block(L, 1.8, T + 1.2, s.style === 'planks' || s.style === 'timber' ? 'wood' : 'metal2', { y: y0 + H + 0.9 }, { bevel: 0.5, res: 2 });
  }
  if (top === 'spikes') {
    for (let x = -L / 2 + 3; x < L / 2 - 2; x += rng.range(4, 7)) {
      const h = rng.range(4, 9);
      b.cyl(0, rng.range(1, 1.8), h, 'organic', { x, y: y0 + topY(x) + h / 2 - 0.5, z: rng.soft() * T * 0.2, rz: rng.soft() * 0.3 }, 8);
    }
  }
  if (top === 'crenel' && s.style !== 'timber') {
    // walkway cap stones over the lower stretches
    for (let x = -L / 2; x < L / 2; x += 1) {
      /* the courses already form the merlons; nothing extra needed */
    }
  }
}

function doorFrame(b: Builder, s: WallSpec, hole: Hole | null) {
  const { T, y0, style } = s;
  // iron bars across barred windows (any wall style)
  for (const h of hole?.all ?? []) if (h.kind === 'barred') {
    const n = Math.max(3, Math.round(h.w / 3.4));
    for (let i = 1; i < n; i++) b.cyl(0.65, 0.65, h.spring - h.bottom + 2, 'metal2', { x: h.x - h.w / 2 + (i * h.w) / n, y: y0 + (h.bottom + h.spring) / 2 }, 8);
    b.box(h.w + 1, 1, 1.4, 'metal2', { x: h.x, y: y0 + (h.bottom + h.spring) / 2 });
  }
  if (s.opening === 'secret') {
    // a hidden door: just a hairline seam and a loose stone to press
    const w = Math.min(s.c.sq * 0.86, s.L - 8), top = Math.min(s.c.sq * 1.45, s.H - 6);
    for (const side of [1]) {
      const z = side * (T / 2 - 2 + LOOK.popout + 0.25);
      b.box(0.6, top, 0.5, 'mortar', { x: -w / 2, y: y0 + top / 2, z });
      b.box(0.6, top, 0.5, 'mortar', { x: w / 2, y: y0 + top / 2, z });
      b.box(w, 0.6, 0.5, 'mortar', { x: 0, y: y0 + top, z });
      b.block(3.2, 2.6, 0.8, 'stone2', { x: w / 2 + 4, y: y0 + top * 0.55, z: z + 0.3 }, { bevel: 0.3, noise: 0.2, seed: 3 });
    }
  }
  const masonry = ['brick', 'ashlar', 'fieldstone', 'pipes', 'crystalwall'].includes(style);
  if (!hole || masonry) return;
  const mat = style === 'timber' || style === 'planks' ? 'wood' : style === 'organic' ? 'organic' : style === 'concretewall' || style === 'cinder' ? 'stone2' : 'metal2';
  const fw = 2.4;
  for (const h of hole.all) {
    if (h.kind === 'broken' || h.kind === 'round') continue;
    const hw = h.w / 2;
    const jambH = h.spring - h.bottom + (h.arch ? 0 : fw);
    for (const e of [-1, 1]) b.block(fw, jambH, T + 1.2, mat, { x: h.x + e * (hw + fw / 2), y: y0 + h.bottom + jambH / 2 }, { bevel: 0.5, res: 2 });
    if (h.arch && !h.pointed) {
      b.add(arcTorus(hw + fw / 2, fw / 2, 8, 24, Math.PI), mat, { x: h.x, y: y0 + h.spring, sz: (T + 1.2) / fw });
    } else if (h.pointed) {
      const ring = archPts(h.x, hw + fw / 2, h.spring, true, 24);
      for (let i = 1; i < ring.length; i++) {
        const [x0, yA] = ring[i - 1], [x1, yB] = ring[i];
        b.block(Math.hypot(x1 - x0, yB - yA) + 0.6, fw, T + 1.2, mat, { x: (x0 + x1) / 2, y: y0 + (yA + yB) / 2, rz: Math.atan2(yB - yA, x1 - x0) }, { bevel: 0.3, res: 2 });
      }
    } else b.block(h.w + fw * 2, fw, T + 1.2, mat, { x: h.x, y: y0 + holeTop(h) + fw / 2 }, { bevel: 0.5, res: 2 });
    if (style === 'bulkhead' || style === 'scifipanel') {
      for (let y = h.bottom + 2; y < h.spring - 2; y += 3) for (const e of [-1, 1]) b.box(1.2, 1.6, 0.5, 'accent', { x: h.x + e * (hw + fw / 2), y: y0 + y, z: T / 2 + 0.85, rz: e * 0.7 });
    }
  }
}

// ---------- doors (separate leaf, printed flat) ----------

export function doorLeaf(b: Builder, type: string, w: number, h: number, arch: boolean, c: Ctx) {
  // laid flat on the bed (Y up = the door's front face), centred on the origin
  const rng = c.rng.fork(21);
  const t = 2.6;
  if (type === 'portcullis') {
    for (let x = -w / 2 + 1; x <= w / 2 - 1 + 0.01; x += 3.4) {
      b.boxOn(1.4, 1.4, h, 'metal2', { x });
      b.cyl(0, 0.8, 2.4, 'metal2', { x, z: h / 2 + 1.1, y: 0.7, rx: Math.PI / 2 }, 6);
    }
    for (let z = -h / 2 + 3; z < h / 2 - 1; z += 4) b.boxOn(w, 1.2, 1.2, 'metal', { z, y: 1.1 });
    return;
  }
  const outline = arch ? archShape(w, h) : polyShape([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]);
  if (type === 'wood' || type === 'hatch') {
    b.extrude(outline, t, 'wood2', { y: t / 2, rx: Math.PI / 2 });
    const pw = w / 5;
    for (let i = 0; i < 5; i++) {
      const x = -w / 2 + (i + 0.5) * pw;
      const len = arch ? h - (w / 2 - Math.sqrt(Math.max(0, (w / 2) ** 2 - x * x))) : h;
      const sd = rng.int(1, 9999);
      const g = topBox(pw - 0.5, 0.9, len - 0.6, 0.4, (gx, gz) => -0.18 * Math.pow(Math.abs(Math.sin(gx * 2.4 + fbm(gx * 0.3, gz * 0.05, 0, sd, 2) * 4)), 10), 0.3);
      b.add(g, rng.chance(0.5) ? 'wood' : 'wood2', { x, y: t - 0.2, z: -h / 2 + len / 2 + 0.3 });
    }
    for (const zf of [0.22, 0.78]) {
      const z = -h / 2 + h * zf;
      b.boxOn(w - 2, 0.8, 2.6, 'metal2', { z, y: t + 0.6 });
      for (let x = -w / 2 + 2.5; x < w / 2 - 1; x += 3.2) b.sphere(0.55, 'metal2', { x, z, y: t + 1.4, sy: 0.7 }, 8);
    }
    b.add(new THREE.TorusGeometry(1.8, 0.45, 8, 20), 'metal2', { x: w / 2 - 4, z: 0, y: t + 1, rx: -Math.PI / 2 });
    b.cyl(1, 1, 1, 'metal2', { x: w / 2 - 4, z: -2, y: t + 1 }, 12);
    return;
  }
  if (type === 'bronze') {
    b.extrude(outline, t, 'brass', { y: t / 2, rx: Math.PI / 2 });
    for (const zf of [0.3, 0.72]) for (const xs of [-1, 1]) {
      const pw = w / 2 - 3, ph = h * 0.32;
      b.block(pw, 0.8, ph, 'brass', { x: xs * (w / 4), z: -h / 2 + h * zf, y: t + 0.3 }, { bevel: 0.4, res: 2 });
      b.sphere(1.1, 'brass', { x: xs * (w / 4), z: -h / 2 + h * zf, y: t + 0.9, sy: 0.6 }, 12);
    }
    b.boxOn(0.8, 0.8, h - 2, 'brass', { y: t });
    return;
  }
  if (type === 'vault') {
    b.cyl(w / 2, w / 2, t, 'metal', { y: t / 2 }, 48);
    b.cyl(w / 2 - 2, w / 2 - 2, 0.8, 'metal2', { y: t + 0.4 }, 48);
    for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.sphere(0.8, 'brass', { x: Math.cos(a) * (w / 2 - 1), z: Math.sin(a) * (w / 2 - 1), y: t, sy: 0.7 }, 8); }
    b.add(new THREE.TorusGeometry(w / 5, 0.8, 8, 32), 'brass', { y: t + 1.8, rx: -Math.PI / 2 });
    for (let i = 0; i < 3; i++) b.box(w / 2.6, 0.9, 0.9, 'brass', { y: t + 1.8, ry: (i * Math.PI) / 3 });
    b.cyl(2, 2, 1.8, 'brass', { y: t + 1.2 }, 20);
    return;
  }
  if (type === 'metal') {
    b.extrude(outline, t, 'metal', { y: t / 2, rx: Math.PI / 2 });
    b.block(w - 3, 0.6, h - 3, 'metal2', { y: t + 0.2 }, { bevel: 0.3, res: 3 });
    b.block(w * 0.4, 0.8, h * 0.18, 'glow', { z: -h * 0.25, y: t + 0.5 }, { bevel: 0.3, res: 2 });
    b.boxOn(4, 1.2, 1, 'metal2', { x: w / 2 - 4, z: 0, y: t + 0.3 });
    return;
  }
  if (type === 'shutter') {
    for (let z = -h / 2 + 0.8; z < h / 2; z += 1.8) b.block(w, 1.2, 1.6, 'metal', { z, y: 0.6 }, { bevel: 0.5, res: 2 });
    b.boxOn(w, 2.4, 2, 'metal2', { z: -h / 2 + 1, y: 0 });
    for (let i = 0; i < 6; i++) b.box(rng.range(3, 9), 0.4, rng.range(1, 3), 'accent', { x: rng.range(-w / 3, w / 3), z: rng.range(-h / 3, h / 3), y: 1.4, ry: rng.soft() }); // graffiti tags
    return;
  }
  if (type === 'sliding') {
    for (const side of [-1, 1]) {
      const pw = w / 2 - 0.3;
      b.block(pw, t, h, 'metal', { x: side * (w / 4), y: t / 2 }, { bevel: 0.5, res: 2 });
      for (let z = -h / 2 + 4; z < h / 2 - 3; z += 4.2) b.box(pw * 0.7, 0.6, 1.4, 'accent', { x: side * (w / 4), z, y: t + 0.2, ry: side * 0.5 });
      b.box(1, 0.8, h * 0.5, 'glow', { x: side * (w / 4 + pw / 2 - 1.5), y: t + 0.2 });
    }
    return;
  }
  if (type === 'iris') {
    const R = Math.min(w, h) / 2;
    b.cyl(R, R, t, type === 'iris' && c ? 'metal2' : 'metal2', { y: t / 2 }, 48);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const shape = polyShape([[0, 0], [R - 1, -1.5], [R - 1, 3.5]]);
      b.extrude(shape, 1, 'organic', { y: t + 0.4, rx: -Math.PI / 2, ry: a });
    }
    b.sphere(2, 'glow', { y: t, sy: 0.5 }, 16);
    return;
  }
}

function archShape(w: number, h: number) {
  const s = new THREE.Shape();
  const hw = w / 2, spring = h / 2 - hw;
  s.moveTo(-hw, -h / 2);
  s.lineTo(hw, -h / 2);
  s.lineTo(hw, spring);
  s.absarc(0, spring, hw, 0, Math.PI, false);
  s.lineTo(-hw, -h / 2);
  return s;
}

export function holeFor(s: WallSpec) {
  return makeHole(s);
}
export { archPts };

export { inHole, smoothstep };

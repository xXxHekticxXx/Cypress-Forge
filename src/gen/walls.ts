// Walls, corners and doors. A wall runs along X (centred), is T thick along Z and stands on y0.
// Masonry walls are built course by course from blocks that go right through the wall, so both faces are
// detailed; other styles have a core with panels, timbers, pipes or ribs on both faces.
import * as THREE from 'three';
import { Builder, Rng, fbm, noise3, clamp, polyShape, smoothstep, tube, arcTorus, inPoly, LOOK, type Mat, type BlockOpts } from './core';
import { rubble, crystalCluster, topBox, type Ctx } from './floors';

// styles that get a steel/concrete frame round openings instead of arch stones
const MODERN = ['cinder', 'concretewall', 'cyberwall', 'facebrick', 'corrugated', 'precast', 'patched'];
// styles built from separate stones/bricks set in mortar (they get arch stones, lintels and sills)
const ARCHED = ['brick', 'ashlar', 'fieldstone', 'marble', 'incertum', 'romanbrick', 'georgian', 'harbor', 'factory', 'pipes', 'megalith', 'crystalwall'];
const BLOCKY = [...ARCHED.filter((x) => !['incertum', 'megalith', 'crystalwall'].includes(x)), 'cinder', 'facebrick', 'patched', 'cyberwall'];
const CORE: Record<string, Mat> = {
  timber: 'cloth', planks: 'wood2', clinker: 'wood2', organic: 'organic', nogging: 'mortar', concretewall: 'stone', precast: 'stone',
  corrugated: 'metal2', iron: 'metal2', bulkhead: 'metal2', scifipanel: 'metal2', crystalwall: 'stone2',
};
const INSET: Record<string, number> = { bulkhead: 2.2, organic: 1.5, concretewall: 1.2, precast: 1.2, corrugated: 1.2, clinker: 1.6, planks: 1.4, nogging: 1.6, crystalwall: 1.0 };

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
  const blocky = BLOCKY.includes(style);
  const coreInset = INSET[style] ?? (blocky || style === 'incertum' || style === 'megalith' ? 1.0 : 1.2);
  const shape = outline(s, hole, topY);
  const coreT = Math.max(2, s.T - coreInset * 2);
  b.extrude(shape, coreT, CORE[style] ?? 'mortar', { y: s.y0 });

  if (blocky) masonryCourses(b, s, hole, topY);
  else if (style === 'incertum' || style === 'megalith') polygonal(b, s, hole, topY);
  else if (style === 'crystalwall') crystalColumns(b, s, hole, topY);
  else if (style === 'timber') timber(b, s, hole, topY, 'daub');
  else if (style === 'nogging') timber(b, s, hole, topY, 'nogging');
  else if (style === 'planks') boardBatten(b, s, hole, topY);
  else if (style === 'clinker') clinker(b, s, hole, topY);
  else if (style === 'iron') ironWall(b, s, hole, topY);
  else if (style === 'bulkhead' || style === 'scifipanel') bulkhead(b, s, hole, topY);
  else if (style === 'organic') organicWall(b, s, hole, topY);
  else if (style === 'concretewall' || style === 'precast' || style === 'corrugated') relief(b, s, hole, topY, RELIEF[style](s));
  if (ARCHED.includes(style)) archStones(b, s, hole);

  // extras per style
  if (style === 'pipes') pipesOn(b, s, hole, topY);
  if (style === 'cyberwall') cyberExtras(b, s, hole, topY);
  if (style === 'patched') { patches(b, s, hole, topY); cables(b, s, 2); }
  if (style === 'precast') precastExtras(b, s, hole, topY);
  if (style === 'harbor') harborExtras(b, s, hole, topY);
  if (style === 'factory') factoryExtras(b, s, hole, topY);
  if (style === 'georgian') georgianExtras(b, s, hole, topY);
  if (style === 'facebrick') facebrickExtras(b, s, hole);
  if (style === 'fieldstone' || style === 'incertum') galets(b, s, hole, topY);
  if (style === 'corrugated') corrugatedExtras(b, s, hole, topY);
  if (style === 'marble') b.block(s.L, 2.6, s.T + 3.4, 'stone2', { y: s.y0 + 1.3 }, { bevel: 0.5, noise: 0.08, seed: 2, res: 2 }); // stepped plinth
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

// ---------- bricks & stones: every style has its own bond, unit size and face ----------

type Unit = { x: number; y: number; len: number; h: number; course: number; i: number; end: boolean; rng: Rng };
type Face = BlockOpts & { out?: number; dz?: number; rz?: number; dy?: number; mat?: Mat; skip?: boolean; boss?: BlockOpts & { inset: number; out: number } };
type Pattern = {
  ch: (course: number, y: number) => number;
  len: (course: number, i: number, end: boolean) => number;
  joint: number;
  face: (u: Unit) => Face;
};

function pattern(s: WallSpec): Pattern {
  const { c } = s;
  const rng = c.rng.fork(21);
  const bh = 25.4 / Math.max(2, c.courses), bl = c.sq / Math.max(1, c.bricksPer);
  const J = LOOK.joint, d = c.detail, wear = c.wear;
  const std = (u: Unit, noise: number, freq: number, bevel: number, res = 1.3): Face =>
    ({ noise: (noise + wear * 0.25) * d, freq, bevel: Math.min(bevel, u.h * 0.3), res, chip: wear, seed: u.rng.int(1, 99999) });
  switch (s.style) {
    case 'marble': // Greek isodomic ashlar: equal tall courses, tall orthostates at the foot, drafted margins round a rough boss
      return {
        ch: (k) => (k === 0 ? bh * 3.4 : bh * 2), len: (k, i) => (k === 0 ? bl * 1.7 : i === 0 && k % 2 ? bl : bl * 2), joint: J * 0.45,
        face: (u) => ({ ...std(u, 0.05, 0.3, 0.3, 1.6), boss: { inset: 1.5, out: 0.7, noise: (0.35 + wear * 0.3) * d, freq: 0.32, bevel: 0.6, res: 1.1, seed: u.rng.int(1, 9999) } }),
      };
    case 'romanbrick': // opus mixtum: bands of thin Roman brick between bands of diamond-set net stones (handled below)
      return { ch: () => bh * 0.55, len: (k, i) => (i === 0 && k % 2 ? bl * 0.7 : bl * 1.4), joint: J * 1.5, face: (u) => std(u, 0.3, 0.6, 0.35, 1.1) };
    case 'brick': // handmade brick, Flemish bond: stretcher-header-stretcher in every course, uneven sizes
      return {
        ch: () => bh * rng.range(0.93, 1.07), len: (k, i) => (i === 0 && k % 2 ? bl * 0.75 : i % 2 ? bl / 2 : bl), joint: J * 1.15,
        face: (u) => ({ ...std(u, 0.38, 0.55, 0.55), out: u.len < bl * 0.6 ? 0.3 : u.rng.range(-0.15, 0.2), rz: u.rng.soft() * 0.02, dy: u.rng.soft() * 0.25 }),
      };
    case 'georgian': // English bond: whole courses of stretchers, then whole courses of headers; crisp rubbed brick
      return { ch: () => bh, len: (k, i) => (k % 2 ? (i === 0 ? bl / 4 : bl / 2) : bl), joint: J * 0.6, face: (u) => std(u, 0.08, 0.7, 0.25, 1.6) };
    case 'pipes': // Victorian garden-wall bond: three stretcher courses, then a header course
      return { ch: () => bh, len: (k, i) => (k % 4 === 3 ? bl / 2 : i === 0 && k % 2 ? bl / 2 : bl), joint: J * 0.8, face: (u) => std(u, 0.2, 0.6, 0.35) };
    case 'factory': // mill brick: plain stretcher bond (pilasters and corbels added after)
      return { ch: () => bh, len: (k, i) => (i === 0 && k % 2 ? bl / 2 : bl), joint: J * 0.8, face: (u) => ({ ...std(u, 0.18, 0.6, 0.3), out: -0.5 }) };
    case 'ashlar': // castle stone: random courses, rock-faced (pitched) stones, dressed quoins at the ends
      return {
        ch: () => rng.range(bh * 1.4, bh * 2.6), len: (k, i, end) => (end ? (k % 2 ? bl * 1.9 : bl * 1.05) : rng.range(bl, bl * 2.6)), joint: J * 0.8,
        face: (u) => (u.end ? { ...std(u, 0.08, 0.4, 0.5, 1.4), out: 0.9 } : { ...std(u, 0.75, 0.2, 1.2, 1.0), out: u.rng.range(0, 0.7) }),
      };
    case 'fieldstone': // rounded field and river stones, wandering courses
      return {
        ch: () => rng.range(bh * 0.9, bh * 1.9), len: () => rng.range(bl * 0.6, bl * 1.5), joint: J * 0.8,
        face: (u) => ({ ...std(u, 0.5, 0.5, Math.min(u.len, u.h) * 0.3, 1.0), bevel: Math.min(u.len, u.h) * 0.3, out: u.rng.range(-0.3, 0.7), dz: u.rng.soft() * 0.3, rz: u.rng.soft() * 0.12, dy: u.rng.soft() * 0.6 }),
      };
    case 'harbor': // sea wall: huge rusticated granite, battered (leaning back) towards the top
      return {
        ch: () => rng.range(bh * 2.2, bh * 3), len: () => rng.range(bl * 1.6, bl * 3), joint: J * 0.9,
        face: (u) => ({ ...std(u, 0.95, 0.15, 1.4, 1.0), out: 2.4 * Math.pow(1 - clamp(u.y / s.H, 0, 1), 1.3) + u.rng.range(0, 0.4) }),
      };
    case 'cinder': // concrete masonry units: big 2:1 blocks, crisp edges, porous face, tooled joints
      return { ch: () => bh * 1.6, len: (k, i) => (i === 0 && k % 2 ? bh * 1.6 : bh * 3.2), joint: J * 0.85, face: (u) => std(u, 0.14, 1.4, 0.25, 1.4) };
    case 'patched': // cinder block with gaps punched out (scrap patches added after)
      return { ch: () => bh * 1.6, len: (k, i) => (i === 0 && k % 2 ? bh * 1.6 : bh * 3.2), joint: J * 0.85, face: (u) => ({ ...std(u, 0.3, 1.2, 0.3, 1.4), skip: u.rng.chance(0.13) }) };
    case 'facebrick': // machine face brick, stretcher bond, soldier course along the top
      return {
        ch: (k, y) => (y > s.H - bl * 1.05 ? s.H - y : bh), len: (k, i) => (i === 0 && k % 2 ? bl / 2 : bl), joint: J * 0.6,
        face: (u) => ({ ...std(u, 0.03, 0.8, 0.2, 1.8) }),
      };
    case 'cyberwall':
      return { ch: () => s.H / 4, len: (k, i) => (i % 2 ? c.sq : c.sq / 2), joint: J * 0.8, face: (u) => ({ noise: 0.08, bevel: 0.6, res: 1.6, seed: u.rng.int(1, 9999), mat: u.rng.chance(0.5) ? 'metal' : 'metal2' }) };
  }
  return { ch: () => bh, len: (k, i) => (i === 0 && k % 2 ? bl / 2 : bl), joint: J, face: (u) => std(u, 0.25, 0.45, 0.6) };
}

function masonryCourses(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { style, T, y0, c, L } = s;
  const rng = c.rng.fork(1);
  const P = pattern(s);
  const bh = 25.4 / Math.max(2, c.courses), bl = c.sq / Math.max(1, c.bricksPer);
  const margin = (y: number) => (hole && hole.all.some((d) => d.arch && d.kind !== 'slit' && y > d.spring - 1) && !MODERN.includes(style) ? 5.6 : hole?.kind === 'broken' ? 0.2 : 0.35);
  let y = 0, course = 0;
  const maxTop = Math.max(...Array.from({ length: 41 }, (_, i) => topY(-L / 2 + (i / 40) * L)));
  const soldierAt = s.H - bl * 1.05;
  while (y < maxTop - 0.5) {
    // Roman opus mixtum: every fifth band is a net of diamond-set square stones
    if (style === 'romanbrick' && course % 6 === 5 && maxTop - y > c.sq * 0.5) {
      const bandH = Math.min(c.sq * 0.62, maxTop - y - bh);
      reticulatum(b, s, hole, topY, y, y + bandH, rng);
      y += bandH; course++;
      continue;
    }
    let ch = P.ch(course, y);
    const minCh = Math.min(P.ch(course + 1, y + ch), ch);
    if (maxTop - y - ch < minCh * 0.6) ch = maxTop - y;
    const soldier = style === 'facebrick' && y >= soldierAt - 0.01;
    for (const [a, z] of freeRuns(s, hole, topY, y, y + ch, margin)) {
      let x = a, i = 0;
      while (x < z - 0.8) {
        const end = i === 0 ? a < -L / 2 + 0.5 : false;
        let len = soldier ? bh : P.len(course, i, end);
        if (z - x - len < len * 0.45 || z - x - len < 1.2) len = z - x;
        const isEnd = end || (x + len > L / 2 - 0.5 && z > L / 2 - 0.5);
        if (isEnd && style === 'ashlar' && !end) { const q = course % 2 ? bl * 1.05 : bl * 1.9; if (len > q + bl * 0.6) len = len - q; }
        const top = Math.min(y + ch, topY(x + len / 2));
        const hgt = top - y;
        if (hgt > 1.2) {
          const broken = s.top === 'broken' && top < y + ch - 0.5;
          const u: Unit = { x: x + len / 2, y, len, h: hgt, course, i, end: isEnd, rng: rng.fork(course * 131 + i) };
          const f = P.face(u);
          const missing = f.skip || (c.wear > 0.45 && rng.chance((c.wear - 0.45) * 0.08));
          const depth = T - 2 + 2 * Math.max(0.15, LOOK.popout + (f.out ?? 0));
          const opts: BlockOpts = { ...f, noise: (f.noise ?? 0.2) + (broken ? 0.6 : 0), chip: (f.chip ?? 0) + (broken ? 0.6 : 0) };
          if (!missing) {
            b.block(len - P.joint, hgt - P.joint, depth, f.mat ?? (rng.chance(0.5) ? 'stone' : 'stone2'), { x: u.x, y: y0 + y + hgt / 2 + (f.dy ?? 0) * 0.3, z: f.dz ?? 0, rz: f.rz ?? 0 }, opts);
            if (f.boss && len - P.joint > f.boss.inset * 2 + 2 && hgt - P.joint > f.boss.inset * 2 + 2)
              b.block(len - P.joint - f.boss.inset * 2, hgt - P.joint - f.boss.inset * 2, depth + f.boss.out * 2, 'stone', { x: u.x, y: y0 + y + hgt / 2 }, f.boss);
          }
        }
        x += len; i++;
      }
    }
    y += ch;
    course++;
  }
}

/** Roman opus reticulatum: small square stones set on the diagonal, like a net. */
function reticulatum(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number, ya: number, yb: number, rng: Rng) {
  const { T, y0, L, c } = s;
  const side = Math.max(3.2, (c.sq / Math.max(2, c.bricksPer)) * 0.55);
  const p = side * Math.SQRT2 + LOOK.joint * 0.9;
  const depth = T - 2 + 2 * Math.max(0.15, LOOK.popout);
  for (let row = 0, y = ya + p / 2; y <= yb - p / 2 + 0.01; y += p / 2, row++) {
    for (let x = -L / 2 + (row % 2 ? p / 2 : 0) + p / 2; x <= L / 2 - p / 2 + 0.01; x += p) {
      if (y + p / 2 > topY(x) || inHole(hole, x, y, p / 2 + 0.4)) continue;
      b.block(side, side, depth, rng.chance(0.5) ? 'stone' : 'stone2', { x, y: y0 + y, rz: Math.PI / 4 },
        { bevel: 0.4, noise: (0.25 + c.wear * 0.3) * c.detail, freq: 0.6, res: 1.1, chip: c.wear, seed: rng.int(1, 99999) });
    }
  }
}

/** Arch stones, lintels and sills round every opening of a stone or brick wall. */
function archStones(b: Builder, s: WallSpec, hole: Hole | null) {
  const { style, T, y0, c } = s;
  const rng = c.rng.fork(12);
  const d = c.detail;
  if (!hole) return;
  const brickArch = ['brick', 'georgian', 'factory', 'pipes', 'romanbrick'].includes(style);
  for (const h of hole.all) {
    if (h.kind === 'broken' || h.kind === 'round') {
      if (h.kind === 'round') {
        const R = h.r! + 2.6, n = Math.max(8, Math.round((Math.PI * 2 * R) / (brickArch ? 2.6 : 4.6)));
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          b.block((Math.PI * 2 * R) / n - 0.5, 5, T + 0.6, 'stone', { x: h.x + Math.cos(a) * R, y: y0 + h.cy! + Math.sin(a) * R, rz: a - Math.PI / 2 }, { bevel: 0.6, noise: 0.2 * d, seed: rng.int(1, 9999), res: 1.2 });
        }
      }
      continue;
    }
    const hw = h.w / 2;
    if (h.arch && h.kind !== 'slit') {
      // stones radiating round the arch (round or pointed), keystone on top; brick walls get a ring of narrow bricks
      const ring = archPts(h.x, hw, h.spring, !!h.pointed, 40);
      const total = ring.reduce((acc, p, i) => (i ? acc + Math.hypot(p[0] - ring[i - 1][0], p[1] - ring[i - 1][1]) : 0), 0);
      const n = Math.max(5, Math.round(total / (brickArch ? 2.4 : style === 'marble' || style === 'megalith' ? 6.5 : 4.6)) | 1);
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) / n) * (ring.length - 1);
        const k0 = Math.floor(t), f = t - k0;
        const p0 = ring[k0], p1 = ring[Math.min(ring.length - 1, k0 + 1)];
        const px = p0[0] + (p1[0] - p0[0]) * f, py = p0[1] + (p1[1] - p0[1]) * f;
        const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        const nx = -Math.sin(ang), ny = Math.cos(ang);
        const key = i === (n - 1) / 2 && !brickArch;
        b.block(total / n - 0.5 + (key ? 1 : 0), key ? 6.5 : 5.2, T - 2 + 2 * LOOK.popout + 0.6, 'stone', {
          x: px + nx * (2.6 + (key ? 0.6 : 0)), y: y0 + py + ny * (2.6 + (key ? 0.6 : 0)), rz: ang,
        }, { bevel: brickArch ? 0.3 : 0.6, noise: 0.2 * d + c.wear * 0.2, seed: rng.int(1, 9999), res: 1.2 });
      }
      if (!brickArch) for (const e of [-1, 1]) b.block(6.5, 3, T + 0.6, 'stone2', { x: h.x + e * (hw + 2.6), y: y0 + h.spring - 1.5 }, { bevel: 0.5, noise: 0.15, seed: rng.int(1, 999) });
    } else if (brickArch && style !== 'romanbrick') {
      // flat "jack arch" of bricks fanning out over a square opening
      const n = Math.max(5, Math.round((h.w + 6) / 2.4));
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n - 0.5;
        b.block((h.w + 6) / n - 0.4, 5, T - 2 + 2 * LOOK.popout + 0.4, 'stone', { x: h.x + f * (h.w + 6), y: y0 + holeTop(h) + 2.5, rz: -f * 0.5 }, { bevel: 0.3, noise: 0.15 * d, seed: rng.int(1, 9999), res: 1.2 });
      }
    } else {
      b.block(h.w + 9, 5, T + 0.6, 'stone', { x: h.x, y: y0 + holeTop(h) + 2.5 }, { bevel: 0.7, noise: 0.2 * d, seed: rng.int(1, 9999) });
    }
    if (!h.reaches) b.block(h.w + 5, 2.4, T + 2.4, 'stone', { x: h.x, y: y0 + h.bottom - 1.2 }, { bevel: 0.5, noise: 0.15, seed: 5 });
  }
}

// ---------- polygonal stone (Roman opus incertum, alien megaliths) ----------

function clipHalf(poly: [number, number][], px: number, py: number, qx: number, qy: number): [number, number][] {
  // keep the side of the bisector of p→q that is nearer p
  const mx = (px + qx) / 2, my = (py + qy) / 2, nx = qx - px, ny = qy - py;
  const f = (v: [number, number]) => (v[0] - mx) * nx + (v[1] - my) * ny;
  const out: [number, number][] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const fa = f(a), fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

function polygonal(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { L, T, y0, c } = s;
  const mega = s.style === 'megalith';
  const rng = c.rng.fork(31);
  const bl = c.sq / Math.max(1, c.bricksPer);
  const size = mega ? Math.max(14, c.sq * 0.85) : Math.max(5, bl * 0.95);
  const J = LOOK.joint * (mega ? 0.35 : 1.5);
  const maxTop = Math.max(...Array.from({ length: 41 }, (_, i) => topY(-L / 2 + (i / 40) * L)));
  const pts: [number, number][] = [];
  const nx = Math.ceil(L / size) + 2, ny = Math.ceil(maxTop / (size * 0.8)) + 2;
  for (let i = -1; i < nx; i++) for (let j = -1; j < ny; j++)
    pts.push([-L / 2 + (i + rng.range(0.15, 0.85)) * size, (j + rng.range(0.15, 0.85)) * size * 0.8]);
  const margin = (y: number) => (hole && hole.all.some((d) => d.arch && d.kind !== 'slit' && y > d.spring - 1) ? 5.6 : 0.4);
  const depthBase = T - 2 + 2 * Math.max(0.15, LOOK.popout);
  for (const p of pts) {
    if (p[0] < -L / 2 - size || p[0] > L / 2 + size || p[1] > maxTop + size) continue;
    let poly: [number, number][] = [[-L / 2, 0], [L / 2, 0], [L / 2, maxTop], [-L / 2, maxTop]];
    for (const q of pts) if (q !== p && Math.abs(q[0] - p[0]) < size * 2.6 && Math.abs(q[1] - p[1]) < size * 2.6) poly = clipHalf(poly, p[0], p[1], q[0], q[1]);
    if (poly.length < 3) continue;
    // follow the wall top, then pull every corner in to leave a mortar joint
    // cut level under the wall top across the stone's width (a straight cut keeps the stone convex)
    const xs = poly.map((v) => v[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let tcut = Infinity;
    for (let k = 0; k <= 6; k++) tcut = Math.min(tcut, topY(x0 + ((x1 - x0) * k) / 6) - 0.2);
    if (poly.some((v) => v[1] > tcut)) poly = clipHalf(poly, 0, tcut - 1, 0, tcut + 1);
    if (poly.length < 3) continue;
    const cx = poly.reduce((a, v) => a + v[0], 0) / poly.length, cy = poly.reduce((a, v) => a + v[1], 0) / poly.length;
    const rad = poly.reduce((a, v) => a + Math.hypot(v[0] - cx, v[1] - cy), 0) / poly.length;
    if (rad < 1.4) continue;
    const k = Math.max(0.3, 1 - (J / 2 + 0.5) / rad);
    poly = poly.map(([x, y]) => [cx + (x - cx) * k, cy + (y - cy) * k] as [number, number]);
    const area = Math.abs(poly.reduce((a, v, i) => { const w = poly[(i + 1) % poly.length]; return a + v[0] * w[1] - w[0] * v[1]; }, 0)) / 2;
    if (area < 3) continue;
    if (poly.some(([x, y]) => inHole(hole, x, y, margin(y))) || inHole(hole, cx, cy, margin(cy))) continue;
    const missing = c.wear > 0.45 && rng.chance((c.wear - 0.45) * 0.1);
    if (missing) continue;
    const local = poly.map(([x, y]) => [x - cx, y - cy] as [number, number]);
    const depth = depthBase + (mega ? 0 : rng.range(-0.4, 0.8));
    b.extrude(polyShape(local), depth - 0.8, rng.chance(0.5) ? 'stone' : 'stone2', { x: cx, y: y0 + cy, rx: mega ? 0 : rng.soft() * 0.05, ry: mega ? 0 : rng.soft() * 0.05 }, 0.4);
    // alien megaliths: carved glyphs raised on the faces of big stones
    if (mega && rad > 6 && rng.chance(0.55)) for (const side of [-1, 1]) {
      const z = side * (depth / 2 + 0.25);
      const r = Math.min(rad * 0.45, 5);
      const kind = rng.int(0, 2);
      if (kind === 0) for (const rr of [r, r * 0.55]) b.add(new THREE.TorusGeometry(rr, 0.35, 6, 32), 'stone2', { x: cx, y: y0 + cy, z });
      else if (kind === 1) {
        // stepped fret
        for (let i = 0; i < 4; i++) { b.box(r * 0.6, 0.7, 0.7, 'stone2', { x: cx - r * 0.6 + i * r * 0.4, y: y0 + cy - r * 0.5 + i * r * 0.33, z }); b.box(0.7, r * 0.4, 0.7, 'stone2', { x: cx - r * 0.3 + i * r * 0.4, y: y0 + cy - r * 0.35 + i * r * 0.33, z }); }
      } else {
        // eye / sun glyph
        b.add(new THREE.TorusGeometry(r * 0.5, 0.35, 6, 28), 'stone2', { x: cx, y: y0 + cy, z });
        b.sphere(0.9, 'stone2', { x: cx, y: y0 + cy, z, sz: 0.5 }, 10);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.box(r * 0.35, 0.6, 0.7, 'stone2', { x: cx + Math.cos(a) * r * 0.8, y: y0 + cy + Math.sin(a) * r * 0.8, z, rz: a }); }
      }
    }
  }
}

// ---------- crystal columns (like basalt columns, but crystal) ----------

function freeSpans(s: WallSpec, hole: Hole | null, topY: (x: number) => number, x: number, r: number): [number, number][] {
  const spans: [number, number][] = [];
  let a: number | null = null;
  const top = topY(x);
  for (let y = 0; y <= top + 0.01; y += 0.6) {
    const ok = !inHole(hole, x, y, r) && !inHole(hole, x - r, y, 0.3) && !inHole(hole, x + r, y, 0.3);
    if (ok && a === null) a = y;
    if ((!ok || y + 0.6 > top + 0.01) && a !== null) { const e = ok ? top : y - 0.6; if (e - a > 2) spans.push([a, e]); a = null; }
  }
  return spans;
}

function crystalColumns(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  // packed six-sided crystal columns of mixed widths, standing proud by different amounts; flat-topped
  // at stepped heights on a flat wall top, breaking into faceted crystal points on any other top
  const { L, T, y0, c } = s;
  const rng = c.rng.fork(41);
  const R = Math.max(2, T / 4 + LOOK.popout * 0.5);
  const flat = s.top === 'flat' || s.top === 'cornice' || s.top === 'rail';
  for (const row of [-1, 1]) {
    let x = -L / 2 + R * (row > 0 ? 0.8 : 1.5);
    while (x < L / 2 - R * 0.5) {
      const r = R * rng.range(0.7, 1.15);
      const z = row * (T / 2 - r * 0.75 + rng.range(-0.2, 0.9) * Math.max(0.4, LOOK.popout));
      const twist = rng.range(0, Math.PI / 3);
      for (const [ya, yb] of freeSpans(s, hole, topY, x, r)) {
        const atTop = yb >= topY(x) - 0.1;
        const step = atTop ? (flat ? -rng.int(0, 2) * 1.2 : rng.range(-2, 5)) : -0.4;
        const len = Math.max(2, yb - ya + step);
        b.cyl(r, r, len, 'crystal', { x, y: y0 + ya + len / 2, z, ry: twist }, 6);
        if (atTop && !flat) {
          // a chisel point leaning a little off the column
          const tip = r * rng.range(1.2, 2.6);
          b.cyl(r * 0.15, r, tip, 'crystal', { x, y: y0 + ya + len + tip / 2 - 0.1, z, ry: twist, rz: rng.soft() * 0.25, rx: rng.soft() * 0.2 }, 6);
        } else if (atTop) {
          // slightly domed hexagonal cap like a basalt column end
          b.cyl(r * 0.8, r, 0.8, 'crystal', { x, y: y0 + ya + len + 0.35, z, ry: twist }, 6);
        }
      }
      x += r * rng.range(1.45, 1.75);
    }
  }
  // small crystal clusters sprouting from the joints
  for (let i = 0; i < L / 14; i++) {
    const x = rng.range(-L / 2 + 4, L / 2 - 4), y = rng.range(4, s.H - 6);
    if (inHole(hole, x, y, 4) || y > topY(x) - 4) continue;
    const side = rng.chance(0.5) ? 1 : -1;
    const g = new Builder();
    crystalCluster(g, 0, 0, 0, rng, 0.5);
    for (const p of g.parts) b.add(p.geo, 'crystal', { x, y: y0 + y, z: side * (T / 2 + LOOK.popout * 0.5), rx: side * Math.PI / 2.3 });
  }
}

// ---------- relief-faced walls: board-formed concrete, ribbed precast, corrugated steel ----------

type ReliefSpec = { h: (x: number, y: number) => number; mat: Mat; res: number; band: number };

const hash2 = (a: number, b: number, s = 0) => { const v = Math.sin(a * 127.1 + b * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };

const RELIEF: Record<string, (s: WallSpec) => ReliefSpec> = {
  concretewall: (s) => {
    const { c } = s;
    const board = Math.max(2.4, (25.4 / Math.max(2, c.courses)) * 1.1);
    const sd = c.seed;
    const tieX = c.sq / 2, tieY = board * Math.max(2, Math.round((c.sq * 0.6) / board));
    return {
      mat: 'stone', res: 0.35, band: 6,
      h: (x, y) => {
        const bi = Math.floor(y / board), fy = y / board - bi;
        let v = 0.5 + hash2(bi, 3, sd) * 0.3 * c.detail;                       // each form board sits a little proud or shy
        v += (fbm(x * 0.5, bi * 7.1, 0, sd, 3) - 0.5) * 0.35 * c.detail * LOOK.tex; // wood grain printed into the concrete
        const e = Math.min(fy, 1 - fy) * board;
        if (e < 0.3) v -= (0.3 - e) * 1.2;                                     // fins where the boards met
        const tx = ((x % tieX) + tieX) % tieX - tieX / 2, ty = ((y % tieY) + tieY) % tieY - tieY / 2;
        v -= 0.9 * Math.exp(-(tx * tx + ty * ty) / 0.55);                       // form-tie holes
        const px = ((x + s.L / 2) % (c.sq * 2) + c.sq * 2) % (c.sq * 2);
        if (px < 0.6) v -= 0.6;                                                 // control joint
        v -= c.wear * 1.2 * Math.max(0, fbm(x * 0.15, y * 0.15, 3, sd, 3) - 0.62) * 4; // spalling
        return v;
      },
    };
  },
  precast: (s) => {
    const { c } = s;
    const pw = c.sq, ph = Math.max(10, s.H / 2);
    return {
      mat: 'stone', res: 0.35, band: 6,
      h: (x, y) => {
        const px = ((x + s.L / 2) % pw + pw) % pw, py = ((y % ph) + ph) % ph;
        const e = Math.min(px, pw - px, py, ph - py);
        const pi = Math.floor((x + s.L / 2) / pw), pj = Math.floor(y / ph);
        let v = 0.9 + hash2(pi, pj, c.seed) * 0.35;
        v += 0.45 * Math.abs(Math.sin((px / 3) * Math.PI)) * smoothstep(1.4, 2.6, e); // vertical ribs
        if (e < 1.2) v -= (1.2 - e) * 0.9;                                           // chamfered reveal between panels
        v -= c.wear * 1.0 * Math.max(0, fbm(x * 0.2, y * 0.2, 5, c.seed, 3) - 0.6) * 4;
        return v;
      },
    };
  },
  corrugated: (s) => {
    const { c } = s;
    const pitch = 4.2, sheet = c.sq * 1.5;
    return {
      mat: 'metal', res: 0.35, band: 8,
      h: (x, y) => {
        const sx = ((x + s.L / 2) % sheet + sheet) % sheet;
        let v = 0.55 + 0.55 * Math.cos((sx / pitch) * Math.PI * 2);
        if (sx < 0.8) v += 0.35; // the lap where sheets overlap
        // dents and dings
        v -= c.wear * 1.4 * Math.max(0, fbm(x * 0.12, y * 0.12, 7, c.seed, 2) - 0.6) * 3;
        return v;
      },
    };
  },
};

function relief(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number, R: ReliefSpec) {
  const { T, y0, H } = s;
  const inset = INSET[s.style] ?? 1.2;
  const thick = inset + 0.3;
  for (let ya = 0; ya < H - 0.3; ya += R.band) {
    const yb = Math.min(H, ya + R.band);
    for (const [a, z] of freeRuns(s, hole, topY, ya, yb, () => 0.3, 0.6)) {
      const cx = (a + z) / 2;
      const hgt = Math.min(yb, topY(cx)) - ya;
      if (hgt < 0.8) continue;
      const cy = ya + hgt / 2;
      for (const side of [-1, 1]) {
        const g = topBox(z - a, thick, hgt, R.res, (lx, lz) => R.h(cx + lx, cy - side * lz) * (0.6 + 0.4 * LOOK.popout), 0);
        b.add(g, R.mat, { x: cx, y: y0 + cy, z: side * (T / 2 - thick), rx: side * Math.PI / 2 });
      }
    }
  }
}

// ---------- board & batten (medieval) ----------

function boardBatten(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, c, H, L } = s;
  const rng = c.rng.fork(3);
  const bw = Math.max(3, c.sq / c.planksPer);
  for (let x0 = -L / 2; x0 < L / 2 - 0.5; x0 += bw) {
    const w = Math.min(bw, L / 2 - x0);
    const x = x0 + w / 2;
    for (const [ya, yb] of freeSpans(s, hole, topY, x, w / 2 - 0.3)) {
      const len = yb - ya;
      for (const side of [-1, 1]) {
        const sd = rng.int(1, 9999);
        // vertical grain and the odd knot
        const kx = rng.range(-w * 0.2, w * 0.2), ky = rng.range(-len * 0.3, len * 0.3);
        const g = topBox(w - 0.45, 1.6, len, 0.3, (gx, gz) => {
          const knot = Math.hypot(gx - kx, (gz - ky) * 0.6);
          return -0.22 * c.detail * Math.pow(Math.abs(Math.sin(gx * 3.1 + fbm(gz * 0.06, gx * 0.4, 0, sd, 2) * 3 + 1 / (0.6 + knot))), 8) + (s.top === 'broken' ? 0 : 0) - c.wear * 0.4 * Math.max(0, fbm(gx * 0.2, gz * 0.2, 1, sd, 2) - 0.55);
        }, 0.3);
        b.add(g, rng.chance(0.5) ? 'wood' : 'wood2', { x, y: y0 + ya + len / 2, z: side * (T / 2 - 1.6), rx: side * Math.PI / 2 });
      }
    }
  }
  // battens and a Z brace on the outside, held with clout nails
  const ys = [H * 0.18, H * 0.78];
  for (const yy of ys) for (const [a, z] of freeRuns(s, hole, topY, yy - 2, yy + 2, () => 0.4)) {
    b.block(z - a, 4, 1.4, 'wood', { x: (a + z) / 2, y: y0 + yy, z: T / 2 + 0.5 }, { bevel: 0.4, noise: 0.3 * c.detail, freq: 0.6, seed: rng.int(1, 999), res: 1.2 });
    for (let x = a + bw / 2; x < z; x += bw) for (const dy of [-1, 1]) b.sphere(0.55, 'metal2', { x, y: y0 + yy + dy * 1.1, z: T / 2 + 1.25, sz: 0.6 }, 8);
  }
  for (let x0 = -L / 2; x0 < L / 2 - c.sq * 0.6; x0 += c.sq) {
    const x1 = Math.min(L / 2, x0 + c.sq);
    const len = Math.hypot(x1 - x0, ys[1] - ys[0] - 4);
    const mx = (x0 + x1) / 2, my = (ys[0] + ys[1]) / 2;
    if (inHole(hole, mx, my, 3) || inHole(hole, x0 + 2, ys[0] + 3, 2) || inHole(hole, x1 - 2, ys[1] - 3, 2)) continue;
    b.block(len, 3.4, 1.2, 'wood', { x: mx, y: y0 + my, z: T / 2 + 0.45, rz: Math.atan2(ys[1] - ys[0] - 4, x1 - x0) }, { bevel: 0.4, noise: 0.3 * c.detail, freq: 0.6, seed: rng.int(1, 999), res: 1.2 });
  }
}

// ---------- ship hull: clinker (overlapping) planks outside, frames and ceiling planks inside ----------

function clinker(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, c, H, L } = s;
  const rng = c.rng.fork(13);
  const ph = Math.max(3, (c.sq / c.planksPer) * 1.1);
  let row = 0;
  for (let y = 0; y < H - 1; y += ph, row++) {
    const yb = Math.min(H, y + ph + 1.2);
    for (const [a, z] of freeRuns(s, hole, topY, y, Math.min(H, y + ph), () => 0.5, 0.5)) {
      // planks are butt-jointed at staggered points
      let x = a;
      const off = (row % 3) * c.sq * 0.6;
      while (x < z - 1) {
        let len = Math.min(z - x, c.sq * 2 - ((x === a ? off : 0) % (c.sq * 2)) || c.sq * 2);
        if (z - x - len < 3) len = z - x;
        const hgt = Math.min(yb, topY(x + len / 2)) - y;
        if (hgt > 1.5) {
          const sd = rng.int(1, 9999);
          // outside: each strake laps over the one below and leans out at its lower edge
          const g = topBox(len - 0.4, 1.3, hgt, 0.4, (gx, gz) => -0.15 * c.detail * Math.pow(Math.abs(Math.sin(gz * 2.4 + fbm(gx * 0.05, gz * 0.3, 0, sd, 2) * 4)), 10) - c.wear * 0.4 * Math.max(0, fbm(gx * 0.2, gz * 0.2, 1, sd, 2) - 0.55), 0.35);
          b.add(g, rng.chance(0.5) ? 'wood' : 'wood2', { x: x + len / 2, y: y0 + y + hgt / 2, z: T / 2 - 1.4 + 0.5 * LOOK.popout, rx: Math.PI / 2 - 0.13 });
          // copper rivets along the lap, one at every frame
          for (let rx = x + 2; rx < x + len - 1; rx += c.sq / 3) b.cyl(0.5, 0.5, 0.6, 'brass', { x: rx, y: y0 + y + 0.9, z: T / 2 + 0.3 + 0.5 * LOOK.popout, rx: Math.PI / 2 }, 8);
          // inside: flush (carvel) ceiling planks
          const gi = topBox(len - 0.4, 1.4, Math.min(ph, hgt) - 0.4, 0.5, (gx, gz) => -0.15 * c.detail * Math.pow(Math.abs(Math.sin(gz * 2.4 + fbm(gx * 0.05, gz * 0.3, 1, sd, 2) * 4)), 10), 0.3);
          b.add(gi, 'wood2', { x: x + len / 2, y: y0 + y + Math.min(ph, hgt) / 2, z: -(T / 2 - 1.6), rx: -Math.PI / 2 });
        }
        x += len;
      }
    }
  }
  // heavy frames (ribs) on the inside every third of a square
  for (let x = -L / 2 + 2; x < L / 2 - 1; x += c.sq / 3 * 2) {
    for (const [ya, yb] of freeSpans(s, hole, topY, x, 1.8)) {
      b.block(3.4, yb - ya, 2.2, 'wood', { x, y: y0 + (ya + yb) / 2, z: -(T / 2 + 0.6) }, { bevel: 0.5, noise: 0.35 * c.detail, freq: 0.5, seed: rng.int(1, 999), res: 1.2, chip: c.wear });
      for (let y = ya + 3; y < yb - 1; y += ph) b.cyl(0.55, 0.55, 0.6, 'wood2', { x, y: y0 + y, z: -(T / 2 + 1.8), rx: Math.PI / 2 }, 8); // treenails
    }
  }
}


function timber(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number, infill: 'daub' | 'nogging') {
  const { L, T, y0, c, H } = s;
  const rng = c.rng.fork(2);
  // wattle-and-daub: lumpy hand-smoothed plaster panels on both faces
  if (infill === 'daub') {
    const runs = freeRuns(s, hole, topY, 3, H - 3, () => 0.5, 0.9);
    for (const [a, z] of runs) for (const side of [-1, 1]) {
      const w = z - a;
      b.block(w, H - 6, 1, 'cloth', { x: (a + z) / 2, y: y0 + H / 2, z: side * (T / 2 - 1.4) }, { bevel: 0.3, noise: 0.35 * c.detail, freq: 0.25, seed: rng.int(1, 9999), res: 1.5 });
    }
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
  // posts evenly spaced (wider bays for brick nogging so the herringbone has room)
  const bays = Math.max(1, Math.round((L - 4.4) / (infill === 'nogging' ? c.sq * 0.85 : c.sq / 2)));
  for (let i = 0; i <= bays; i++) posts.push(-L / 2 + 2.2 + (i * (L - 4.4)) / bays);
  for (const x of posts) if (!inHole(hole, x, H / 2, 3) && !inHole(hole, x, 6, 3)) beam(x, 4.4, x, topLine - 4.4, 4);
  const mid = H * 0.48;
  for (let i = 0; i < posts.length - 1; i++) {
    const x0 = posts[i] + 2, x1 = posts[i + 1] - 2;
    const cx = (x0 + x1) / 2;
    if (inHole(hole, cx, mid, 3) || inHole(hole, x0, mid, 3) || inHole(hole, x1, mid, 3)) continue;
    beam(x0, mid, x1, mid, 3.6);
    if (infill === 'daub') {
      if (i % 2 === 0) beam(x0, 4.4, x1, mid - 1.8, 3.2);
      else beam(x0, topLine - 4.4, x1, mid + 1.8, 3.2);
    }
  }
  if (infill === 'nogging') {
    // herringbone brick laid in every panel between the timbers
    const panels: [number, number, number, number][] = [];
    for (let i = 0; i < posts.length - 1; i++) {
      const x0 = posts[i] + 2.2, x1 = posts[i + 1] - 2.2;
      panels.push([x0, x1, 4.4, mid - 1.8], [x0, x1, mid + 1.8, topLine - 4.4]);
    }
    const bl = clamp(c.sq / Math.max(2, c.bricksPer) * 0.55, 3, 4.6), bw = bl * 0.45;
    const pitch = bw * 1.05 * Math.SQRT2;
    for (const [x0, x1, ya, yb] of panels) {
      if (yb - ya < 3 || x1 - x0 < 3) continue;
      let row = 0;
      const ext = (bl / 2 + bw / 2) * Math.SQRT1_2 + 0.1; // half the brick's reach once turned 45°
      const rowStep = (bl / 2 - bw / 2) * Math.SQRT1_2 * 2 + bw * 0.75;
      for (let y = ya + ext; y <= yb - ext + 0.01; y += rowStep, row++) {
        const ang = row % 2 ? Math.PI / 4 : -Math.PI / 4;
        for (let x = x0 + ext + (row % 2) * pitch * 0.5; x <= x1 - ext + 0.01; x += pitch) {
          // keep each brick inside its panel and clear of openings
          const ca = Math.cos(ang), sa = Math.sin(ang);
          const corners = [[-bl / 2, -bw / 2], [bl / 2, -bw / 2], [bl / 2, bw / 2], [-bl / 2, bw / 2]].map(([u, v]) => [x + u * ca - v * sa, y + u * sa + v * ca]);
          if (corners.some(([px, py]) => px < x0 || px > x1 || py < ya || py > yb || inHole(hole, px, py, 0.4) || py > topY(px) - 0.5)) continue;
          for (const side of [-1, 1])
            b.block(bl - 0.5, bw - 0.5, 1.4 + LOOK.popout, rng.chance(0.5) ? 'stone' : 'stone2', { x, y: y0 + y, z: side * (T / 2 - 1.6 + (1.4 + LOOK.popout) / 2), rz: ang },
              { bevel: 0.25, noise: 0.25 * c.detail, freq: 0.6, seed: rng.int(1, 9999), res: 1.2, chip: c.wear });
        }
      }
    }
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
  // Victorian boiler plate: rows of plates, each row lapped over the one below, double-riveted seams,
  // with riveted I-beam stanchions standing proud
  const { T, y0, c, H, L } = s;
  const rng = c.rng.fork(4);
  const rows = Math.max(2, Math.round(H / (c.sq * 0.75)));
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    const ya = r * rh, yb = Math.min(H, ya + rh + 1.6); // overlap the next row up
    const lap = (r % 2) * 0.55;                          // alternate rows stand out a little
    const runs = freeRuns(s, hole, topY, ya, Math.min(H, ya + rh), () => 0.8);
    for (const [a, z] of runs) {
      let x = a + (r % 2 ? -c.sq * 0.5 : 0);
      while (x < z - 1) {
        const x0 = Math.max(a, x), x1 = Math.min(z, x + c.sq * 1.25);
        const len = x1 - x0;
        const top = Math.min(yb, topY((x0 + x1) / 2));
        const hgt = top - ya;
        if (len > 1.5 && hgt > 1.5) for (const side of [-1, 1]) {
          const sd = rng.int(1, 9999);
          const g = topBox(len - 0.5, 1.2 + lap, hgt, 0.5, (px, pz) => c.wear * 0.5 * (fbm(px * 0.15, pz * 0.15, 2, sd, 3) - 0.5) * 2, 0.35);
          b.add(g, rng.chance(0.5) ? 'metal' : 'metal2', { x: (x0 + x1) / 2, y: y0 + ya + hgt / 2, z: side * (T / 2 - 1.2), rx: side * Math.PI / 2 });
          const zz = side * (T / 2 + lap + 0.05);
          const rr = (xa: number, yA: number, xb: number, yB: number, sp: number) => {
            const n = Math.max(1, Math.round(Math.hypot(xb - xa, yB - yA) / sp));
            for (let i = 0; i <= n; i++) b.sphere(0.62, 'metal2', { x: xa + ((xb - xa) * i) / n, y: yA + ((yB - yA) * i) / n, z: zz, sz: 0.75 }, 8);
          };
          // double row along the bottom lap, single row up each butt seam
          rr(x0 + 1.5, y0 + ya + 1.1, x1 - 1.5, y0 + ya + 1.1, 2.6);
          rr(x0 + 2.8, y0 + ya + 2.6, x1 - 2.8, y0 + ya + 2.6, 2.6);
          if (hgt > 5) { rr(x0 + 1.2, y0 + ya + 4, x0 + 1.2, y0 + top - 2.2, 2.8); }
        }
        x += c.sq * 1.25;
      }
    }
  }
  // I-beam stanchions
  for (let x = -L / 2 + 2.6; x <= L / 2 - 2.6 + 0.01; x += c.sq * 2) {
    for (const [ya, yb] of freeSpans(s, hole, topY, x, 2.8)) {
      const len = yb - ya;
      for (const side of [-1, 1]) {
        const z = side * (T / 2 + 0.6);
        b.box(1, len, 2.6, 'metal2', { x, y: y0 + ya + len / 2, z: z + side * 1.3 });
        b.box(5.2, len, 0.9, 'metal2', { x, y: y0 + ya + len / 2, z: z + side * 3 });
        for (let y = ya + 2; y < yb - 1; y += 3.2) for (const e of [-1, 1]) b.sphere(0.5, 'metal2', { x: x + e * 1.8, y: y0 + y, z: z + side * 3.5, sz: 0.7 }, 8);
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
        if (hull) {
          // hexagonal armour tiles, each sitting at its own height, with fine seams
          const hs = 3.4, sd = rng.int(1, 999), cx0 = x + len / 2, cy0 = 7 + ph / 2 - 0.3;
          const g = topBox(len - 1.6, 1.2, ph, 0.3, (lx, lz) => {
            const wx = cx0 + lx, wy = cy0 - side * lz;
            const qx = wx / (hs * 1.5), qy = wy / (hs * Math.sqrt(3)) - (Math.round(qx) % 2 ? 0.5 : 0);
            const i = Math.round(qx), j = Math.round(qy);
            const ox = (qx - i) * hs * 1.5, oy = (qy - j) * hs * Math.sqrt(3);
            const dHex = Math.max(Math.abs(oy), Math.abs(ox) * 0.866 + Math.abs(oy) * 0.5);
            const edge = hs * 0.866 - dHex;
            return 0.35 + hash2(i, j, sd) * 0.4 - (edge < 0.35 ? 0.5 : 0) - c.wear * 0.4 * Math.max(0, fbm(wx * 0.2, wy * 0.2, 4, sd, 2) - 0.6) * 3;
          }, 0.4);
          b.add(g, 'metal', { x: x + len / 2, y: y0 + cy0, z: side * (T / 2 - 2.5), rx: side * Math.PI / 2 });
        } else b.block(len - 1.6, ph, 1.2, 'metal', { x: x + len / 2, y: y0 + 7 + ph / 2 - 0.3, z: zz }, { bevel: 0.6, res: 2, noise: c.wear * 0.3, seed: rng.int(1, 999) });
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
  cables(b, s, 2);
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


// ---------- extras that make each style read as its period ----------

function cables(b: Builder, s: WallSpec, n: number) {
  const { T, y0, H, L, c } = s;
  const rng = c.rng.fork(81);
  for (let k = 0; k < n; k++) {
    const x0 = rng.range(-L / 2 + 2, 0), x1 = rng.range(0, L / 2 - 2);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector3(x0 + (x1 - x0) * t, y0 + H - 3 - Math.sin(t * Math.PI) * (6 + k * 4), T / 2 + 1 + k * 0.8));
    }
    b.add(tube(new THREE.CatmullRomCurve3(pts), 40, 0.6, 8, false), k ? 'accent' : 'metal2');
    for (const p of [pts[0], pts[12]]) b.sphere(0.8, 'metal2', { x: p.x, y: p.y, z: p.z }, 8);
  }
}

/** Scrap sheet bolted over the holes in a patched cyberpunk wall. */
function patches(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, H, L, c } = s;
  const rng = c.rng.fork(82);
  const n = Math.max(3, Math.round(L / 10));
  for (let i = 0; i < n; i++) {
    const w = rng.range(9, 18), h = rng.range(8, 15);
    const x = rng.range(-L / 2 + w / 2 + 1, L / 2 - w / 2 - 1), y = rng.range(h / 2 + 2, H - h / 2 - 2);
    if (inHole(hole, x, y, Math.max(w, h) / 2 + 1) || y + h / 2 > topY(x) - 1) continue;
    const side = i % 3 === 2 ? -1 : 1;
    const sd = rng.int(1, 999);
    const g = topBox(w, 0.9, h, 0.35, (gx) => 0.45 + 0.45 * Math.cos((gx / 3.2) * Math.PI * 2) - c.wear * 0.5 * Math.max(0, fbm(gx * 0.3, 0, 0, sd, 2) - 0.55), 0.2);
    const z = side * (T / 2 + LOOK.popout - 0.2);
    b.add(g, 'metal', { x, y: y0 + y, z, rx: side * Math.PI / 2, rz: rng.soft() * 0.12 });
    for (const ex of [-1, 1]) for (const ey of [-1, 1]) b.cyl(0.7, 0.7, 0.9, 'metal2', { x: x + ex * (w / 2 - 1.2), y: y0 + y + ey * (h / 2 - 1.2), z: z + side * 1.2, rx: Math.PI / 2 }, 6);
  }
  // junction box and conduit
  const x = rng.range(-L / 2 + 6, L / 2 - 6);
  if (!inHole(hole, x, H * 0.5, 6)) {
    b.block(6, 8, 2.4, 'metal2', { x, y: y0 + H * 0.5, z: T / 2 + LOOK.popout + 1 }, { bevel: 0.4, res: 2 });
    b.cyl(0.9, 0.9, H * 0.5 - 4, 'metal2', { x, y: y0 + H * 0.5 + 4 + (H * 0.5 - 4) / 2, z: T / 2 + LOOK.popout + 1 }, 10);
  }
}

function precastExtras(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, H, L, c } = s;
  const rng = c.rng.fork(83);
  const z = T / 2 + 1.5 * (0.6 + 0.4 * LOOK.popout);
  // vent grille
  const vx = rng.range(-L / 2 + 7, L / 2 - 7), vy = H * 0.68;
  if (!inHole(hole, vx, vy, 6) && vy + 5 < topY(vx)) {
    b.block(10, 8, 1.2, 'metal2', { x: vx, y: y0 + vy, z: z + 0.4 }, { bevel: 0.3, res: 2 });
    for (let i = -3; i <= 3; i++) b.box(8.4, 0.6, 1.1, 'metal', { x: vx, y: y0 + vy + i * 1.05, z: z + 1.2, rx: -0.5 });
  }
  // holo-ad frame with a glowing screen
  const ax = rng.range(-L / 2 + 9, L / 2 - 9), ay = H * 0.35;
  if (L >= c.sq * 2 && !inHole(hole, ax, ay, 9)) {
    b.block(16, 10, 1.4, 'metal2', { x: ax, y: y0 + ay, z: z + 0.5 }, { bevel: 0.4, res: 2 });
    b.box(14, 8, 0.6, 'glow', { x: ax, y: y0 + ay, z: z + 1.3 });
  }
  cables(b, s, 1);
}

function harborExtras(b: Builder, s: WallSpec, hole: Hole | null, _topY: (x: number) => number) {
  const { T, y0, H, L, c } = s;
  const rng = c.rng.fork(84);
  const out = (y: number) => T / 2 + LOOK.popout + 2.4 * Math.pow(1 - clamp(y / H, 0, 1), 1.3);
  // iron mooring rings on backing plates
  for (let x = -L / 2 + c.sq * 0.75; x < L / 2 - 4; x += c.sq * 1.6) {
    const y = H * 0.42;
    if (inHole(hole, x, y, 6)) continue;
    const z = out(y) + 0.4;
    b.block(5, 5, 1, 'metal2', { x, y: y0 + y, z }, { bevel: 0.3, noise: 0.2, seed: 3 });
    b.cyl(1, 1, 2.4, 'metal2', { x, y: y0 + y, z: z + 1.4, rx: Math.PI / 2 }, 10);
    b.add(new THREE.TorusGeometry(3.2, 0.75, 8, 28), 'metal2', { x, y: y0 + y - 3, z: z + 2.4, rx: 0.35 });
  }
  // barnacles and weed lumps along the tide line
  for (let i = 0; i < L / 2.2; i++) {
    const x = rng.range(-L / 2 + 1.5, L / 2 - 1.5), y = rng.range(1, H * 0.22);
    if (inHole(hole, x, y, 1.5)) continue;
    const r = rng.range(0.5, 1.2);
    b.cyl(r * 0.5, r, r * 1.1, 'stone2', { x, y: y0 + y, z: out(y) + r * 0.3, rx: Math.PI / 2 }, 8);
  }
}

function factoryExtras(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, H, L, c } = s;
  const rng = c.rng.fork(85);
  const bh = 25.4 / Math.max(2, c.courses), bl = c.sq / Math.max(1, c.bricksPer);
  const face = T / 2 - 1 + LOOK.popout;
  // brick pilasters at the ends and every square
  const xs: number[] = [];
  for (let x = -L / 2 + bl * 0.45; x <= L / 2 - bl * 0.45 + 0.01; x += c.sq) xs.push(x);
  if (xs[xs.length - 1] < L / 2 - bl * 0.5) xs.push(L / 2 - bl * 0.45);
  for (const x of xs) for (let y = 0, k = 0; y < H - 0.5; y += bh, k++) {
    const top = Math.min(y + bh, topY(x));
    if (top - y < 1 || inHole(hole, x, y + bh / 2, bl * 0.45)) continue;
    for (const side of [-1, 1]) b.block(bl * 0.9 - 0.5, top - y - 0.5, 3, rng.chance(0.5) ? 'stone' : 'stone2', { x: x + (k % 2 ? 0.4 : -0.4), y: y0 + (y + top) / 2, z: side * (face + 1) }, { bevel: 0.3, noise: 0.2 * c.detail, freq: 0.6, seed: rng.int(1, 9999), res: 1.3, chip: c.wear });
  }
  // corbelled cornice: two stepped courses and a row of dentils just under the top
  if (s.top === 'flat' || s.top === 'cornice') {
    for (const [k, outz] of [[2, 0.9], [1, 1.8]] as const) {
      const y = H - k * bh;
      for (const [a, z] of freeRuns(s, hole, topY, y, y + bh, () => 0.3)) for (const side of [-1, 1])
        b.block(z - a, bh - 0.5, 1.6, 'stone', { x: (a + z) / 2, y: y0 + y + bh / 2, z: side * (face + outz) }, { bevel: 0.3, noise: 0.15, seed: rng.int(1, 999), res: 1.6 });
    }
    const y = H - 3 * bh;
    for (let x = -L / 2 + bl / 4; x < L / 2 - 0.5; x += bl / 2) if (!inHole(hole, x, y, 1)) for (const side of [-1, 1])
      b.box(bl / 4, bh - 0.5, 1.6, 'stone2', { x, y: y0 + y + bh / 2, z: side * (face + 0.9) });
  }
  // cast-iron tie-rod anchor stars between pilasters
  for (let i = 0; i < xs.length - 1; i++) {
    const x = (xs[i] + xs[i + 1]) / 2, y = H * 0.66;
    if (inHole(hole, x, y, 4) || y > topY(x) - 4) continue;
    for (let k = 0; k < 4; k++) b.box(7, 1.3, 0.8, 'metal2', { x, y: y0 + y, z: face + 0.6, rz: (k * Math.PI) / 4 });
    b.cyl(1.1, 1.1, 1.4, 'metal2', { x, y: y0 + y, z: face + 1, rx: Math.PI / 2 }, 6);
  }
}

function georgianExtras(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, H, L, c } = s;
  const rng = c.rng.fork(86);
  const bh = 25.4 / Math.max(2, c.courses), bl = c.sq / Math.max(1, c.bricksPer);
  const face = T / 2 - 1 + LOOK.popout;
  // smooth stone quoins at both ends, long and short in turn
  for (const e of [-1, 1]) for (let y = 0, k = 0; y < H - 1; y += bh * 2, k++) {
    const w = k % 2 ? bl * 0.9 : bl * 1.5;
    const x = e * (L / 2 - w / 2);
    const top = Math.min(y + bh * 2, topY(x));
    if (top - y < 1.5 || inHole(hole, x, y + bh, w / 2)) continue;
    b.block(w - 0.4, top - y - 0.4, T - 2 + 2 * (LOOK.popout + 0.6), 'stone2', { x, y: y0 + (y + top) / 2 }, { bevel: 0.35, noise: 0.06, seed: rng.int(1, 999), res: 1.8 });
  }
  // a stone string course round the wall at first-floor height
  const y = Math.round((H * 0.58) / bh) * bh;
  for (const [a, z] of freeRuns(s, hole, topY, y, y + bh * 1.2, () => 0.3)) for (const side of [-1, 1])
    b.block(z - a, bh * 1.2, 1.8, 'stone2', { x: (a + z) / 2, y: y0 + y + bh * 0.6, z: side * (face + 0.5) }, { bevel: 0.4, noise: 0.05, seed: 7, res: 1.8 });
}

/** Weep vents in the bottom course of modern face brick. */
function facebrickExtras(b: Builder, s: WallSpec, hole: Hole | null) {
  const { T, y0, L, c } = s;
  const bh = 25.4 / Math.max(2, c.courses);
  for (let x = -L / 2 + c.sq * 0.5; x < L / 2 - 2; x += c.sq) {
    if (inHole(hole, x, bh * 1.5, 2)) continue;
    for (const side of [-1, 1]) {
      const z = side * (T / 2 - 1 + LOOK.popout + 0.1);
      b.box(2.2, bh - 0.8, 0.5, 'metal2', { x, y: y0 + bh * 1.5, z });
      for (let i = -1; i <= 1; i++) b.box(0.35, bh - 1.4, 0.5, 'metal', { x: x + i * 0.65, y: y0 + bh * 1.5, z: z + side * 0.3 });
    }
  }
}

/** Small chinking stones pushed into the joints of rubble walls. */
function galets(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, H, L, c } = s;
  const rng = c.rng.fork(87);
  for (let i = 0; i < (L * H) / 60; i++) {
    const x = rng.range(-L / 2 + 1, L / 2 - 1), y = rng.range(1, H - 1);
    if (inHole(hole, x, y, 1.5) || y > topY(x) - 1) continue;
    const side = rng.chance(0.5) ? 1 : -1;
    b.block(rng.range(1.2, 2.2), rng.range(0.8, 1.4), 1.6, 'stone2', { x, y: y0 + y, z: side * (T / 2 - 1 + LOOK.popout * 0.6), rz: rng.soft() * 0.6 }, { bevel: 0.35, noise: 0.15, seed: rng.int(1, 999), res: 1 });
  }
}

/** Corrugated steel: screw rows on the outside, steel girts on the inside, a flashing angle at the foot. */
function corrugatedExtras(b: Builder, s: WallSpec, hole: Hole | null, topY: (x: number) => number) {
  const { T, y0, H, L } = s;
  const crest = T / 2 + 1.1 * (0.6 + 0.4 * LOOK.popout);
  for (const y of [3, H / 2, H - 3]) for (let x = -L / 2 + 4.2; x < L / 2 - 1; x += 8.4) {
    if (inHole(hole, x, y, 1) || y > topY(x) - 1) continue;
    b.cyl(0.6, 0.6, 0.7, 'metal2', { x, y: y0 + y, z: crest + 0.2, rx: Math.PI / 2 }, 6);
  }
  for (const y of [H * 0.3, H * 0.75]) for (const [a, z] of freeRuns(s, hole, topY, y - 1.5, y + 1.5, () => 0.3))
    b.block(z - a, 3, 1.6, 'metal2', { x: (a + z) / 2, y: y0 + y, z: -(crest + 0.6) }, { bevel: 0.2, res: 2 });
  for (const [a, z] of freeRuns(s, hole, topY, 0, 2, () => 0.3)) for (const side of [-1, 1])
    b.block(z - a, 2, 1, 'metal2', { x: (a + z) / 2, y: y0 + 1, z: side * (crest + 0.4) }, { bevel: 0.2, res: 2 });
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
    b.block(L, 1.8, T + 1.2, ['planks', 'timber', 'clinker', 'nogging'].includes(s.style) ? 'wood' : 'metal2', { y: y0 + H + 0.9 }, { bevel: 0.5, res: 2 });
  }
  if (top === 'spikes') {
    for (let x = -L / 2 + 3; x < L / 2 - 2; x += rng.range(4, 7)) {
      const h = rng.range(4, 9);
      b.cyl(0, rng.range(1, 1.8), h, 'organic', { x, y: y0 + topY(x) + h / 2 - 0.5, z: rng.soft() * T * 0.2, rz: rng.soft() * 0.3 }, 8);
    }
  }
  if (top === 'crenel' && s.style !== 'timber' && s.style !== 'nogging') {
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
  if (!hole || ARCHED.includes(style)) return;
  const mat = ['timber', 'planks', 'clinker', 'nogging'].includes(style) ? 'wood' : style === 'organic' ? 'organic' : ['concretewall', 'cinder', 'precast'].includes(style) ? 'stone2' : 'metal2';
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

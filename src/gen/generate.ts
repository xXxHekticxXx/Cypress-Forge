// Turns a set of settings into a finished, printable piece.
import * as THREE from 'three';
import { Builder, INCH, Rng, bounds, LOOK, type Part } from './core';
import { cave, forest } from './nature';
import { dungeon, trap } from './dungeon';
import { applyFinish } from './finish';
import { addBase, baseHeight, clipPiece } from './base';
import { floorSurface, type Ctx } from './floors';
import { wall, doorLeaf, holeFor, type Opening } from './walls';
import { pillar, stairs, hill, bridge } from './terrain';
import { scatter } from './props';
import { eraById, CAVE, DUNGEON, FOREST } from './eras';
import { sqSize, type Params } from './params';

export type Piece = { parts: Part[]; size: THREE.Vector3; box: THREE.Box3; name: string };

const MASONRY = ['brick', 'ashlar', 'fieldstone', 'cinder', 'concretewall', 'pipes', 'cyberwall', 'crystalwall'];

export function pieceName(p: Params) {
  const e = eraById(p.era);
  const label = (list: { id: string; label: string }[], id: string) => list.find((x) => x.id === id)?.label ?? id;
  const size = `${p.sx}x${p.sy}`;
  switch (p.piece) {
    case 'floor': return `${label(e.floor, p.floorStyle)} floor ${size}`;
    case 'wall': return `${label(e.wall, p.wallStyle)} wall ${p.sx}${p.opening !== 'none' ? ' ' + p.opening : ''}`;
    case 'corner': return `${label(e.wall, p.wallStyle)} corner`;
    case 'door': return `${label(e.door, p.doorType)} (${label(e.wall, p.wallStyle)})`;
    case 'pillar': return `${label(e.pillar, p.pillarStyle)}${p.broken ? ' (broken)' : ''}`;
    case 'stairs': return `${label(e.stairs, p.stairsStyle)} ${size}`;
    case 'hill': return `${label(e.ground, p.hillStyle)} ${size}`;
    case 'scatter': return `${label(e.scatter, p.scatterItem)} x${p.count}`;
    case 'bridge': return `${label(e.bridge, p.bridgeStyle)} ${p.sx}`;
    case 'cave': return `${label(CAVE, p.caveItem)} ${size}`;
    case 'dungeon': return label(DUNGEON, p.dungeonItem);
    case 'forest': return label(FOREST, p.forestItem);
    case 'trap': return `${label(e.traps, p.trapItem)} trap`;
  }
}

export function generate(p: Params): Piece {
  const sq = sqSize(p);
  LOOK.tex = p.texture ?? 0.6;
  LOOK.popout = p.popout ?? 1;
  LOOK.joint = p.joint ?? 0.8;
  const c: Ctx = { rng: new Rng(p.seed), sq, wear: p.wear, detail: p.detail, seed: p.seed, era: p.era, courses: p.courses ?? 6, bricksPer: p.bricksPer ?? 3, planksPer: p.planksPer ?? 4 };
  const b = new Builder();
  const W = p.sx * sq, D = p.sy * sq;
  const era = eraById(p.era);
  const floorFor = era.floor.some((f) => f.id === p.floorStyle) ? p.floorStyle : era.floor[0].id;

  switch (p.piece) {
    case 'floor': {
      const y = addBase(b, W, D, p);
      floorSurface(b, floorFor, W, D, y, c);
      break;
    }
    case 'wall':
    case 'door': {
      const T = p.wallT, H = p.wallH * INCH, L = W;
      let opening: Opening = p.opening;
      if (p.piece === 'door') opening = MASONRY.includes(p.wallStyle) && ['ancient', 'medieval', 'alien'].includes(p.era) ? 'doorArch' : 'door';
      if (p.floorStrip) {
        const y = addBase(b, L, sq, p);
        const fd = sq - T;
        const g = new Builder();
        floorSurface(g, floorFor, L, fd, 0, c);
        for (const part of g.parts) b.add(part.geo, part.mat, { y, z: T / 2 });
        wall(b.sub({ z: -sq / 2 + T / 2 }), { L, H, T, y0: y, style: p.wallStyle, top: p.top, opening, pos: p.openingPos, c });
        if (p.piece === 'door' && p.doorLeaf && p.doorType !== 'none') addLeaf(b, p, { L, H, T, y0: y, style: p.wallStyle, top: p.top, opening, pos: p.openingPos, c }, sq / 2 + 6);
      } else {
        const y = addBase(b, L, T + 2, p, centersAlong(L, sq));
        wall(b, { L, H, T, y0: y, style: p.wallStyle, top: p.top, opening, pos: p.openingPos, c });
        if (p.piece === 'door' && p.doorLeaf && p.doorType !== 'none') addLeaf(b, p, { L, H, T, y0: y, style: p.wallStyle, top: p.top, opening, pos: p.openingPos, c }, T / 2 + 6);
      }
      break;
    }
    case 'corner': {
      const T = p.wallT, H = p.wallH * INCH;
      const L = sq * Math.max(1, p.sx);
      if (p.floorStrip) {
        const y = addBase(b, L, L, p);
        const g = new Builder();
        floorSurface(g, floorFor, L - T, L - T, 0, c);
        for (const part of g.parts) b.add(part.geo, part.mat, { y, x: T / 2, z: T / 2 });
        wall(b.sub({ z: -L / 2 + T / 2 }), { L, H, T, y0: y, style: p.wallStyle, top: p.top, opening: 'none', c });
        wall(b.sub({ x: -L / 2 + T / 2, z: T / 2, ry: Math.PI / 2 }), { L: L - T, H, T, y0: y, style: p.wallStyle, top: p.top, opening: 'none', c: { ...c, rng: c.rng.fork(3) } });
      } else {
        // L-shaped base made of two strips
        const y = addBase(b.sub({ z: -L / 2 + T / 2 + 1 }), L, T + 2, p, [[L / 2 - sq / 2, 0]]);
        addBase(b.sub({ x: -L / 2 + T / 2 + 1, z: (T + 2) / 2, ry: Math.PI / 2 }), L - T - 2, T + 2, p, []);
        wall(b.sub({ z: -L / 2 + T / 2 + 1 }), { L, H, T, y0: y, style: p.wallStyle, top: p.top, opening: 'none', c });
        wall(b.sub({ x: -L / 2 + T / 2 + 1, z: T / 2 + 1, ry: Math.PI / 2 }), { L: L - T - 2, H, T, y0: y, style: p.wallStyle, top: p.top, opening: 'none', c: { ...c, rng: c.rng.fork(3) } });
      }
      break;
    }
    case 'pillar': {
      const y = addBase(b, W, D, p);
      const top = floorSurface(b, floorFor, W, D, y, c);
      pillar(b, p.pillarStyle, p.pillarH * INCH, top - 0.6, p.broken, c);
      break;
    }
    case 'stairs': {
      const y = addBase(b, W, D, p);
      stairs(b, p.stairsStyle, W, D, p.stairsH * INCH, p.steps, y, p.rails, c);
      break;
    }
    case 'hill': {
      const y = addBase(b, W, D, p);
      hill(b, p.hillStyle, W, D, p.hillH * INCH, p.tiers, p.rocks, y, c);
      break;
    }
    case 'scatter': {
      const g = new Builder();
      scatter(g, p.scatterItem, p.count, c);
      const bb = bounds(g.parts);
      if (p.onBase && p.base !== 'none') {
        const bw = Math.max(sq, Math.ceil((bb.max.x - bb.min.x + 6) / sq) * sq * 0 + (bb.max.x - bb.min.x + 6));
        const bd = Math.max(sq, bb.max.z - bb.min.z + 6);
        const cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
        const y = addBase(b, bw, bd, p, []);
        const f = new Builder();
        floorSurface(f, floorFor, bw, bd, 0, c);
        for (const part of f.parts) b.add(part.geo, part.mat, { y });
        const top = y + 1.6;
        for (const part of g.parts) b.add(part.geo, part.mat, { x: -cx, z: -cz, y: top });
      } else for (const part of g.parts) b.add(part.geo, part.mat);
      break;
    }
    case 'bridge': {
      bridge(b, p.bridgeStyle, W, D * 0.9, 0, c);
      break;
    }
    case 'cave': {
      const y = addBase(b, W, D, p);
      cave(b, p.caveItem, W, D, p.wallH * INCH, y, p.floorStrip, c);
      break;
    }
    case 'dungeon': {
      const y = addBase(b, W, D, p);
      dungeon(b, p.dungeonItem, W, D, p.wallH * INCH, y, c);
      break;
    }
    case 'forest': {
      const y = addBase(b, W, D, p);
      forest(b, p.forestItem, W, D, p.pillarH * INCH, y, c);
      break;
    }
    case 'trap': {
      const y = addBase(b, W, D, p);
      trap(b, p.trapItem, W, D, y, c);
      break;
    }
  }
  applyFinish(b, p.finish ?? 'clean', p.finishAmt ?? 0.5, p.seed);
  const box = bounds(b.parts);
  // everything sits on the bed
  if (Math.abs(box.min.y) > 0.01) {
    const m = new THREE.Matrix4().makeTranslation(0, -box.min.y, 0);
    for (const part of b.parts) part.geo.applyMatrix4(m);
    box.translate(new THREE.Vector3(0, -box.min.y, 0));
  }
  return { parts: b.parts, size: box.getSize(new THREE.Vector3()), box, name: pieceName(p) };
}

function centersAlong(L: number, sq: number): [number, number][] {
  const n = Math.max(1, Math.round(L / sq));
  return Array.from({ length: n }, (_, i) => [-L / 2 + (L / n) * (i + 0.5), 0] as [number, number]);
}

function addLeaf(b: Builder, p: Params, s: Parameters<typeof wall>[1], frontZ: number) {
  const h = holeFor(s);
  if (!h) return;
  const lw = h.w - 0.6, lh = h.spring + (h.arch ? h.w / 2 : 0) - 0.4;
  const g = new Builder();
  doorLeaf(g, p.doorType, lw, lh, h.arch, s.c);
  // lay the door flat in front of the wall so it prints without supports
  for (const part of g.parts) b.add(part.geo, part.mat, { z: frontZ + lh / 2 });
}

/** A strip of connector clips for bases with clip slots. */
export function clipSet(n: number): Piece {
  const b = new Builder();
  for (let i = 0; i < n; i++) clipPiece(b.sub({ x: (i % 6) * 10 - 25, z: Math.floor(i / 6) * 22 }));
  const box = bounds(b.parts);
  return { parts: b.parts, size: box.getSize(new THREE.Vector3()), box, name: `Connector clips x${n}` };
}

export { baseHeight };

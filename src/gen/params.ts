// Every setting a piece can have, with friendly defaults for 28 mm minis.
import { ERAS, eraById, type PieceKind } from './eras';
import { INCH, Rng } from './core';

export type Params = {
  era: string;
  piece: PieceKind;
  seed: number;
  sx: number; // squares wide
  sy: number; // squares deep
  grid: 'in' | 'mm25';
  wear: number;   // 0 new .. 1 ruined
  detail: number; // relief depth multiplier
  base: 'flat' | 'magnet' | 'clip' | 'none';
  magnet: '5x2' | '6x2' | '6x3' | '8x3';
  floorStyle: string;
  wallStyle: string;
  top: string;
  wallH: number;   // inches
  wallT: number;   // mm
  opening: 'none' | 'arch' | 'square' | 'window' | 'broken';
  floorStrip: boolean;
  doorType: string;
  doorLeaf: boolean;
  pillarStyle: string;
  pillarH: number; // inches
  broken: boolean;
  stairsStyle: string;
  stairsH: number; // inches
  steps: number;
  rails: boolean;
  hillStyle: string;
  hillH: number;   // inches
  tiers: number;
  rocks: number;   // 0..1
  scatterItem: string;
  count: number;
  onBase: boolean;
  bridgeStyle: string;
};

export const sqSize = (p: Params) => (p.grid === 'in' ? INCH : 25);

export function defaults(era = 'medieval', piece: PieceKind = 'floor'): Params {
  const e = eraById(era);
  const p: Params = {
    era, piece, seed: 1234,
    sx: 2, sy: 2, grid: 'in', wear: 0.25, detail: 1, base: 'flat', magnet: '6x3',
    floorStyle: e.floor[0].id, wallStyle: e.wall[0].id, top: e.top[0].id,
    wallH: 2, wallT: 12, opening: 'none', floorStrip: true,
    doorType: e.door[0].id, doorLeaf: true,
    pillarStyle: e.pillar[0].id, pillarH: 2.5, broken: false,
    stairsStyle: e.stairs[0].id, stairsH: 1, steps: 4, rails: false,
    hillStyle: e.ground[0].id, hillH: 1.5, tiers: 2, rocks: 0.5,
    scatterItem: e.scatter[0].id, count: 3, onBase: false,
    bridgeStyle: e.bridge[0].id,
  };
  return fitPiece(p);
}

/** Sensible sizes when switching piece type. */
export function fitPiece(p: Params): Params {
  const q = { ...p };
  if (q.piece === 'wall' || q.piece === 'door') { q.sy = 1; q.sx = Math.max(q.sx, 2); }
  if (q.piece === 'corner') { q.sx = Math.min(3, Math.max(2, q.sx)); q.sy = 1; }
  if (q.piece === 'pillar') { q.sx = 1; q.sy = 1; }
  if (q.piece === 'scatter') { q.sx = 1; q.sy = 1; }
  if (q.piece === 'bridge') { q.sy = 1; q.sx = Math.max(q.sx, 3); }
  if (q.piece === 'stairs') { q.sy = Math.max(q.sy, 2); }
  return q;
}

/** When the era changes, keep each style if the new era has it, otherwise use that era's first one. */
export function switchEra(p: Params, era: string): Params {
  const e = eraById(era);
  const keep = (v: string, list: { id: string }[]) => (list.some((x) => x.id === v) ? v : list[0].id);
  return {
    ...p, era,
    floorStyle: keep(p.floorStyle, e.floor), wallStyle: keep(p.wallStyle, e.wall), top: keep(p.top, e.top),
    doorType: keep(p.doorType, e.door), pillarStyle: keep(p.pillarStyle, e.pillar), stairsStyle: keep(p.stairsStyle, e.stairs),
    hillStyle: keep(p.hillStyle, e.ground), scatterItem: keep(p.scatterItem, e.scatter), bridgeStyle: keep(p.bridgeStyle, e.bridge),
  };
}

export function randomize(p: Params, seed = Date.now()): Params {
  const r = new Rng(seed);
  const e = eraById(p.era);
  const q = { ...p, seed: r.int(1, 999999) };
  if (p.piece === 'floor') q.floorStyle = r.pick(e.floor).id;
  if (p.piece === 'wall' || p.piece === 'corner' || p.piece === 'door') {
    q.wallStyle = r.pick(e.wall).id;
    q.top = r.pick(e.top).id;
    if (p.piece === 'wall') q.opening = r.pick(['none', 'none', 'arch', 'window', 'broken'] as const);
  }
  if (p.piece === 'door') q.doorType = r.pick(e.door).id;
  if (p.piece === 'pillar') { q.pillarStyle = r.pick(e.pillar).id; q.broken = r.chance(0.3); }
  if (p.piece === 'stairs') q.stairsStyle = r.pick(e.stairs).id;
  if (p.piece === 'hill') { q.hillStyle = r.pick(e.ground).id; q.tiers = r.int(1, 3); q.rocks = r.range(0.2, 0.9); }
  if (p.piece === 'scatter') { q.scatterItem = r.pick(e.scatter).id; q.count = r.int(1, 4); }
  if (p.piece === 'bridge') q.bridgeStyle = r.pick(e.bridge).id;
  q.wear = Math.round(r.range(0, 0.7) * 20) / 20;
  return q;
}

export const ALL_ERAS = ERAS;

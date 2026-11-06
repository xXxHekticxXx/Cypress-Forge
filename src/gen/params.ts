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
  opening: string;      // see OPENINGS
  openingPos: 'center' | 'left' | 'right' | 'two';
  popout: number;       // mm bricks/stones stand out from the mortar
  joint: number;        // mm gap between bricks/stones/planks
  bricksPer: number;    // bricks along one square
  courses: number;      // rows of bricks per inch of height
  planksPer: number;    // planks across one square
  texture: number;      // 0..1 fine surface texture
  finish: 'clean' | 'moss' | 'burnt' | 'decay' | 'vines' | 'cobwebs';
  finishAmt: number;    // 0..1
  caveItem: string;
  dungeonItem: string;
  forestItem: string;
  trapItem: string;
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
    wallH: 2, wallT: 12, opening: 'none', openingPos: 'center', floorStrip: true,
    popout: 1, joint: 0.8, bricksPer: 3, courses: 6, planksPer: 4, texture: 0.6, finish: 'clean', finishAmt: 0.5,
    caveItem: 'wall', dungeonItem: 'bars', forestItem: 'oak', trapItem: e.traps[0].id,
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
  if (q.piece === 'cave') { q.sy = ['wall', 'corner', 'arch'].includes(q.caveItem) ? Math.max(1, q.sy) : q.sy; }
  if (q.piece === 'trap') { q.sx = Math.max(2, q.sx); q.sy = Math.max(2, q.sy); }
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
    trapItem: keep(p.trapItem, e.traps),
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
    if (p.piece === 'wall') q.opening = r.pick(['none', 'none', 'arch', 'pointed', 'window', 'slit', 'barred', 'twin', 'broken', 'crumbled']);
  }
  if (p.piece === 'door') q.doorType = r.pick(e.door).id;
  if (p.piece === 'pillar') { q.pillarStyle = r.pick(e.pillar).id; q.broken = r.chance(0.3); }
  if (p.piece === 'stairs') q.stairsStyle = r.pick(e.stairs).id;
  if (p.piece === 'hill') { q.hillStyle = r.pick(e.ground).id; q.tiers = r.int(1, 3); q.rocks = r.range(0.2, 0.9); }
  if (p.piece === 'scatter') { q.scatterItem = r.pick(e.scatter).id; q.count = r.int(1, 4); }
  if (p.piece === 'bridge') q.bridgeStyle = r.pick(e.bridge).id;
  if (p.piece === 'trap') q.trapItem = r.pick(e.traps).id;
  q.wear = Math.round(r.range(0, 0.7) * 20) / 20;
  return q;
}

export const ALL_ERAS = ERAS;

export const OPENINGS = [
  { id: 'none', label: 'None' }, { id: 'arch', label: 'Round arch' }, { id: 'pointed', label: 'Pointed arch' },
  { id: 'square', label: 'Square door' }, { id: 'double', label: 'Double door' }, { id: 'window', label: 'Small window' },
  { id: 'slit', label: 'Arrow slit' }, { id: 'barred', label: 'Barred window' }, { id: 'round', label: 'Round window' },
  { id: 'twin', label: 'Twin windows' }, { id: 'broken', label: 'Blasted hole' }, { id: 'crumbled', label: 'Crumbled gap' },
  { id: 'murder', label: 'Murder hole' }, { id: 'secret', label: 'Secret door' },
];

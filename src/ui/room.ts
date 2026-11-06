// "Generate a whole room": a matching set of tiles for the chosen era, laid out on the grid.
import { defaults, randomize } from '../gen/params';
import { eraById } from '../gen/eras';
import { Rng, INCH } from '../gen/core';
import type { Params } from '../gen/params';

/** Height of a floor tile's walking surface, so loose props and pillars stand on it in the preview. */
const FLOOR_TOP = 5.4;

export type RoomKind = 'small' | 'large' | 'hall' | 'corridor';
export const ROOMS: { id: RoomKind; label: string; w: number; d: number; help: string }[] = [
  { id: 'small', label: 'Small room', w: 4, d: 4, help: '4 × 4 squares' },
  { id: 'large', label: 'Large room', w: 6, d: 4, help: '6 × 4 squares' },
  { id: 'hall', label: 'Great hall', w: 6, d: 6, help: '6 × 6 squares with pillars' },
  { id: 'corridor', label: 'Corridor', w: 2, d: 6, help: '2 squares wide, 6 long' },
];

export type Placement = { p: Params; x: number; z: number; ry: number; y?: number };

/** Tiles for a room: wall tiles with floor strips around the edge, corners, floors inside, a door, props. */
export function makeRoom(era: string, kind: RoomKind, seed: number, base: Params['base'], wear: number): Placement[] {
  const r = new Rng(seed);
  const e = eraById(era);
  const room = ROOMS.find((x) => x.id === kind)!;
  const sq = INCH;
  const W = room.w, D = room.d;
  const wallStyle = r.pick(e.wall).id;
  const floorStyle = r.pick(e.floor.filter((f) => !['dirt', 'rough'].includes(f.id)).length ? e.floor.filter((f) => !['dirt', 'rough'].includes(f.id)) : e.floor).id;
  const common = (piece: Params['piece']): Params => ({ ...defaults(era, piece), base, wear, wallStyle, floorStyle, top: e.top[0].id, seed: seed + 11, floorStrip: true, wallH: 2, wallT: 10 });
  const out: Placement[] = [];
  const cx = (i: number) => -W * sq / 2 + (i + 0.5) * sq;
  const cz = (j: number) => -D * sq / 2 + (j + 0.5) * sq;

  if (kind === 'corridor') {
    // two rows of wall tiles facing each other
    for (let j = 0; j < D; j += 2) {
      const len = Math.min(2, D - j);
      const wp = { ...common('wall'), sx: len, sy: 1, opening: 'none' as const };
      out.push({ p: wp, x: -sq / 2, z: cz(j) + (len - 1) * sq / 2, ry: Math.PI / 2 });
      out.push({ p: { ...wp, opening: j === 2 ? 'arch' : 'none' }, x: sq / 2, z: cz(j) + (len - 1) * sq / 2, ry: -Math.PI / 2 });
    }
  } else {
    // corners
    const corner = { ...common('corner'), sx: 1, sy: 1 };
    out.push({ p: corner, x: cx(0), z: cz(0), ry: 0 });
    out.push({ p: corner, x: cx(W - 1), z: cz(0), ry: -Math.PI / 2 });
    out.push({ p: corner, x: cx(W - 1), z: cz(D - 1), ry: Math.PI });
    out.push({ p: corner, x: cx(0), z: cz(D - 1), ry: Math.PI / 2 });
    // edges in 2-square wall tiles (1-square where needed); one becomes the door
    const wallP = (len: number) => ({ ...common('wall'), sx: len, sy: 1, opening: 'none' as const });
    const doorP = { ...common('door'), sx: 2, sy: 1, doorType: e.door[0].id, doorLeaf: false };
    const edge = (n: number, place: (k: number, len: number) => [number, number], ry: number, door: boolean) => {
      let k = 1;
      const segs: number[] = [];
      while (k < n - 1) { const len = Math.min(2, n - 1 - k); segs.push(len); k += len; }
      let pos = 1;
      const doorAt = door ? Math.floor((segs.length - 1) / 2) : -1;
      segs.forEach((len, i) => {
        const [x, z] = place(pos, len);
        const p = i === doorAt && len === 2 ? doorP : i % 2 === 1 && kind === 'hall' ? { ...wallP(len), opening: 'window' as const } : wallP(len);
        out.push({ p, x, z, ry });
        pos += len;
      });
    };
    edge(W, (i, len) => [cx(i) + (len - 1) * sq / 2, cz(0)], 0, false);
    edge(W, (i, len) => [cx(i) + (len - 1) * sq / 2, cz(D - 1)], Math.PI, true);
    edge(D, (j, len) => [cx(0), cz(j) + (len - 1) * sq / 2], Math.PI / 2, false);
    edge(D, (j, len) => [cx(W - 1), cz(j) + (len - 1) * sq / 2], -Math.PI / 2, false);
    // floor inside
    const fw = W - 2, fd = D - 2;
    for (let i = 0; i < fw; i += 2) for (let j = 0; j < fd; j += 2) {
      const sx = Math.min(2, fw - i), sy = Math.min(2, fd - j);
      out.push({ p: { ...common('floor'), sx, sy }, x: cx(1 + i) + (sx - 1) * sq / 2, z: cz(1 + j) + (sy - 1) * sq / 2, ry: 0 });
    }
  }
  // pillars in a hall, props everywhere
  if (kind === 'hall') {
    const pil = { ...common('pillar'), pillarStyle: e.pillar[0].id, pillarH: 2, sx: 1, sy: 1, base: 'none' as const };
    for (const [i, j] of [[2, 2], [3, 2], [2, 3], [3, 3]] as const) out.push({ p: { ...pil, broken: wear > 0.5 && (i + j) % 2 === 0 }, x: cx(i === 2 ? 1 : W - 2), z: cz(j === 2 ? 1 : D - 2), ry: 0, y: FLOOR_TOP });
  }
  const props = kind === 'corridor' ? 1 : kind === 'small' ? 2 : 3;
  for (let k = 0; k < props; k++) {
    const sp = randomize({ ...common('scatter'), onBase: false }, seed + k * 101);
    sp.count = r.int(1, 3);
    sp.scatterItem = r.pick(e.scatter).id;
    const ii = kind === 'corridor' ? 0.5 : r.range(1.3, W - 2.3), jj = kind === 'corridor' ? r.range(1, D - 2) : r.range(1.3, D - 2.3);
    out.push({ p: sp, x: -W * sq / 2 + ii * sq + (kind === 'corridor' ? sq / 2 : 0), z: -D * sq / 2 + jj * sq, ry: r.range(0, 6), y: FLOOR_TOP });
  }
  return out;
}

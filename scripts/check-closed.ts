// Every mesh in every piece must be closed (each edge shared by exactly two triangles), so slicers read it cleanly.
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ERAS, PIECES } from '../src/gen/eras';
import { defaults } from '../src/gen/params';
import { generate } from '../src/gen/generate';

const open = new Map<string, number>();
let parts = 0;
for (const e of ERAS) for (const pc of PIECES) for (const variant of [0, 1]) {
  const p: any = defaults(e.id, pc.id);
  if (variant) { p.wear = 0.8; p.base = 'clip'; p.top = e.top[e.top.length - 1].id; p.opening = 'window'; p.broken = true; p.floorStrip = false; p.onBase = true; p.rails = true; }
  const lists: Record<string, string[]> = { floor: e.floor.map((x) => x.id), wall: e.wall.map((x) => x.id), pillar: e.pillar.map((x) => x.id), scatter: e.scatter.map((x) => x.id), stairs: e.stairs.map((x) => x.id), bridge: e.bridge.map((x) => x.id), hill: e.ground.map((x) => x.id), door: e.door.map((x) => x.id), corner: e.wall.map((x) => x.id) };
  const keyName: Record<string, string> = { floor: 'floorStyle', wall: 'wallStyle', pillar: 'pillarStyle', scatter: 'scatterItem', stairs: 'stairsStyle', bridge: 'bridgeStyle', hill: 'hillStyle', door: 'doorType', corner: 'wallStyle' };
  for (const s of lists[pc.id]) {
    p[keyName[pc.id]] = s;
    const piece = generate(p);
    for (const part of piece.parts) {
      parts++;
      const raw = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
      for (const k of Object.keys(raw.attributes)) if (k !== 'position') raw.deleteAttribute(k);
      const g = mergeVertices(raw, 1e-3);
      const idx = g.index!.array;
      const edges = new Map<string, number>();
      for (let i = 0; i < idx.length; i += 3) for (let k = 0; k < 3; k++) {
        if (idx[i] === idx[i + 1] || idx[i + 1] === idx[i + 2] || idx[i] === idx[i + 2]) break; // zero-area: slicers drop these
        const a = idx[i + k], b = idx[i + ((k + 1) % 3)];
        const key = a < b ? `${a}_${b}` : `${b}_${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
      let bad = 0;
      edges.forEach((n) => { if (n !== 2) bad++; });
      if (bad) {
        const k = `${e.id}/${pc.id}/${s}:${part.mat}:${part.geo.type}`;
        open.set(k, (open.get(k) ?? 0) + bad);
      }
    }
  }
}
console.log(`${parts} meshes checked, ${open.size} kinds open`);
const agg = new Map<string, string>(); open.forEach((n, k) => { const [path, mat, type] = k.split(':'); const kk = mat + ':' + type; if (!agg.has(kk)) agg.set(kk, path + ' ' + n); }); agg.forEach((v, k) => console.log('  ', k, v));

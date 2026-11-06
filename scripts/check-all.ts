// Builds every piece in every era and style (plus aged/opening variants); reports errors, open meshes, size and time.
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ERAS, PIECES, CAVE, DUNGEON, FOREST } from '../src/gen/eras';
import { defaults, OPENINGS } from '../src/gen/params';
import { generate } from '../src/gen/generate';

const closedCheck = process.argv.includes('--closed');
let fails = 0, total = 0, maxMs = 0, maxTris = 0, openMeshes = 0;
const notes: string[] = [];
const openKinds = new Map<string, number>();
const finishes = ['clean', 'moss', 'burnt', 'decay', 'vines', 'cobwebs'];
let fi = 0;
for (const e of ERAS) for (const pc of PIECES) {
  const lists: Record<string, [string, { id: string }[]]> = {
    floor: ['floorStyle', e.floor], wall: ['wallStyle', e.wall], corner: ['wallStyle', e.wall], door: ['doorType', e.door],
    pillar: ['pillarStyle', e.pillar], stairs: ['stairsStyle', e.stairs], hill: ['hillStyle', e.ground], scatter: ['scatterItem', e.scatter],
    bridge: ['bridgeStyle', e.bridge], cave: ['caveItem', CAVE], dungeon: ['dungeonItem', DUNGEON], forest: ['forestItem', FOREST], trap: ['trapItem', e.traps],
  };
  const [key, list] = lists[pc.id];
  if (['cave', 'dungeon', 'forest'].includes(pc.id) && e.id !== 'medieval' && e.id !== 'alien') continue; // era-neutral pieces: check twice
  for (const s of list) for (const variant of [0, 1]) {
    const p: any = defaults(e.id, pc.id);
    p[key] = s.id;
    if (pc.id === 'forest' || pc.id === 'dungeon' || pc.id === 'cave') { p.sx = 2; p.sy = 2; if (s.id === 'fallen') p.sx = 3; }
    if (variant) {
      p.wear = 0.8; p.base = 'clip'; p.top = e.top[e.top.length - 1].id; p.broken = true; p.floorStrip = !p.floorStrip; p.onBase = true; p.rails = true;
      p.opening = OPENINGS[(fi % (OPENINGS.length - 1)) + 1].id; p.openingPos = ['center', 'left', 'right', 'two'][fi % 4];
      p.finish = finishes[fi % finishes.length]; p.finishAmt = 0.8; p.popout = 2.2; p.joint = 1.4; p.bricksPer = 5; p.courses = 9; p.planksPer = 6; p.texture = 1;
      if (pc.id === 'wall') p.sx = 3;
      fi++;
    }
    total++;
    const t0 = performance.now();
    try {
      const piece = generate(p);
      const ms = performance.now() - t0;
      let tris = 0;
      for (const part of piece.parts) {
        tris += (part.geo.index ? part.geo.index.count : part.geo.attributes.position.count) / 3;
        const a = part.geo.attributes.position.array as Float32Array;
        for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) throw new Error('NaN position in ' + part.mat);
        if (closedCheck) {
          const raw = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
          for (const k of Object.keys(raw.attributes)) if (k !== 'position') raw.deleteAttribute(k);
          const g = mergeVertices(raw, 1e-3);
          const idx = g.index!.array;
          const edges = new Map<number, number>();
          const n = g.attributes.position.count;
          for (let i = 0; i < idx.length; i += 3) {
            if (idx[i] === idx[i + 1] || idx[i + 1] === idx[i + 2] || idx[i] === idx[i + 2]) continue;
            for (let k = 0; k < 3; k++) { const a1 = idx[i + k], b1 = idx[i + ((k + 1) % 3)]; const kk = a1 < b1 ? a1 * n + b1 : b1 * n + a1; edges.set(kk, (edges.get(kk) ?? 0) + 1); }
          }
          let bad = 0;
          edges.forEach((v) => { if (v !== 2) bad++; });
          if (bad) { openMeshes++; const k = `${pc.id}/${s.id}/${variant}/${p.opening}/${p.openingPos}/${p.top}/${p.floorStrip}:${part.mat}:${part.geo.type}`; openKinds.set(k, (openKinds.get(k) ?? 0) + 1); }
        }
      }
      maxMs = Math.max(maxMs, ms); maxTris = Math.max(maxTris, tris);
      if (ms > 2500 || tris > 900000) notes.push(`${e.id}/${pc.id}/${s.id}/${variant}: ${ms.toFixed(0)} ms, ${Math.round(tris / 1000)}k tris`);
      if (piece.size.x > 245 || piece.size.z > 245 || piece.size.y > 245) notes.push(`${e.id}/${pc.id}/${s.id}: too big ${piece.size.x.toFixed(0)}x${piece.size.z.toFixed(0)}x${piece.size.y.toFixed(0)}`);
    } catch (err) {
      fails++;
      console.log(`FAIL ${e.id}/${pc.id}/${s.id}/${variant} (${p.opening}/${p.finish}): ${(err as Error).stack?.split('\n').slice(0, 3).join(' | ')}`);
    }
  }
}
console.log(`${total} pieces, ${fails} failed, slowest ${maxMs.toFixed(0)} ms, most ${Math.round(maxTris / 1000)}k triangles${closedCheck ? `, ${openMeshes} open meshes` : ''}`);
notes.forEach((s) => console.log('  ' + s));
[...openKinds].slice(0, 30).forEach(([k, n]) => console.log('  open', k, n));

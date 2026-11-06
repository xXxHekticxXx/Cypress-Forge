import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { defaults, OPENINGS } from '../src/gen/params';
import { generate } from '../src/gen/generate';
for (const o of OPENINGS) for (const pos of ['center', 'left', 'right', 'two']) for (const sx of [1, 2, 3]) for (const top of ['flat', 'broken', 'crenel']) for (const fs of [true, false]) {
  const p: any = { ...defaults('medieval', 'wall'), opening: o.id, openingPos: pos, sx, top, floorStrip: fs, wear: 0.8 };
  const piece = generate(p);
  for (const part of piece.parts) {
    if (part.geo.type !== 'ExtrudeGeometry' || part.mat !== 'mortar') continue;
    const raw = part.geo.toNonIndexed(); for (const k of Object.keys(raw.attributes)) if (k !== 'position') raw.deleteAttribute(k);
    const g = mergeVertices(raw, 1e-3); const idx = g.index!.array; const e = new Map<string, number>();
    for (let i = 0; i < idx.length; i += 3) { if (idx[i] === idx[i + 1] || idx[i + 1] === idx[i + 2] || idx[i] === idx[i + 2]) continue; for (let k = 0; k < 3; k++) { const a = idx[i + k], b = idx[i + ((k + 1) % 3)]; const kk = a < b ? a + '_' + b : b + '_' + a; e.set(kk, (e.get(kk) ?? 0) + 1); } }
    const bad = [...e.values()].filter((v) => v !== 2).length;
    if (bad) console.log(o.id, pos, sx, top, fs, bad);
  }
}

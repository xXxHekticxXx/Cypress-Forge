// Builds every piece in every era and style; reports errors, triangle counts and time.
import { ERAS, PIECES } from '../src/gen/eras';
import { defaults } from '../src/gen/params';
import { generate } from '../src/gen/generate';

let fails = 0, total = 0, maxMs = 0, maxTris = 0;
const slow: string[] = [];
for (const e of ERAS) for (const pc of PIECES) {
  const styles: Record<string, { key: string; list: { id: string }[] }> = {
    floor: { key: 'floorStyle', list: e.floor }, wall: { key: 'wallStyle', list: e.wall }, corner: { key: 'wallStyle', list: e.wall },
    door: { key: 'doorType', list: e.door }, pillar: { key: 'pillarStyle', list: e.pillar }, stairs: { key: 'stairsStyle', list: e.stairs },
    hill: { key: 'hillStyle', list: e.ground }, scatter: { key: 'scatterItem', list: e.scatter }, bridge: { key: 'bridgeStyle', list: e.bridge },
  };
  const st = styles[pc.id];
  for (const s of st.list) {
    for (const variant of [0, 1]) {
      const p: any = defaults(e.id, pc.id);
      p[st.key] = s.id;
      if (variant) { p.wear = 0.8; p.base = 'magnet'; p.top = e.top[e.top.length - 1].id; p.opening = 'arch'; p.broken = true; p.floorStrip = false; }
      if (pc.id === 'door') { p.wallStyle = e.wall[variant % e.wall.length].id; }
      total++;
      const t0 = performance.now();
      try {
        const piece = generate(p);
        const ms = performance.now() - t0;
        let tris = 0;
        for (const part of piece.parts) tris += (part.geo.index ? part.geo.index.count : part.geo.attributes.position.count) / 3;
        for (const part of piece.parts) {
          const a = part.geo.attributes.position.array as Float32Array;
          for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) throw new Error('NaN position in ' + part.mat);
        }
        maxMs = Math.max(maxMs, ms); maxTris = Math.max(maxTris, tris);
        if (ms > 1500 || tris > 600000) slow.push(`${e.id}/${pc.id}/${s.id}/${variant}: ${ms.toFixed(0)} ms, ${Math.round(tris / 1000)}k tris`);
        if (piece.size.x > 250 || piece.size.z > 250) slow.push(`${e.id}/${pc.id}/${s.id}: too big ${piece.size.x.toFixed(0)}x${piece.size.z.toFixed(0)}`);
      } catch (err) {
        fails++;
        console.log(`FAIL ${e.id}/${pc.id}/${s.id}/${variant}: ${(err as Error).stack?.split('\n').slice(0, 3).join(' | ')}`);
      }
    }
  }
}
console.log(`${total} pieces, ${fails} failed, slowest ${maxMs.toFixed(0)} ms, most ${Math.round(maxTris / 1000)}k triangles`);
slow.forEach((s) => console.log('  ' + s));

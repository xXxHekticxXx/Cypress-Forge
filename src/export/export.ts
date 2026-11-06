// Export: binary STL per piece, 3MF build plates for a 250 × 250 mm bed, print estimates, and the zip.
import * as THREE from 'three';
import { zipSync, strToU8 } from 'fflate';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mergeAll, type Part } from '../gen/core';

export const BED = { w: 250, d: 250, h: 250, margin: 5, gap: 4 }; // changed by Settings

/** Y-up preview coordinates → Z-up print coordinates (slicers use Z as up). */
function toZUp(g: THREE.BufferGeometry) {
  g.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  g.computeBoundingBox();
  const bb = g.boundingBox!;
  g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -bb.min.z);
  return g;
}

export function printGeometry(parts: Part[]) {
  return dropDegenerate(toZUp(mergeAll(parts)));
}

/** Remove zero-area triangles (cone tips, lathe poles) so the files are clean. */
function dropDegenerate(g: THREE.BufferGeometry) {
  const a = g.attributes.position.array as Float32Array;
  const out = new Float32Array(a.length);
  let n = 0;
  const same = (i: number, j: number) => Math.abs(a[i] - a[j]) < 1e-5 && Math.abs(a[i + 1] - a[j + 1]) < 1e-5 && Math.abs(a[i + 2] - a[j + 2]) < 1e-5;
  for (let i = 0; i < a.length; i += 9) {
    if (same(i, i + 3) || same(i + 3, i + 6) || same(i, i + 6)) continue;
    out.set(a.subarray(i, i + 9), n);
    n += 9;
  }
  const r = new THREE.BufferGeometry();
  r.setAttribute('position', new THREE.BufferAttribute(out.slice(0, n), 3));
  return r;
}

export function stl(g: THREE.BufferGeometry, name: string) {
  const pos = g.attributes.position.array as Float32Array;
  const tris = pos.length / 9;
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  const head = `Cypress Forge - ${name}`.slice(0, 79);
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i) & 0x7f);
  dv.setUint32(80, tris, true);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  let o = 84;
  for (let t = 0; t < tris; t++) {
    a.fromArray(pos, t * 9); b.fromArray(pos, t * 9 + 3); c.fromArray(pos, t * 9 + 6);
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    for (const v of [n, a, b, c]) { dv.setFloat32(o, v.x, true); dv.setFloat32(o + 4, v.y, true); dv.setFloat32(o + 8, v.z, true); o += 12; }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buf);
}

/** Solid volume in cm³ (meshes that overlap are counted twice, so this errs high). */
export function volumeCm3(g: THREE.BufferGeometry) {
  const p = g.attributes.position.array as Float32Array;
  let v = 0;
  for (let i = 0; i < p.length; i += 9) {
    v += (p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6])) / 6;
  }
  return Math.abs(v) / 1000;
}

export type PrintOpts = { layer: number; infill: number; density: number; speed: number };
export const PRINT: PrintOpts = { layer: 0.16, infill: 15, density: 1.24, speed: 1 };

export function estimate(g: THREE.BufferGeometry, o: PrintOpts = PRINT) {
  const vol = volumeCm3(g) * 0.82; // overlap correction
  // walls + infill: about 38 % of the solid plus the infill share
  const fill = 0.38 + (o.infill / 100) * 0.5;
  const grams = vol * fill * o.density + 1;
  // detailed terrain at 0.2 mm on a Kobra S1 ≈ 4.2 min per gram; thinner layers take longer
  const minutes = (6 + (grams / 1.24) * 4.2 * (0.2 / o.layer) * 0.85) / o.speed;
  return { grams, minutes };
}

export const fmtTime = (min: number) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h ${m} m` : `${m} m`;
};

// ---------- plates ----------

export type Item = { name: string; geo: THREE.BufferGeometry };
export type Placed = { item: Item; x: number; y: number; rot: boolean };

/** Lay pieces out on as few 250 × 250 plates as possible (shelves, biggest first, turning pieces to fit). */
export function arrange(items: Item[]): Placed[][] {
  const use = BED.w - BED.margin * 2, useD = BED.d - BED.margin * 2;
  const sized = items.map((item) => {
    item.geo.computeBoundingBox();
    const s = item.geo.boundingBox!.getSize(new THREE.Vector3());
    return { item, w: s.x, d: s.y };
  }).sort((a, b) => Math.max(b.w, b.d) - Math.max(a.w, a.d));
  const plates: Placed[][] = [];
  type Shelf = { y: number; h: number; x: number };
  const state: { shelves: Shelf[]; used: number }[] = [];
  for (const s of sized) {
    let done = false;
    for (let pi = 0; pi < plates.length && !done; pi++) done = tryPlace(pi);
    if (!done) { plates.push([]); state.push({ shelves: [], used: 0 }); tryPlace(plates.length - 1); }
    function tryPlace(pi: number) {
      const st = state[pi];
      for (const rot of [false, true]) {
        const w = rot ? s.d : s.w, d = rot ? s.w : s.d;
        if (w > use || d > useD) continue;
        for (const sh of st.shelves) {
          if (sh.x + w <= use && d <= sh.h) {
            plates[pi].push({ item: s.item, x: sh.x + w / 2, y: sh.y + d / 2, rot });
            sh.x += w + BED.gap;
            return true;
          }
        }
        if (st.used + d <= useD) {
          const sh = { y: st.used, h: d, x: w + BED.gap };
          st.shelves.push(sh);
          st.used += d + BED.gap;
          plates[pi].push({ item: s.item, x: w / 2, y: sh.y + d / 2, rot });
          return true;
        }
      }
      return false;
    }
  }
  return plates;
}

function threeMF(placed: Placed[]) {
  let objects = '', build = '';
  placed.forEach((p, i) => {
    const g = mergeVertices(p.item.geo.clone(), 1e-4);
    const pos = g.attributes.position.array as Float32Array;
    const idx = g.index!.array;
    let verts = '', tris = '';
    for (let k = 0; k < pos.length; k += 3) verts += `<vertex x="${pos[k].toFixed(3)}" y="${pos[k + 1].toFixed(3)}" z="${pos[k + 2].toFixed(3)}"/>`;
    for (let k = 0; k < idx.length; k += 3) tris += `<triangle v1="${idx[k]}" v2="${idx[k + 1]}" v3="${idx[k + 2]}"/>`;
    objects += `<object id="${i + 1}" name="${esc(p.item.name)}" type="model"><mesh><vertices>${verts}</vertices><triangles>${tris}</triangles></mesh></object>`;
    const x = BED.margin + p.x, y = BED.margin + p.y;
    const t = p.rot ? `0 1 0 -1 0 0 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} 0` : `1 0 0 0 1 0 0 0 1 ${x.toFixed(3)} ${y.toFixed(3)} 0`;
    build += `<item objectid="${i + 1}" transform="${t}"/>`;
  });
  const model = `<?xml version="1.0" encoding="UTF-8"?><model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Cypress Forge</metadata><resources>${objects}</resources><build>${build}</build></model>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'),
    '3D/3dmodel.model': strToU8(model),
  }, { level: 6 });
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]!);
export const safeName = (s: string) => s.replace(/[^\w\- ()x.]+/g, '').replace(/\s+/g, '-').slice(0, 60);

/** Everything in one zip: an STL for every piece (copies numbered) and a 3MF per build plate. */
export function exportZip(items: Item[], setName: string, o: { files: 'both' | '3mf' | 'stl'; readme: boolean; layer?: number } = { files: 'both', readme: true }) {
  const files: Record<string, Uint8Array> = {};
  const counts = new Map<string, number>();
  for (const it of items) {
    const base = safeName(it.name);
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    if (n === 1 && o.files !== '3mf') files[`STL/${base}.stl`] = stl(it.geo, it.name);
  }
  const plates = arrange(items);
  if (o.files !== 'stl') plates.forEach((pl, i) => (files[`Plates/${safeName(setName)}-plate-${i + 1}.3mf`] = threeMF(pl)));
  const list = [...counts].map(([n, k]) => `${k} x ${n}`).join('\r\n');
  if (o.readme) files['README.txt'] = strToU8(
    `${setName} - made with Cypress Forge (28 mm scale, 1 inch squares)\r\n\r\n` +
    `Plates/: open a plate in Anycubic Slicer Next (or any slicer) - pieces are already laid out for a ${BED.w} x ${BED.d} mm bed.\r\n` +
    `STL/: one file per different piece if you'd rather place them yourself.\r\n\r\nPieces:\r\n${list}\r\n\r\n` +
    `Suggested settings: ${o.layer ?? 0.16} mm layers (0.12-0.16 mm keeps the most detail) for the most detail (0.2 mm is fine), 2-3 walls, 10-15 % infill, no supports.\r\n` +
    `Magnet holes are sized 0.3 mm larger than the magnet; clips print flat.\r\n`,
  );
  return { zip: zipSync(files, { level: 6 }), plates: plates.length };
}

export function download(data: Uint8Array | string, name: string, type = 'application/octet-stream') {
  const blob = new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

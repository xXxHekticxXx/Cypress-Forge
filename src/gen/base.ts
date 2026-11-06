// Bases under every piece: flat, with magnet pockets, or with clip slots that join neighbouring tiles.
import * as THREE from 'three';
import { Builder, roundRect, polyShape } from './core';
import type { Params } from './params';
import { sqSize } from './params';

export const MAGNETS: Record<Params['magnet'], [number, number]> = { '5x2': [5, 2], '6x2': [6, 2], '6x3': [6, 3], '8x3': [8, 3] };
const FIT = 0.3; // printing clearance for magnets and clips

export function baseHeight(p: Params) {
  if (p.base === 'none') return 0;
  if (p.base === 'magnet') return Math.max(3.5, MAGNETS[p.magnet][1] + FIT + 1.4);
  if (p.base === 'clip') return 5;
  return 3;
}

const CLIP = { r: 3.2, neck: 1.9, c: 4.6, h: 3.4 };

/**
 * Outline of the bottom layer with half dog-bone notches cut into the edges (clip slots).
 * Walks the rectangle anticlockwise; each notch goes in from the edge, round the circle and back out.
 */
function notchedOutline(w: number, d: number, sq: number) {
  const r = CLIP.r + FIT / 2, n = CLIP.neck + FIT / 2, c = CLIP.c;
  const s = Math.sqrt(r * r - n * n);
  const pts: [number, number][] = [];
  const corners: [number, number][] = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  for (let e = 0; e < 4; e++) {
    const [x0, y0] = corners[e], [x1, y1] = corners[(e + 1) % 4];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const tx = (x1 - x0) / len, ty = (y1 - y0) / len;
    const nx = -ty, ny = tx; // inward (left of travel)
    pts.push([x0, y0]);
    const count = Math.max(1, Math.round(len / sq));
    const across = e % 2 === 0 ? d : w; // room for notches from both sides?
    if (len < sq * 0.9 || across < 2 * (c + r) + 2) continue;
    for (let i = 0; i < count; i++) {
      const u = (len / count) * (i + 0.5);
      const at = (du: number, dv: number): [number, number] => [x0 + tx * (u + du) + nx * dv, y0 + ty * (u + du) + ny * dv];
      pts.push(at(-n, 0), at(-n, c - s));
      const a0 = Math.atan2(-s, -n), a1 = Math.atan2(-s, n) - Math.PI * 2;
      for (let k = 1; k < 24; k++) {
        const a = a0 + ((a1 - a0) * k) / 24;
        pts.push(at(Math.cos(a) * r, c + Math.sin(a) * r));
      }
      pts.push(at(n, c - s), at(n, 0));
    }
  }
  return polyShape(pts);
}

function slab(shape: THREE.Shape, y0: number, h: number) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(Math.PI / 2); // shape lies in XZ, extruded downward
  g.translate(0, y0 + h, 0);
  return g;
}

/**
 * Adds a base of w×d mm centred on the origin and returns its height. `holes` lists magnet spots (x,z);
 * clip slots go in the middle of each grid square along the outside edges.
 */
export function addBase(b: Builder, w: number, d: number, p: Params, holes?: [number, number][], shape?: THREE.Shape) {
  const h = baseHeight(p);
  if (h === 0) return 0;
  const outline = shape ?? roundRect(w, d, 1.2);
  const sq = sqSize(p);
  // Holes are made by stacking two closed slabs: a bottom layer with the pockets/notches left out, and a
  // solid top layer. The slicer joins them; no mesh cutting needed, so the files stay clean.
  if (p.base === 'magnet') {
    const [md, mh] = MAGNETS[p.magnet];
    const low = mh + FIT;
    const bottom = roundRect(w, d, 1.2);
    for (const [x, z] of holes ?? gridCenters(w, d, sq)) {
      const hole = new THREE.Path();
      hole.absarc(x, z, (md + FIT) / 2, 0, Math.PI * 2, true);
      bottom.holes.push(hole);
    }
    b.add(slab(bottom, 0, low), 'base');
    b.add(slab(outline, low, h - low), 'base');
    return h;
  }
  if (p.base === 'clip' && !shape) {
    b.add(slab(notchedOutline(w, d, sq), 0, CLIP.h), 'base');
    b.add(slab(outline, CLIP.h, h - CLIP.h), 'base');
    return h;
  }
  b.add(slab(outline, 0, h), 'base');
  return h;
}

export function gridCenters(w: number, d: number, sq: number): [number, number][] {
  const nx = Math.max(1, Math.round(w / sq)), nz = Math.max(1, Math.round(d / sq));
  const out: [number, number][] = [];
  const stepX = w / nx, stepZ = d / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) out.push([-w / 2 + stepX * (i + 0.5), -d / 2 + stepZ * (j + 0.5)]);
  return out;
}

/** The loose clip that joins two tiles with clip slots (print several). */
export function clipPiece(b: Builder) {
  const t = 3;
  b.box(CLIP.neck * 2, t, CLIP.c * 2, 'base', { y: t / 2 });
  b.cyl(CLIP.r, CLIP.r, t, 'base', { y: t / 2, z: -CLIP.c }, 28);
  b.cyl(CLIP.r, CLIP.r, t, 'base', { y: t / 2, z: CLIP.c }, 28);
}

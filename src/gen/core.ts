// Geometry toolkit for the terrain generators. Units are millimetres, Y is up while building and previewing
// (exports turn it to Z-up for the slicer). Every piece is a set of closed meshes; slicers join meshes that
// overlap, so details can simply sit into each other.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------- numbers ----------

export const INCH = 25.4;

/** Small, fast, seeded random numbers (same seed = same piece). */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
  }
  next() {
    this.s = (this.s * 16807) % 2147483647;
    return (this.s - 1) / 2147483646;
  }
  range(a: number, b: number) {
    return a + (b - a) * this.next();
  }
  int(a: number, b: number) {
    return Math.floor(this.range(a, b + 1));
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  chance(p: number) {
    return this.next() < p;
  }
  /** roughly bell-shaped around 0, within ±1 */
  soft() {
    return (this.next() + this.next() + this.next()) / 1.5 - 1;
  }
  fork(salt: number) {
    return new Rng(Math.floor(this.next() * 1e9) + salt * 7919);
  }
}

// 3D value noise with smooth interpolation, plus fractal sum.
function hash3(x: number, y: number, z: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 0xffff;
}
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export function noise3(x: number, y: number, z: number, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = fade(xf), v = fade(yf), w = fade(zf);
  let out = 0;
  for (let dz = 0; dz < 2; dz++)
    for (let dy = 0; dy < 2; dy++)
      for (let dx = 0; dx < 2; dx++) {
        const wgt = (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
        out += wgt * hash3(xi + dx, yi + dy, zi + dz, seed);
      }
  return out * 2 - 1;
}
export function fbm(x: number, y: number, z: number, seed = 0, oct = 4) {
  let a = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * noise3(x * f, y * f, z * f, seed + i * 31);
    n += a;
    a *= 0.5;
    f *= 2.03;
  }
  return s / n;
}
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// ---------- materials (only for the painted preview; prints are one colour) ----------

export type Mat =
  | 'base' | 'stone' | 'stone2' | 'mortar' | 'wood' | 'wood2' | 'metal' | 'metal2' | 'brass'
  | 'accent' | 'glow' | 'ground' | 'grass' | 'cloth' | 'crystal' | 'organic' | 'water'
  | 'moss' | 'char' | 'rust' | 'bark' | 'leaf' | 'bone';

/** Settings that every generator reads while a piece is being built (set by generate()). */
export const LOOK = { tex: 0.6, popout: 1, joint: 0.8 };

export type Part = { geo: THREE.BufferGeometry; mat: Mat };

// ---------- building ----------

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export type Place = {
  x?: number; y?: number; z?: number;
  rx?: number; ry?: number; rz?: number;
  sx?: number; sy?: number; sz?: number;
};

export function placeMatrix(p: Place) {
  tmpE.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, 'YXZ');
  tmpQ.setFromEuler(tmpE);
  return new THREE.Matrix4().compose(
    new THREE.Vector3(p.x ?? 0, p.y ?? 0, p.z ?? 0),
    tmpQ,
    new THREE.Vector3(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1),
  );
}

/** Collects the meshes of one piece. Groups can be moved/rotated as a unit with `sub()`. */
export class Builder {
  parts: Part[] = [];
  constructor(private m: THREE.Matrix4 = new THREE.Matrix4()) {}

  add(geo: THREE.BufferGeometry, mat: Mat, p?: Place) {
    const g = geo.index ? geo : geo;
    if (p) g.applyMatrix4(placeMatrix(p));
    g.applyMatrix4(this.m);
    this.parts.push({ geo: g, mat });
    return this;
  }

  /** A child builder whose parts are placed by `p` (relative to this builder). */
  sub(p: Place) {
    const b = new Builder(this.m.clone().multiply(placeMatrix(p)));
    b.parts = this.parts; // shares the same list
    return b;
  }

  box(w: number, h: number, d: number, mat: Mat, p: Place = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    return this.add(g, mat, p);
  }

  /** Box resting on y (p.y is the bottom). */
  boxOn(w: number, h: number, d: number, mat: Mat, p: Place = {}) {
    return this.box(w, h, d, mat, { ...p, y: (p.y ?? 0) + h / 2 });
  }

  cyl(rTop: number, rBot: number, h: number, mat: Mat, p: Place = {}, seg = 24) {
    return this.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, p);
  }

  block(w: number, h: number, d: number, mat: Mat, p: Place = {}, o: BlockOpts = {}) {
    return this.add(block(w, h, d, o), mat, p);
  }

  lathe(profile: [number, number][], mat: Mat, p: Place = {}, seg = 32) {
    return this.add(lathe(profile, seg), mat, p);
  }

  extrude(shape: THREE.Shape, depth: number, mat: Mat, p: Place = {}, bevel = 0) {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: bevel > 0,
      bevelSize: bevel,
      bevelThickness: bevel,
      bevelSegments: 2,
      curveSegments: 24,
    });
    g.translate(0, 0, -depth / 2);
    return this.add(g, mat, p);
  }

  sphere(r: number, mat: Mat, p: Place = {}, seg = 16) {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(6, Math.round(seg * 0.6))), mat, p);
  }

  /** A rod between two points. */
  rod(a: THREE.Vector3, b: THREE.Vector3, r: number, mat: Mat, seg = 10) {
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    const dir = b.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    g.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    return this.add(g, mat);
  }
}

// ---------- shapes ----------

export type BlockOpts = {
  bevel?: number;   // rounded edge radius
  noise?: number;   // surface roughness in mm
  freq?: number;    // roughness scale
  seed?: number;
  flatTop?: boolean; // keep the top flat (floors: minis must stand)
  res?: number;     // subdivision size in mm
  chip?: number;    // 0..1 chipped corners
};

/**
 * A stone/brick/plank block with rounded edges and an uneven surface. Positions are a pure function of the
 * original position, so coincident edge vertices stay together and the mesh stays closed.
 */
export function block(w: number, h: number, d: number, o: BlockOpts = {}) {
  const bevel = Math.min(o.bevel ?? 0.6, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01);
  const natural = (o.noise ?? 0) > 0.05;
  const tex = natural ? LOOK.tex : 0;
  const res = Math.min(o.res ?? 1.6, tex > 0.3 ? 1.6 - tex * 0.6 : 99);
  const sx = clamp(Math.round(w / res), 2, 48), sy = clamp(Math.round(h / res), 2, 48), sz = clamp(Math.round(d / res), 2, 48);
  const g = new THREE.BoxGeometry(w, h, d, sx, sy, sz);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const hx = w / 2 - bevel, hy = h / 2 - bevel, hz = d / 2 - bevel;
  const amp = o.noise ?? 0;
  const fq = o.freq ?? 0.35;
  const seed = o.seed ?? 1;
  const chip = o.chip ?? 0;
  const v = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    n.copy(v).sub(c);
    const len = n.length();
    if (len > 1e-6) n.divideScalar(len);
    else n.set(0, 1, 0);
    let r = bevel;
    if (amp > 0) {
      const topness = o.flatTop ? smoothstep(h / 2 - 0.3, h / 2, v.y) : 0;
      const k = amp * (1 - 0.8 * topness);
      r += k * fbm(v.x * fq, v.y * fq, v.z * fq, seed, 3) - k * 0.35;
      // fine surface texture: grain, pits and tool marks (printable at 0.12-0.2 mm layers)
      if (tex > 0) {
        const kt = tex * (1 - 0.6 * topness);
        r += kt * (0.22 * noise3(v.x * 1.4, v.y * 1.4, v.z * 1.4, seed + 77) - 0.16 * Math.pow(Math.abs(noise3(v.x * 0.9, v.y * 0.9, v.z * 0.9, seed + 5)), 3) * 2.2);
      }
      // chipped corners: bite out where two or three faces meet
      if (chip > 0) {
        const corner = (Math.abs(v.x) > w / 2 - 1.5 ? 1 : 0) + (Math.abs(v.y) > h / 2 - 1.5 ? 1 : 0) + (Math.abs(v.z) > d / 2 - 1.5 ? 1 : 0);
        if (corner >= 2) r -= chip * 1.2 * Math.max(0, noise3(v.x * 0.5, v.y * 0.5, v.z * 0.5, seed + 9));
      }
    }
    v.copy(c).addScaledVector(n, Math.max(0.05, r));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
}

/** Turned profile (columns, barrels, urns). Points are [radius, height]; start and end at radius 0 to close it. */
export function lathe(profile: [number, number][], seg = 32) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  return m;
}

/** Column shaft with flutes (classical) or ribs. */
export function fluted(r: number, h: number, flutes: number, depth: number, taper = 0.9, seg = 6) {
  const radial = flutes * seg;
  const rows = Math.max(2, Math.round(h / 3));
  const g = new THREE.CylinderGeometry(r * taper, r, h, radial, rows, false);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const rr = Math.hypot(v.x, v.z);
    if (rr < 1e-4) continue;
    const a = Math.atan2(v.z, v.x);
    const f = Math.pow(Math.max(0, Math.cos(a * flutes)), 2);
    const k = (rr - depth * f) / rr;
    pos.setXYZ(i, v.x * k, v.y, v.z * k);
  }
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  m.computeVertexNormals();
  return m;
}

/** Rectangle with rounded corners as a 2D shape. */
export function roundRect(w: number, h: number, r: number, cx = 0, cy = 0) {
  const s = new THREE.Shape();
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function polyShape(pts: [number, number][]) {
  // drop repeated points: they leave slivers in the extruded solid
  pts = pts.filter((p, i) => {
    const q = pts[(i + pts.length - 1) % pts.length];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.02;
  });
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
}

export function circlePath(r: number, cx = 0, cy = 0, n = 32) {
  const p = new THREE.Path();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    i ? p.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : p.moveTo(cx + r, cy);
  }
  return p;
}

/** Height-field slab: closed solid from y=0 up to h(x,z), over a w×d rectangle centred on the origin. */
export function heightSlab(w: number, d: number, res: number, h: (x: number, z: number) => number) {
  const nx = Math.max(2, Math.round(w / res)), nz = Math.max(2, Math.round(d / res));
  const verts: number[] = [];
  const idx: number[] = [];
  const top = (i: number, j: number) => i * (nz + 1) + j;
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const x = -w / 2 + (w * i) / nx, z = -d / 2 + (d * j) / nz;
      verts.push(x, Math.max(0.2, h(x, z)), z);
    }
  const nTop = verts.length / 3;
  // bottom copies
  for (let i = 0; i <= nx; i++)
    for (let j = 0; j <= nz; j++) {
      const x = -w / 2 + (w * i) / nx, z = -d / 2 + (d * j) / nz;
      verts.push(x, 0, z);
    }
  const bot = (i: number, j: number) => nTop + top(i, j);
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const a = top(i, j), b = top(i + 1, j), c = top(i + 1, j + 1), dd = top(i, j + 1);
      idx.push(a, dd, b, b, dd, c);
      const A = bot(i, j), B = bot(i + 1, j), C = bot(i + 1, j + 1), D = bot(i, j + 1);
      idx.push(A, B, D, B, C, D);
    }
  // sides
  for (let i = 0; i < nx; i++) {
    let a = top(i, 0), b = top(i + 1, 0), A = bot(i, 0), B = bot(i + 1, 0);
    idx.push(a, b, A, b, B, A);
    a = top(i, nz); b = top(i + 1, nz); A = bot(i, nz); B = bot(i + 1, nz);
    idx.push(a, A, b, b, A, B);
  }
  for (let j = 0; j < nz; j++) {
    let a = top(0, j), b = top(0, j + 1), A = bot(0, j), B = bot(0, j + 1);
    idx.push(a, A, b, b, A, B);
    a = top(nx, j); b = top(nx, j + 1); A = bot(nx, j); B = bot(nx, j + 1);
    idx.push(a, b, A, b, B, A);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- finishing ----------

/** One geometry per material for the preview. */
export function mergeByMat(parts: Part[]) {
  const by = new Map<Mat, THREE.BufferGeometry[]>();
  for (const p of parts) {
    let g = p.geo;
    g = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!by.has(p.mat)) by.set(p.mat, []);
    by.get(p.mat)!.push(g);
  }
  const out = new Map<Mat, THREE.BufferGeometry>();
  for (const [m, list] of by) out.set(m, mergeGeometries(list, false)!);
  return out;
}

/** All parts as one triangle soup (for export). */
export function mergeAll(parts: Part[]) {
  const list = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k);
    return g;
  });
  return mergeGeometries(list, false)!;
}

export function bounds(parts: Part[]) {
  const b = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    b.union(p.geo.boundingBox!);
  }
  return b;
}

// ---------- closed tubes (open tube ends upset slicers) ----------

/** TubeGeometry with both ends capped, so it is a closed solid. */
export function tube(curve: THREE.Curve<THREE.Vector3>, segs: number, r: number, radial: number, _closed = false) {
  const g = new THREE.TubeGeometry(curve, segs, r, radial, false);
  g.deleteAttribute('uv');
  const pos = g.attributes.position as THREE.BufferAttribute;
  const idx = Array.from(g.index!.array);
  const verts = Array.from(pos.array as Float32Array);
  const ring = radial + 1;
  const cap = (ringStart: number, at: number, outward: THREE.Vector3) => {
    const c = curve.getPointAt(at);
    const ci = verts.length / 3;
    verts.push(c.x, c.y, c.z);
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < radial; i++) {
      const i0 = ringStart + i, i1 = ringStart + i + 1;
      a.fromArray(verts, i0 * 3).sub(c);
      b.fromArray(verts, i1 * 3).sub(c);
      const n = a.clone().cross(b);
      if (n.dot(outward) >= 0) idx.push(ci, i0, i1);
      else idx.push(ci, i1, i0);
    }
  };
  cap(0, 0, curve.getTangentAt(0).negate());
  cap(segs * ring, 1, curve.getTangentAt(1));
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(idx);
  const m = mergeVertices(out, 1e-4);
  m.computeVertexNormals();
  return m;
}

/** Part of a torus (handles, hoops, arches), capped at both ends. Lies in the XY plane like TorusGeometry. */
export function arcTorus(R: number, r: number, radial: number, tubular: number, arc: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= tubular; i++) {
    const a = (i / tubular) * arc;
    pts.push(new THREE.Vector3(Math.cos(a) * R, Math.sin(a) * R, 0));
  }
  return tube(new THREE.CatmullRomCurve3(pts), tubular * 2, r, radial);
}


/** Point inside a polygon (even-odd rule). */
export function inPoly(pts: [number, number][], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Tapered tube with bark: deep vertical furrows, knots and a little twist. Closed at both ends.
 * Used for trunks, branches, roots and logs.
 */
export function barkTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segs: number, radial: number, seed: number, bark = 1) {
  const frames = curve.computeFrenetFrames(segs, false);
  const verts: number[] = [];
  const idx: number[] = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, P);
    const R = r0 + (r1 - r0) * t;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const furrow = Math.pow(Math.abs(Math.sin(a * Math.max(3, Math.round(R * 2.2)) + noise3(t * 6, 0, 0, seed) * 2)), 0.6);
      const knot = Math.max(0, noise3(Math.cos(a) * 2, Math.sin(a) * 2, t * segs * 0.25, seed + 3) - 0.55) * 1.4;
      const rr = R * (1 + bark * (0.1 * furrow - 0.06 + 0.05 * noise3(a * 3, t * 20, 1, seed + 1) + knot * 0.25));
      N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
      verts.push(P.x + N.x * rr, P.y + N.y * rr, P.z + N.z * rr);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
    idx.push(a, c, b, b, c, d);
  }
  // caps (slightly domed so a cut log end shows growth rings when ringed later)
  const cap = (ring: number, end: number, sign: number) => {
    curve.getPointAt(end, P);
    const ci = verts.length / 3;
    const T = curve.getTangentAt(end).multiplyScalar(sign * 0.2);
    verts.push(P.x + T.x, P.y + T.y, P.z + T.z);
    for (let j = 0; j < radial; j++) {
      const a = ring * radial + j, b = ring * radial + ((j + 1) % radial);
      sign > 0 ? idx.push(ci, a, b) : idx.push(ci, b, a);
    }
  };
  cap(0, 0, -1);
  cap(segs, 1, 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

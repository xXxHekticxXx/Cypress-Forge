// Pillars, stairs, hills/cliffs and bridges.
import * as THREE from 'three';
import { Builder, Rng, fbm, noise3, heightSlab, fluted, lathe, polyShape, smoothstep, clamp, tube } from './core';
import { rubble, tuft, crystalCluster, topBox, floorSurface, type Ctx } from './floors';

// ---------- pillars ----------

export function pillar(b: Builder, style: string, H: number, y0: number, broken: boolean, c: Ctx) {
  const rng = c.rng.fork(51);
  const sq = c.sq;
  const R = sq * 0.3;
  // a broken pillar keeps 35–70 % of its height and drops a piece next to it
  const keep = broken ? rng.range(0.35, 0.7) : 1;
  const top = y0 + H * keep;
  const cutTop = (yTop: number) => {
    if (!broken) return;
    // jagged break: a few chunky shards on top
    for (let i = 0; i < 5; i++) b.block(rng.range(2, 4), rng.range(1.5, 4), rng.range(2, 4), 'stone', { x: rng.soft() * R * 0.5, z: rng.soft() * R * 0.5, y: yTop, rx: rng.soft(), rz: rng.soft() }, { bevel: 0.4, noise: 0.5, seed: rng.int(1, 99), chip: 1 });
    rubble(b, R + 4, 0, y0, 2.5, rng, 4);
  };
  switch (style) {
    case 'doric':
    case 'ionic':
    case 'round': {
      const classical = style !== 'round';
      b.block(R * 2.5, 2.4, R * 2.5, 'stone2', { y: y0 + 1.2 }, { bevel: 0.5, noise: 0.2 + c.wear * 0.3, seed: 2 });
      b.lathe([[0, 0], [R * 1.12, 0], [R * 1.15, 1], [R * 1.02, 2.2], [R * 1.06, 3], [0, 3]], 'stone', { y: y0 + 2.4 }, 40);
      const shaftH = H - 2.4 - 3 - 5.5;
      const shaft = classical ? fluted(R, shaftH, style === 'ionic' ? 24 : 20, 0.7 * c.detail, 0.88, 4) : lathe([[0, 0], [R, 0], [R * 0.92, shaftH], [0, shaftH]], 40);
      const shown = Math.max(4, shaftH * keep - 2);
      shaft.translate(0, shaftH / 2, 0);
      b.add(shaft, 'stone', { y: y0 + 5.4, sy: broken ? shown / shaftH : 1 });
      if (broken) { cutTop(y0 + 5.4 + shown); break; }
      const cy = y0 + 5.4 + shaftH;
      if (style === 'doric' || style === 'round') {
        b.lathe([[0, 0], [R * 0.92, 0], [R * 0.95, 0.8], [R * 1.25, 3], [0, 3]], 'stone', { y: cy }, 40);
        b.block(R * 2.7, 2.4, R * 2.7, 'stone2', { y: cy + 4.2 }, { bevel: 0.4, noise: 0.15, seed: 3 });
      } else {
        b.lathe([[0, 0], [R * 0.95, 0], [R * 1.1, 2], [0, 2]], 'stone', { y: cy }, 40);
        for (const s of [-1, 1]) for (const z of [-1, 1]) {
          // volutes: little spiral scrolls on each side
          const pts = [];
          for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 3.2, r = 2.6 * (1 - t * 0.85); pts.push(new THREE.Vector3(s * (R * 1.1 + Math.cos(a) * r), cy + 1.6 + Math.sin(a) * r, z * R * 0.7)); }
          b.add(tube(new THREE.CatmullRomCurve3(pts), 60, 0.6, 6, false), 'stone');
        }
        b.block(R * 2.9, 2, R * 2.2, 'stone2', { y: cy + 4.4 }, { bevel: 0.4, noise: 0.12, seed: 4 });
      }
      break;
    }
    case 'egypt': {
      b.block(R * 2.4, 2.4, R * 2.4, 'stone2', { y: y0 + 1.2 }, { bevel: 0.5, noise: 0.25, seed: 2 });
      const sh = (H - 12) * keep;
      // bundled papyrus stems
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        b.lathe([[0, 0], [R * 0.4, 0], [R * 0.36, sh], [0, sh]], 'stone', { x: Math.cos(a) * R * 0.62, z: Math.sin(a) * R * 0.62, y: y0 + 2.4 }, 16);
      }
      b.cyl(R * 0.8, R * 0.8, sh, 'stone', { y: y0 + 2.4 + sh / 2 }, 24);
      for (let k = 0; k < 3; k++) b.add(new THREE.TorusGeometry(R * 1.02, 0.6, 6, 32), 'accent', { y: y0 + 2.4 + sh - 3 - k * 1.5, rx: Math.PI / 2 });
      if (broken) { cutTop(y0 + 2.4 + sh); break; }
      b.lathe([[0, 0], [R * 1.0, 0], [R * 1.6, 5], [R * 1.5, 8], [0, 8]], 'stone', { y: y0 + 2.4 + sh }, 32); // papyrus flower capital
      b.block(R * 2.2, 1.8, R * 2.2, 'stone2', { y: y0 + 2.4 + sh + 9 }, { bevel: 0.3, seed: 6 });
      break;
    }
    case 'obelisk': {
      b.block(R * 2.6, 4, R * 2.6, 'stone2', { y: y0 + 2 }, { bevel: 0.6, noise: 0.3, seed: 2 });
      const sh = (H - 4) * keep;
      const g = new THREE.CylinderGeometry(R * 0.55, R * 0.8, sh * 0.9, 4, 1);
      g.rotateY(Math.PI / 4);
      b.add(g, 'stone', { y: y0 + 4 + sh * 0.45 });
      if (!broken) { const p = new THREE.ConeGeometry(R * 0.78, sh * 0.1, 4); p.rotateY(Math.PI / 4); b.add(p, 'brass', { y: y0 + 4 + sh * 0.95 }); }
      // hieroglyph bands
      for (let i = 0; i < sh * 0.8 / 3; i++) for (let f = 0; f < 4; f++) {
        const yy = y0 + 6 + i * 3, rr = R * (0.8 - ((yy - y0 - 4) / (sh * 0.9)) * 0.25) * 0.72;
        b.box(rng.range(0.8, 2), 1.4, 0.6, 'stone2', { y: yy, x: Math.cos(f * Math.PI / 2) * rr, z: Math.sin(f * Math.PI / 2) * rr, ry: -f * Math.PI / 2 + Math.PI / 2 });
      }
      cutTop(y0 + 4 + sh * 0.9);
      break;
    }
    case 'pier': {
      // stacked blocks with chamfered corners
      const w = R * 2;
      let y = y0;
      while (y < top - 2) {
        const h = Math.min(rng.range(5, 7), top - y);
        b.block(w + rng.soft() * 0.4, h - 0.6, w + rng.soft() * 0.4, rng.chance(0.5) ? 'stone' : 'stone2', { y: y + h / 2, ry: rng.soft() * 0.02 }, { bevel: 1.2, noise: (0.35 + c.wear * 0.3) * c.detail, seed: rng.int(1, 999), chip: c.wear });
        y += h;
      }
      b.block(w + 3, 2.4, w + 3, 'stone', { y: y0 + 1.2 }, { bevel: 0.6, noise: 0.25, seed: 9 });
      if (!broken) b.block(w + 3, 2.4, w + 3, 'stone', { y: top + 1.2 }, { bevel: 0.6, noise: 0.25, seed: 10 });
      cutTop(top);
      // torch sconce
      b.box(1.6, 5, 2, 'metal2', { y: y0 + H * 0.6 * keep, z: w / 2 + 1 });
      b.cyl(1, 0.6, 5, 'wood', { y: y0 + H * 0.6 * keep + 3, z: w / 2 + 2.4, rx: 0.3 }, 8);
      if (!broken) b.cyl(0, 1.2, 3, 'glow', { y: y0 + H * 0.6 + 6.6, z: w / 2 + 3 }, 6);
      break;
    }
    case 'post':
    case 'mast':
    case 'bollard': {
      const w = style === 'mast' ? R * 1.3 : R * 1.2;
      if (style === 'post') {
        b.block(w, top - y0, w, 'wood', { y: (y0 + top) / 2 }, { bevel: 0.6, noise: 0.35 * c.detail, freq: 0.5, seed: 4, chip: c.wear });
        if (!broken) for (const s of [-1, 1]) b.block(w * 2, 2, w * 0.8, 'wood2', { x: s * w, y: top - 4, rz: s * 0.6 }, { bevel: 0.4, noise: 0.2, seed: 5 });
        b.block(w + 3, 2.2, w + 3, 'stone', { y: y0 + 1.1 }, { bevel: 0.6, noise: 0.3, seed: 6 });
      } else {
        b.cyl(w / 2, w / 2 + 0.5, top - y0, 'wood', { y: (y0 + top) / 2 }, 24);
        for (let y = y0 + 4; y < top - 2; y += 7) b.add(new THREE.TorusGeometry(w / 2 + 0.3, 0.5, 6, 24), 'metal2', { y, rx: Math.PI / 2 });
        if (style === 'mast' && !broken) {
          b.cyl(0.8, 0.8, sq * 1.6, 'wood', { y: top - 8, rz: Math.PI / 2 }, 12);
          b.block(w + 2, 3, w + 2, 'wood2', { y: top - 14 }, { bevel: 0.4 });
          for (const s of [-1, 1]) b.rod(new THREE.Vector3(s * sq * 0.8, top - 8, 0), new THREE.Vector3(s * sq * 0.45, y0 + 1, 0), 0.35, 'cloth', 6);
        }
        if (style === 'bollard') for (let i = 0; i < 2; i++) b.add(new THREE.TorusGeometry(w / 2 + 0.9, 0.8, 6, 24), 'cloth', { y: top - 4 - i * 1.6, rx: Math.PI / 2 });
      }
      cutTop(top);
      break;
    }
    case 'pipe': {
      b.cyl(R * 0.7, R * 0.7, top - y0, 'metal', { y: (y0 + top) / 2 }, 28);
      for (let y = y0 + 3; y < top; y += sq * 0.7) {
        b.cyl(R * 0.95, R * 0.95, 1.6, 'brass', { y }, 28);
        for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; b.cyl(0.5, 0.5, 2.2, 'metal2', { y, x: Math.cos(a) * R * 0.85, z: Math.sin(a) * R * 0.85 }, 6); }
      }
      b.cyl(R * 1.1, R * 1.2, 3, 'metal2', { y: y0 + 1.5 }, 28);
      if (!broken) b.cyl(R * 1.2, R * 1.1, 3, 'metal2', { y: top - 1.5 }, 28);
      b.cyl(R * 0.4, R * 0.4, R * 2, 'brass', { y: y0 + H * 0.45 * keep, rz: Math.PI / 2, x: R }, 14);
      b.cyl(1.8, 1.8, 1, 'cloth', { y: y0 + H * 0.45 * keep + 4, z: R * 0.7, rx: Math.PI / 2 }, 20);
      cutTop(top);
      break;
    }
    case 'girder':
    case 'ibeam': {
      const w = R * 1.6;
      b.box(w, top - y0, 1.6, 'metal', { y: (y0 + top) / 2 });
      for (const s of [-1, 1]) b.box(1.4, top - y0, w * 0.75, 'metal', { x: s * (w / 2 - 0.7), y: (y0 + top) / 2 });
      for (let y = y0 + 4; y < top - 2; y += 4) for (const s of [-1, 1]) b.sphere(0.55, 'metal2', { x: s * (w / 2 + 0.1), y, z: 0, sx: 0.6 }, 8);
      if (style === 'girder') for (let y = y0 + 3; y < top - 6; y += 8) for (const s of [-1, 1]) b.box(0.9, 9, 0.9, 'metal2', { y: y + 4, z: s * 1.4, rz: 0.55 });
      b.block(w + 4, 2, w + 4, 'stone2', { y: y0 + 1 }, { bevel: 0.4, seed: 2 });
      cutTop(top);
      break;
    }
    case 'concrete': {
      b.block(R * 2, top - y0, R * 2, 'stone', { y: (y0 + top) / 2 }, { bevel: 0.6, noise: (0.1 + c.wear * 0.5) * c.detail, freq: 0.3, seed: 3, chip: c.wear });
      if (broken || c.wear > 0.5) for (let i = 0; i < 6; i++) b.rod(new THREE.Vector3(rng.soft() * R * 0.7, top - 1, rng.soft() * R * 0.7), new THREE.Vector3(rng.soft() * R, top + rng.range(2, 6), rng.soft() * R), 0.4, 'metal2', 6);
      cutTop(top);
      break;
    }
    case 'lamp': {
      b.cyl(1.4, 2, top - y0, 'metal2', { y: (y0 + top) / 2 }, 16);
      b.cyl(3, 3.4, 4, 'metal2', { y: y0 + 2 }, 20);
      if (!broken) {
        b.cyl(1, 1, sq * 0.6, 'metal2', { y: top, x: sq * 0.25, rz: Math.PI / 2 }, 10);
        b.block(6, 1.6, 3, 'metal2', { x: sq * 0.55, y: top - 0.8 }, { bevel: 0.4 });
        b.box(5, 0.6, 2, 'glow', { x: sq * 0.55, y: top - 1.8 });
      }
      cutTop(top);
      break;
    }
    case 'neon': {
      b.block(R * 1.8, top - y0, R * 1.8, 'metal2', { y: (y0 + top) / 2 }, { bevel: 0.6, res: 2.5 });
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.box(ax ? 0.8 : 1.4, top - y0 - 6, az ? 0.8 : 1.4, 'glow', { y: (y0 + top) / 2, x: ax * R * 0.92, z: az * R * 0.92 });
      for (let y = y0 + 6; y < top - 4; y += 10) b.block(R * 2.1, 2, R * 2.1, 'metal', { y }, { bevel: 0.4 });
      // wrapped cables
      const pts = [];
      for (let i = 0; i <= 30; i++) { const t = i / 30, a = t * Math.PI * 5; pts.push(new THREE.Vector3(Math.cos(a) * R * 1.05, y0 + 2 + t * (top - y0 - 4), Math.sin(a) * R * 1.05)); }
      b.add(tube(new THREE.CatmullRomCurve3(pts), 120, 0.55, 6, false), 'accent');
      cutTop(top);
      break;
    }
    case 'strut':
    case 'reactor':
    case 'holo': {
      if (style === 'strut') {
        const g = new THREE.CylinderGeometry(R * 0.8, R * 0.95, top - y0, 6);
        b.add(g, 'metal', { y: (y0 + top) / 2 });
        for (let y = y0 + 5; y < top - 3; y += 6) b.add(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 1.4, 6), 'metal2', { y });
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; b.box(0.8, top - y0 - 8, 0.7, 'glow', { y: (y0 + top) / 2, x: Math.cos(a) * R * 0.78, z: Math.sin(a) * R * 0.78, ry: -a }); }
        b.add(new THREE.CylinderGeometry(R * 1.3, R * 1.4, 3, 6), 'metal2', { y: y0 + 1.5 });
        if (!broken) b.add(new THREE.CylinderGeometry(R * 1.4, R * 1.3, 3, 6), 'metal2', { y: top - 1.5 });
      } else if (style === 'reactor') {
        b.cyl(R * 0.75, R * 0.75, top - y0, 'glow', { y: (y0 + top) / 2 }, 24);
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; b.box(2.2, top - y0, 2.2, 'metal', { y: (y0 + top) / 2, x: Math.cos(a) * R * 0.8, z: Math.sin(a) * R * 0.8 }); }
        for (let y = y0 + 4; y < top - 2; y += 7) b.add(new THREE.TorusGeometry(R * 0.85, 1, 8, 28), 'metal2', { y, rx: Math.PI / 2 });
        b.cyl(R * 1.2, R * 1.3, 3, 'metal2', { y: y0 + 1.5 }, 28);
      } else {
        b.cyl(R * 1.1, R * 1.3, 4, 'metal2', { y: y0 + 2 }, 32);
        b.cyl(R * 0.4, R * 0.5, top - y0 - 8, 'metal', { y: y0 + 4 + (top - y0 - 8) / 2 }, 20);
        b.lathe([[0, 0], [R * 0.9, 0], [R * 0.6, 4], [0, 4]], 'metal2', { y: top - 4 }, 24);
        if (!broken) b.sphere(R * 0.45, 'glow', { y: top + 1.5 }, 20);
      }
      cutTop(top);
      break;
    }
    case 'spire':
    case 'pod': {
      const sh = top - y0;
      const g = lathe([[0, 0], [R * 1.1, 0], [R * 0.8, sh * 0.3], [R * 0.55, sh * 0.7], [R * 0.2, sh], [0, sh]], 20);
      // twist and lumpiness
      const pos = g.attributes.position as THREE.BufferAttribute;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const a = (v.y / sh) * Math.PI * 1.4;
        const k = 1 + 0.18 * noise3(v.x * 0.3, v.y * 0.15, v.z * 0.3, c.seed);
        const x = (v.x * Math.cos(a) - v.z * Math.sin(a)) * k, z = (v.x * Math.sin(a) + v.z * Math.cos(a)) * k;
        pos.setXYZ(i, x, v.y, z);
      }
      g.computeVertexNormals();
      b.add(g, 'organic', { y: y0 });
      if (style === 'pod') for (let i = 0; i < 4; i++) b.sphere(rng.range(2, 3.4), 'glow', { y: y0 + sh * rng.range(0.4, 0.9), x: rng.soft() * R, z: rng.soft() * R, sy: 1.3 }, 14);
      for (let i = 0; i < 5; i++) b.sphere(rng.range(1, 2), 'organic', { y: y0 + 1, x: Math.cos(i * 1.3) * R * 1.1, z: Math.sin(i * 1.3) * R * 1.1 }, 10);
      break;
    }
    case 'crystals': {
      rubble(b, 0, 0, y0, R * 0.7, rng, 5);
      const n = 5;
      for (let i = 0; i < n; i++) {
        const h = (top - y0) * (i === 0 ? 1 : rng.range(0.35, 0.7));
        const r = R * (i === 0 ? 0.55 : rng.range(0.25, 0.4));
        const body = new THREE.CylinderGeometry(r, r * 0.9, h * 0.82, 6);
        body.translate(0, h * 0.41, 0);
        const tip = new THREE.ConeGeometry(r, h * 0.18, 6);
        tip.translate(0, h * 0.91, 0);
        const tilt = i === 0 ? 0 : 0.35;
        for (const g of [body, tip]) b.add(g, 'crystal', { y: y0, x: i ? rng.soft() * R * 0.6 : 0, z: i ? rng.soft() * R * 0.6 : 0, rx: rng.soft() * tilt, rz: rng.soft() * tilt });
      }
      break;
    }
    case 'statue': {
      // armoured knight with sword, on a plinth
      b.block(R * 2.4, 6, R * 2.4, 'stone2', { y: y0 + 3 }, { bevel: 0.6, noise: 0.25, seed: 2 });
      const sy = y0 + 6;
      const s = (H - 6) / 40;
      for (const x of [-1.6, 1.6]) b.block(2.6 * s, 14 * s, 3 * s, 'stone', { x: x * s, y: sy + 7 * s }, { bevel: 0.9, noise: 0.2, seed: 3 });
      b.lathe([[0, 0], [5 * s, 0], [6 * s, 6 * s], [4.6 * s, 13 * s], [0, 13 * s]], 'stone', { y: sy + 13 * s }, 20);
      b.sphere(3 * s, 'stone', { y: sy + 29 * s, sy: 1.15 }, 16);
      b.block(5 * s, 1.4 * s, 4 * s, 'stone', { y: sy + 27 * s }, { bevel: 0.4 });
      b.box(1 * s, 22 * s, 0.6 * s, 'stone', { y: sy + 15 * s, z: 4.5 * s }); // sword
      b.box(6 * s, 1 * s, 1 * s, 'stone', { y: sy + 25.5 * s, z: 4.5 * s });
      for (const x of [-4.6, 4.6]) b.block(2.4 * s, 10 * s, 2.4 * s, 'stone', { x: x * s, y: sy + 21 * s, z: 2 * s, rx: -0.5 }, { bevel: 0.8 });
      b.extrude(polyShape([[-4, 6], [4, 6], [3.4, -2], [0, -6], [-3.4, -2]].map(([x, y]) => [x * s, y * s] as [number, number])), 1.2 * s, 'stone2', { x: -6 * s, y: sy + 18 * s, z: 2 * s, ry: -0.6 });
      if (broken) cutTop(sy + 24 * s);
      break;
    }
    default:
      pillar(b, 'pier', H, y0, broken, c);
  }
}

// ---------- stairs ----------

export function stairs(b: Builder, style: string, W: number, D: number, H: number, n: number, y0: number, rails: boolean, c: Ctx) {
  const rng = c.rng.fork(61);
  const stepD = D / n, stepH = H / n;
  if (style === 'ramp') {
    const sh = polyShape([[-D / 2, 0], [D / 2, 0], [D / 2, H], [D / 2 - 6, H]]);
    b.extrude(sh, W, 'metal', { y: y0, ry: Math.PI / 2 }, 0.4);
    // grip ridges
    for (let i = 1; i < D / 3.2 - 2; i++) {
      const t = (i * 3.2) / (D - 6), z = D / 2 - i * 3.2;
      b.box(W - 2, 0.7, 0.9, 'metal2', { z, y: y0 + H * (1 - t) + 0.25 + 0.1, rx: Math.atan2(H, D - 6) });
    }
    b.box(W - 4, 0.6, 1.2, 'glow', { z: D / 2 - 1, y: y0 + H + 0.2 });
  } else if (style === 'spiral') {
    const R = Math.min(W, D) / 2 - 1;
    b.cyl(2.2, 2.2, H + 6, 'metal', { y: y0 + (H + 6) / 2 }, 16);
    const m = Math.max(n * 2, 8);
    for (let i = 0; i < m; i++) {
      const a = (i / m) * Math.PI * 1.6;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.absarc(0, 0, R, a, a + (Math.PI * 1.6) / m + 0.05, false);
      shape.lineTo(0, 0);
      b.extrude(shape, 1.4, 'metal', { y: y0 + ((i + 1) / m) * H - 0.7, rx: -Math.PI / 2 });
      if (rails) b.rod(new THREE.Vector3(Math.cos(a) * R, y0 + ((i + 1) / m) * H, -Math.sin(a) * R), new THREE.Vector3(Math.cos(a) * R, y0 + ((i + 1) / m) * H + 12, -Math.sin(a) * R), 0.5, 'metal2', 6);
    }
  } else if (style === 'ladder') {
    for (const s of [-1, 1]) b.block(2, Math.hypot(H + 10, D * 0.6), 2, 'wood', { x: s * (W / 2 - 3), y: y0 + (H + 10) / 2, z: 0, rx: Math.atan2(D * 0.6, H + 10) }, { bevel: 0.4, noise: 0.2, seed: 2 });
    const rungs = Math.round((H + 8) / 5);
    for (let i = 0; i < rungs; i++) {
      const t = (i + 0.5) / rungs;
      b.cyl(0.8, 0.8, W - 6, 'wood2', { y: y0 + t * (H + 10), z: (0.5 - t) * D * 0.6 * -1 + 0, rz: Math.PI / 2 }, 8);
    }
    b.block(W, 3, D * 0.3, 'wood', { y: y0 + H + 1.5, z: -D / 2 + D * 0.15 }, { bevel: 0.4, seed: 4 });
  } else {
    // solid steps
    for (let i = 0; i < n; i++) {
      const top = (i + 1) * stepH;
      const z = D / 2 - (i + 0.5) * stepD;
      const sd = rng.int(1, 9999);
      if (style === 'wood') {
        b.block(W - 1, top, stepD, 'wood2', { z, y: y0 + top / 2 }, { bevel: 0.3, res: 2 });
        b.add(topBox(W - 0.6, 1.6, stepD + 0.8, 0.45, (x, zz) => -0.16 * Math.pow(Math.abs(Math.sin(zz * 2.6 + fbm(x * 0.05, zz * 0.3, 0, sd, 2) * 4)), 10) - c.wear * 0.4 * smoothstep(W * 0.3, 0, Math.abs(x))), 'wood', { z: z + 0.4, y: y0 + top - 1.6 });
        for (const s of [-1, 1]) b.sphere(0.5, 'metal2', { x: s * (W / 2 - 2), z: z + 0.4, y: y0 + top + 0.05, sy: 0.6 }, 8);
      } else if (style === 'metal') {
        b.block(W - 1, top - 1.2, stepD, 'metal2', { z, y: y0 + (top - 1.2) / 2 }, { bevel: 0.3, res: 3 });
        const g = new Builder();
        for (let k = 1; k < W / 2.4; k++) g.box(0.8, 1.2, stepD - 1, 'metal', { x: -W / 2 + k * 2.4, y: 0.6 });
        g.box(W - 1, 1.2, 1.2, 'accent', { z: stepD / 2 - 0.6, y: 0.6 });
        for (const p of g.parts) b.add(p.geo, p.mat, { z, y: y0 + top - 1.2 });
      } else {
        const organic = style === 'organic', roughS = style === 'rough' || organic;
        const mat = organic ? 'organic' : style === 'concrete' ? 'stone' : rng.chance(0.5) ? 'stone' : 'stone2';
        if (roughS) {
          b.block(W, top, stepD, mat, { z, y: y0 + top / 2 },
            { bevel: 1.2, noise: 0.9 * c.detail, freq: organic ? 0.2 : 0.4, seed: sd, flatTop: true, chip: c.wear, res: 1.6 });
        } else {
          // each step is a core plus a row of cut treads with joints, like real masonry stairs
          b.block(W - 1.6, Math.max(1, top - 2.2), stepD - 0.8, 'mortar', { z, y: y0 + Math.max(1, top - 2.2) / 2 }, { bevel: 0.3, res: 3 });
          let x = -W / 2;
          while (x < W / 2 - 0.5) {
            let len = rng.range(W * 0.22, W * 0.45);
            if (W / 2 - x - len < W * 0.15) len = W / 2 - x;
            const sm = style === 'concrete' ? 'stone' : rng.chance(0.5) ? 'stone' : 'stone2';
            b.block(len - 0.6, Math.min(top, stepH + 2.4), stepD - 0.4, sm, { x: x + len / 2, z: z + 0.2, y: y0 + top - Math.min(top, stepH + 2.4) / 2 },
              { bevel: 0.7, noise: (0.25 + c.wear * 0.45) * c.detail, freq: 0.45, seed: rng.int(1, 9999), flatTop: true, chip: c.wear, res: 1.4 });
            x += len;
          }
          // side cheek walls
          for (const sx of [-1, 1]) b.block(1.6, top, stepD, 'stone2', { x: sx * (W / 2 - 0.8), z, y: y0 + top / 2 }, { bevel: 0.3, noise: 0.2, seed: sd + 3, res: 2 });
        }
        // worn dip in the middle of each tread
        if (c.wear > 0.3 && !roughS) b.block(W * 0.5, 0.6, stepD * 0.6, mat, { z: z + 0.5, y: y0 + top - 0.1 }, { bevel: 0.3, noise: 0.2, seed: sd + 1 });
      }
    }
    // landing at the top
    b.block(W - 0.6, H, 3, style === 'wood' ? 'wood2' : style === 'metal' ? 'metal2' : 'stone2', { z: -D / 2 + 1.5, y: y0 + H / 2 }, { bevel: 0.5, noise: 0.2, seed: 7 });
  }
  if (rails && style !== 'spiral') {
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - 1.2);
      const posts = Math.max(2, n);
      for (let i = 0; i <= posts; i++) {
        const t = i / posts;
        const z = D / 2 - t * D * 0.92 - 1;
        const yy = y0 + Math.min(H, (1 - (z + D / 2) / D) * H + stepH);
        b.cyl(0.6, 0.6, 12, style === 'wood' ? 'wood' : 'metal2', { x, z, y: yy + 6 }, 8);
      }
      b.rod(new THREE.Vector3(x, y0 + stepH + 12, D / 2 - 1), new THREE.Vector3(x, y0 + H + 12, -D / 2 + D * 0.08 - 1), 0.8, style === 'wood' ? 'wood' : 'metal2', 8);
    }
  }
}

// ---------- hills and cliffs ----------

export function hill(b: Builder, style: string, W: number, D: number, H: number, tiers: number, rocks: number, y0: number, c: Ctx) {
  const rng = c.rng.fork(71);
  const seed = c.seed;
  const tierH = H / Math.max(1, tiers);
  const crater = style === 'crater';
  const field = (x: number, z: number) => {
    const nx = x / (W / 2), nz = z / (D / 2);
    const edge = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
    const fall = smoothstep(0, Math.min(W, D) * 0.18, edge);
    let h: number;
    if (crater) {
      const r = Math.hypot(nx, nz);
      h = H * (0.25 + 0.6 * Math.exp(-Math.pow((r - 0.55) / 0.22, 2))) - H * 0.25 * smoothstep(0.5, 0, r);
    } else {
      const blob = 1 - Math.pow(Math.min(1, Math.hypot(nx * 0.95, nz * 0.95)), 2.2);
      h = H * clamp(blob * 1.05 + fbm(x * 0.02, z * 0.02, 0, seed, 3) * 0.45, 0, 1.1);
    }
    return h * fall;
  };
  const terraced = (x: number, z: number) => {
    const raw = field(x, z);
    if (crater) return raw;
    // terraces: flat ledges for minis with steep, layered faces between them
    const t = raw / tierH;
    const k = Math.floor(t);
    const f = t - k;
    const step = (k + smoothstep(0.78, 0.98, f)) * tierH;
    const face = smoothstep(0.78, 0.98, f) * (1 - smoothstep(0.98, 1, f));
    const strata = face * (Math.sin(raw * 2.4 + noise3(x * 0.1, z * 0.1, 0, seed) * 2) * 0.5 + 0.5) * 0.9;
    return Math.min(step, raw + 0.5) - strata;
  };
  const surface = (x: number, z: number) => {
    const h = terraced(x, z);
    const bump = style === 'sand' ? Math.sin(x * 0.35 + fbm(x * 0.03, z * 0.03, 0, seed) * 4) * 0.25 : fbm(x * 0.3, z * 0.3, 2, seed, 2) * 0.35;
    return 2 + h + bump * c.detail;
  };
  const g = heightSlab(W - 0.3, D - 0.3, 0.75, surface);
  const mat = style === 'grass' ? 'grass' : style === 'sand' ? 'ground' : style === 'crystalhill' ? 'stone' : 'stone2';
  b.add(g, mat, { y: y0 });
  // rock outcrops wherever the ground is steep (ledge faces), so cliffs read as stone, not clay
  if (!crater && style !== 'sand') {
    const step = 4.2;
    for (let x = -W / 2 + 4; x < W / 2 - 4; x += step) for (let z = -D / 2 + 4; z < D / 2 - 4; z += step) {
      const jx = x + rng.soft() * 1.5, jz = z + rng.soft() * 1.5;
      const h0 = surface(jx, jz);
      const slope = Math.max(Math.abs(surface(jx + 1.5, jz) - h0), Math.abs(surface(jx, jz + 1.5) - h0)) / 1.5;
      if (slope < 0.9 || rng.chance(0.25)) continue;
      const s = rng.range(2.8, 5.2);
      b.block(s, s * rng.range(0.5, 0.9), s * rng.range(0.7, 1.1), style === 'crystalhill' ? 'stone2' : 'stone', { x: jx, z: jz, y: y0 + h0 - s * 0.25, ry: rng.range(0, 3), rx: rng.soft() * 0.3, rz: rng.soft() * 0.3 },
        { bevel: s * 0.18, noise: s * 0.18, freq: 0.5, seed: rng.int(1, 9999), res: 1 });
    }
  }
  // boulders, grass tufts, crystals and era bits on the ledges
  const nRocks = Math.round(rocks * (W * D) / 260);
  for (let i = 0; i < nRocks; i++) {
    const x = rng.range(-W / 2 + 4, W / 2 - 4), z = rng.range(-D / 2 + 4, D / 2 - 4);
    const s = rng.range(2, 5.5);
    b.block(s, s * 0.7, s * rng.range(0.7, 1), 'stone', { x, z, y: y0 + surface(x, z) + s * 0.15, ry: rng.range(0, 3), rz: rng.soft() * 0.3 }, { bevel: s * 0.25, noise: s * 0.15, freq: 0.6, seed: rng.int(1, 9999) });
  }
  if (style === 'grass') for (let i = 0; i < (W * D) / 70; i++) {
    const x = rng.range(-W / 2 + 2, W / 2 - 2), z = rng.range(-D / 2 + 2, D / 2 - 2);
    tuft(b, x, z, y0 + surface(x, z) - 0.3, rng);
  }
  if (style === 'crystalhill') for (let i = 0; i < 2 + rocks * 4; i++) {
    const x = rng.range(-W / 2 + 6, W / 2 - 6), z = rng.range(-D / 2 + 6, D / 2 - 6);
    crystalCluster(b, x, y0 + surface(x, z) - 0.5, z, rng, 0.8);
  }
  if (style === 'crater') for (let i = 0; i < 3; i++) {
    const x = rng.range(-W / 3, W / 3), z = rng.range(-D / 3, D / 3);
    b.lathe([[0, 0], [5, 0], [4, 1.6], [3, 1.2], [0, 0.6]], 'stone2', { x, z, y: y0 + surface(x, z) - 0.4 }, 24);
  }
}

// ---------- bridges ----------

export function bridge(b: Builder, style: string, L: number, W: number, y0: number, c: Ctx) {
  const rng = c.rng.fork(81);
  const deckY = y0 + c.sq; // walking level one inch up
  if (style === 'stonearch') {
    // solid arch spanning the gap, parapets both sides, stones on the faces
    const span = L - c.sq * 0.9;
    const R = span / 2;
    const rise = Math.min(R, deckY - y0 - 3);
    const shape = new THREE.Shape();
    shape.moveTo(-L / 2, 0);
    shape.lineTo(-span / 2, 0);
    for (let i = 0; i <= 32; i++) {
      const a = Math.PI - (i / 32) * Math.PI;
      shape.lineTo(Math.cos(a) * R, Math.sin(a) * rise);
    }
    shape.lineTo(L / 2, 0);
    shape.lineTo(L / 2, deckY - y0);
    shape.lineTo(-L / 2, deckY - y0);
    shape.closePath();
    b.extrude(shape, W - 1.6, 'mortar', { y: y0 });
    for (const s of [-1, 1]) {
      // voussoirs
      const n = Math.round((Math.PI * R) / 5);
      for (let i = 0; i < n; i++) {
        const a = Math.PI - ((i + 0.5) / n) * Math.PI;
        b.block((Math.PI * R) / n - 0.6, 5, 2, 'stone', { x: Math.cos(a) * (R + 0.5), y: y0 + Math.sin(a) * (rise + 0.5) + 0.5, z: s * (W / 2 - 0.9), rz: Math.atan2(Math.sin(a) * rise / R, Math.cos(a)) - Math.PI / 2 }, { bevel: 0.5, noise: 0.25, seed: rng.int(1, 999) });
      }
      // parapet
      let x = -L / 2;
      while (x < L / 2 - 1) {
        const len = Math.min(rng.range(6, 10), L / 2 - x);
        b.block(len - 0.6, 6, 3, 'stone2', { x: x + len / 2, y: deckY + 3, z: s * (W / 2 - 1.5) }, { bevel: 0.6, noise: 0.3 + c.wear * 0.3, seed: rng.int(1, 999), chip: c.wear });
        x += len;
      }
    }
    floorSurface(b, 'cobble', L, W - 6, deckY - 1.2, c);
  } else if (style === 'plank' || style === 'rope' || style === 'organic') {
    if (style !== 'organic') {
      // trestle legs at both ends, planks across
      for (const e of [-1, 1]) for (const s of [-1, 1]) b.block(2.4, deckY - y0, 2.4, 'wood2', { x: e * (L / 2 - 3), z: s * (W / 2 - 2), y: (y0 + deckY) / 2 }, { bevel: 0.4, noise: 0.3, seed: rng.int(1, 99) });
      for (const s of [-1, 1]) b.block(L, 2, 2, 'wood2', { z: s * (W / 2 - 2), y: deckY - 2 }, { bevel: 0.4, noise: 0.2, seed: rng.int(1, 99) });
      const pw = 4.2;
      for (let x = -L / 2 + pw / 2; x < L / 2; x += pw + (style === 'rope' ? 0.9 : 0.35)) {
        if (c.wear > 0.5 && rng.chance((c.wear - 0.5) * 0.4)) continue;
        const sd = rng.int(1, 999);
        b.add(topBox(pw, 1.4, W - 0.6 + rng.soft(), 0.4, (gx, gz) => -0.16 * Math.pow(Math.abs(Math.sin(gx * 2.6 + fbm(gz * 0.05, gx * 0.3, 0, sd, 2) * 4)), 10)), rng.chance(0.5) ? 'wood' : 'wood2', { x, y: deckY - 1, ry: rng.soft() * 0.03 });
      }
      if (style === 'rope') for (const s of [-1, 1]) {
        for (const e of [-1, 1]) b.cyl(0.9, 0.9, 12, 'wood', { x: e * (L / 2 - 3), z: s * (W / 2 - 2), y: deckY + 6 }, 10);
        const pts = [];
        for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector3(-L / 2 + 3 + t * (L - 6), deckY + 11 - Math.sin(t * Math.PI) * 3, s * (W / 2 - 2))); }
        b.add(tube(new THREE.CatmullRomCurve3(pts), 48, 0.55, 6, false), 'cloth');
        for (let i = 1; i < 8; i++) { const p = pts[i * 2]; b.rod(p, new THREE.Vector3(p.x, deckY, p.z), 0.3, 'cloth', 5); }
      }
    } else {
      const g = heightSlab(L, W, 0.8, (x, z) => 2.4 + fbm(x * 0.15, z * 0.15, 0, c.seed, 3) * 0.6 - Math.pow(z / (W / 2), 4) * 1.2);
      b.add(g, 'organic', { y: deckY - 2.4 });
      for (const e of [-1, 1]) b.block(8, deckY - y0, W, 'organic', { x: e * (L / 2 - 4), y: (y0 + deckY) / 2 }, { bevel: 2, noise: 1.2, freq: 0.2, seed: 5 + e });
      for (const s of [-1, 1]) {
        const pts = [];
        for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(-L / 2 + 4 + t * (L - 8), deckY - 2 - Math.sin(t * Math.PI) * 4, s * (W / 2 - 1))); }
        b.add(tube(new THREE.CatmullRomCurve3(pts), 40, 1.6, 8, false), 'organic');
      }
    }
  } else {
    // metal: catwalk, truss, sci-fi gantry
    const deckT = 2.4;
    b.block(L, deckT, W - 1, 'metal2', { y: deckY - deckT / 2 }, { bevel: 0.5, res: 3 });
    const g = new Builder();
    for (let x = -L / 2 + 2; x < L / 2 - 1; x += 2.4) g.box(0.8, 1, W - 3, 'metal', { x, y: 0.5 });
    for (const p of g.parts) b.add(p.geo, p.mat, { y: deckY });
    for (const e of [-1, 1]) for (const s of [-1, 1]) b.box(2.4, deckY - y0, 2.4, 'metal', { x: e * (L / 2 - 2), z: s * (W / 2 - 2), y: (y0 + deckY) / 2 });
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - 1);
      // handrails and posts
      for (let x = -L / 2 + 1; x <= L / 2 - 1 + 0.01; x += c.sq / 2) b.cyl(0.6, 0.6, 12, 'metal2', { x, z, y: deckY + 6 }, 8);
      b.cyl(0.8, 0.8, L - 2, style === 'scifi' ? 'glow' : 'metal2', { z, y: deckY + 12, rz: Math.PI / 2 }, 10);
      b.cyl(0.5, 0.5, L - 2, 'metal2', { z, y: deckY + 6.5, rz: Math.PI / 2 }, 8);
      if (style === 'truss') {
        for (let x = -L / 2 + 2; x < L / 2 - 6; x += 6) b.rod(new THREE.Vector3(x, deckY - deckT, z), new THREE.Vector3(x + 6, deckY - deckT - 6, z), 0.6, 'metal', 6);
        b.cyl(0.8, 0.8, L - 4, 'metal', { z, y: deckY - deckT - 6, rz: Math.PI / 2 }, 8);
      }
      if (style === 'scifi') b.block(L - 4, 3, 1.6, 'metal', { z: s * (W / 2 - 0.2), y: deckY - 3 }, { bevel: 0.6, res: 3 });
    }
  }
}

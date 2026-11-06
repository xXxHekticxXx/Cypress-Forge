// The 3D build plate: realistic shading (fine surface detail, colour variation, ambient occlusion, soft
// shadows), a gridded board, pieces you can pick, drag, rotate and drop, and a 28 mm mini for scale.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Mat, Part } from '../gen/core';

export type Look = 'painted' | 'plastic';
export type ViewItem = { id: string; key: string; parts: () => Part[]; x: number; y: number; z: number; ry: number };

// Fine detail added in the shader (preview only): grain, pitting and colour mottling in world space.
const DETAIL: Partial<Record<Mat | 'plastic', [number, number, number]>> = {
  // [scale per mm, colour variation, bump strength]
  stone: [0.55, 0.16, 0.9], stone2: [0.55, 0.16, 0.9], mortar: [0.9, 0.12, 0.6], base: [0.7, 0.1, 0.5],
  wood: [0.35, 0.14, 0.5], wood2: [0.35, 0.14, 0.5], bark: [0.8, 0.2, 1.2], ground: [0.9, 0.2, 0.9], grass: [1.2, 0.22, 0.8],
  moss: [1.6, 0.25, 1.0], leaf: [1.4, 0.22, 0.9], metal: [0.6, 0.07, 0.25], metal2: [0.6, 0.08, 0.3], rust: [1.1, 0.25, 0.8],
  char: [1.2, 0.2, 1.1], organic: [0.5, 0.15, 0.6], cloth: [1.4, 0.1, 0.4], bone: [0.8, 0.08, 0.4], brass: [0.6, 0.06, 0.2],
  plastic: [1.2, 0.03, 0.15],
};

function detailMaterial(m: THREE.MeshStandardMaterial, kind: Mat | 'plastic') {
  const d = DETAIL[kind] ?? [0.6, 0.08, 0.3];
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uDetail = { value: new THREE.Vector3(...d) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
uniform vec3 uDetail;
float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(h3(i+vec3(0,0,0)),h3(i+vec3(1,0,0)),f.x), mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x), mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y), f.z); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float mott = fbm3(vWPos * uDetail.x * 0.35) - 0.5;
float speck = vn(vWPos * uDetail.x * 6.0) - 0.5;
diffuseColor.rgb *= 1.0 + mott * uDetail.y * 2.2 + speck * uDetail.y * 0.6;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float hh = fbm3(vWPos * uDetail.x * 2.0) * uDetail.z * 0.35;
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float hx = dFdx(hh), hy = dFdy(hh);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1) * faceDirection;
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad);
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor + (fbm3(vWPos * uDetail.x) - 0.5) * 0.25, 0.05, 1.0);`);
  };
  m.customProgramCacheKey = () => 'detail-' + kind;
  return m;
}

export class Viewport {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(32, 1, 1, 6000);
  controls: OrbitControls;
  board = new THREE.Group();
  content = new THREE.Group();
  mini = new THREE.Group();
  sun: THREE.DirectionalLight;
  composer: EffectComposer | null = null;
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private groups = new Map<string, { key: string; g: THREE.Group }>();
  private sel: THREE.Box3Helper | null = null;
  private selId: string | null = null;
  private raf = 0;
  private dirty = true;
  private ro: ResizeObserver;
  look: Look = 'painted';
  paint: Record<Mat, string> = {} as Record<Mat, string>;
  boardSize = { w: 12, d: 12, sq: 25.4 };
  // callbacks
  onSelect: (id: string | null) => void = () => {};
  onMove: (id: string, x: number, z: number) => void = () => {};
  snap: (id: string, x: number, z: number) => [number, number] = (_, x, z) => [x, z];
  private drag: { id: string; off: THREE.Vector3; moved: boolean; start: THREE.Vector2 } | null = null;
  private down: THREE.Vector2 | null = null;

  constructor(private host: HTMLElement, hq: boolean) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.hq = hq;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // shadows only change when pieces change, not when the camera turns
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    host.appendChild(this.renderer.domElement);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.42;
    this.scene.background = new THREE.Color('#15181C');
    this.scene.add(new THREE.HemisphereLight('#e6ecff', '#2a241e', 0.32));
    this.sun = new THREE.DirectionalLight('#fff1e0', 2.3);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(hq ? 4096 : 2048, hq ? 4096 : 2048);
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.25;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight('#a8c8ff', 0.55);
    rim.position.set(-300, 200, -400);
    this.scene.add(rim);
    this.scene.add(this.board, this.content, this.mini);
    this.buildMini();
    this.camera.position.set(260, 240, 300);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 25;
    this.controls.maxDistance = 2500;
    this.controls.addEventListener('change', () => { this.dirty = true; this.lastMove = performance.now(); });
    this.controls.addEventListener('start', () => { this.moving = true; this.lastMove = performance.now(); });
    this.controls.addEventListener('end', () => { this.moving = false; this.lastMove = performance.now(); });
    if (hq) {
      try {
        const rt = new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType });
        this.composer = new EffectComposer(this.renderer, rt);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        const ao = new GTAOPass(this.scene, this.camera, 1, 1);
        ao.updateGtaoMaterial({ radius: 6, distanceExponent: 1.5, thickness: 4, scale: 1.2 });
        ao.blendIntensity = 0.85;
        this.composer.addPass(ao);
        this.composer.addPass(new OutputPass());
      } catch { this.composer = null; }
    }
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    this.setBoard(12, 12, 25.4);
    this.bindPointer();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      const now = performance.now();
      // while the camera turns or a piece is dragged: quick, lower-resolution frames with no extra effects.
      // once it settles: one full-quality frame.
      const busy = this.moving || !!this.drag?.moved || now - this.lastMove < 180;
      if (this.shadowDirty && (!busy || now - this.lastShadow > 150)) {
        this.renderer.shadowMap.needsUpdate = true;
        this.shadowDirty = false;
        this.lastShadow = now;
        this.dirty = true;
      }
      if (busy) {
        if (this.dirty) {
          this.dirty = false;
          this.setFast(true);
          this.renderer.render(this.scene, this.camera);
          this.needFull = true;
        }
      } else if (this.dirty || this.needFull) {
        this.dirty = false;
        this.needFull = false;
        this.setFast(false);
        if (this.composer && this.aoOn) this.composer.render();
        else this.renderer.render(this.scene, this.camera);
      }
    };
    loop();
  }

  private hq = false;
  private moving = false;
  private lastMove = 0;
  private needFull = false;
  private shadowDirty = true;
  private lastShadow = 0;
  private fast = false;
  /** Pixel ratio that keeps the picture under a pixel budget (4K screens would otherwise draw 8+ million pixels a frame). */
  private ratio(fast: boolean) {
    const w = this.host.clientWidth || 1, h = this.host.clientHeight || 1;
    const budget = fast ? (this.hq ? 1.1e6 : 0.6e6) : this.hq ? 3.7e6 : 2.1e6;
    return Math.max(0.35, Math.min(window.devicePixelRatio || 1, this.hq ? 2 : 1.5, Math.sqrt(budget / (w * h))));
  }
  private setFast(on: boolean) {
    if (on === this.fast) return;
    this.fast = on;
    this.renderer.setPixelRatio(this.ratio(on));
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (w && h) this.renderer.setSize(w, h, false);
    // the effect pass stays at full-quality size; it is skipped while moving
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setPixelRatio(this.ratio(this.fast));
    this.renderer.setSize(w, h, false);
    this.composer?.setPixelRatio(this.ratio(false));
    this.composer?.setSize(w, h);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  private mat(m: Mat) {
    const key = this.look === 'plastic' ? 'plastic' : m;
    let mm = this.mats.get(key);
    if (!mm) {
      if (key === 'plastic') mm = detailMaterial(new THREE.MeshStandardMaterial({ color: '#A9ABAF', roughness: 0.58, metalness: 0, vertexColors: true }), 'plastic');
      else {
        const metal = m === 'metal' || m === 'metal2' || m === 'brass';
        const glow = m === 'glow';
        mm = detailMaterial(new THREE.MeshStandardMaterial({
          color: this.paint[m] ?? '#999',
          roughness: metal ? 0.38 : m === 'crystal' ? 0.12 : m === 'water' ? 0.05 : m === 'organic' ? 0.45 : m === 'leaf' || m === 'moss' ? 0.95 : 0.9,
          metalness: metal ? 0.7 : m === 'rust' ? 0.2 : 0,
          emissive: glow ? new THREE.Color(this.paint[m] ?? '#5ef') : new THREE.Color('#000'),
          emissiveIntensity: glow ? 1.1 : 0,
          transparent: m === 'crystal' || m === 'water',
          opacity: m === 'crystal' ? 0.9 : m === 'water' ? 0.85 : 1,
          vertexColors: true,
        }), m);
      }
      this.mats.set(key, mm);
    }
    return mm;
  }

  setLook(look: Look, paint: Record<Mat, string>) {
    if (look === this.look && JSON.stringify(paint) === JSON.stringify(this.paint)) return;
    this.look = look;
    this.paint = paint;
    this.mats.forEach((m) => m.dispose());
    this.mats.clear();
    this.content.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.mat((o.userData.mat ?? 'stone') as Mat);
    });
    this.dirty = true;
  }

  /** Builds the meshes for one piece: one mesh per material, each part slightly different in colour. */
  private meshes(parts: Part[]) {
    const group = new THREE.Group();
    const by = new Map<Mat, THREE.BufferGeometry[]>();
    parts.forEach((p, i) => {
      let g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      if (!g.attributes.normal) g.computeVertexNormals();
      // per-stone/per-plank tint so neighbours aren't identical
      const h = Math.sin(i * 127.1 + parts.length * 3.7) * 43758.5453;
      const t = h - Math.floor(h);
      const k = 0.86 + t * 0.24, warm = (t - 0.5) * 0.06;
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) { col[v * 3] = k + warm; col[v * 3 + 1] = k; col[v * 3 + 2] = k - warm; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      if (!by.has(p.mat)) by.set(p.mat, []);
      by.get(p.mat)!.push(g);
    });
    for (const [m, list] of by) {
      const mesh = new THREE.Mesh(mergeGeometries(list, false)!, this.mat(m));
      mesh.userData.mat = m;
      mesh.castShadow = m !== 'glow' && m !== 'water';
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }

  /** Show the board's pieces. Only pieces whose settings changed are rebuilt. */
  setItems(items: ViewItem[]) {
    const seen = new Set<string>();
    for (const it of items) {
      seen.add(it.id);
      let e = this.groups.get(it.id);
      if (!e || e.key !== it.key) {
        if (e) { this.content.remove(e.g); e.g.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); }
        const g = this.meshes(it.parts());
        g.userData.id = it.id;
        this.content.add(g);
        e = { key: it.key, g };
        this.groups.set(it.id, e);
      }
      e.g.position.set(it.x, it.y, it.z);
      e.g.rotation.y = it.ry;
    }
    for (const [id, e] of this.groups) if (!seen.has(id)) {
      this.content.remove(e.g);
      e.g.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.groups.delete(id);
    }
    this.updateSel();
    this.fitShadows();
    this.shadowDirty = true;
    this.dirty = true;
  }

  select(id: string | null) {
    this.selId = id;
    this.updateSel();
    this.dirty = true;
  }

  private updateSel() {
    if (this.sel) { this.scene.remove(this.sel); this.sel = null; }
    const e = this.selId ? this.groups.get(this.selId) : null;
    if (!e) return;
    const box = new THREE.Box3().setFromObject(e.g).expandByScalar(0.8);
    this.sel = new THREE.Box3Helper(box, new THREE.Color('#E0A33D'));
    this.scene.add(this.sel);
  }

  private fitShadows() {
    const box = new THREE.Box3().setFromObject(this.board).union(new THREE.Box3().setFromObject(this.content));
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.z, s.y) * 0.75 + 20;
    this.sun.position.set(c.x + r * 0.9, r * 1.9 + 60, c.z + r * 0.6);
    this.sun.target.position.copy(c);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -r * 1.3;
    cam.right = cam.top = r * 1.3;
    cam.near = 1;
    cam.far = r * 6 + 300;
    cam.updateProjectionMatrix();
  }

  setBoard(w: number, d: number, sq: number) {
    this.boardSize = { w, d, sq };
    this.board.clear();
    const W = w * sq, D = d * sq;
    const plate = new THREE.Mesh(new THREE.BoxGeometry(W + 16, 4, D + 16), new THREE.MeshStandardMaterial({ color: this.plateColor, roughness: 0.85 }));
    plate.position.y = -2.02;
    plate.receiveShadow = true;
    this.board.add(plate);
    const pts: number[] = [];
    for (let x = 0; x <= w; x++) pts.push(-W / 2 + x * sq, 0.02, -D / 2, -W / 2 + x * sq, 0.02, D / 2);
    for (let z = 0; z <= d; z++) pts.push(-W / 2, 0.02, -D / 2 + z * sq, W / 2, 0.02, -D / 2 + z * sq);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#3A4049', transparent: true, opacity: 0.9 }));
    lines.visible = this.gridOn;
    this.board.add(lines);
    this.mini.position.set(-W / 2 - 22, 0, D / 2 - 12);
    this.fitShadows();
    this.shadowDirty = true;
    this.dirty = true;
  }

  plateColor = '#23272E';
  aoOn = true;
  setBackground(bg: string, plate: string) {
    this.scene.background = new THREE.Color(bg);
    this.plateColor = plate;
    const m = (this.board.children[0] as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
    m?.color.set(plate);
    this.dirty = true;
  }
  setShadows(on: boolean) { this.sun.castShadow = on; this.shadowDirty = true; this.dirty = true; }
  setAO(on: boolean) { this.aoOn = on; this.dirty = true; }
  setRotateSpeed(v: number) { this.controls.rotateSpeed = v; this.controls.zoomSpeed = v; }
  gridOn = true;
  setGrid(on: boolean) { this.gridOn = on; this.board.children[1] && (this.board.children[1].visible = on); this.dirty = true; }
  setMini(on: boolean) { this.mini.visible = on; this.shadowDirty = true; this.dirty = true; }

  /** Point the camera at one piece, or at the whole board. */
  frame(id?: string | null) {
    const e = id ? this.groups.get(id) : null;
    const box = e ? new THREE.Box3().setFromObject(e.g) : new THREE.Box3().setFromObject(this.board).union(new THREE.Box3().setFromObject(this.content));
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y * 1.3, s.z) * 0.75 + 15;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(c).setY(s.y * 0.3 + box.min.y);
    this.camera.position.copy(this.controls.target).addScaledVector(dir, r * 2.2);
    this.dirty = true;
  }

  /** Board point under the mouse (y = 0 plane). */
  groundAt(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  private pick(clientX: number, clientY: number) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.camera);
    const hit = rc.intersectObjects(this.content.children, true)[0];
    if (!hit) return null;
    let o: THREE.Object3D | null = hit.object;
    while (o && !o.userData.id) o = o.parent;
    return o ? (o.userData.id as string) : null;
  }

  private bindPointer() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (ev) => {
      this.down = new THREE.Vector2(ev.clientX, ev.clientY);
      const id = this.pick(ev.clientX, ev.clientY);
      if (id && (id === this.selId || ev.button === 0)) {
        const e = this.groups.get(id)!;
        const g = this.groundAt(ev.clientX, ev.clientY);
        if (g) {
          this.drag = { id, off: e.g.position.clone().sub(g).setY(0), moved: false, start: this.down.clone() };
          this.controls.enabled = false;
          el.setPointerCapture(ev.pointerId);
        }
        if (id !== this.selId) { this.selId = id; this.onSelect(id); this.updateSel(); this.dirty = true; }
      }
    });
    el.addEventListener('pointermove', (ev) => {
      if (!this.drag) return;
      if (!this.drag.moved && this.drag.start.distanceTo(new THREE.Vector2(ev.clientX, ev.clientY)) < 6) return;
      this.drag.moved = true;
      const g = this.groundAt(ev.clientX, ev.clientY);
      if (!g) return;
      const e = this.groups.get(this.drag.id);
      if (!e) return;
      const [x, z] = this.snap(this.drag.id, g.x + this.drag.off.x, g.z + this.drag.off.z);
      if (e.g.position.x !== x || e.g.position.z !== z) this.shadowDirty = true;
      e.g.position.x = x;
      e.g.position.z = z;
      this.updateSel();
      this.dirty = true;
    });
    const up = (ev: PointerEvent) => {
      if (this.drag) {
        const e = this.groups.get(this.drag.id);
        if (this.drag.moved && e) this.onMove(this.drag.id, e.g.position.x, e.g.position.z);
        this.drag = null;
        this.controls.enabled = true;
        try { el.releasePointerCapture(ev.pointerId); } catch { /* not captured */ }
      } else if (this.down && this.down.distanceTo(new THREE.Vector2(ev.clientX, ev.clientY)) < 5) {
        // a click on empty board clears the selection
        if (!this.pick(ev.clientX, ev.clientY)) { this.selId = null; this.onSelect(null); this.updateSel(); this.dirty = true; }
      }
      this.down = null;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  private buildMini() {
    // a generic 28 mm adventurer on a 25 mm base, for scale
    const m = new THREE.MeshStandardMaterial({ color: '#5D7FA8', roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: '#D8B08C', roughness: 0.7 });
    const add = (g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rz = 0) => {
      const mesh = new THREE.Mesh(g, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.z = rz;
      mesh.castShadow = true;
      this.mini.add(mesh);
    };
    add(new THREE.CylinderGeometry(12.5, 12.5, 3, 40), new THREE.MeshStandardMaterial({ color: '#2B2F36', roughness: 0.8 }), 0, 1.5, 0);
    add(new THREE.CylinderGeometry(2.6, 3.4, 13, 16), m, 0, 9.5, 0);
    add(new THREE.CylinderGeometry(4, 6.5, 14, 20), m, 0, 16, -0.6);
    add(new THREE.SphereGeometry(3.2, 20, 16), skin, 0, 26.6, 0);
    add(new THREE.CylinderGeometry(1.1, 1.1, 11, 10), m, 5.6, 19, 0, 0.35);
    add(new THREE.BoxGeometry(0.8, 16, 0.4), new THREE.MeshStandardMaterial({ color: '#C9CDD3', metalness: 0.7, roughness: 0.3 }), 8, 22, 2, 0.1);
  }

  /** JPEG of the current view, or of one piece on its own (for print-set cards). */
  snapshot(w = 220, h = 160) {
    this.setFast(false);
    if (this.composer) this.composer.render(); else this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const s = Math.max(w / src.width, h / src.height);
    ctx.drawImage(src, (w - src.width * s) / 2, (h - src.height * s) / 2, src.width * s, src.height * s);
    return c.toDataURL('image/jpeg', 0.82);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
  }
}

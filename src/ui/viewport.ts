// The 3D view: lights, shadows, painted or plain-plastic look, a 28 mm mini for scale, and orbit controls.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeByMat, type Mat, type Part } from '../gen/core';

export type Look = 'painted' | 'plastic';

export class Viewport {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(35, 1, 1, 4000);
  controls: OrbitControls;
  content = new THREE.Group();
  grid: THREE.Group = new THREE.Group();
  mini = new THREE.Group();
  sun: THREE.DirectionalLight;
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  private raf = 0;
  private dirty = true;
  private ro: ResizeObserver;
  look: Look = 'painted';
  paint: Record<Mat, string> = {} as Record<Mat, string>;
  private lastRadius = 60;

  constructor(private host: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    host.appendChild(this.renderer.domElement);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.45;
    this.scene.background = new THREE.Color('#1A1D22');
    this.scene.add(new THREE.HemisphereLight('#dfe6ff', '#2a2420', 0.35));
    this.sun = new THREE.DirectionalLight('#fff4e6', 2.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.3;
    this.scene.add(this.sun, this.sun.target);
    const rim = new THREE.DirectionalLight('#9ec5ff', 0.6);
    rim.position.set(-120, 80, -160);
    this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.ShadowMaterial({ opacity: 0.35 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    this.scene.add(ground, this.grid, this.content, this.mini);
    this.buildMini();
    this.camera.position.set(110, 95, 120);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 20;
    this.controls.maxDistance = 1200;
    this.controls.addEventListener('change', () => (this.dirty = true));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      if (this.dirty) {
        this.renderer.render(this.scene, this.camera);
        this.dirty = false;
      }
    };
    loop();
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
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
      if (key === 'plastic') mm = new THREE.MeshStandardMaterial({ color: '#A7A9AD', roughness: 0.55, metalness: 0.0 });
      else {
        const metal = m === 'metal' || m === 'metal2' || m === 'brass';
        const glow = m === 'glow';
        mm = new THREE.MeshStandardMaterial({
          color: this.paint[m] ?? '#999',
          roughness: metal ? 0.42 : m === 'crystal' ? 0.15 : m === 'organic' ? 0.5 : 0.88,
          metalness: metal ? 0.65 : 0,
          emissive: glow ? new THREE.Color(this.paint[m] ?? '#5ef') : new THREE.Color('#000'),
          emissiveIntensity: glow ? 0.9 : 0,
          transparent: m === 'crystal',
          opacity: m === 'crystal' ? 0.92 : 1,
        });
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

  /** Show one or more pieces. Each entry may be placed (room preview). */
  show(items: { parts: Part[]; x?: number; y?: number; z?: number; ry?: number }[], frame: boolean) {
    this.content.children.forEach((g) => g.traverse((o) => (o as THREE.Mesh).geometry?.dispose()));
    this.content.clear();
    for (const it of items) {
      const group = new THREE.Group();
      for (const [m, geo] of mergeByMat(it.parts)) {
        const mesh = new THREE.Mesh(geo, this.mat(m));
        mesh.userData.mat = m;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      group.position.set(it.x ?? 0, it.y ?? 0, it.z ?? 0);
      group.rotation.y = it.ry ?? 0;
      this.content.add(group);
    }
    const box = new THREE.Box3().setFromObject(this.content);
    if (box.isEmpty()) box.set(new THREE.Vector3(-10, 0, -10), new THREE.Vector3(10, 10, 10));
    // the mini stands just in front-left of the piece and is part of the framing
    this.mini.position.set(box.min.x - 16, 0, box.max.z + 4);
    if (this.mini.visible) box.union(new THREE.Box3().setFromObject(this.mini));
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y * 1.4, size.z) * 0.75 + 12;
    // shadows follow the piece
    this.sun.position.set(center.x + radius * 1.1, radius * 2.2 + 40, center.z + radius * 0.7);
    this.sun.target.position.copy(center);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -radius * 1.4;
    cam.right = cam.top = radius * 1.4;
    cam.near = 1;
    cam.far = radius * 6 + 200;
    cam.updateProjectionMatrix();
    this.drawGrid(box);
    if (frame || Math.abs(radius - this.lastRadius) > this.lastRadius * 0.35) {
      const dir = this.camera.position.clone().sub(this.controls.target).normalize();
      if (dir.lengthSq() < 0.1) dir.set(0.6, 0.55, 0.6).normalize();
      this.controls.target.copy(center).setY(size.y * 0.3);
      this.camera.position.copy(this.controls.target).addScaledVector(dir, radius * 2.1);
      this.lastRadius = radius;
    }
    this.dirty = true;
    return { size, box };
  }

  private drawGrid(box: THREE.Box3) {
    this.grid.clear();
    const sq = 25.4;
    const pad = 3;
    const x0 = Math.floor(box.min.x / sq) - pad, x1 = Math.ceil(box.max.x / sq) + pad;
    const z0 = Math.floor(box.min.z / sq) - pad, z1 = Math.ceil(box.max.z / sq) + pad;
    const pts: number[] = [];
    for (let x = x0; x <= x1; x++) pts.push(x * sq, 0, z0 * sq, x * sq, 0, z1 * sq);
    for (let z = z0; z <= z1; z++) pts.push(x0 * sq, 0, z * sq, x1 * sq, 0, z * sq);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.grid.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#2E333B', transparent: true, opacity: 0.9 })));
  }

  setGrid(on: boolean) { this.grid.visible = on; this.dirty = true; }
  setMini(on: boolean) { this.mini.visible = on; this.dirty = true; }

  private buildMini() {
    // a generic 28 mm adventurer on a 25 mm base: tells you the scale at a glance
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
    this.mini.visible = true;
  }

  /** PNG of the current view (for thumbnails). */
  snapshot(w = 220, h = 160) {
    this.renderer.render(this.scene, this.camera);
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

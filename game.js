import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const fmt = (n) => Math.round(n).toLocaleString('it-IT');
const smooth = (x) => x * x * (3 - 2 * x);
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : Number(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch {} }
};
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/*  gear + upgrades                                                    */
/* ------------------------------------------------------------------ */
const GEAR = {
  yart: {
    name: 'YART', sub: 'box mod', kind: 'vape', model: 'box', h: 2.0,
    pts: 1.0, fill: 50, zone: 22, liquidRate: 3.2, batteryRate: 1.5,
    badge: '', color: '#c9ff4f'
  },
  joint: {
    name: 'ERBA NATURALE', sub: 'blunt', kind: 'herb', model: 'cigar', h: 1.95,
    pts: 1.5, fill: 44, zone: 26, idle: 1.9, hit: 2.1,
    badge: 'NATURALE', color: '#a8d96b'
  },
  kiwi: {
    name: 'KIWI SPARK', sub: 'pod ricaricabile', kind: 'vape', model: 'pod', h: 2.0,
    pts: 1.15, fill: 54, zone: 25, liquidRate: 4.2, batteryRate: 1.6, refills: 2,
    badge: 'REFILL ×2', color: '#9dff3d'
  },
  ninopuff: {
    name: 'NINOPUFF', sub: 'pod premium', kind: 'vape', model: 'pod', h: 2.0,
    pts: 1.45, fill: 60, zone: 18, liquidRate: 3.6, batteryRate: 2.0,
    badge: 'PREMIUM', color: '#b06bff'
  },
  cig: {
    name: 'SIGARETTA', sub: 'tabacco', kind: 'herb', model: 'cig', h: 2.15,
    pts: 1.8, fill: 66, zone: 17, idle: 3.6, hit: 2.6,
    badge: 'HARSH', color: '#ffb27a'
  }
};
const GEAR_ORDER = ['yart', 'joint', 'kiwi', 'ninopuff', 'cig'];
const GEAR_IDS = Object.keys(GEAR);

const UPGRADES = [
  { id: 'lungs', name: 'POLMONI D’ACCIAIO', desc: '+1 polmone (fino a 5)', cost: 140, max: 2 },
  { id: 'zone', name: 'BOCCA LARGA', desc: 'zona perfetta +14%', cost: 110, max: 4 },
  { id: 'calm', name: 'CALMA', desc: 'inalata -9% velocità', cost: 100, max: 3 },
  { id: 'dense', name: 'FUMO DENSO', desc: 'punti +15%', cost: 150, max: 5 },
  { id: 'chain', name: 'CATENA LUNGA', desc: 'la catena dura 4s in più', cost: 120, max: 3 },
  { id: 'hand', name: 'MANO FREDDA', desc: 'bonus perfetto +30%', cost: 120, max: 4 },
  { id: 'refill', name: 'RICAMBIO', desc: '+1 refill e -8% consumo', cost: 130, max: 3 },
  { id: 'lighter', name: 'ACCENDINO TURBO', desc: 'accensione rapida, brucia -8%', cost: 100, max: 3 }
];

/* ------------------------------------------------------------------ */
/*  state                                                              */
/* ------------------------------------------------------------------ */
const S = {
  mode: 'title',
  ready: false,
  score: 0,
  cash: 0,
  time: 0,
  chain: 1,
  maxChain: 1,
  lung: 0,
  lost: 0,
  maxLungs: 3,
  holding: false,
  needRelease: false,
  lock: 0,
  zoneC: 76,
  zoneW: 22,
  fillRate: 50,
  lastPerfect: 0,
  shake: 0,
  glow: 0,
  pop: 0,
  ember: 0,
  round: 1,
  gearId: 'yart',
  liquid: 100,
  battery: 100,
  burn: 0,
  refills: 0,
  igniteT: 0,
  igniteDur: 1,
  endT: 0,
  upg: { lungs: 0, zone: 0, calm: 0, dense: 0, chain: 0, hand: 0, refill: 0, lighter: 0 },
  best: store.get('yart.best', 0),
  bestTime: store.get('yart.bestTime', 0),
  bestRound: store.get('yart.bestRound', 1)
};

/* ------------------------------------------------------------------ */
/*  audio (synth, zero assets)                                         */
/* ------------------------------------------------------------------ */
const sfx = {
  ctx: null, master: null, noise: null, inhale: null, muted: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      const ctx = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(ctx.destination);
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
      this.noise = buf;
    } catch {}
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {}); },
  startInhale() {
    if (!this.ctx || this.muted) return;
    this.stopInhale(0.06);
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 720; bp.Q.value = 0.9;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp).connect(g).connect(this.master);
    src.start();
    g.gain.setTargetAtTime(0.15, ctx.currentTime, 0.07);
    bp.frequency.setTargetAtTime(1150, ctx.currentTime, 0.45);
    this.inhale = { src, g, bp };
  },
  tension(k) {
    if (this.inhale) this.inhale.bp.frequency.setTargetAtTime(700 + k * 1000, this.ctx.currentTime, 0.1);
  },
  stopInhale(fade = 0.14) {
    if (!this.inhale || !this.ctx) return;
    const { src, g } = this.inhale;
    const t = this.ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setTargetAtTime(0, t, fade / 3);
      src.stop(t + fade);
    } catch {}
    this.inhale = null;
  },
  tone(freq, dur, type = 'sine', vol = 0.11, delay = 0) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = 0;
    o.connect(g).connect(this.master);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  },
  perfect(level) {
    const base = [523.25, 587.33, 659.25, 783.99][level % 4];
    this.tone(base, 0.3, 'sine', 0.1);
    this.tone(base * 1.5, 0.28, 'sine', 0.075, 0.045);
  },
  cough() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.5);
    this.tone(70, 0.3, 'sine', 0.22);
  },
  click() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.08);
    this.tone(320, 0.05, 'square', 0.06);
  },
  flame() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noise; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.7;
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2200, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.55);
  },
  fizzle() {
    if (!this.ctx || this.muted) return;
    this.tone(220, 0.25, 'sawtooth', 0.05);
    this.tone(140, 0.35, 'sine', 0.09, 0.06);
  },
  shop() { this.tone(523, 0.16, 'triangle', 0.07); this.tone(784, 0.22, 'triangle', 0.06, 0.08); },
  buy() { this.tone(659, 0.14, 'triangle', 0.09); this.tone(880, 0.2, 'triangle', 0.08, 0.07); this.tone(1174, 0.25, 'sine', 0.06, 0.14); },
  refill() { this.tone(440, 0.12, 'square', 0.05); this.tone(660, 0.16, 'square', 0.04, 0.07); },
  ui() { this.tone(880, 0.12, 'triangle', 0.06); }
};

function haptic(ms) {
  if (prefersReduced) return;
  try { navigator.vibrate?.(ms); } catch {}
}

/* ------------------------------------------------------------------ */
/*  three.js scene                                                     */
/* ------------------------------------------------------------------ */
const canvas = $('stage');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.localClippingEnabled = true;
} catch {
  $('startBtn').textContent = 'WEBGL NON DISPONIBILE';
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0a0413, 0.055);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 60);
camera.position.set(0, 0.25, 8);

const CONTENT_W = 2.7, CONTENT_H = 4.4;

function resize() {
  if (!renderer) return;
  const w = innerWidth, h = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  const fov = (camera.fov * Math.PI) / 180;
  const distH = (CONTENT_H / 2) / Math.tan(fov / 2);
  const distW = (CONTENT_W / 2) / (Math.tan(fov / 2) * camera.aspect);
  camera.position.z = Math.max(distH, distW) * 1.05;
  camera.position.y = 0.25;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 120));

if (renderer) {
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
}

/* lights */
scene.add(new THREE.HemisphereLight(0xb49bff, 0x180024, 1.0));
const keyLight = new THREE.DirectionalLight(0xffffff, 2.6);
keyLight.position.set(3.5, 4.5, 6);
scene.add(keyLight);
const fillLight = new THREE.PointLight(0xbfe4ff, 14, 12, 2);
fillLight.position.set(2.6, 0.4, 4);
scene.add(fillLight);
const rimLight = new THREE.PointLight(0xff4f9d, 30, 15, 2);
rimLight.position.set(-3.2, 2.2, -2);
scene.add(rimLight);
const underLight = new THREE.PointLight(0x9fff5c, 12, 8, 2);
underLight.position.set(0.4, -1.6, 1.8);
scene.add(underLight);

/* glow sprites */
function radialTexture(stops) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  for (const [p, col] of stops) grd.addColorStop(p, col);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowTex = radialTexture([[0, 'rgba(255,255,255,.95)'], [0.35, 'rgba(170,255,120,.45)'], [1, 'rgba(120,255,120,0)']]);
const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: 0x9dff6a, transparent: true, opacity: 0.5,
  blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
}));
glowSprite.scale.set(8, 8, 1);
glowSprite.position.set(0.4, 0.55, -2.4);
scene.add(glowSprite);

const glowPink = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: 0xff4f9d, transparent: true, opacity: 0.28,
  blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
}));
glowPink.scale.set(5.5, 5.5, 1);
glowPink.position.set(-2.2, 1.4, -3.2);
scene.add(glowPink);

const rig = new THREE.Group();
scene.add(rig);
const gearRoot = new THREE.Group();
gearRoot.position.set(0.1, 0.3, 0);
rig.add(gearRoot);

/* ------------------------------------------------------------------ */
/*  models                                                             */
/* ------------------------------------------------------------------ */
let plantObj = null;
let smokeTemplate = null;
const wisps = [];
const clouds = [];
const models = {};

const sourceMap = { box: 'vape', pod: 'pod', cigar: 'cigar', cig: 'cig' };
let gearObj = null, gearMats = [], clipPlane = null, tipAnchor = null;
let lighterGroup = null, flameSprite = null, flameLight = null, emberSprite = null, emberLight = null;

function normalizeHeight(obj, targetH) {
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const s = targetH / Math.max(size.y, 1e-5);
  obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(obj);
  const center = box2.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  obj.updateMatrixWorld(true);
  return targetH;
}

function buildFallbackVape() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 1.0, 0.34),
    new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.5, metalness: 0.4 })
  );
  body.position.y = -0.2;
  g.add(body);
  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.17, 0.6, 12),
    new THREE.MeshStandardMaterial({ color: 0x8fd0ff, roughness: 0.15, metalness: 0.1, emissive: 0x2a6c99, emissiveIntensity: 0.4 })
  );
  tank.position.y = 0.6;
  g.add(tank);
  const tip = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.13, 0.16, 10),
    new THREE.MeshStandardMaterial({ color: 0x15151f, roughness: 0.7 })
  );
  tip.position.y = 0.95;
  g.add(tip);
  return g;
}

const POD_SKINS = {
  ninopuff: { mat23: 0x2a1740, mat13: 0xb06bff, mat3: 0xff4f9d, mat16: 0x46305e },
  kiwi: { mat23: 0x24360f, mat13: 0x9dff3d, mat3: 0xd8ff8a, mat16: 0x3c5c22 }
};

function recolor(obj, id) {
  const skin = POD_SKINS[id];
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mat = o.material;
    if (skin && skin[mat.name] != null && mat.color) {
      mat.color.setHex(skin[mat.name]);
      if (mat.emissive) mat.emissive.setHex(skin[mat.name]);
      if (mat.emissive) mat.emissiveIntensity = mat.name === 'mat23' ? 0.3 : 0.14;
      return;
    }
    if (id === 'joint' && mat.color) {
      const h = mat.color.getHex();
      if (h !== 0x000000) mat.color.lerp(new THREE.Color(0x8fb35a), 0.3);
    }
  });
}

function disposeGear() {
  if (!gearObj) return;
  gearRoot.remove(gearObj);
  for (const m of gearMats) { try { m.dispose(); } catch {} }
  gearObj = null;
  gearMats = [];
  clipPlane = null;
}

function buildGearMesh(id) {
  disposeGear();
  const g = GEAR[id];
  const gltf = models[sourceMap[g.model]];
  const obj = gltf ? gltf.scene.clone(true) : buildFallbackVape();

  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.material.side = THREE.FrontSide;
    gearMats.push(o.material);
  });
  if (g.model === 'cigar' || g.model === 'cig') obj.rotation.x = -Math.PI / 2;
  recolor(obj, id);
  normalizeHeight(obj, g.h);
  gearObj = obj;
  gearRoot.add(obj);

  gearRoot.rotation.set(0.04, g.kind === 'herb' ? -0.55 : g.model === 'pod' ? 0.5 : -0.38, g.kind === 'herb' ? -0.42 : -0.1);

  if (!tipAnchor) {
    tipAnchor = new THREE.Object3D();
    gearRoot.add(tipAnchor);
  }
  tipAnchor.position.set(g.kind === 'herb' ? 0 : 0.0, g.h / 2 - 0.02, g.kind === 'herb' ? 0 : 0.05);

  if (g.kind === 'herb') {
    clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 50);
    for (const m of gearMats) { m.clippingPlanes = [clipPlane]; m.clipShadows = true; }
  }
}

function buildPlant(gltf) {
  plantObj = gltf.scene;
  plantObj.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.roughness = 0.95;
      if (o.material.color) o.material.color.multiplyScalar(0.8);
      o.material.emissive = new THREE.Color(0x0d2408);
      o.material.emissiveIntensity = 0.6;
    }
  });
  normalizeHeight(plantObj, 2.2);
  plantObj.position.set(-1.35, -1.8, -1.9);
  plantObj.rotation.y = 0.55;
  rig.add(plantObj);
}

/* smoke */
function wispMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0xeefff6, transparent: true, opacity: 0.45, depthWrite: false, fog: false });
}

function buildSmoke(gltf) {
  smokeTemplate = gltf ? gltf.scene : (() => {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), wispMaterial());
    const g = new THREE.Group(); g.add(m); return g;
  })();
  const POOL = 18;
  for (let i = 0; i < POOL; i++) {
    const obj = smokeTemplate.clone(true);
    const mat = wispMaterial();
    obj.traverse((o) => { if (o.isMesh) o.material = mat; });
    obj.visible = false;
    scene.add(obj);
    wisps.push({
      obj, mat, base: 0, life: 0, ttl: 1, growth: 1.4,
      vel: new THREE.Vector3(), spin: new THREE.Vector3(), s0: 0.4
    });
  }
  const spots = [
    { p: [1.9, 1.15, -3.2], s: 1.8, o: 0.07, r: 0.4 },
    { p: [-2.0, 1.15, -3.6], s: 1.4, o: 0.05, r: -0.7 }
  ];
  for (const spot of spots) {
    const obj = smokeTemplate.clone(true);
    const mat = wispMaterial();
    mat.opacity = spot.o;
    obj.traverse((o) => { if (o.isMesh) o.material = mat; });
    obj.position.set(...spot.p);
    obj.rotation.set(spot.r, spot.r * 1.4, 0);
    obj.scale.setScalar(spot.s);
    scene.add(obj);
    clouds.push({ obj, base: spot.p[1], phase: Math.random() * 6.28 });
  }
}

function buildLighter(gltf) {
  lighterGroup = new THREE.Group();
  if (gltf) {
    const m = gltf.scene.clone(true);
    m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); } });
    normalizeHeight(m, 0.62);
    lighterGroup.add(m);
  } else {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.16),
      new THREE.MeshStandardMaterial({ color: 0x2f6bff, roughness: 0.5 }));
    lighterGroup.add(m);
  }
  flameSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffb35c, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
  }));
  flameSprite.scale.set(0.26, 0.44, 1);
  flameSprite.position.set(0, 0.4, 0);
  lighterGroup.add(flameSprite);
  flameLight = new THREE.PointLight(0xff8a3d, 0, 2.4, 2);
  flameLight.position.set(0, 0.45, 0.1);
  lighterGroup.add(flameLight);
  lighterGroup.visible = false;
  gearRoot.add(lighterGroup);
}

function buildEmber() {
  emberSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xff5a1a, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
  }));
  emberSprite.scale.set(0.42, 0.42, 1);
  emberSprite.visible = false;
  gearRoot.add(emberSprite);
  emberLight = new THREE.PointLight(0xff6a2a, 0, 2.2, 2);
  emberLight.visible = false;
  gearRoot.add(emberLight);
}

/* ------------------------------------------------------------------ */
/*  particles                                                          */
/* ------------------------------------------------------------------ */
function spawnWisp(pos, { s = 0.32, ttl = 1.7, opacity = 0.5, growth = 1.6, spread = 0.5, up = 0.9, z = 0 } = {}) {
  if (!wisps.length) return;
  let w = null;
  for (const it of wisps) if (it.life <= 0) { w = it; break; }
  if (!w) w = wisps[Math.floor(Math.random() * wisps.length)];
  w.life = 1;
  w.ttl = ttl;
  w.base = opacity;
  w.s0 = s;
  w.growth = growth;
  w.obj.position.copy(pos);
  w.obj.position.x += rand(-0.08, 0.08);
  w.obj.position.z += z + rand(-0.1, 0.1);
  w.obj.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28), 'XYZ');
  w.obj.scale.setScalar(s);
  w.obj.visible = true;
  w.mat.opacity = opacity;
  w.vel.set(rand(-spread, spread), rand(0.5, 1) * up, rand(-spread * 0.4, spread * 0.2));
  w.spin.set(rand(-0.6, 0.6), rand(-0.8, 0.8), rand(-0.5, 0.5));
}

function updateWisps(dt) {
  for (const w of wisps) {
    if (w.life <= 0) continue;
    w.life -= dt / w.ttl;
    if (w.life <= 0) { w.obj.visible = false; continue; }
    const k = 1 - w.life;
    w.obj.position.addScaledVector(w.vel, dt);
    w.vel.y += 0.22 * dt;
    w.obj.rotation.x += w.spin.x * dt;
    w.obj.rotation.y += w.spin.y * dt;
    w.obj.rotation.z += w.spin.z * dt;
    w.obj.scale.setScalar(w.s0 * (1 + k * w.growth));
    w.mat.opacity = w.base * Math.sin(Math.min(1, w.life * 2.2) * Math.PI * 0.5) * (1 - k * 0.35);
  }
}

/* ------------------------------------------------------------------ */
/*  UI refs                                                            */
/* ------------------------------------------------------------------ */
const el = {
  score: $('score'), best: $('bestVal'), time: $('time'),
  chain: $('chain'), zone: $('zone'), fill: $('fill'),
  hint: $('hint'), callout: $('callout'), lives: $('lives'),
  cash: $('cash'), cashWrap: $('cashWrap'),
  gearName: $('gearName'), gearSub: $('gearSub'), gearBadge: $('gearBadge'),
  round: $('round'), rowA: $('rowA'), rowB: $('rowB'),
  kA: $('kA'), kB: $('kB'), vA: $('vA'), vB: $('vB'), tA: $('tA'), tB: $('tB'),
  start: $('startScreen'), over: $('overScreen'), credits: $('creditsScreen'),
  shop: $('shopScreen'), shopRound: $('shopRound'), shopGear: $('shopGear'),
  shopCash: $('shopCash'), shopCards: $('shopCards'), nextGear: $('nextGear'),
  startBtn: $('startBtn'), againBtn: $('againBtn'), skipBtn: $('skipBtn'),
  overScore: $('overScore'), overTime: $('overTime'), overRound: $('overRound'),
  overBest: $('overBest'), recordBadge: $('recordBadge')
};
el.best.textContent = fmt(S.best);

/* ------------------------------------------------------------------ */
/*  HUD                                                                */
/* ------------------------------------------------------------------ */
function renderLives() {
  el.lives.innerHTML = '';
  for (let i = 0; i < S.maxLungs; i++) {
    const s = document.createElement('span');
    s.className = i < S.maxLungs - S.lost ? 'on' : 'lost';
    el.lives.appendChild(s);
  }
}

let lastChain = 1;
function updateHUD() {
  el.score.textContent = fmt(S.score);
  el.time.textContent = S.time.toFixed(1);
  el.cash.textContent = Math.floor(S.cash);
  el.cashWrap.classList.toggle('hide', S.mode === 'title');
  el.round.textContent = S.round;

  if (S.chain !== lastChain) {
    el.chain.innerHTML = 'CATENA <b>×' + S.chain + '</b>';
    el.chain.classList.toggle('max', S.chain >= 10);
    document.body.classList.toggle('high', S.chain >= 6);
    lastChain = S.chain;
  }

  const zl = S.zoneC - S.zoneW / 2;
  el.zone.style.left = zl + '%';
  el.zone.style.width = S.zoneW + '%';
  el.fill.style.width = clamp(S.lung, 0, 100) + '%';

  const g = GEAR[S.gearId];
  if (g.kind === 'vape') {
    el.rowA.classList.remove('hide');
    el.rowB.classList.remove('hide');
    el.kA.textContent = 'LIQUIDO';
    el.kB.textContent = 'BATTERIA';
    el.tA.textContent = Math.round(clamp(S.liquid, 0, 100)) + '%';
    el.tB.textContent = Math.round(clamp(S.battery, 0, 100)) + '%';
    el.vA.style.width = clamp(S.liquid, 0, 100) + '%';
    el.vB.style.width = clamp(S.battery, 0, 100) + '%';
    el.vA.style.background = g.color;
    el.vB.style.background = '#6fe6ff';
    el.vA.classList.toggle('rfill', false);
    el.vA.classList.toggle('low', S.liquid < 22);
    el.vB.classList.toggle('low', S.battery < 22);
    el.gearBadge.hidden = !g.badge;
    el.gearBadge.textContent = g.badge;
    if (S.refills > 0) { el.gearBadge.hidden = false; el.gearBadge.textContent = 'REFILL ×' + S.refills; }
  } else {
    el.rowA.classList.remove('hide');
    el.rowB.classList.add('hide');
    el.kA.textContent = g.model === 'cig' ? 'TABACCO' : 'ERBA';
    el.tA.textContent = Math.round(clamp((1 - S.burn) * 100, 0, 100)) + '%';
    el.vA.style.width = clamp((1 - S.burn) * 100, 0, 100) + '%';
    el.vA.style.background = '#ff9b4d';
    el.vA.classList.toggle('low', S.burn > 0.78);
    el.gearBadge.hidden = !g.badge;
    el.gearBadge.textContent = g.badge;
  }

  const holding = S.holding && !S.needRelease && S.lock <= 0;
  const inZone = holding && Math.abs(S.lung - S.zoneC) <= S.zoneW / 2;
  const danger = S.lung > S.zoneC + S.zoneW / 2;
  el.zone.classList.toggle('aim', inZone);
  el.fill.classList.toggle('danger', danger);

  if (S.mode === 'ignite') setHint('ACCENDI...', 'fire');
  else if (S.mode === 'ending') setHint('...', '');
  else if (S.lock > 0) setHint('TOSSISCI... ASPETTA', 'bad');
  else if (S.needRelease) setHint('RILASCIA E RIPROVA', 'bad');
  else if (inZone) setHint('RILASCIA ORA!', 'aim');
  else if (holding && danger) setHint('TROPPO! RILASCIA', 'bad');
  else if (holding) setHint('INALA...', '');
  else if (S.lung > 30) setHint('RILASCIA NEL VERDE', '');
  else setHint(g.kind === 'herb' ? 'TIENI PREMUTO E TIRA' : 'TIENI PREMUTO PER INALARE', '');
}

function setHint(text, cls) {
  if (el.hint.textContent !== text) el.hint.textContent = text;
  const want = 'hint' + (cls ? ' ' + cls : '');
  if (el.hint.className !== want) el.hint.className = want;
}

function callout(main, sub, tone = '') {
  el.callout.className = tone;
  el.callout.innerHTML = main + (sub ? `<small>${sub}</small>` : '');
  void el.callout.offsetWidth;
  el.callout.classList.add('show');
}

/* ------------------------------------------------------------------ */
/*  game flow                                                          */
/* ------------------------------------------------------------------ */
function effectiveFill() {
  const g = GEAR[S.gearId];
  const roundScale = 1 + (S.round - 1) * 0.035;
  const chainScale = 1 + (S.chain - 1) * 0.018;
  const calm = 1 - 0.09 * S.upg.calm;
  return g.fill * roundScale * chainScale * calm;
}

function effectiveZone() {
  const g = GEAR[S.gearId];
  const roundScale = Math.max(0.6, 1 - (S.round - 1) * 0.02);
  return Math.max(10, g.zone * roundScale * (1 + 0.14 * S.upg.zone));
}

function gain(n) {
  const mult = 1 + 0.15 * S.upg.dense;
  S.score += n * mult;
  S.cash += n * mult * 0.15;
}

function spend(n) { S.cash = Math.max(0, S.cash - n); }

function burst(n = 9, power = 1) {
  if (!tipAnchor) return;
  const p = new THREE.Vector3();
  tipAnchor.getWorldPosition(p);
  for (let i = 0; i < n; i++) {
    spawnWisp(p, {
      s: rand(0.26, 0.42) * (0.8 + power * 0.2),
      ttl: rand(1.6, 2.5),
      opacity: rand(0.14, 0.26),
      growth: rand(1.2, 1.8),
      spread: 0.5 * power,
      up: 0.75 * power,
      z: 0.2
    });
  }
  S.pop = 1;
}

function perfect() {
  const g = GEAR[S.gearId];
  S.chain = Math.min(15, S.chain + 1);
  S.maxChain = Math.max(S.maxChain, S.chain);
  S.lastPerfect = S.time;
  const gainAmt = 160 * S.chain * g.pts * (1 + 0.3 * S.upg.hand);
  gain(gainAmt);
  S.lung *= 0.42;
  burst(7 + Math.min(6, S.chain * 0.5), 1);
  callout('PERFETTO', '+' + fmt(gainAmt));
  el.chain.classList.add('pop');
  setTimeout(() => el.chain.classList.remove('pop'), 190);
  haptic(16);
  sfx.perfect(S.chain);
}

function nearMiss() {
  gain(40 * S.chain * GEAR[S.gearId].pts);
  const p = new THREE.Vector3();
  tipAnchor?.getWorldPosition(p);
  if (p) spawnWisp(p, { s: 0.4, ttl: 1.5, opacity: 0.16, growth: 1.6, spread: 0.3, up: 0.8, z: 0.1 });
}

function weakPuff() {
  if (S.chain > 1) S.chain -= 1;
  const p = new THREE.Vector3();
  tipAnchor?.getWorldPosition(p);
  if (p) spawnWisp(p, { s: 0.3, ttl: 1.0, opacity: 0.12, growth: 1.3, spread: 0.2, up: 0.5, z: 0.1 });
}

function cough() {
  S.lost += 1;
  S.chain = 1;
  S.lung = 26;
  S.lock = 0.85;
  S.holding = false;
  S.needRelease = true;
  S.shake = 1;
  S.lastPerfect = S.time;
  sfx.stopInhale(0.1);
  sfx.cough();
  haptic([30, 40, 30]);
  callout('TOSSISCI!', 'TROPPO FUMO', 'bad');
  renderLives();
  if (S.lost >= S.maxLungs) endRun();
}

function refillPod() {
  S.refills -= 1;
  S.liquid = 100;
  S.battery = Math.max(S.battery, 45);
  S.lock = 0.35;
  S.holding = false;
  S.needRelease = true;
  sfx.refill();
  callout('REFILL!', 'liquido pieno', 'gold');
  haptic(10);
}

function endGear(reason) {
  if (S.mode !== 'play') return;
  S.mode = 'ending';
  S.endT = 0.85;
  S.holding = false;
  sfx.stopInhale(0.1);
  sfx.fizzle();
  const txt = reason === 'batteria' ? 'BATTERIA' : reason === 'spento' ? 'SPENTO' : 'VUOTO';
  callout(txt, reason === 'batteria' ? 'ricarica' : 'cambia device', 'bad');
  const p = new THREE.Vector3();
  tipAnchor?.getWorldPosition(p);
  if (p) for (let i = 0; i < 3; i++) spawnWisp(p, { s: 0.2, ttl: 1, opacity: 0.15, growth: 1, spread: 0.2, up: 0.4 });
}

function pickGear(round = S.round) {
  if (round <= GEAR_ORDER.length) return GEAR_ORDER[round - 1];
  let id;
  do { id = GEAR_IDS[Math.floor(Math.random() * GEAR_IDS.length)]; } while (id === S.gearId);
  return id;
}

function startGear(id) {
  const g = GEAR[id];
  S.gearId = id;
  S.liquid = 100;
  S.battery = 100;
  S.burn = 0;
  S.refills = (g.refills || 0) + S.upg.refill;
  S.lung = 0;
  S.holding = false;
  S.needRelease = false;
  S.lock = 0;
  S.zoneC = 76;
  S.zoneW = effectiveZone();
  S.lastPerfect = S.time;
  S.ember = 0.1;
  S.fillRate = effectiveFill();

  buildGearMesh(id);
  el.gearName.textContent = g.name;
  el.gearSub.textContent = g.sub;
  el.gearBadge.hidden = !g.badge;
  el.gearBadge.textContent = g.badge;

  if (g.kind === 'herb') {
    S.igniteDur = Math.max(0.5, 1.1 - 0.2 * S.upg.lighter);
    S.igniteT = S.igniteDur;
    S.mode = 'ignite';
    lighterGroup.visible = true;
    lighterGroup.position.set(0.75, g.h / 2 - 0.9, 0.55);
    lighterGroup.rotation.set(0, 0, -0.25);
    flameSprite.visible = false;
    flameSprite.scale.set(0.01, 0.01, 1);
    flameLight.intensity = 0;
    S.flameOn = false;
    emberSprite.visible = false;
    emberLight.visible = false;
    callout('ACCENDI', g.name, 'gold');
    sfx.click();
  } else {
    S.mode = 'play';
    emberSprite.visible = false;
    emberLight.visible = false;
    callout(g.name, g.sub);
    sfx.ui();
  }
  updateHUD();
}

function startRun() {
  if (!S.ready) return;
  sfx.init();
  sfx.resume();
  S.score = 0;
  S.cash = 0;
  S.time = 0;
  S.chain = 1;
  S.maxChain = 1;
  S.lung = 0;
  S.lost = 0;
  S.maxLungs = 3;
  S.upg = { lungs: 0, zone: 0, calm: 0, dense: 0, chain: 0, hand: 0, refill: 0, lighter: 0 };
  S.round = 1;
  S.holding = false;
  S.needRelease = false;
  S.lock = 0;
  S.shake = 0;
  S.endT = 0;
  lastChain = 0;
  el.start.hidden = true;
  el.over.hidden = true;
  el.shop.hidden = true;
  el.credits.hidden = true;
  renderLives();
  startGear('yart');
}

function endRun() {
  if (S.mode === 'over') return;
  S.mode = 'over';
  S.holding = false;
  sfx.stopInhale(0.2);
  const record = S.score > S.best;
  if (record) { S.best = Math.round(S.score); store.set('yart.best', S.best); el.best.textContent = fmt(S.best); }
  if (S.time > S.bestTime) { S.bestTime = S.time; store.set('yart.bestTime', S.time); }
  if (S.round > S.bestRound) { S.bestRound = S.round; store.set('yart.bestRound', S.round); }
  el.overScore.textContent = fmt(S.score);
  el.overTime.innerHTML = S.time.toFixed(1) + '<small>s</small>';
  el.overRound.textContent = S.round;
  el.overBest.textContent = 'BEST ' + fmt(S.best) + ' · ' + S.bestTime.toFixed(1) + 's · round ' + S.bestRound;
  el.recordBadge.hidden = !record;
  el.over.hidden = false;
  document.body.classList.remove('high');
}

/* ------------------------------------------------------------------ */
/*  shop                                                               */
/* ------------------------------------------------------------------ */
let shopPicks = [];

function upgradeCost(u) {
  return Math.round((u.cost * (1 + 0.12 * (S.round - 1))) / 5) * 5;
}

function renderShop() {
  const avail = UPGRADES.filter((u) => (S.upg[u.id] || 0) < u.max);
  for (let i = avail.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [avail[i], avail[j]] = [avail[j], avail[i]];
  }
  shopPicks = avail.slice(0, 3);
  el.shopCards.innerHTML = '';
  el.shopCash.textContent = Math.floor(S.cash);
  if (!shopPicks.length) {
    const p = document.createElement('p');
    p.className = 'micro';
    p.textContent = 'TUTTO AL MASSIMO';
    el.shopCards.appendChild(p);
    return;
  }
  for (const u of shopPicks) {
    const cost = upgradeCost(u);
    const can = S.cash >= cost;
    const b = document.createElement('button');
    b.className = 'card' + (can ? '' : ' no');
    b.disabled = !can;
    b.innerHTML = `<span class="ct"><b>${u.name}</b><span class="cost">€ ${cost}</span></span><span class="cd">${u.desc}</span>`;
    b.addEventListener('click', () => buyUpgrade(u, cost));
    el.shopCards.appendChild(b);
  }
}

function buyUpgrade(u, cost) {
  if (S.cash < cost) return;
  spend(cost);
  S.upg[u.id] = (S.upg[u.id] || 0) + 1;
  if (u.id === 'lungs') S.maxLungs = Math.min(5, S.maxLungs + 1);
  sfx.buy();
  haptic(12);
  el.shop.hidden = true;
  nextRound();
}

function openShop() {
  S.mode = 'shop';
  S.holding = false;
  el.shopRound.textContent = S.round;
  el.shopGear.textContent = GEAR[S.gearId].name;
  el.shopCash.textContent = Math.floor(S.cash);
  S.nextId = pickGear(S.round + 1);
  el.nextGear.textContent = GEAR[S.nextId].name;
  renderShop();
  el.shop.hidden = false;
  sfx.shop();
}

function nextRound() {
  S.round += 1;
  el.shop.hidden = true;
  S.mode = 'play';
  renderLives();
  startGear(S.nextId || pickGear());
}

/* ------------------------------------------------------------------ */
/*  update                                                             */
/* ------------------------------------------------------------------ */
function update(dt) {
  if (S.mode === 'ignite') {
    S.time += dt;
    S.igniteT -= dt;
    if (S.igniteT <= 0) S.mode = 'play';
    updateHUD();
    return;
  }
  if (S.mode === 'ending') {
    S.endT -= dt;
    if (S.endT <= 0) openShop();
    updateHUD();
    return;
  }
  if (S.mode !== 'play') {
    updateHUD();
    return;
  }

  S.time += dt;
  if (S.lock > 0) { S.lock -= dt; if (S.lock < 0) S.lock = 0; }

  const g = GEAR[S.gearId];
  const holding = S.holding && !S.needRelease && S.lock <= 0;

  if (holding) {
    S.lung += S.fillRate * dt;
    gain(16 * S.chain * g.pts * dt);
    S.glow = lerp(S.glow, 1, 0.2);
    S.ember -= dt;
    if (S.ember <= 0) {
      S.ember = 0.11;
      const p = new THREE.Vector3();
      tipAnchor?.getWorldPosition(p);
      if (p) spawnWisp(p, { s: 0.22, ttl: 1.1, opacity: 0.18, growth: 1.5, spread: 0.14, up: 0.9, z: 0.15 });
    }
    sfx.tension(clamp(S.lung / 100, 0, 1));
    if (S.lung >= 100) {
      S.lung = 100;
      cough();
      if (S.mode !== 'play') return;
    }
  } else {
    S.lung = Math.max(0, S.lung - 46 * dt);
    S.glow = lerp(S.glow, 0, 0.12);
    if (g.kind === 'herb') {
      S.ember -= dt;
      if (S.ember <= 0) {
        S.ember = 0.45;
        const p = new THREE.Vector3();
        tipAnchor?.getWorldPosition(p);
        if (p) spawnWisp(p, { s: 0.14, ttl: 1.4, opacity: 0.1, growth: 1.7, spread: 0.08, up: 0.4, z: 0.1 });
      }
    }
  }

  /* resources */
  const burnScale = 1 - 0.08 * S.upg.lighter;
  const useScale = 1 - 0.08 * S.upg.refill;
  if (g.kind === 'herb') {
    S.burn += ((g.idle + (holding ? g.hit : 0)) * burnScale * dt) / 100;
    if (S.ember <= 0.06) S.ember = 0.06;
    if (S.burn >= 1) { S.burn = 1; endGear('spento'); updateHUD(); return; }
  } else if (holding) {
    S.liquid -= g.liquidRate * useScale * dt;
    S.battery -= g.batteryRate * useScale * dt;
    if (S.liquid <= 0) {
      S.liquid = 0;
      if (S.refills > 0) refillPod();
      else { endGear('vuoto'); updateHUD(); return; }
    }
    if (S.battery <= 0) { S.battery = 0; endGear('batteria'); updateHUD(); return; }
  }

  /* zone drift + difficulty */
  const t = S.time;
  S.fillRate = effectiveFill();
  const target = clamp(74 + Math.sin(t * 0.55) * 11 + Math.sin(t * 1.31) * 3, 60, 86);
  S.zoneC = lerp(S.zoneC, target, 1 - Math.pow(0.001, dt));
  S.zoneW = effectiveZone();

  const decayAfter = 7 + 4 * S.upg.chain;
  if (t - S.lastPerfect > decayAfter && S.chain > 1) {
    S.chain -= 1;
    S.lastPerfect = t;
  }

  updateHUD();
}

/* ------------------------------------------------------------------ */
/*  presentation                                                       */
/* ------------------------------------------------------------------ */
let clock = performance.now() / 1000;

function animate(now) {
  requestAnimationFrame(animate);
  const t = now / 1000;
  const dt = Math.min(0.05, t - clock);
  clock = t;

  update(dt);

  const g = GEAR[S.gearId];
  const herb = g.kind === 'herb';

  /* gear idle / inhale motion */
  if (gearObj) {
    const inh = S.glow;
    const bob = Math.sin(t * 1.25) * 0.02;
    gearRoot.position.y = 0.3 + bob + inh * 0.05;
    gearRoot.position.x = 0.1 + Math.sin(t * 0.7) * 0.025;
    gearRoot.rotation.z = (herb ? -0.42 : -0.1) - inh * 0.04 + Math.sin(t * 0.9) * 0.012;
    gearRoot.rotation.y = (herb ? -0.55 : g.model === 'pod' ? 0.5 : -0.38) + Math.sin(t * 0.42) * 0.1;
    const pop = 1 + S.pop * 0.05;
    gearRoot.scale.setScalar(pop);
    S.pop *= Math.pow(0.002, dt);
    if (mouthLight) mouthLight.intensity = (inh * 7 + S.pop * 4) * (herb ? 0 : 1);
  }

  if (plantObj) {
    plantObj.rotation.z = Math.sin(t * 0.6) * 0.02;
    plantObj.position.y = -1.8 + Math.sin(t * 0.8) * 0.012;
  }
  for (const c of clouds) {
    c.obj.position.y = c.base + Math.sin(t * 0.35 + c.phase) * 0.12;
    c.obj.rotation.y += 0.035 * dt;
    c.obj.rotation.x += 0.012 * dt;
  }

  /* ember + clipping for herbs */
  if (herb && tipAnchor) {
    const top = g.h / 2 - S.burn * (g.h - 0.06);
    tipAnchor.position.y = top;
    tipAnchor.getWorldPosition(tmpVec);
    if (clipPlane) clipPlane.constant = tmpVec.y;
    if (emberSprite) {
      emberSprite.position.set(0, top + 0.02, 0);
      emberSprite.visible = S.mode !== 'ignite';
      const flick = 0.85 + Math.sin(t * 23) * 0.1 + Math.sin(t * 7.7) * 0.05;
      emberSprite.scale.set(0.36 * flick * (1 + S.glow * 0.3), 0.5 * flick * (1 + S.glow * 0.3), 1);
      emberSprite.material.opacity = 0.75 * flick;
    }
    if (emberLight) {
      emberLight.position.set(0, top + 0.03, 0.02);
      emberLight.visible = S.mode !== 'ignite';
      emberLight.intensity = 3.0 * (0.8 + Math.sin(t * 19) * 0.2) * (1 + S.glow * 0.9) * (S.mode === 'ignite' ? 0 : 1);
    }
  }

  /* lighter ignition animation */
  if (lighterGroup) {
    if (S.mode === 'ignite') {
      const p = clamp(1 - S.igniteT / S.igniteDur, 0, 1);
      const k = smooth(clamp(p / 0.55, 0, 1));
      const tx = 0.14, ty = g.h / 2 - 0.18, tz = 0.32;
      lighterGroup.position.x = lerp(0.75, tx, k);
      lighterGroup.position.y = lerp(g.h / 2 - 0.9, ty, k);
      lighterGroup.position.z = lerp(0.55, tz, k);
      lighterGroup.rotation.z = -0.25 + Math.sin(t * 26) * 0.025;
      lighterGroup.rotation.x = Math.sin(t * 17) * 0.03;
      const flameOn = p > 0.42;
      flameSprite.visible = flameOn;
      if (flameOn) {
        const f = 0.75 + Math.sin(t * 33) * 0.15 + Math.sin(t * 11) * 0.1;
        flameSprite.scale.set(0.26 * f, 0.44 * f, 1);
      }
      flameLight.intensity = flameOn ? 2.2 + Math.sin(t * 29) * 0.6 : 0;
      if (p > 0.42 && !S.flameOn) { S.flameOn = true; sfx.flame(); }
      if (p >= 1) lighterGroup.visible = false;
    } else if (lighterGroup.visible) {
      lighterGroup.visible = false;
      flameSprite.visible = false;
      flameLight.intensity = 0;
    }
  }

  /* glow + shake */
  if (glowSprite) {
    glowSprite.material.opacity = 0.32 + S.glow * 0.4 + Math.sin(t * 2) * 0.02;
    const s = 7.2 + S.glow * 0.8 + S.pop * 1.4;
    glowSprite.scale.set(s, s, 1);
  }
  if (S.shake > 0.001) {
    const amp = S.shake * (prefersReduced ? 0.03 : 0.12);
    camera.position.x = Math.sin(t * 63) * amp;
    camera.position.y = 0.25 + Math.cos(t * 71) * amp;
    S.shake *= Math.pow(0.0008, dt);
    if (S.shake < 0.001) { camera.position.x = 0; camera.position.y = 0.25; }
  } else {
    camera.position.x = 0;
    camera.position.y = 0.25;
  }

  updateWisps(dt);
  if (renderer) renderer.render(scene, camera);
}

const tmpVec = new THREE.Vector3();
let mouthLight = null;

/* ------------------------------------------------------------------ */
/*  input                                                              */
/* ------------------------------------------------------------------ */
function press() {
  if (S.mode === 'title') { startRun(); return; }
  if (S.mode !== 'play' || !S.ready) return;
  if (S.needRelease || S.lock > 0 || S.holding) return;
  S.holding = true;
  sfx.startInhale();
}

function release() {
  const wasHolding = S.holding;
  S.holding = false;
  S.needRelease = false;
  if (S.mode !== 'play' || !wasHolding) return;
  sfx.stopInhale();
  const inZone = Math.abs(S.lung - S.zoneC) <= S.zoneW / 2;
  if (inZone) perfect();
  else if (S.lung >= 30) nearMiss();
  else weakPuff();
}

function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('button, a')) return;
  if (!el.credits.hidden || !el.shop.hidden) return;
  if (S.mode === 'over') return;
  sfx.init();
  sfx.resume();
  press();
}

addEventListener('pointerdown', onDown, { passive: true });
addEventListener('pointerup', release, { passive: true });
addEventListener('pointercancel', release, { passive: true });
addEventListener('blur', () => { if (S.mode === 'play') { S.holding = false; sfx.stopInhale(); } });

addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    sfx.init();
    if (S.mode === 'title') startRun();
    else press();
  }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); release(); }
});

el.startBtn.addEventListener('click', () => { sfx.init(); sfx.resume(); startRun(); });
el.againBtn.addEventListener('click', () => { sfx.init(); sfx.resume(); startRun(); });
el.skipBtn.addEventListener('click', () => { sfx.ui(); el.shop.hidden = true; nextRound(); });

/* mute */
const muteBtn = $('muteBtn');
let muted = store.get('yart.muted', 0) === 1;
function applyMute() {
  sfx.muted = muted;
  muteBtn.classList.toggle('off', muted);
  muteBtn.setAttribute('aria-pressed', String(muted));
  if (muted) sfx.stopInhale(0.05);
}
muteBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  muted = !muted;
  store.set('yart.muted', muted ? 1 : 0);
  sfx.init(); sfx.resume();
  applyMute();
  if (!muted) sfx.ui();
});
applyMute();

/* credits */
function openCredits() { sfx.ui(); el.credits.hidden = false; }
function closeCredits() { el.credits.hidden = true; }
$('creditsBtn').addEventListener('click', openCredits);
$('creditsBtn2').addEventListener('click', openCredits);
$('closeCredits').addEventListener('click', closeCredits);

document.addEventListener('visibilitychange', () => {
  if (document.hidden && S.mode === 'play') {
    S.holding = false;
    sfx.stopInhale(0.05);
  }
});

/* ------------------------------------------------------------------ */
/*  boot                                                               */
/* ------------------------------------------------------------------ */
resize();
renderLives();
if (renderer) requestAnimationFrame(animate);

const loader = new GLTFLoader();
const paths = {
  vape: './assets/models/vape_kBOhB2eCji.glb',
  pod: './assets/models/vape_pen_large_5CMa9iNBbAK.glb',
  cigar: './assets/models/cigar_cT7awduBbgn.glb',
  cig: './assets/models/cigarette_2RL6h8MbDPb.glb',
  lighter: './assets/models/lighter_t8AmON8X5a.glb',
  smoke: './assets/models/smoke_RReLSfPo1Q.glb',
  plant: './assets/models/suspicious_plant_FJhXwFAoHw.glb'
};

el.startBtn.disabled = true;
el.startBtn.textContent = 'CARICO...';

const load = (k) => loader.loadAsync(paths[k]).catch(() => null);

function setupScene(m) {
  models.vape = m.vape || null;
  models.pod = m.pod || m.vape || null;
  models.cigar = m.cigar || m.vape || null;
  models.cig = m.cig || m.vape || null;
  buildSmoke(m.smoke || null);
  if (m.plant) buildPlant(m.plant);
  buildLighter(m.lighter || null);
  buildEmber();
  mouthLight = new THREE.PointLight(0xc9ff4f, 0, 3.2, 2);
  mouthLight.position.set(0, 0.9, 0.15);
  gearRoot.add(mouthLight);
  buildGearMesh('yart');
  S.ready = true;
  el.startBtn.disabled = false;
  el.startBtn.textContent = 'PREMI PER FUMARE';
}

Promise.all([load('vape'), load('pod'), load('cigar'), load('cig'), load('lighter'), load('smoke'), load('plant')])
  .then(([vape, pod, cigar, cig, lighter, smoke, plant]) => {
    setupScene({ vape, pod, cigar, cig, lighter, smoke, plant });
  })
  .catch(() => setupScene({}));

window.__YART = S;
if (location.search.includes('debug')) {
  window.__yartDebug = {
    gear(id, round = S.round) { S.round = round; S.mode = 'play'; startGear(id); },
    shop: openShop,
    give(n) { S.cash += n; }
  };
}

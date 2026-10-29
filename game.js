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
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : Number(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch {} }
};
const prefersReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/*  state                                                              */
/* ------------------------------------------------------------------ */
const S = {
  mode: 'title',
  ready: false,
  score: 0,
  time: 0,
  chain: 1,
  maxChain: 1,
  lung: 0,
  lost: 0,
  holding: false,
  needRelease: false,
  lock: 0,
  zoneC: 76,
  zoneW: 24,
  fillRate: 50,
  lastPerfect: 0,
  shake: 0,
  glow: 0,
  pop: 0,
  ember: 0,
  best: store.get('yart.best', 0),
  bestTime: store.get('yart.bestTime', 0)
};

const ZONE_MIN = 60, ZONE_MAX = 86;

/* ------------------------------------------------------------------ */
/*  audio (all synthesized, zero assets)                               */
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
    src.buffer = this.noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 720;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.value = 0;
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
  perfect(level) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const base = [523.25, 587.33, 659.25, 783.99][level % 4];
    [1, 1.5].forEach((m, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = base * m;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g).connect(this.master);
      const t0 = t + i * 0.04;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.11, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      o.start(t0);
      o.stop(t0 + 0.32);
    });
  },
  cough() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1600, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    src.connect(lp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.5);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(52, t + 0.25);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.28, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(og).connect(this.master);
    o.start(t);
    o.stop(t + 0.32);
  },
  ui() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.14);
  }
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
} catch {
  document.querySelector('#startBtn').textContent = 'WEBGL NON DISPONIBILE';
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

/* glow sprite */
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

/* ------------------------------------------------------------------ */
/*  models                                                             */
/* ------------------------------------------------------------------ */
let vapeWrap = null, mouthAnchor = null, mouthLight = null;
let plantObj = null;
let smokeTemplate = null;
const wisps = [];

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

function buildVape(gltf) {
  vapeWrap = new THREE.Group();
  const model = gltf ? gltf.scene : buildFallbackVape();
  model.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      o.material.side = THREE.FrontSide;
      if (o.material.color) o.material.color.offsetHSL(0, 0.05, 0.02);
    }
  });
  const h = normalizeHeight(model, 2.0);
  vapeWrap.add(model);

  mouthAnchor = new THREE.Object3D();
  mouthAnchor.position.set(0, h / 2 - 0.02, 0.06);
  vapeWrap.add(mouthAnchor);

  mouthLight = new THREE.PointLight(0xc9ff4f, 0, 3.2, 2);
  mouthLight.position.set(0, h / 2 - 0.05, 0.12);
  vapeWrap.add(mouthLight);

  vapeWrap.position.set(0.12, 0.3, 0);
  vapeWrap.rotation.set(0.04, -0.38, -0.1);
  rig.add(vapeWrap);
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

/* smoke puffs */
function wispMaterial() {
  return new THREE.MeshBasicMaterial({
    color: 0xeefff6, transparent: true, opacity: 0.45,
    depthWrite: false, fog: false
  });
}

const clouds = [];

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

  /* static haze clouds for depth */
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

function spawnWisp(pos, { s = 0.32, ttl = 1.7, opacity = 0.5, growth = 1.6, spread = 0.5, up = 0.9, z = 0 } = {}) {
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
    w.vel.multiplyScalar(1 - 0.9 * dt);
    w.obj.rotation.x += w.spin.x * dt;
    w.obj.rotation.y += w.spin.y * dt;
    w.obj.rotation.z += w.spin.z * dt;
    const sc = w.s0 * (1 + k * w.growth);
    w.obj.scale.setScalar(sc);
    w.mat.opacity = w.base * Math.sin(Math.min(1, w.life * 2.2) * Math.PI * 0.5) * (1 - k * 0.35);
  }
}

/* ------------------------------------------------------------------ */
/*  UI refs                                                            */
/* ------------------------------------------------------------------ */
const el = {
  score: $('score'), best: $('bestVal'), time: $('time'),
  chain: $('chain'), zone: $('zone'), fill: $('fill'),
  hint: $('hint'), callout: $('callout'),
  lives: [...document.querySelectorAll('#lives span')],
  start: $('startScreen'), over: $('overScreen'), credits: $('creditsScreen'),
  startBtn: $('startBtn'), againBtn: $('againBtn'),
  overScore: $('overScore'), overTime: $('overTime'), overChain: $('overChain'),
  overBest: $('overBest'), recordBadge: $('recordBadge')
};
el.best.textContent = fmt(S.best);

/* ------------------------------------------------------------------ */
/*  game logic                                                         */
/* ------------------------------------------------------------------ */
function updateLives() {
  el.lives.forEach((s, i) => {
    s.className = i < 3 - S.lost ? 'on' : 'lost';
  });
}

function callout(main, sub, bad = false) {
  el.callout.className = bad ? 'bad' : '';
  el.callout.innerHTML = main + (sub ? `<small>${sub}</small>` : '');
  void el.callout.offsetWidth;
  el.callout.classList.add('show');
}

function burst(n = 9, power = 1) {
  if (!mouthAnchor) return;
  const p = new THREE.Vector3();
  mouthAnchor.getWorldPosition(p);
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
  S.chain = Math.min(15, S.chain + 1);
  S.maxChain = Math.max(S.maxChain, S.chain);
  S.lastPerfect = S.time;
  const gain = 160 * S.chain;
  S.score += gain;
  S.fillRate = Math.min(118, 44 + S.chain * 5);
  S.lung *= 0.42;
  burst(7 + Math.min(6, S.chain * 0.5), 1);
  callout('PERFETTO', '+' + fmt(gain));
  el.chain.classList.add('pop');
  setTimeout(() => el.chain.classList.remove('pop'), 190);
  haptic(16);
  sfx.perfect(S.chain);
}

function nearMiss() {
  S.score += 40 * S.chain;
  const p = new THREE.Vector3();
  mouthAnchor?.getWorldPosition(p);
  if (p) spawnWisp(p, { s: 0.4, ttl: 1.5, opacity: 0.16, growth: 1.6, spread: 0.3, up: 0.8, z: 0.1 });
}

function weakPuff() {
  if (S.chain > 1) S.chain -= 1;
  const p = new THREE.Vector3();
  mouthAnchor?.getWorldPosition(p);
  if (p) spawnWisp(p, { s: 0.3, ttl: 1.0, opacity: 0.12, growth: 1.3, spread: 0.2, up: 0.5, z: 0.1 });
}

function cough() {
  S.lost += 1;
  S.chain = 1;
  S.lung = 26;
  S.lock = 0.85;
  S.holding = false;
  S.needRelease = true;
  sfx.stopInhale(0.1);
  S.shake = 1;
  S.lastPerfect = S.time;
  sfx.cough();
  haptic([30, 40, 30]);
  callout('TOSSISCI!', 'TROPPO FUMO', true);
  updateLives();
  if (S.lost >= 3) endRun();
}

function startRun() {
  if (!S.ready) return;
  sfx.init();
  sfx.resume();
  S.mode = 'play';
  S.score = 0;
  S.time = 0;
  S.chain = 1;
  S.maxChain = 1;
  S.lung = 0;
  S.lost = 0;
  S.holding = false;
  S.needRelease = false;
  S.lock = 0;
  S.zoneC = 76;
  S.zoneW = 24;
  S.fillRate = 50;
  S.lastPerfect = 0;
  S.shake = 0;
  S.pop = 0;
  S.ember = 0;
  el.start.hidden = true;
  el.over.hidden = true;
  el.score.textContent = '0';
  el.time.textContent = '0.0';
  updateLives();
  setHint('TIENI PREMUTO PER INALARE', '');
  sfx.ui();
}

function endRun() {
  if (S.mode === 'over') return;
  S.mode = 'over';
  S.holding = false;
  sfx.stopInhale(0.2);
  const record = S.score > S.best;
  if (record) { S.best = Math.round(S.score); store.set('yart.best', S.best); el.best.textContent = fmt(S.best); }
  if (S.time > S.bestTime) { S.bestTime = S.time; store.set('yart.bestTime', S.time); }
  el.overScore.textContent = fmt(S.score);
  el.overTime.innerHTML = S.time.toFixed(1) + '<small>s</small>';
  el.overChain.textContent = '×' + S.maxChain;
  el.overBest.textContent = 'BEST ' + fmt(S.best) + ' · ' + S.bestTime.toFixed(1) + 's';
  el.recordBadge.hidden = !record;
  el.over.hidden = false;
  document.body.classList.remove('high');
}

function press() {
  if (S.mode === 'title') { startRun(); return; }
  if (S.mode !== 'play' || !S.ready) return;
  if (S.needRelease || S.lock > 0) return;
  if (S.holding) return;
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

/* ------------------------------------------------------------------ */
/*  per-frame update                                                   */
/* ------------------------------------------------------------------ */
function setHint(text, cls) {
  if (el.hint.textContent !== text) el.hint.textContent = text;
  const want = 'hint' + (cls ? ' ' + cls : '');
  if (el.hint.className !== want) el.hint.className = want;
}

let lastChain = 1;

function update(dt) {
  S.time += dt;

  if (S.lock > 0) { S.lock -= dt; if (S.lock < 0) S.lock = 0; }

  const holding = S.holding && !S.needRelease && S.lock <= 0;

  if (holding) {
    S.lung += S.fillRate * dt;
    S.score += 16 * S.chain * dt;
    S.glow = lerp(S.glow, 1, 0.2);
    S.ember -= dt;
    if (S.ember <= 0) {
      S.ember = 0.11;
      const p = new THREE.Vector3();
      mouthAnchor?.getWorldPosition(p);
      if (p) spawnWisp(p, { s: 0.22, ttl: 1.1, opacity: 0.18, growth: 1.5, spread: 0.14, up: 0.9, z: 0.15 });
    }
    sfx.tension(clamp(S.lung / 100, 0, 1));
    if (S.lung >= 100) {
      S.lung = 100;
      cough();
    }
  } else {
    S.lung = Math.max(0, S.lung - 46 * dt);
    S.glow = lerp(S.glow, 0, 0.12);
  }

  /* breathing room: the sweet spot slowly drifts */
  const t = S.time;
  const target = clamp(74 + Math.sin(t * 0.55) * 11 + Math.sin(t * 1.31) * 3, ZONE_MIN, ZONE_MAX);
  S.zoneC = lerp(S.zoneC, target, 1 - Math.pow(0.001, dt));
  S.zoneW = clamp(27 - S.chain * 1.35, 11, 24);

  /* chain decays if you stall */
  if (S.mode === 'play' && t - S.lastPerfect > 7 && S.chain > 1) {
    S.chain -= 1;
    S.lastPerfect = t;
  }

  /* hud */
  el.score.textContent = fmt(S.score);
  el.time.textContent = S.time.toFixed(1);

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

  const inZone = holding && Math.abs(S.lung - S.zoneC) <= S.zoneW / 2;
  const danger = S.lung > S.zoneC + S.zoneW / 2;
  el.zone.classList.toggle('aim', inZone);
  el.fill.classList.toggle('danger', danger);

  if (S.lock > 0) setHint('TOSSISCI... ASPETTA', 'bad');
  else if (S.needRelease) setHint('RILASCIA E RIPROVA', 'bad');
  else if (inZone) setHint('RILASCIA ORA!', 'aim');
  else if (holding && danger) setHint('TROPPO! RILASCIA', 'bad');
  else if (holding) setHint('INALA...', '');
  else if (S.lung > 30) setHint('RILASCIA NEL VERDE', '');
  else setHint('TIENI PREMUTO PER INALARE', '');
}

/* ------------------------------------------------------------------ */
/*  scene animation                                                    */
/* ------------------------------------------------------------------ */
let clock = performance.now() / 1000;

function animate(now) {
  requestAnimationFrame(animate);
  const t = now / 1000;
  const dt = Math.min(0.05, t - clock);
  clock = t;

  if (S.mode === 'play') update(dt);

  /* vape idle + inhale motion */
  if (vapeWrap) {
    const inh = S.glow;
    const bob = Math.sin(t * 1.25) * 0.025;
    vapeWrap.position.y = 0.3 + bob + inh * 0.06;
    vapeWrap.position.x = 0.12 + Math.sin(t * 0.7) * 0.03;
    vapeWrap.rotation.z = -0.1 - inh * 0.06 + Math.sin(t * 0.9) * 0.015;
    vapeWrap.rotation.y = -0.38 + Math.sin(t * 0.42) * 0.12;
    const pop = 1 + S.pop * 0.05;
    vapeWrap.scale.setScalar(pop);
    S.pop *= Math.pow(0.002, dt);
    if (mouthLight) mouthLight.intensity = inh * 7 + S.pop * 4;
  }

  if (plantObj) {
    plantObj.rotation.z = Math.sin(t * 0.6) * 0.02;
    plantObj.position.y = -1.8 + Math.sin(t * 0.8) * 0.015;
  }

  for (const c of clouds) {
    c.obj.position.y = c.base + Math.sin(t * 0.35 + c.phase) * 0.12;
    c.obj.rotation.y += 0.035 * dt;
    c.obj.rotation.x += 0.012 * dt;
  }

  /* glow */
  if (glowSprite) {
    glowSprite.material.opacity = 0.32 + S.glow * 0.4 + Math.sin(t * 2) * 0.02;
    const s = 7.2 + S.glow * 0.8 + S.pop * 1.4;
    glowSprite.scale.set(s, s, 1);
  }

  /* camera shake */
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

/* ------------------------------------------------------------------ */
/*  boot                                                               */
/* ------------------------------------------------------------------ */
resize();
if (renderer) requestAnimationFrame(animate);

const loader = new GLTFLoader();
const modelPaths = {
  vape: './assets/models/vape_kBOhB2eCji.glb',
  smoke: './assets/models/smoke_RReLSfPo1Q.glb',
  plant: './assets/models/suspicious_plant_FJhXwFAoHw.glb'
};

el.startBtn.disabled = true;
el.startBtn.textContent = 'CARICO...';

Promise.all([
  loader.loadAsync(modelPaths.vape).catch(() => null),
  loader.loadAsync(modelPaths.smoke).catch(() => null),
  loader.loadAsync(modelPaths.plant).catch(() => null)
]).then(([vape, smoke, plant]) => {
  buildVape(vape);
  buildSmoke(smoke);
  if (plant) buildPlant(plant);
  S.ready = true;
  el.startBtn.disabled = false;
  el.startBtn.textContent = 'PREMI PER FUMARE';
}).catch(() => {
  S.ready = true;
  el.startBtn.disabled = false;
  el.startBtn.textContent = 'PREMI PER FUMARE';
});

/* ------------------------------------------------------------------ */
/*  input                                                              */
/* ------------------------------------------------------------------ */
function onDown(e) {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (e.target.closest('button, a')) return;
  if (!el.credits.hidden) return;
  if (S.mode === 'over') return;
  sfx.init();
  sfx.resume();
  press();
}

function onUp() { release(); }

addEventListener('pointerdown', onDown, { passive: true });
addEventListener('pointerup', onUp, { passive: true });
addEventListener('pointercancel', onUp, { passive: true });
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
  sfx.init();
  sfx.resume();
  applyMute();
  if (!muted) sfx.ui();
});
applyMute();

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

/* tiny debug handle (harmless) */
window.__YART = S;

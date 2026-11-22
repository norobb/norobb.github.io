// Hero: glossy shapes that roam the whole hero, over the text too. Brush one to nudge it, tap one to flick it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('scene');
const stage = canvas?.parentElement; // the hero section
const home = document.querySelector('.hero__stage');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// The palette lives in tokens.css as oklch; let the browser convert it to sRGB
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
function token(name) {
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
  return new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
}

function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    canvas.hidden = true;
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); // the canvas is now hero-sized
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  const key = new THREE.DirectionalLight(0xfff4e0, 1.6);
  key.position.set(-4, 6, 6); // warm light from the top left, like the paper shadows
  const rim = new THREE.DirectionalLight(0xcfe3ff, 1.1);
  rim.position.set(5, -2, -4);
  scene.add(key, rim, new THREE.HemisphereLight(0xfffaf0, 0xe8e2d0, 0.5));

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 13);

  const mat = (name, extra = {}) => new THREE.MeshPhysicalMaterial({
    color: token(name), roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
    sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff), ...extra,
  });
  // pearl: a pale shell that shifts colour as it turns
  const glass = mat('--color-sugar', { roughness: 0.12, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [200, 600], sheen: 0 });

  const shapes = [
    { geo: new RoundedBoxGeometry(2.1, 2.1, 2.1, 10, 0.45), m: mat('--color-accent'), p: [-0.9, 0.3, 0] },
    { geo: new THREE.TorusGeometry(1.0, 0.4, 64, 160), m: mat('--color-accent-3', { iridescence: 0.5, iridescenceIOR: 1.4 }), p: [1.9, 1.5, -0.8] },
    { geo: new THREE.SphereGeometry(1.05, 96, 96), m: glass, p: [1.4, -1.25, 1.2] },
    { geo: new THREE.CapsuleGeometry(0.52, 1.4, 24, 64), m: mat('--color-mint'), p: [-2.6, -1.7, -0.4] },
    { geo: new THREE.SphereGeometry(0.62, 96, 96), m: mat('--color-accent-2', { roughness: 0.15 }), p: [-2.5, 1.9, -1.2] },
    { geo: new RoundedBoxGeometry(0.95, 0.95, 0.95, 8, 0.22), m: mat('--color-ink', { roughness: 0.3, sheen: 0 }), p: [0.4, -2.4, -1.0] },
    { geo: new THREE.TorusGeometry(0.42, 0.16, 48, 96), m: mat('--color-accent'), p: [0.3, 2.5, -1.6] },
  ];

  const RADII = [1.5, 1.4, 1.05, 1.2, 0.62, 0.7, 0.58]; // rough collision size per shape
  const meshes = shapes.map((s, i) => {
    const mesh = new THREE.Mesh(s.geo, s.m);
    mesh.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    mesh.userData = {
      base: new THREE.Vector3(...s.p),
      pos: new THREE.Vector3(...s.p),
      vel: new THREE.Vector3(),
      r: RADII[i],
      phase: i * 1.7,
      spin: new THREE.Vector3(0.15 + (i % 2) * 0.1, 0.2 + (i % 3) * 0.08, 0),
      kick: new THREE.Vector3(),
      pop: 0,
    };
    scene.add(mesh);
    return mesh;
  });

  // ---- view: the canvas covers the whole hero; shapes live on the z=0 plane ----
  const view = { hw: 6, hh: 4, home: new THREE.Vector2() };
  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    const aspect = width / height, tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = aspect;
    camera.position.z = Math.max(13, 3.4 / (tan * aspect)); // narrow screens: pull back so they still fit
    camera.updateProjectionMatrix();
    view.hh = tan * camera.position.z;
    view.hw = view.hh * aspect;
    // home: the empty stage column, in world units
    const h = stage.getBoundingClientRect(), r = home.getBoundingClientRect();
    view.home.set(((r.left + r.width / 2 - h.left) / h.width * 2 - 1) * view.hw, -((r.top + r.height / 2 - h.top) / h.height * 2 - 1) * view.hh);
    if (!placed) { placed = true; for (const m of meshes) m.userData.pos.set(view.home.x + m.userData.base.x, view.home.y + m.userData.base.y, m.userData.base.z); }
  }
  let placed = false;
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---- input: listened on the hero, so text and buttons stay clickable ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ptr = { x: 0, y: 0, vx: 0, vy: 0, t: 0, in: false };
  let hover = null, poked = false;
  function toWorld(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    return [ndc.x * view.hw, ndc.y * view.hh];
  }
  function hit(e) {
    toWorld(e);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(meshes, false)[0]?.object ?? null;
  }
  stage.addEventListener('pointermove', (e) => {
    const [x, y] = toWorld(e), now = performance.now(), dt = Math.max(8, now - ptr.t) / 1000;
    if (ptr.in) { ptr.vx = (x - ptr.x) / dt; ptr.vy = (y - ptr.y) / dt; }
    Object.assign(ptr, { x, y, t: now, in: true });
    if (e.pointerType === 'mouse') { hover = hit(e); stage.style.cursor = hover ? 'pointer' : ''; }
  });
  stage.addEventListener('pointerleave', () => { ptr.in = false; hover = null; stage.style.cursor = ''; });
  stage.addEventListener('pointerdown', (e) => {
    const m = hit(e);
    poked = !!m;
    if (!m) return;
    const [x, y] = toWorld(e), u = m.userData;
    const away = new THREE.Vector2(u.pos.x - x, u.pos.y - y).normalize().multiplyScalar(9);
    u.vel.x += away.x + (Math.random() - 0.5) * 3;
    u.vel.y += away.y + 3;
    u.kick.set((Math.random() - 0.5) * 14, 10 + Math.random() * 6, (Math.random() - 0.5) * 8);
    u.pop = 1;
  });
  // a poke on a shape that sits over a link shouldn't also follow the link
  stage.addEventListener('click', (e) => { if (poked) { e.preventDefault(); poked = false; } }, true);

  // ---- loop ----
  let visible = true;
  // pause once most of the hero has scrolled away, so it doesn't compete with the marquee below
  new IntersectionObserver(([e]) => { visible = e.intersectionRatio > 0.2; if (visible) tick(); }, { threshold: [0, 0.2, 0.25] }).observe(stage);

  const clock = new THREE.Clock();
  let raf = 0, lastScroll = window.scrollY;
  const tmp = new THREE.Vector3();
  function tick() {
    cancelAnimationFrame(raf);
    if (!visible) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const lift = Math.min(window.scrollY / window.innerHeight, 1.4) * view.hh * 0.6;
    const roam = reduced ? 0 : 1;

    ptr.vx *= 0.85; ptr.vy *= 0.85;
    // scrolling or swiping the page flings them along, with a bit of sideways scatter and spin
    const dy = window.scrollY - lastScroll;
    lastScroll = window.scrollY;
    const fling = Math.max(-1.5, Math.min(1.5, dy * (2 * view.hh / stage.clientHeight) * 0.9));
    for (const m of meshes) {
      const u = m.userData, p = u.pos, v = u.vel;
      // wander on slow sine paths, loosely tied to a home spot in the stage column
      v.x += (Math.sin(t * 0.21 + u.phase) * 1.0 + Math.sin(t * 0.53 + u.phase * 2) * 0.5) * roam * dt;
      v.y += (Math.cos(t * 0.17 + u.phase * 1.3) * 0.75 + Math.sin(t * 0.47 + u.phase) * 0.4) * roam * dt;
      v.x += (view.home.x + u.base.x - p.x) * 0.06 * dt;
      v.y += (view.home.y + u.base.y - p.y) * 0.06 * dt;
      v.z += (u.base.z - p.z) * 0.5 * dt;
      if (fling) {
        v.y += fling * (0.8 + (u.phase % 1) * 0.6);
        v.x += Math.sin(u.phase * 3 + t) * Math.abs(fling) * 0.8;
        u.kick.x += fling * 3; u.kick.z += Math.cos(u.phase) * fling * 2;
      }
      // a passing pointer nudges whatever it brushes
      if (ptr.in) {
        const dx = p.x - ptr.x, dy = p.y - ptr.y, d = Math.hypot(dx, dy);
        if (d < u.r * 1.1) { v.x += ptr.vx * 0.04 + dx * 0.6; v.y += ptr.vy * 0.04 + dy * 0.6; u.kick.x += ptr.vy * 0.02; u.kick.y += ptr.vx * 0.02; }
      }
      // soft walls at the edges of the hero
      const bx = view.hw - u.r, by = view.hh - u.r;
      if (p.x > bx) v.x -= (p.x - bx) * 6 * dt; if (p.x < -bx) v.x += (-bx - p.x) * 6 * dt;
      if (p.y > by) v.y -= (p.y - by) * 6 * dt; if (p.y < -by) v.y += (-by - p.y) * 6 * dt;
    }
    // shapes bump into each other instead of overlapping
    for (let i = 0; i < meshes.length; i++) for (let j = i + 1; j < meshes.length; j++) {
      const a = meshes[i].userData, b = meshes[j].userData;
      tmp.subVectors(a.pos, b.pos).setZ(0);
      const d = tmp.length(), min = (a.r + b.r) * 0.85;
      if (d > 0.001 && d < min) { tmp.multiplyScalar(((min - d) / d) * 2.5 * dt * 60 * 0.5); a.vel.add(tmp); b.vel.sub(tmp); }
    }
    for (const m of meshes) {
      const u = m.userData;
      u.vel.multiplyScalar(Math.exp(-1.1 * dt));
      u.pos.addScaledVector(u.vel, dt);
      m.position.set(u.pos.x, u.pos.y + lift, u.pos.z);
      m.rotation.x += (u.spin.x * roam + u.kick.x) * dt;
      m.rotation.y += (u.spin.y * roam + u.kick.y) * dt;
      m.rotation.z += u.kick.z * dt;
      u.kick.multiplyScalar(0.96);
      // springy pop on tap, a soft swell on hover
      u.pop *= 0.9;
      const target = 1 + (m === hover ? 0.08 : 0) + Math.sin(u.pop * Math.PI) * 0.18;
      m.scale.setScalar(m.scale.x + (target - m.scale.x) * (1 - Math.pow(0.0001, dt)));
    }
    renderer.render(scene, camera);
  }
  tick();
  stage.classList.add('is-live');
}

if (canvas) start();

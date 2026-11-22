// Hero: floating glossy shapes. Drag to spin the cluster, tap a shape to flick it, scroll to turn and spread it.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('scene');
const stage = canvas?.parentElement;
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
    stage.classList.add('no-webgl');
    return;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
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

  // soft contact shadow: a blurred dark ellipse under the cluster
  const sh = document.createElement('canvas');
  sh.width = sh.height = 256;
  const sctx = sh.getContext('2d');
  const grad = sctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(30,32,40,0.35)');
  grad.addColorStop(1, 'rgba(30,32,40,0)');
  sctx.fillStyle = grad;
  sctx.fillRect(0, 0, 256, 256);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(7, 5),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sh), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -3.1;
  scene.add(shadow);

  const group = new THREE.Group();
  scene.add(group);
  const meshes = shapes.map((s, i) => {
    const mesh = new THREE.Mesh(s.geo, s.m);
    mesh.position.set(...s.p);
    mesh.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    mesh.userData = {
      base: new THREE.Vector3(...s.p),
      phase: i * 1.7,
      bob: 0.12 + (i % 3) * 0.06,
      spin: new THREE.Vector3(0.15 + (i % 2) * 0.1, 0.2 + (i % 3) * 0.08, 0),
      kick: new THREE.Vector3(),
      pop: 0,
    };
    group.add(mesh);
    return mesh;
  });

  // ---- input ----
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let drag = null;
  let velY = reduced ? 0 : 0.004, velX = 0, rotY = 0, rotX = 0;
  let hover = null;
  const look = { x: 0, y: 0, tx: 0, ty: 0 };

  function hit(e) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObjects(meshes, false)[0]?.object ?? null;
  }

  canvas.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: 0, id: e.pointerId };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add('is-dragging');
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    look.tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    look.ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      velY = dx * 0.006;
      velX = dy * 0.004;
      drag.x = e.clientX; drag.y = e.clientY;
    } else if (e.pointerType === 'mouse') {
      hover = hit(e);
      canvas.style.cursor = hover ? 'pointer' : 'grab';
    }
  });
  const end = (e) => {
    if (!drag) return;
    if (drag.moved < 6) {
      const m = hit(e);
      if (m) {
        m.userData.kick.set((Math.random() - 0.5) * 14, 10 + Math.random() * 6, (Math.random() - 0.5) * 8);
        m.userData.pop = 1;
      }
    }
    drag = null;
    canvas.classList.remove('is-dragging');
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  canvas.addEventListener('pointerleave', () => { look.tx = 0; look.ty = 0; hover = null; });

  // ---- size ----
  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    // keep the whole cluster in frame on narrow stages
    camera.position.z = width / height < 0.9 ? 16 : 13;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---- loop ----
  let visible = true;
  // pause once most of the stage has scrolled away, so it doesn't compete with the marquee below
  new IntersectionObserver(([e]) => { visible = e.intersectionRatio > 0.2; if (visible) tick(); }, { threshold: [0, 0.2, 0.25] }).observe(stage);

  const clock = new THREE.Clock();
  let raf = 0, sScroll = 0;
  function tick() {
    cancelAnimationFrame(raf);
    if (!visible) return;
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    sScroll += (Math.min(window.scrollY / window.innerHeight, 1.4) - sScroll) * (1 - Math.pow(0.002, dt));
    const scroll = sScroll;

    if (!drag) {
      // inertia settles back to a slow idle spin
      const idle = reduced ? 0 : 0.003;
      velY += (idle - velY) * 0.03;
      velX *= 0.94;
    }
    rotY += velY;
    rotX = Math.max(-0.9, Math.min(0.9, rotX + velX));
    if (!drag) rotX *= 0.985;

    look.x += (look.tx - look.x) * 0.06;
    look.y += (look.ty - look.y) * 0.06;
    group.rotation.y = rotY + look.x * 0.25 + scroll * 1.6;
    group.rotation.x = rotX + look.y * 0.18 + scroll * 0.5;
    group.position.y = scroll * 1.2;
    shadow.position.y = -3.1 + scroll * 1.2;
    shadow.material.opacity = 1 - Math.min(scroll, 1);

    const spread = 1 + scroll * 0.7;
    for (const m of meshes) {
      const u = m.userData;
      const bob = reduced ? 0 : Math.sin(t * 0.9 + u.phase) * u.bob;
      m.position.set(u.base.x * spread, u.base.y * spread + bob, u.base.z * spread);
      const auto = reduced ? 0 : 1;
      m.rotation.x += (u.spin.x * auto + u.kick.x) * dt;
      m.rotation.y += (u.spin.y * auto + u.kick.y) * dt;
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

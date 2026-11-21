const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- headline: letters rise in on load ---------- */
$$('.split').forEach((el) => {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  let i = 0;
  text.split(' ').forEach((word, w) => {
    const wrap = document.createElement('span');
    wrap.className = 'word';
    wrap.setAttribute('aria-hidden', 'true');
    for (const ch of word) {
      const s = document.createElement('span');
      s.className = 'char';
      s.style.setProperty('--i', i++);
      s.textContent = ch;
      wrap.append(s);
    }
    el.append(wrap);
    if (w < text.split(' ').length - 1) el.append(' ');
  });
});

/* ---------- about statement: words light up while scrolling ---------- */
const words = [];
$$('.words').forEach((el) => {
  const parts = el.textContent.split(' ');
  el.textContent = '';
  parts.forEach((p, i) => {
    const s = document.createElement('span');
    s.className = 'w';
    s.textContent = p;
    el.append(s);
    if (i < parts.length - 1) el.append(' ');
    words.push(s);
  });
});

/* ---------- scroll engine: one rAF pass sets every scroll-linked value ---------- */
const progress = $('.progress');
const hero = $('.hero');
const untis = $('.untis');
const phone = $('.phone3d');
const steps = $$('.steps li');
const screens = $$('.phone3d__body img');
const dayflow = $('.dayflow');
const shot = $('.shot');
const chips = $$('.float-chip');
const about = $('.about');
const letters = $$('.close__name span');
const close = $('.close');
let lastY = window.scrollY;
let velocity = 0;
let step = -1;

// 0 when the element's top meets the viewport bottom, 1 when its bottom leaves the top
function through(el) {
  const r = el.getBoundingClientRect();
  return clamp((innerHeight - r.top) / (innerHeight + r.height));
}

function setStep(i) {
  if (i === step) return;
  step = i;
  steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
  screens.forEach((s, k) => s.classList.toggle('is-active', k === i));
}

function frame() {
  const y = window.scrollY;
  velocity += ((y - lastY) - velocity) * 0.2;
  lastY = y;

  const docH = document.documentElement.scrollHeight - innerHeight;
  progress.style.transform = `scaleX(${docH > 0 ? y / docH : 0})`;

  // Untis: the phone turns through the pinned chapter and swaps screens
  const ur = untis.getBoundingClientRect();
  const pinned = getComputedStyle(untis).getPropertyValue('--pinned').trim() === '1';
  const q = pinned ? clamp(-ur.top / (ur.height - innerHeight)) : through(untis);
  phone.style.setProperty('--q', q.toFixed(3));
  setStep(Math.min(2, Math.floor((pinned ? q : clamp((q - 0.25) / 0.5)) * 3)));

  if (reduced) return;

  // hero text drifts up and fades as it scrolls away
  hero.style.setProperty('--exit', clamp(y / (hero.offsetHeight * 0.8)).toFixed(3));

  // Dayflow: the screenshot swings up flat as the band arrives
  const d = through(dayflow);
  shot.style.setProperty('--swing', clamp((0.5 - d) / 0.3).toFixed(3));
  chips.forEach((c, i) => c.style.setProperty('--d', ((d - 0.5) * (i + 1)).toFixed(3)));

  // About: words light up one by one
  const a = clamp((through(about) - 0.15) / 0.4);
  const lit = Math.round(a * words.length);
  words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));

  // Close: each letter of the name flips up into place
  const c = through(close);
  letters.forEach((l, i) => {
    const k = clamp((c - 0.12 - i * 0.035) / 0.22);
    l.style.transform = `translateY(${(1 - k) * 0.4}em) rotateX(${(1 - k) * -95}deg)`;
    l.style.opacity = (0.15 + k * 0.85).toFixed(3);
  });
}

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => { frame(); ticking = false; });
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
frame();
if (reduced) { words.forEach((w) => w.classList.add('is-lit')); }

/* ---------- marquee: always moving, faster and skewed when you scroll ---------- */
const rows = $$('.marquee__row').map((row) => {
  row.innerHTML += row.innerHTML + row.innerHTML; // three copies so the loop never shows a gap
  return { row, dir: Number(row.dataset.dir), x: 0 };
});
if (!reduced) {
  let prev = performance.now();
  (function loop(now) {
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    velocity *= 0.92;
    for (const r of rows) {
      const third = r.row.scrollWidth / 3;
      r.x -= r.dir * (60 + Math.abs(velocity) * 14) * dt;
      if (r.x <= -third) r.x += third;
      if (r.x > 0) r.x -= third;
      r.row.style.transform = `translate3d(${r.x}px,0,0) skewX(${clamp(-velocity * 0.4, -12, 12)}deg)`;
    }
    requestAnimationFrame(loop);
  })(prev);
}

/* ---------- 3D tilt toward the pointer ---------- */
$$('[data-tilt]').forEach((el) => {
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduced) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--rx', `${((e.clientY - r.top) / r.height - 0.5) * -14}deg`);
    el.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 18}deg`);
    el.style.setProperty('--gx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--gy', `${((e.clientY - r.top) / r.height) * 100}%`);
  });
  el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
});

/* ---------- toybox: languages as physics blocks ---------- */
const STACK = {
  kotlin: ['Kotlin', ' runs the Dayflow Android app and my native Untis app.'],
  dart: ['Flutter', ' and Dart are what Untis Neo is made of.'],
  ts: ['TypeScript', ' with React powers the Dayflow web demo.'],
  python: ['Python', ' runs my WebUntis checker every five minutes.'],
  c: ['C and C++', ' go on microcontrollers, like my ESP32 security key.'],
  swift: ['Swift', ' made Googly Eyes for iPhone and Mac.'],
};
const out = $('#stack-out');
function pick(lang) {
  const [name, rest] = STACK[lang];
  const m = document.createElement('mark');
  m.textContent = name;
  out.replaceChildren(m, rest);
}
const box = $('#toybox');
const toys = $$('.toy', box);
toys.forEach((t) => t.addEventListener('click', (e) => { if (!t.dataset.dragged) pick(t.dataset.lang); delete t.dataset.dragged; e.preventDefault(); }));

function physics() {
  const { Engine, Bodies, Body, Composite } = window.Matter;
  const engine = Engine.create({ gravity: { y: 1.1 } });
  box.classList.add('is-physics');
  let W = box.clientWidth, H = box.clientHeight;
  let walls = [];
  function buildWalls() {
    Composite.remove(engine.world, walls);
    W = box.clientWidth; H = box.clientHeight;
    const t = 200;
    walls = [
      Bodies.rectangle(W / 2, H + t / 2, W + 2 * t, t, { isStatic: true }),
      Bodies.rectangle(-t / 2, H / 2 - 800, t, H * 2 + 1600, { isStatic: true }),
      Bodies.rectangle(W + t / 2, H / 2 - 800, t, H * 2 + 1600, { isStatic: true }),
    ];
    Composite.add(engine.world, walls);
  }
  buildWalls();

  const bodies = toys.map((el, i) => {
    const w = el.offsetWidth, h = el.offsetHeight;
    const b = Bodies.rectangle(
      (W * (0.15 + 0.7 * ((i * 0.37) % 1))), -h * (1 + i * 1.4), w, h,
      { chamfer: { radius: h / 2 }, restitution: 0.45, friction: 0.08, frictionAir: 0.012, density: 0.002 },
    );
    Body.setAngle(b, (i % 2 ? 1 : -1) * 0.4);
    b.el = el; b.w = w; b.h = h;
    return b;
  });
  Composite.add(engine.world, bodies);

  // drag and throw: the block chases the pointer, release keeps its speed
  let held = null;
  toys.forEach((el, i) => {
    el.addEventListener('pointerdown', (e) => {
      const r = box.getBoundingClientRect();
      held = { b: bodies[i], x: e.clientX - r.left, y: e.clientY - r.top, moved: 0, el };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-held');
    });
    el.addEventListener('pointermove', (e) => {
      if (!held || held.el !== el) return;
      const r = box.getBoundingClientRect();
      const nx = e.clientX - r.left, ny = e.clientY - r.top;
      held.moved += Math.abs(nx - held.x) + Math.abs(ny - held.y);
      held.x = nx; held.y = ny;
    });
    const drop = () => {
      if (!held || held.el !== el) return;
      if (held.moved > 6) el.dataset.dragged = '1';
      el.classList.remove('is-held');
      held = null;
    };
    el.addEventListener('pointerup', drop);
    el.addEventListener('pointercancel', drop);
  });

  // a fast scroll bumps the blocks into the air
  let lastScroll = window.scrollY;
  addEventListener('scroll', () => {
    const dv = window.scrollY - lastScroll;
    lastScroll = window.scrollY;
    if (Math.abs(dv) > 30 && inView) bodies.forEach((b) => Body.setVelocity(b, { x: b.velocity.x + (Math.random() - 0.5) * 6, y: -Math.min(Math.abs(dv) * 0.12, 14) }));
  }, { passive: true });

  new ResizeObserver(() => {
    buildWalls();
    bodies.forEach((b) => { if (b.position.x > W) Body.setPosition(b, { x: W - b.w, y: b.position.y }); });
  }).observe(box);

  let inView = true;
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) loop(); }).observe(box);
  let raf = 0;
  function loop() {
    cancelAnimationFrame(raf);
    if (!inView) return;
    raf = requestAnimationFrame(loop);
    if (held) {
      const b = held.b;
      Body.setVelocity(b, { x: (held.x - b.position.x) * 0.3, y: (held.y - b.position.y) * 0.3 });
      Body.setAngularVelocity(b, b.angularVelocity * 0.8);
    }
    Engine.update(engine, 1000 / 60);
    for (const b of bodies) {
      b.el.style.transform = `translate(${b.position.x - b.w / 2}px, ${b.position.y - b.h / 2}px) rotate(${b.angle}rad)`;
    }
  }
  loop();
}

if (!reduced) {
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || !window.Matter) return;
    io.disconnect();
    physics();
  }, { rootMargin: '0px 0px -25%' });
  io.observe(box);
}

/* ---------- copy username ---------- */
$('#copy-name').addEventListener('click', async () => {
  const status = $('#copy-status');
  try {
    await navigator.clipboard.writeText('norobb');
    status.textContent = 'Copied. Add norobb as a friend on Discord.';
  } catch {
    status.textContent = 'Copy didn’t work here. My Discord is norobb.';
  }
});

/* ---------- torn paper edges ---------- */
// Seeded noise so each edge tears the same way on every visit
function tear(el, seed, depth = 12) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = 56;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(2)}% ${(rnd() * depth).toFixed(1)}px`);
  el.style.clipPath = `polygon(${pts.join(',')}, 100% 100%, 0% 100%)`;
}
$$('[data-tear]').forEach((el, i) => tear(el, 7919 * (i + 3)));

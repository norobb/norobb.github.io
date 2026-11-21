const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wide = matchMedia('(min-width: 60rem)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- smooth scrolling ---------- */
let lenis = null;
if (!reduced && window.Lenis) {
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const t = $(a.getAttribute('href'));
    if (!t) return;
    e.preventDefault();
    lenis.scrollTo(t, { offset: -16 });
  }));
}

/* ---------- headline letters ---------- */
$$('.split').forEach((el) => {
  const text = el.textContent;
  el.setAttribute('aria-label', text);
  el.textContent = '';
  let i = 0;
  const ws = text.split(' ');
  ws.forEach((word, w) => {
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
    if (w < ws.length - 1) el.append(' ');
  });
});

/* ---------- about words ---------- */
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

/* ---------- marquee rows ---------- */
const rows = $$('.marquee__row').map((row) => {
  row.innerHTML += row.innerHTML + row.innerHTML; // three copies so the loop never shows a gap
  return { row, dir: Number(row.dataset.dir), x: 0, third: 0 };
});

/* ---------- layout cache: measured on resize, never during scroll ---------- */
const els = {
  progress: $('.progress'), hero: $('.hero'),
  untisTrack: $('.untis__track'), phone: $('.phone3d'), steps: $$('.steps li'), screens: $$('.phone3d__body img'),
  journey: $('.journey'), track: $('.journey__track'),
  about: $('.about'), close: $('.close'), letters: $$('.close__name span'),
  demo: $('#df-demo'),
};
const box = {};
function measure() {
  box.wide = wide.matches;
  // size the horizontal journey's pin track first, then read positions
  const shift = Math.max(0, els.track.scrollWidth - innerWidth + 64);
  els.journey.style.height = box.wide && !reduced ? `${innerHeight + shift}px` : '';
  const y = window.scrollY;
  const top = (el) => el.getBoundingClientRect().top + y;
  box.vh = innerHeight;
  box.doc = document.documentElement.scrollHeight - innerHeight;
  box.hero = els.hero.offsetHeight;
  box.untis = { top: top(els.untisTrack), h: els.untisTrack.offsetHeight };
  box.journey = { top: top(els.journey), h: els.journey.offsetHeight, shift };
  box.about = { top: top(els.about), h: els.about.offsetHeight };
  box.close = { top: top(els.close), h: els.close.offsetHeight };
  rows.forEach((r) => { r.third = r.row.scrollWidth / 3; });
}
// progress of an element through the viewport: 0 entering at the bottom, 1 leaving at the top
const through = (b, y) => clamp((y + box.vh - b.top) / (box.vh + b.h));
// progress through a pinned track: 0 when it sticks, 1 when it lets go
const pinned = (b, y) => clamp((y - b.top) / Math.max(1, b.h - box.vh));

/* ---------- scroll-linked frame ---------- */
let step = -1, lit = -1, velocity = 0, lastY = window.scrollY;
const smooth = { untis: 0, journey: 0 };
function setStep(i) {
  if (i === step) return;
  step = i;
  els.steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
  els.screens.forEach((s, k) => s.classList.toggle('is-active', k === i));
}

function frame(dt) {
  const y = window.scrollY;
  velocity = lerp(velocity, y - lastY, 0.25);
  lastY = y;
  els.progress.style.transform = `scaleX(${box.doc > 0 ? (y / box.doc).toFixed(4) : 0})`;

  const uq = box.wide ? pinned(box.untis, y) : clamp((through(box.untis, y) - 0.2) / 0.6);
  setStep(Math.min(2, Math.floor(uq * 3)));
  if (reduced) return;

  // ease towards the target so jumps in scroll position never snap
  const k = 1 - Math.pow(0.0005, dt);
  smooth.untis = lerp(smooth.untis, uq, k);
  els.phone.style.setProperty('--q', smooth.untis.toFixed(4));

  els.hero.style.setProperty('--exit', clamp(y / (box.hero * 0.8)).toFixed(3));

  if (box.wide) {
    smooth.journey = lerp(smooth.journey, pinned(box.journey, y), k);
    els.track.style.transform = `translate3d(${(-smooth.journey * box.journey.shift).toFixed(1)}px,0,0)`;
  }

  const a = clamp((through(box.about, y) - 0.15) / 0.4);
  const n = Math.round(a * words.length);
  if (n !== lit) { lit = n; words.forEach((w, i) => w.classList.toggle('is-lit', i < n)); }

  const c = through(box.close, y);
  els.letters.forEach((l, i) => {
    const t = clamp((c - 0.12 - i * 0.035) / 0.22);
    l.style.transform = `translate3d(0,${((1 - t) * 0.4).toFixed(3)}em,0) rotateX(${((1 - t) * -95).toFixed(1)}deg)`;
    l.style.opacity = (0.15 + t * 0.85).toFixed(3);
  });

  // marquee: steady drift, faster and skewed with scroll speed
  const speed = 60 + Math.min(Math.abs(velocity), 80) * 10;
  for (const r of rows) {
    if (!r.third) continue;
    r.x -= r.dir * speed * dt;
    if (r.x <= -r.third) r.x += r.third;
    if (r.x > 0) r.x -= r.third;
    r.row.style.transform = `translate3d(${r.x.toFixed(1)}px,0,0) skewX(${clamp(-velocity * 0.35, -10, 10).toFixed(2)}deg)`;
  }
}

let prev = performance.now();
function raf(now) {
  const dt = Math.min((now - prev) / 1000, 0.05);
  prev = now;
  lenis?.raf(now);
  frame(dt);
  requestAnimationFrame(raf);
}

measure();
let mTimer = 0;
const remeasure = () => { clearTimeout(mTimer); mTimer = setTimeout(measure, 120); };
addEventListener('resize', remeasure);
addEventListener('load', measure);
document.fonts?.ready.then(measure);
if (reduced) {
  words.forEach((w) => w.classList.add('is-lit'));
  addEventListener('scroll', () => frame(0), { passive: true });
  frame(0);
} else {
  requestAnimationFrame(raf);
}

/* ---------- reveal once: facts, chips, cards ---------- */
const io = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('is-seen'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -15%' });
$$('.facts, .feature-chips, .more').forEach((el) => io.observe(el));

/* ---------- 3D tilt, eased ---------- */
$$('[data-tilt], [data-tilt-soft]').forEach((el) => {
  const amt = el.hasAttribute('data-tilt-soft') ? 0.5 : 1;
  const s = { rx: 0, ry: 0, tx: 0, ty: 0, run: false };
  const loop = () => {
    s.rx = lerp(s.rx, s.tx, 0.12); s.ry = lerp(s.ry, s.ty, 0.12);
    el.style.setProperty('--rx', `${s.rx.toFixed(2)}deg`);
    el.style.setProperty('--ry', `${s.ry.toFixed(2)}deg`);
    if (Math.abs(s.rx - s.tx) + Math.abs(s.ry - s.ty) > 0.02) requestAnimationFrame(loop); else s.run = false;
  };
  const kick = () => { if (!s.run) { s.run = true; requestAnimationFrame(loop); } };
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || reduced) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    s.tx = (py - 0.5) * -12 * amt; s.ty = (px - 0.5) * 16 * amt;
    el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
    el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
    kick();
  });
  el.addEventListener('pointerleave', () => { s.tx = 0; s.ty = 0; kick(); });
});

/* ---------- Dayflow replay ---------- */
const SCENES = [
  {
    input: { kind: 'msg', text: 'Hey, can you pick me up tomorrow at 17:30 at the train station? And please bring the documents.' },
    out: [['event', 'Event', 'Pick-up at the train station', 'Tomorrow, 17:30'], ['task', 'Task', 'Bring the documents', 'Before 17:30'], ['remind', 'Reminder', 'Leave for the station', 'Tomorrow, 17:00']],
  },
  {
    input: { kind: 'shot', lines: ['Dr. Stein Praxis', 'Checkup confirmed', 'Thursday, 11:30'] },
    out: [['event', 'Event', 'Dentist checkup', 'Thursday, 11:30, Dr. Stein Praxis'], ['remind', 'Reminder', 'Dentist in one hour', 'Thursday, 10:30']],
  },
  {
    input: { kind: 'voice', text: 'Don’t forget, the presentation is due tomorrow and I still have two slides left.' },
    out: [['task', 'Task', 'Finish the last two slides', 'Today'], ['insight', 'Insight', 'Presentation deadline is tomorrow', 'Two tasks still open']],
  },
];
const dIn = $('#df-in'), dOut = $('#df-out'), tabs = $$('[data-scene]'), pauseBtn = $('#df-pause');
let scene = 0, paused = reduced, hovering = false, timer = 0, runId = 0;
const wait = (ms, id) => new Promise((res, rej) => { timer = setTimeout(() => (id === runId ? res() : rej()), ms); });

function cardEl([cls, kind, title, meta]) {
  const li = document.createElement('li');
  li.className = `card card--${cls}`;
  for (const [c, t] of [['card__kind', kind], ['card__title', title], ['card__meta', meta]]) {
    const s = document.createElement('span'); s.className = c; s.textContent = t; li.append(s);
  }
  return li;
}

async function play(i, instant = false) {
  const id = ++runId;
  clearTimeout(timer);
  scene = i;
  tabs.forEach((t, k) => t.setAttribute('aria-pressed', String(k === i)));
  const sc = SCENES[i];
  dOut.replaceChildren();
  dIn.replaceChildren();
  els.demo.classList.remove('is-thinking');
  let target = null;
  if (sc.input.kind === 'shot') {
    const r = document.createElement('div');
    r.className = 'df-receipt';
    sc.input.lines.forEach((l, k) => { const p = document.createElement('p'); p.textContent = l; if (!k) p.className = 'df-receipt__head'; r.append(p); });
    dIn.append(r);
  } else {
    if (sc.input.kind === 'voice') {
      const wave = document.createElement('div');
      wave.className = 'df-wave';
      wave.setAttribute('aria-hidden', 'true');
      for (let k = 0; k < 22; k++) { const b = document.createElement('i'); b.style.setProperty('--h', (0.25 + Math.abs(Math.sin(k * 1.7)) * 0.75).toFixed(2)); b.style.setProperty('--k', k); wave.append(b); }
      dIn.append(wave);
    }
    target = document.createElement('p');
    target.className = 'df-msg';
    dIn.append(target);
  }
  try {
    if (target) {
      if (instant) target.textContent = sc.input.text;
      else for (const ch of sc.input.text) { target.textContent += ch; await wait(22, id); }
    }
    if (!instant) { els.demo.classList.add('is-thinking'); await wait(900, id); els.demo.classList.remove('is-thinking'); }
    for (const c of sc.out) {
      dOut.append(cardEl(c));
      if (!instant) await wait(380, id);
    }
    if (reduced) return;
    await wait(4200, id);
    while (paused || hovering) await wait(400, id);
    play((scene + 1) % SCENES.length);
  } catch { /* a newer run took over */ }
}
tabs.forEach((t, k) => t.addEventListener('click', () => play(k, reduced)));
pauseBtn.addEventListener('click', () => {
  paused = !paused;
  pauseBtn.setAttribute('aria-pressed', String(paused));
  pauseBtn.setAttribute('aria-label', paused ? 'Play the demo' : 'Pause the demo');
  els.demo.classList.toggle('is-paused', paused);
});
els.demo.addEventListener('pointerenter', () => { hovering = true; });
els.demo.addEventListener('pointerleave', () => { hovering = false; });
els.demo.addEventListener('focusin', () => { hovering = true; });
els.demo.addEventListener('focusout', () => { hovering = false; });
const demoIO = new IntersectionObserver(([e]) => { if (e.isIntersecting) { demoIO.disconnect(); play(0, reduced); } }, { threshold: 0.3 });
demoIO.observe(els.demo);

/* ---------- live numbers from GitHub (the baked-in values stay if this fails) ---------- */
async function gh(repo, el) {
  try {
    const [info, commits] = await Promise.all([
      fetch(`https://api.github.com/repos/norobb/${repo}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`https://api.github.com/repos/norobb/${repo}/commits?per_page=1`),
    ]);
    const last = commits.ok && commits.headers.get('link')?.match(/page=(\d+)>; rel="last"/);
    const c = $('[data-gh="commits"]', el);
    if (last && c) c.textContent = last[1];
    const u = $('[data-gh="updated"]', el);
    if (info && u) {
      const days = Math.round((Date.now() - new Date(info.pushed_at)) / 864e5);
      u.textContent = `Last push ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}, live from GitHub.`;
    }
  } catch { /* offline or rate limited */ }
}
$$('[data-repo]').forEach((el) => gh(el.dataset.repo, el));

/* ---------- toybox ---------- */
const STACK = {
  kotlin: ['Kotlin', ' runs the Dayflow Android app and my native Untis app.'],
  dart: ['Flutter', ' and Dart are what Untis Neo is made of.'],
  ts: ['TypeScript', ' with React powers the Dayflow web demo.'],
  js: ['JavaScript', ' is my Navigium helper, a userscript for the vocab trainer.'],
  c: ['C and C++', ' go on microcontrollers, like my ESP32 security key.'],
  swift: ['Swift', ' made Googly Eyes for iPhone and Mac.'],
};
const out = $('#stack-out');
const toybox = $('#toybox');
const toys = $$('.toy', toybox);
toys.forEach((t) => t.addEventListener('click', (e) => {
  if (!t.dataset.dragged) { const [name, rest] = STACK[t.dataset.lang]; const m = document.createElement('mark'); m.textContent = name; out.replaceChildren(m, rest); }
  delete t.dataset.dragged;
  e.preventDefault();
}));

function physics() {
  const { Engine, Bodies, Body, Composite } = window.Matter;
  const engine = Engine.create({ gravity: { y: 1.1 } });
  toybox.classList.add('is-physics');
  let W = toybox.clientWidth, H = toybox.clientHeight, walls = [];
  function buildWalls() {
    Composite.remove(engine.world, walls);
    W = toybox.clientWidth; H = toybox.clientHeight;
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
    const b = Bodies.rectangle(W * (0.15 + 0.7 * ((i * 0.37) % 1)), -h * (1 + i * 1.4), w, h,
      { chamfer: { radius: h / 2 }, restitution: 0.45, friction: 0.08, frictionAir: 0.012, density: 0.002 });
    Body.setAngle(b, (i % 2 ? 1 : -1) * 0.4);
    Object.assign(b, { el, w, h });
    return b;
  });
  Composite.add(engine.world, bodies);

  let held = null;
  toys.forEach((el, i) => {
    el.addEventListener('pointerdown', (e) => {
      const r = toybox.getBoundingClientRect();
      held = { b: bodies[i], x: e.clientX - r.left, y: e.clientY - r.top, moved: 0, el };
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-held');
    });
    el.addEventListener('pointermove', (e) => {
      if (!held || held.el !== el) return;
      const r = toybox.getBoundingClientRect();
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

  let lastScroll = window.scrollY, inView = true;
  addEventListener('scroll', () => {
    const dv = window.scrollY - lastScroll;
    lastScroll = window.scrollY;
    if (Math.abs(dv) > 40 && inView) bodies.forEach((b) => Body.setVelocity(b, { x: b.velocity.x + (Math.random() - 0.5) * 5, y: -Math.min(Math.abs(dv) * 0.1, 12) }));
  }, { passive: true });
  new ResizeObserver(() => { buildWalls(); bodies.forEach((b) => { if (b.position.x > W) Body.setPosition(b, { x: W - b.w, y: b.position.y }); }); }).observe(toybox);
  new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) loop(); }).observe(toybox);
  let id = 0;
  function loop() {
    cancelAnimationFrame(id);
    if (!inView) return;
    id = requestAnimationFrame(loop);
    if (held) {
      const b = held.b;
      Body.setVelocity(b, { x: (held.x - b.position.x) * 0.3, y: (held.y - b.position.y) * 0.3 });
      Body.setAngularVelocity(b, b.angularVelocity * 0.8);
    }
    Engine.update(engine, 1000 / 60);
    for (const b of bodies) b.el.style.transform = `translate3d(${(b.position.x - b.w / 2).toFixed(1)}px, ${(b.position.y - b.h / 2).toFixed(1)}px, 0) rotate(${b.angle.toFixed(3)}rad)`;
  }
  loop();
}
if (!reduced) {
  const pio = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting || !window.Matter) return;
    pio.disconnect();
    physics();
  }, { rootMargin: '0px 0px -25%' });
  pio.observe(toybox);
}

/* ---------- copy username ---------- */
$('#copy-name').addEventListener('click', async () => {
  const status = $('#copy-status');
  try { await navigator.clipboard.writeText('norobb'); status.textContent = 'Copied. Add norobb as a friend on Discord.'; }
  catch { status.textContent = 'Copy didn’t work here. My Discord is norobb.'; }
});

/* ---------- torn paper edges ---------- */
function tear(el, seed, depth = 12) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = [];
  for (let i = 0; i <= 56; i++) pts.push(`${((i / 56) * 100).toFixed(2)}% ${(rnd() * depth).toFixed(1)}px`);
  el.style.clipPath = `polygon(${pts.join(',')}, 100% 100%, 0% 100%)`;
}
$$('[data-tear]').forEach((el, i) => tear(el, 7919 * (i + 3)));

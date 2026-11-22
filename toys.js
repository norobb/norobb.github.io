/* little extras. main.js runs first and provides $, $$, reduced and lenis */
(() => {
const hits = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- shared arcade shell: canvas, input, loop, close ---------- */
function arcade(host, game, { label, cls = '', credit, onClose } = {}) {
  if (host.querySelector(':scope > .egg')) return;
  const back = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = `egg ${cls}`;
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', label);
  const cv = document.createElement('canvas');
  cv.tabIndex = 0;
  cv.setAttribute('aria-label', `${label}. Space, arrow up or tap to jump. Escape closes it.`);
  const x = document.createElement('button');
  x.type = 'button'; x.className = 'egg__x'; x.setAttribute('aria-label', 'Close'); x.textContent = '×';
  wrap.append(cv, x);
  if (credit) { const p = document.createElement('p'); p.className = 'egg__credit'; p.innerHTML = credit; wrap.append(p); }
  host.append(wrap);

  const ctx = cv.getContext('2d');
  let W = 1, H = 1;
  const fit = () => {
    const d = devicePixelRatio || 1;
    W = cv.clientWidth || 1; H = cv.clientHeight || 1;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    ctx.setTransform(d, 0, 0, d, 0, 0);
    game.size(W, H);
  };
  fit();
  game.reset();
  const ro = new ResizeObserver(fit); ro.observe(cv);

  const input = { held: false, duck: false, tap: 0 };
  const press = () => { input.held = true; input.tap++; };
  const key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); return close(); }
    const jump = e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w', duck = e.key === 'ArrowDown' || e.key === 's';
    if (!jump && !duck) return;
    e.preventDefault();
    const down = e.type === 'keydown';
    if (jump) { if (down && !e.repeat) press(); if (!down) input.held = false; }
    if (duck) input.duck = down;
  };
  wrap.addEventListener('keydown', key);
  wrap.addEventListener('keyup', key);
  cv.addEventListener('pointerdown', (e) => { e.preventDefault(); cv.focus({ preventScroll: true }); press(); });
  for (const t of ['pointerup', 'pointercancel', 'pointerleave']) cv.addEventListener(t, () => { input.held = false; });

  let id = 0, prev = performance.now();
  const loop = (now) => {
    const dt = Math.min((now - prev) / 1000, 0.05);
    prev = now;
    game.step(dt, input);
    input.tap = 0;
    game.draw(ctx, W, H);
    id = requestAnimationFrame(loop);
  };
  id = requestAnimationFrame(loop);
  if (cls.includes('egg--fixed')) lenis?.stop();

  function close() {
    cancelAnimationFrame(id);
    ro.disconnect();
    wrap.remove();
    if (cls.includes('egg--fixed')) lenis?.start();
    onClose?.();
    back?.focus?.({ preventScroll: true });
  }
  x.addEventListener('click', close);
  cv.focus({ preventScroll: true });
}

// ready → play → over; a tap starts, and restarts once the crash has sunk in
function states(g, startDelay = 0.45) {
  g.state = 'ready'; g.t = 0;
  return (dt, inp) => {
    g.t += dt;
    if (g.state === 'play') return true;
    if (inp.tap && (g.state === 'ready' || g.t > startDelay)) { if (g.state === 'over') g.reset(); g.state = 'play'; g.t = 0; }
    return false;
  };
}
function pill(ctx, text, x, y, size, bg, fg) {
  ctx.font = `600 ${size}px Chillax, system-ui, sans-serif`;
  const w = ctx.measureText(text).width + size * 1.6, h = size * 1.9;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y + 1);
}

/* ---------- a flappy bird inside the Untis phone ---------- */
function flappy() {
  let W, H, best = 0;
  const g = {
    size(w, h) { W = w; H = h; },
    reset() { g.b = { x: W * 0.28, y: H * 0.45, vy: 0 }; g.pipes = []; g.next = 0.6; g.score = 0; g.off = 0; },
    step(dt, inp) {
      g.off += dt;
      if (!run(dt, inp)) { if (g.state === 'ready') g.b.y = H * 0.45 + Math.sin(g.off * 4) * 8; return; }
      const b = g.b, r = W * 0.055, floor = H * 0.88, sp = W * 0.5;
      if (inp.tap) b.vy = -H * 0.62;
      b.vy += H * 2.1 * dt;
      b.y += b.vy * dt;
      g.next -= dt;
      if (g.next <= 0) { g.pipes.push({ x: W, gap: rand(H * 0.25, H * 0.65), done: false }); g.next = 1.45; }
      const pw = W * 0.2, gh = H * 0.24;
      let dead = b.y + r > floor || b.y < -r * 4;
      for (const p of g.pipes) {
        p.x -= sp * dt;
        if (!p.done && p.x + pw < b.x) { p.done = true; g.score++; }
        const me = { x: b.x - r * 0.8, y: b.y - r * 0.8, w: r * 1.6, h: r * 1.6 };
        if (hits(me, { x: p.x, y: -H, w: pw, h: H + p.gap - gh / 2 }) || hits(me, { x: p.x, y: p.gap + gh / 2, w: pw, h: H })) dead = true;
      }
      g.pipes = g.pipes.filter((p) => p.x + pw > -10);
      if (dead) { g.state = 'over'; g.t = 0; best = Math.max(best, g.score); }
    },
    draw(ctx) {
      const r = W * 0.055, floor = H * 0.88, pw = W * 0.2, gh = H * 0.24;
      ctx.fillStyle = '#cfe4f5'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#e6f1f9';
      for (let k = 0; k < 4; k++) { const cx = ((k * W * 0.4 - g.off * 12) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3; ctx.beginPath(); ctx.ellipse(cx, H * (0.18 + k * 0.13), W * 0.16, H * 0.03, 0, 0, 7); ctx.fill(); }
      for (const p of g.pipes) {
        ctx.fillStyle = '#5ec98a'; ctx.strokeStyle = '#2f7a55'; ctx.lineWidth = 2;
        for (const [y, h] of [[-4, p.gap - gh / 2 + 4], [p.gap + gh / 2, floor - p.gap - gh / 2]]) {
          ctx.fillRect(p.x, y, pw, h); ctx.strokeRect(p.x, y, pw, h);
        }
        ctx.fillRect(p.x - 4, p.gap - gh / 2 - 14, pw + 8, 14); ctx.strokeRect(p.x - 4, p.gap - gh / 2 - 14, pw + 8, 14);
        ctx.fillRect(p.x - 4, p.gap + gh / 2, pw + 8, 14); ctx.strokeRect(p.x - 4, p.gap + gh / 2, pw + 8, 14);
      }
      ctx.fillStyle = '#e2b766'; ctx.fillRect(0, floor, W, H - floor);
      ctx.fillStyle = '#5ec98a'; ctx.fillRect(0, floor, W, 6);
      const b = g.b;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.max(-0.5, Math.min(1.2, b.vy / (H * 0.9))));
      ctx.fillStyle = '#f3cf3f'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(r * 0.4, -r * 0.3, r * 0.38, 0, 7); ctx.fill();
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(r * 0.52, -r * 0.3, r * 0.15, 0, 7); ctx.fill();
      ctx.fillStyle = '#ef6a4c'; ctx.beginPath(); ctx.moveTo(r * 0.7, r * 0.05); ctx.lineTo(r * 1.45, r * 0.25); ctx.lineTo(r * 0.7, r * 0.5); ctx.fill();
      ctx.fillStyle = '#e8b52a'; ctx.beginPath(); ctx.ellipse(-r * 0.35, r * 0.15, r * 0.45, r * 0.25, Math.sin(g.off * 18) * 0.5, 0, 7); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1f2330'; ctx.lineWidth = 4; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = `700 ${W * 0.13}px Chillax, system-ui, sans-serif`;
      ctx.strokeText(g.score, W / 2, H * 0.07); ctx.fillText(g.score, W / 2, H * 0.07);
      if (g.state === 'ready') pill(ctx, 'Tap to flap', W / 2, H * 0.62, W * 0.055, '#1f2330', '#fff');
      if (g.state === 'over') pill(ctx, best ? `Best ${best} · tap again` : 'Tap again', W / 2, H * 0.62, W * 0.055, '#1f2330', '#fff');
    },
  };
  const run = states(g, 0.6);
  return g;
}

/* ---------- a tiny geometry dash, full screen ---------- */
function dash() {
  let W, H, s, groundY, attempt = 0, best = 0;
  // level chunks in cube units: [dx, kind, height]; kinds: ^ spike, # block
  const CHUNKS = [
    [[0, '^']], [[0, '^'], [1, '^']], [[0, '#', 1], [1, '#', 1], [2, '#', 1], [3, '^']],
    [[0, '#', 1], [3, '#', 2], [6, '#', 3]], [[0, '^'], [1, '^'], [2, '^']],
    [[0, '#', 1], [1, '^'], [2, '#', 1]], [[0, '#', 2], [1, '#', 2], [2, '^'], [3, '^'], [4, '#', 2]],
  ];
  const g = {
    size(w, h) { W = w; H = h; s = Math.min(H * 0.075, 46); groundY = H * 0.7; },
    reset() {
      attempt++;
      g.p = { x: W * 0.22, y: groundY - s, vy: 0, rot: 0, ground: true };
      g.items = []; g.cursor = W + 4 * s; g.dist = 0; g.boom = null;
      g.fill(W * 3);
    },
    fill(until) {
      while (g.cursor < until) {
        const pool = g.dist < 1200 ? CHUNKS.slice(0, 3) : CHUNKS;
        const c = pool[Math.floor(Math.random() * pool.length)];
        let w = 0;
        for (const [dx, kind, h = 1] of c) {
          const x = g.cursor + dx * s;
          if (kind === '#') g.items.push({ kind, x, y: groundY - h * s, w: s, h: h * s });
          else g.items.push({ kind, x, y: groundY - s, w: s, h: s });
          w = Math.max(w, dx + 1);
        }
        g.cursor += (w + rand(5, 8)) * s;
      }
    },
    step(dt, inp) {
      if (g.boom) { g.boom.t += dt; if (g.boom.t > 0.7) { best = Math.max(best, g.pct()); g.reset(); g.state = 'play'; } return; }
      if (!run(dt, inp)) return;
      const p = g.p, v = s * 10.4, grav = s * 95;
      if (p.ground && inp.held) { p.vy = -Math.sqrt(2 * grav * s * 2.3); p.ground = false; }
      const prevBottom = p.y + s;
      p.vy += grav * dt; p.y += p.vy * dt;
      const shift = v * dt;
      g.dist += shift; g.cursor -= shift;
      for (const it of g.items) it.x -= shift;
      g.items = g.items.filter((it) => it.x + it.w > -s);
      g.fill(W * 3);
      let floor = groundY;
      const me = { x: p.x, y: p.y, w: s, h: s };
      for (const it of g.items) {
        if (it.x > p.x + s || it.x + it.w < p.x) continue;
        if (it.kind === '#') {
          if (prevBottom <= it.y + 2 && p.vy >= 0) floor = Math.min(floor, it.y);
          else if (hits({ x: me.x + 2, y: me.y + 4, w: s - 4, h: s - 8 }, it)) return g.die();
        } else if (hits({ x: me.x + s * 0.2, y: me.y + s * 0.2, w: s * 0.6, h: s * 0.7 }, { x: it.x + s * 0.3, y: it.y + s * 0.3, w: s * 0.4, h: s * 0.7 })) return g.die();
      }
      p.ground = false;
      if (p.y + s >= floor) { p.y = floor - s; p.vy = 0; p.ground = true; }
      if (p.ground) p.rot = Math.round(p.rot / (Math.PI / 2)) * (Math.PI / 2);
      else p.rot += dt * Math.PI * 1.55;
    },
    die() { g.boom = { t: 0, x: g.p.x + s / 2, y: g.p.y + s / 2 }; },
    pct() { return Math.min(99, Math.floor(g.dist / (s * 4))); },
    draw(ctx) {
      const hue = (g.dist / s * 2) % 360;
      const sky = ctx.createLinearGradient(0, 0, 0, groundY);
      sky.addColorStop(0, `hsl(${hue} 55% 22%)`); sky.addColorStop(1, `hsl(${(hue + 40) % 360} 60% 38%)`);
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, groundY);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let k = 0; k < 8; k++) { const bx = ((k * W * 0.2 - g.dist * 0.2) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.2; ctx.fillRect(bx, groundY - (3 + (k % 4) * 1.6) * s, s * 2.4, groundY); }
      ctx.fillStyle = `hsl(${hue} 50% 14%)`; ctx.fillRect(0, groundY, W, H - groundY);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillRect(0, groundY, W, 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      for (let gx = -(g.dist % (s * 2)); gx < W; gx += s * 2) { ctx.strokeRect(gx, groundY, s * 2, s * 2); }

      for (const it of g.items) {
        if (it.kind === '#') {
          ctx.fillStyle = '#111'; ctx.fillRect(it.x, it.y, it.w, it.h);
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(it.x + 1, it.y + 1, it.w - 2, it.h - 2);
        } else {
          ctx.fillStyle = '#111'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(it.x + 1, it.y + s); ctx.lineTo(it.x + s / 2, it.y + 2); ctx.lineTo(it.x + s - 1, it.y + s); ctx.closePath(); ctx.fill(); ctx.stroke();
        }
      }
      const p = g.p;
      if (g.boom) {
        const t = g.boom.t;
        for (let k = 0; k < 16; k++) {
          const a = k * 2.4, d = t * s * 7 * (0.5 + (k % 4) / 4);
          ctx.fillStyle = k % 2 ? '#f3cf3f' : '#53d2e8';
          ctx.globalAlpha = Math.max(0, 1 - t / 0.7);
          ctx.fillRect(g.boom.x + Math.cos(a) * d, g.boom.y + Math.sin(a) * d, s * 0.25, s * 0.25);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.save(); ctx.translate(p.x + s / 2, p.y + s / 2); ctx.rotate(p.rot);
        ctx.fillStyle = '#f3cf3f'; ctx.fillRect(-s / 2, -s / 2, s, s);
        ctx.strokeStyle = '#111'; ctx.lineWidth = 3; ctx.strokeRect(-s / 2 + 1.5, -s / 2 + 1.5, s - 3, s - 3);
        ctx.fillStyle = '#53d2e8'; ctx.fillRect(-s * 0.25, -s * 0.25, s * 0.5, s * 0.5);
        ctx.strokeRect(-s * 0.25, -s * 0.25, s * 0.5, s * 0.5);
        ctx.restore();
      }
      // progress bar and attempt counter
      ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(W * 0.3, 20, W * 0.4, 8);
      ctx.fillStyle = '#7cf07c'; ctx.fillRect(W * 0.3, 20, W * 0.4 * g.pct() / 100, 8);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '600 14px "Geist Mono", ui-monospace, monospace';
      ctx.fillText(`${g.pct()}%${best ? `  best ${best}%` : ''}`, W * 0.7 + 12, 24);
      ctx.font = `700 ${s * 0.9}px Chillax, system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.globalAlpha = Math.max(0, 1 - g.dist / (s * 14));
      ctx.fillText(`Attempt ${attempt}`, W * 0.5 - g.dist * 0.5, groundY - s * 5);
      ctx.globalAlpha = 1;
      if (g.state === 'ready') pill(ctx, 'Hold space or tap to jump', W / 2, H * 0.84, 16, 'rgba(255,255,255,0.92)', '#111');
    },
  };
  const run = states(g, 0);
  return g;
}

/* ---------- triggers ---------- */
// toys lined up A to Z (main.js fires this)
const toybox = $('#toybox');
toybox?.addEventListener('abc', () => {
  if (toybox.querySelector('.egg')) return;
  const back = document.activeElement;
  const wrap = document.createElement('div');
  wrap.className = 'egg egg--kody';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-label', 'Kody Runner');
  wrap.innerHTML = '<iframe src="kody-runner/index.html" title="Kody Runner"></iframe>'
    + '<button type="button" class="egg__x" aria-label="Close">×</button>'
    + '<p class="egg__credit">Kody Runner is the 404 game by <a href="https://kode.diy/dewu">Kode Dot (kode.diy)</a>, used with permission. All credit to them.</p>';
  const frame = wrap.querySelector('iframe');
  const close = () => { wrap.remove(); toybox.classList.remove('is-egg'); back?.focus?.({ preventScroll: true }); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  wrap.addEventListener('keydown', esc);
  frame.addEventListener('load', () => { frame.contentWindow.addEventListener('keydown', esc); frame.contentWindow.focus(); });
  wrap.querySelector('.egg__x').addEventListener('click', close);
  toybox.classList.add('is-egg');
  toybox.append(wrap);
});

// three quick taps on the phone screen
const screen = $('.phone3d__body');
let taps = [];
screen?.addEventListener('click', (e) => {
  if (e.target.closest('.egg')) return;
  const now = performance.now();
  taps = [...taps.filter((t) => now - t < 900), now];
  if (taps.length >= 3) { taps = []; arcade(screen, flappy(), { label: 'Flappy', cls: 'egg--phone' }); }
});

// five clicks on the big name in the footer
const mark = $('.footer__mark');
let marks = [];
mark?.addEventListener('click', () => {
  const now = performance.now();
  marks = [...marks.filter((t) => now - t < 1500), now];
  if (marks.length >= 5) { marks = []; arcade(document.body, dash(), { label: 'Dash', cls: 'egg--fixed' }); }
});

// typed sequences: the Konami code, and my name
const PALETTE = ['#f3cf3f', '#ef6a4c', '#3b6fd8', '#5ec98a', '#1f2330'];
const KONAMI = 'ArrowUp ArrowUp ArrowDown ArrowDown ArrowLeft ArrowRight ArrowLeft ArrowRight b a';
let keys = [];
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, [contenteditable], .egg')) return;
  keys = [...keys, e.key.length === 1 ? e.key.toLowerCase() : e.key].slice(-10);
  if (keys.join(' ') === KONAMI) { keys = []; party(); }
  if (keys.slice(-4).join('') === 'noah') { keys = []; wave(); }
});

function party() {
  if (!reduced) $('main').animate([{ transform: 'rotate(0)' }, { transform: 'rotate(360deg)' }], { duration: 1400, easing: 'cubic-bezier(0.65, 0, 0.35, 1)' });
  confetti(reduced ? 30 : 120);
}
function confetti(n) {
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'confetto';
    c.style.cssText = `left:${rand(0, 100)}vw;background:${PALETTE[i % PALETTE.length]};width:${rand(6, 12)}px;height:${rand(8, 16)}px;border-radius:${i % 3 ? 2 : 99}px`;
    document.body.append(c);
    const drift = rand(-120, 120), spin = rand(-900, 900);
    c.animate([
      { transform: 'translate3d(0,-20px,0) rotate(0deg)' },
      { transform: `translate3d(${drift}px,${innerHeight + 40}px,0) rotate(${spin}deg)` },
    ], { duration: rand(1800, 3200), delay: rand(0, 500), easing: 'cubic-bezier(0.3, 0.2, 0.6, 1)', fill: 'both' }).finished.then(() => c.remove());
  }
}
function wave() {
  $$('.hero h1 .char').forEach((ch, i) => {
    ch.style.color = PALETTE[i % 4];
    if (!reduced) ch.animate([
      { transform: 'none' }, { transform: 'translateY(-0.35em) rotate(-10deg) scale(1.15)', offset: 0.4 }, { transform: 'none' },
    ], { duration: 700, delay: i * 45, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    setTimeout(() => { ch.style.color = ''; }, 2600 + i * 45);
  });
}
})();

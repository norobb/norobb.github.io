const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const COLORS = ['coral', 'blue', 'mint', 'pear'];
const STORE = 'norobb-plans';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
const save = (plans) => { try { localStorage.setItem(STORE, JSON.stringify(plans)); } catch { /* private mode: plans just don't persist */ } };

const fmtTime = (p) => (p.hour === null ? '' : `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`);
const sentence = (p) => `${p.title}, ${DAY_NAMES[p.day]}${p.hour === null ? '' : ` at ${fmtTime(p)}`}`;

/* ---------- planner ---------- */
const week = document.querySelector('.week');
const form = document.getElementById('plan-form');
const input = document.getElementById('plan-input');
const send = document.getElementById('send');
const sendText = document.getElementById('send-text');
const sendStatus = document.getElementById('send-status');
let plans = load();
let latest = null;

// Mark today's column
const todayCol = (new Date().getDay() + 6) % 7;
week.querySelectorAll('tr').forEach((tr) => tr.children[todayCol + 1]?.classList.add('is-today'));

function cell(p) {
  return week.querySelector(`tr[data-band="${planBand(p.hour)}"]`).children[p.day + 1];
}

function chip(p, fresh) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `chip chip--${p.color}${fresh && !reduced ? ' is-fresh' : ''}`;
  b.textContent = p.hour === null ? p.title : `${fmtTime(p)} ${p.title}`;
  b.setAttribute('aria-label', `${sentence(p)}. Remove`);
  b.addEventListener('click', () => {
    plans = plans.filter((x) => x !== p);
    save(plans);
    b.remove();
    if (latest === p) { latest = null; send.hidden = true; }
    sendStatus.textContent = `Removed ${p.title}.`;
  });
  cell(p).append(b);
}

plans.forEach((p) => chip(p, false));

function addPlan(text) {
  const p = { ...parsePlan(text), color: COLORS[plans.length % COLORS.length] };
  plans = [...plans, p].slice(-12);
  save(plans);
  chip(p, true);
  latest = p;
  sendText.innerHTML = '';
  const m = document.createElement('mark');
  m.textContent = sentence(p);
  sendText.append('Added: ', m, '. Now tell me about it.');
  send.hidden = false;
  sendStatus.textContent = '';
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const v = input.value.trim();
  if (!v) return;
  addPlan(v);
  input.value = '';
});

document.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => addPlan(b.dataset.try)));

async function copy(text, status, done) {
  try {
    await navigator.clipboard.writeText(text);
    status.textContent = done;
    return true;
  } catch {
    status.textContent = `Copy didn’t work here. My Discord is norobb.`;
    return false;
  }
}

document.getElementById('send-btn').addEventListener('click', async () => {
  if (!latest) return;
  const msg = `Hey Noah! ${sentence(latest)}?`;
  // Discord has no link that opens a DM by username, so the message goes via the clipboard
  const ok = await copy(msg, sendStatus, 'Copied. Paste it in a DM to norobb.');
  if (ok) window.open('https://discord.com/channels/@me', '_blank', 'noopener');
});

document.getElementById('copy-name').addEventListener('click', () =>
  copy('norobb', document.getElementById('copy-status'), 'Copied. Add norobb as a friend on Discord.'));

/* ---------- Untis screens ---------- */
const untisImg = document.getElementById('untis-img');
document.querySelectorAll('[data-screen]').forEach((b, _, all) => b.addEventListener('click', () => {
  all.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  untisImg.src = b.dataset.screen;
  untisImg.alt = b.dataset.alt;
}));

/* ---------- stack ---------- */
const STACK = {
  kotlin: ['Kotlin', ' runs the Dayflow Android app and my native Untis app.'],
  dart: ['Dart and Flutter', ' are what Untis Neo is made of.'],
  ts: ['TypeScript', ' with React powers the Dayflow web demo.'],
  python: ['Python', ' runs my WebUntis checker every five minutes.'],
  c: ['C and C++', ' go on microcontrollers, like my ESP32 security key.'],
  swift: ['Swift', ' made Googly Eyes for iPhone and Mac.'],
};
const out = document.getElementById('stack-out');
document.querySelectorAll('[data-lang]').forEach((b, _, all) => b.addEventListener('click', () => {
  all.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  const [name, rest] = STACK[b.dataset.lang];
  const m = document.createElement('mark');
  m.textContent = name;
  out.replaceChildren(m, rest);
}));

/* ---------- torn paper edges ---------- */
// Seeded value noise so each edge tears the same way on every visit
function tear(el, seed, depth = 10) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const n = 48;
  const pts = [];
  for (let i = 0; i <= n; i++) pts.push(`${((i / n) * 100).toFixed(2)}% ${(rnd() * depth).toFixed(1)}px`);
  el.style.clipPath = `polygon(${pts.join(',')}, 100% 100%, 0% 100%)`;
}
document.querySelectorAll('[data-tear]').forEach((el, i) => tear(el, 7919 * (i + 3)));

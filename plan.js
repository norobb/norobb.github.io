// Turns "minecraft friday 8pm" into { day, hour, title }. Tiny local cousin of Dayflow's fallback parser.
(function (root) {
  const DAYS = [
    ['monday', 'mon', 'montag', 'mo'],
    ['tuesday', 'tue', 'tues', 'dienstag', 'di'],
    ['wednesday', 'wed', 'mittwoch'],
    ['thursday', 'thu', 'thur', 'thurs', 'donnerstag'],
    ['friday', 'fri', 'freitag', 'fr'],
    ['saturday', 'sat', 'samstag', 'sa'],
    ['sunday', 'sun', 'sonntag'],
  ];
  const FILLER = new Set(['at', 'on', 'um', 'am', 'this', 'next', 'lets', "let's", 'we', 'could', 'wanna', 'want', 'to', 'do', 'the', 'shall', 'should', 'how', 'about', 'gehen', 'wir']);

  // Monday = 0
  const weekday = (d) => (d.getDay() + 6) % 7;

  function parsePlan(text, now = new Date()) {
    let rest = ` ${String(text).toLowerCase().replace(/[?!.,]+(\s|$)/g, ' ')} `;
    let day = null, hour = null, minute = 0;

    const cut = (re) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], ' '); return m; };

    let suffix;
    let m = cut(/\s(\d{1,2})[:.](\d{2})\s*(am|pm|uhr|h)?(?=\s)/);
    if (m) { hour = Number(m[1]); minute = Number(m[2]); suffix = m[3]; }
    else if ((m = cut(/\s(\d{1,2})\s*(am|pm|uhr|h)(?=\s)/))) { hour = Number(m[1]); suffix = m[2]; }
    if (hour !== null) {
      if (suffix === 'pm' && hour < 12) hour += 12;
      else if (suffix === 'am' && hour === 12) hour = 0;
      else if (!suffix && hour >= 1 && hour <= 7) hour += 12; // "7:30" with no am/pm means evening
      if (hour > 23 || minute > 59) { hour = null; minute = 0; }
    }

    if (cut(/\s(tonight|heute abend)\s/)) { day = weekday(now); if (hour === null) hour = 20; }
    else if (cut(/\s(today|heute)\s/)) day = weekday(now);
    else if (cut(/\s(tomorrow|morgen)\s/)) day = (weekday(now) + 1) % 7;
    else {
      for (let i = 0; i < 7 && day === null; i++) {
        for (const name of DAYS[i]) if (cut(new RegExp(`\\s${name}\\s`))) { day = i; break; }
      }
    }
    if (day === null) day = weekday(now);

    const words = rest.split(/\s+/).filter((w) => w && !FILLER.has(w));
    let title = words.join(' ').trim() || 'hang out';
    title = title[0].toUpperCase() + title.slice(1);
    return { day, hour, minute, title };
  }

  // Which row of the week a plan lands in
  function band(hour) {
    if (hour === null) return 2;
    if (hour < 13) return 0;
    if (hour < 17) return 1;
    if (hour < 21) return 2;
    return 3;
  }

  root.parsePlan = parsePlan;
  root.planBand = band;
  if (typeof module === 'object') module.exports = { parsePlan, band };
})(typeof window === 'object' ? window : globalThis);

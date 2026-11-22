/**
 * Kody Runner — pure simulation core.
 *
 * Plain script, dual-exposed as CJS (vitest) and window.KodyCore (classic
 * <script src> under file://). PURE by contract: no DOM, no canvas, no
 * localStorage, no Date.now, no Math.random. Randomness comes from the
 * injected state.rng (() => float [0,1)); time advances only via step().
 *
 * The renderer/shell owns: drawing, rAF accumulator loop, input capture,
 * audio, persistence (hi score / mute), and all cosmetic timing (run cycle,
 * blink, wheel spin). Entities carry spawn-time random phase fields so the
 * renderer can desynchronize ambient animation without touching the sim.
 */

const CONSTANTS = {
  // Viewport (logical pixels)
  W: 420,
  H: 160,
  groundY: 136,

  // Fixed step
  stepMs: 1000 / 60,
  maxFrameMs: 100, // shell-side clamp guard (documented here, applied in shell)

  // Kody
  kodyX: 38, // draw origin x
  kodyStandY: 136 - 39, // draw origin y when standing (body bottom row = 39)
  // Relative to draw origin. Normal hugs the LOW HORIZONTAL run silhouette
  // (rig v2 quadruped: union of run-a/run-b bounds x 0..38, y 14..39) inset
  // ~2px forgiveness on left/right/top; bottom stays on the ground row. Its
  // top (y=16 → world 113) sits under the high bird's hitbox bottom (world
  // 116 exclusive), so head-height birds punish running; ducking (top world
  // 117) clears them.
  hitboxNormal: { x: 2, y: 16, w: 35, h: 23 },
  hitboxDuck: { x: 4, y: 20, w: 32, h: 19 },

  // Physics (per step). Feel-tuned 2026-07-24 (twice, per Pablo): floaty jump
  // — apex ~88px, ~680ms airtime. The original 0.6/-8.4 arc was too snappy
  // to control; 0.5 was still a bit heavy.
  gravity: 0.42,
  jumpV0: -8.6,
  shortHopV: -3, // releasing jump while vy < -3 clamps vy to -3
  diveV: 8, // down input mid-air

  // World speed (px per step)
  speedBase: 2.6,
  speedRamp: 0.0012,
  speedCap: 6.5,

  // Score
  scoreDivisor: 8, // score = floor(distance / 8)
  milestoneEvery: 100,

  // Spawning
  spawnGapBase: 55, // minGap = 55 + speed * 14 (logical px)
  spawnGapSpeedFactor: 14,
  spawnGapJitter: 160, // gap = randInt(minGap, minGap + 160)
  spawnWeights: [
    ["cactus-small", 0.3],
    ["cactus-tall", 0.2],
    ["cactus-cluster", 0.2],
    ["tumbleweed", 0.15],
    ["bird", 0.15],
  ],
  birdMinScore: 150, // birds only after score > 150
  birdHighY: 136 - 30, // head height — duck under it
  birdLowY: 136 - 14, // low — jump over it

  // Sprite bounds (logical px). Hitboxes are these inset by obstacleInset.
  sprites: {
    "cactus-small": { w: 16, h: 24 },
    "cactus-tall": { w: 20, h: 36 },
    "cactus-cluster": { w: 34, h: 24 },
    tumbleweed: { w: 16, h: 16 },
    bird: { w: 20, h: 12 },
  },
  obstacleInset: 2,

  // Tumbleweed motion
  tumbleweedSpeedFactor: 1.15,
  tumbleweedHopApex: 18,
  tumbleweedHopStep: 0.11, // hopPhase radians per step

  // Restart gate after death: 350ms at 60 steps/s
  restartCooldownSteps: 21,
};

// Tumbleweeds scroll at tumbleweedSpeedFactor × world speed, so between
// spawning (x = W + 2) and reaching Kody's lane they close this many px on
// the obstacle ahead (speed-independent). The scheduler pads tumbleweed gaps
// by it so the guaranteed minimum gap survives at the moment it matters.
CONSTANTS.tumbleweedGapBonus = Math.ceil(
  (CONSTANTS.W + 2 - CONSTANTS.kodyX) * (1 - 1 / CONSTANTS.tumbleweedSpeedFactor),
);

/** Deterministic default rng (mulberry32). Shell may inject Math.random. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] (inclusive). min may be fractional (floored). */
function randInt(rng, min, max) {
  return Math.floor(min) + Math.floor(rng() * (Math.floor(max) - Math.floor(min) + 1));
}

function aabb(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Kody's world-space hitbox for the current pose. */
function kodyHitbox(state) {
  const hb = state.kody.ducking ? CONSTANTS.hitboxDuck : CONSTANTS.hitboxNormal;
  return {
    x: CONSTANTS.kodyX + hb.x,
    y: state.kody.y + hb.y,
    w: hb.w,
    h: hb.h,
  };
}

/** Obstacle world-space hitbox: sprite bounds inset 2px on every side. */
function obstacleHitbox(o) {
  const inset = CONSTANTS.obstacleInset;
  return { x: o.x + inset, y: o.y + inset, w: o.w - 2 * inset, h: o.h - 2 * inset };
}

function minGapFor(speed) {
  return CONSTANTS.spawnGapBase + speed * CONSTANTS.spawnGapSpeedFactor;
}

/**
 * Pre-picks the next obstacle type (state.nextType) so tumbleweeds can be
 * scheduled with tumbleweedGapBonus extra distance — without it their 1.15x
 * speed erodes the minimum gap into provably unclearable patterns.
 */
function scheduleNextSpawn(state) {
  state.nextType = pickType(state);
  const minGap = minGapFor(state.speed);
  state.spawnCountdown =
    minGap +
    Math.floor(state.rng() * (CONSTANTS.spawnGapJitter + 1)) +
    (state.nextType === "tumbleweed" ? CONSTANTS.tumbleweedGapBonus : 0);
}

/** Weighted obstacle type pick; birds excluded until score > birdMinScore. */
function pickType(state) {
  const birdAllowed = state.score > CONSTANTS.birdMinScore;
  const pool = CONSTANTS.spawnWeights.filter(
    ([type]) => birdAllowed || type !== "bird",
  );
  const total = pool.reduce((sum, [, w]) => sum + w, 0);
  let r = state.rng() * total;
  for (const [type, w] of pool) {
    r -= w;
    if (r < 0) return type;
  }
  return pool[pool.length - 1][0];
}

/**
 * Create an obstacle entity and append it to state.obstacles.
 * opts: { x?: number, variant?: 'high'|'low' (bird only) }
 * Entities carry per-instance random phase fields for ambient animation.
 */
function spawnObstacle(state, type, opts) {
  opts = opts || {};
  const dims = CONSTANTS.sprites[type];
  const entity = {
    type,
    x: opts.x !== undefined ? opts.x : CONSTANTS.W + 2,
    w: dims.w,
    h: dims.h,
    y: CONSTANTS.groundY - dims.h,
  };
  if (type === "bird") {
    const variant =
      opts.variant || (state.rng() < 0.5 ? "high" : "low");
    entity.variant = variant;
    entity.y = variant === "high" ? CONSTANTS.birdHighY : CONSTANTS.birdLowY;
    entity.flapPhase = state.rng(); // fraction of flap cycle
  } else if (type === "tumbleweed") {
    entity.baseY = entity.y;
    entity.hopPhase = state.rng() * Math.PI * 2;
    entity.rollPhase = state.rng(); // fraction of the 4-frame roll cycle
  } else {
    entity.swayPhase = state.rng(); // fraction of the a/b sway cycle
  }
  state.obstacles.push(entity);
  return entity;
}

function freshRunFields() {
  return {
    stepsPlayed: 0,
    speed: CONSTANTS.speedBase,
    distance: 0,
    score: 0,
    obstacles: [],
    cooldown: 0,
    kody: {
      y: CONSTANTS.kodyStandY,
      vy: 0,
      onGround: true,
      ducking: false,
      diving: false,
    },
  };
}

/** opts: { rng?: () => number, hi?: number } */
function createGame(opts) {
  opts = opts || {};
  const state = Object.assign(
    {
      mode: "title", // 'title' | 'playing' | 'gameover'
      rng: opts.rng || makeRng(0x6b6f6479), // deterministic unless injected
      hi: opts.hi || 0,
      stepCount: 0,
      events: [],
      spawnCountdown: 0,
    },
    freshRunFields(),
  );
  scheduleNextSpawn(state);
  return state;
}

/** Reset for a new run, keeping rng and hi. Leaves mode = 'playing'. */
function resetRun(state) {
  Object.assign(state, freshRunFields());
  state.mode = "playing";
  scheduleNextSpawn(state);
}

function stepPlaying(state, input) {
  const k = state.kody;
  state.stepsPlayed++;

  // 1. Speed ramp
  state.speed = Math.min(
    CONSTANTS.speedCap,
    CONSTANTS.speedBase + CONSTANTS.speedRamp * state.stepsPlayed,
  );

  // 2. Distance / score / milestone
  state.distance += state.speed;
  const newScore = Math.floor(state.distance / CONSTANTS.scoreDivisor);
  if (
    Math.floor(newScore / CONSTANTS.milestoneEvery) >
    Math.floor(state.score / CONSTANTS.milestoneEvery)
  ) {
    state.events.push("milestone");
  }
  state.score = newScore;

  // 3. Input
  let jumpedThisStep = false;
  if (input.jumpPressed && k.onGround) {
    k.vy = CONSTANTS.jumpV0;
    k.onGround = false;
    k.ducking = false;
    jumpedThisStep = true;
    state.events.push("jumped");
  }
  // Early release → short hop. Never on the step that initiated the jump: a
  // sub-step tap arrives as {jumpPressed:true, jumpHeld:false} and must get
  // the full short-hop arc, not a degenerate ~9px hop.
  if (!jumpedThisStep && !k.onGround && !input.jumpHeld && k.vy < CONSTANTS.shortHopV) {
    k.vy = CONSTANTS.shortHopV;
  }
  if (k.onGround) {
    k.ducking = !!input.duckHeld;
  } else {
    k.ducking = false;
    if (input.duckHeld && !k.diving) {
      k.vy = CONSTANTS.diveV; // mid-air down input → dive
      k.diving = true;
      state.events.push("dived");
    }
  }

  // 4. Vertical physics
  if (!k.onGround) {
    k.vy += CONSTANTS.gravity;
    k.y += k.vy;
    if (k.y >= CONSTANTS.kodyStandY) {
      k.y = CONSTANTS.kodyStandY;
      k.vy = 0;
      k.onGround = true;
      k.diving = false;
      state.events.push("landed");
    }
  }

  // 5. Spawner (distance-based; no carry, so real gaps are >= scheduled gap.
  // The type was pre-picked at scheduling time — see scheduleNextSpawn.)
  state.spawnCountdown -= state.speed;
  if (state.spawnCountdown <= 0) {
    spawnObstacle(state, state.nextType || pickType(state));
    state.events.push("spawned");
    scheduleNextSpawn(state);
  }

  // 6. Move + cull obstacles
  for (const o of state.obstacles) {
    if (o.type === "tumbleweed") {
      o.x -= state.speed * CONSTANTS.tumbleweedSpeedFactor;
      o.hopPhase += CONSTANTS.tumbleweedHopStep;
      o.y =
        o.baseY - CONSTANTS.tumbleweedHopApex * Math.abs(Math.sin(o.hopPhase));
    } else {
      o.x -= state.speed;
    }
  }
  state.obstacles = state.obstacles.filter((o) => o.x + o.w > -20);

  // 7. Collision
  const kodyBox = kodyHitbox(state);
  for (const o of state.obstacles) {
    if (aabb(kodyBox, obstacleHitbox(o))) {
      state.mode = "gameover";
      state.hi = Math.max(state.hi, state.score);
      state.cooldown = CONSTANTS.restartCooldownSteps;
      state.events.push("died");
      break;
    }
  }
}

/**
 * Advance the simulation exactly ONE fixed step (1/60s).
 * input: { jumpPressed?, jumpHeld?, duckHeld? } — jumpPressed is the edge
 * (freshly pressed this step), jumpHeld is the level.
 * state.events is replaced each step with the events emitted by THIS step.
 */
function step(state, input) {
  input = input || {};
  state.events = [];
  state.stepCount++;

  if (state.mode === "title") {
    if (input.jumpPressed) {
      state.mode = "playing";
      state.events.push("started");
    }
    return state;
  }

  if (state.mode === "gameover") {
    if (state.cooldown > 0) {
      state.cooldown--; // input ignored during the 350ms post-death gate
    } else if (input.jumpPressed) {
      resetRun(state);
      state.events.push("restarted");
    }
    return state;
  }

  stepPlaying(state, input);
  return state;
}

/** Convenience: advance n fixed steps with the same input. */
function stepN(state, n, input) {
  for (let i = 0; i < n; i++) step(state, input);
  return state;
}

const KodyCore = {
  CONSTANTS,
  createGame,
  resetRun,
  step,
  stepN,
  aabb,
  kodyHitbox,
  obstacleHitbox,
  spawnObstacle,
  pickType,
  randInt,
  makeRng,
  minGapFor,
};

if (typeof module !== "undefined") module.exports = KodyCore;
if (typeof window !== "undefined") window.KodyCore = KodyCore;

import './style.css';

// ============================================================
// LODICKA — 2-Player Boat Adventure
// Split-screen: each player has their own world that scrolls
// at its own pace, so speed effects don't desync them.
// Reach 20000 points to dock at the port and win!
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ============================================================
// Sound effects (Web Audio API)
// ============================================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(freq, duration, type = 'sine', vol = 0.15) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
  gain.gain.setValueAtTime(vol, audioCtx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  osc.stop(audioCtx.currentTime + duration);
}

const sfxCollect  = () => { playSound(880, 0.1); playSound(1100, 0.15); };
const sfxHit      = () => playSound(150, 0.3, 'sawtooth', 0.12);
const sfxSplash   = () => { playSound(200, 0.5, 'triangle', 0.1); playSound(100, 0.6, 'sine', 0.08); };
const sfxPowerup  = () => { playSound(523, 0.1); setTimeout(() => playSound(659, 0.1), 80); setTimeout(() => playSound(784, 0.15), 160); };
const sfxWeird    = () => { playSound(300, 0.2, 'square', 0.08); playSound(400, 0.15, 'sawtooth', 0.06); };
const sfxJump     = () => { playSound(440, 0.08); setTimeout(() => playSound(660, 0.12), 70); };
const sfxGate     = () => { playSound(1320, 0.08); playSound(880, 0.1); };
const sfxTreasure = () => { playSound(880, 0.08); setTimeout(() => playSound(1100, 0.08), 60); setTimeout(() => playSound(1320, 0.15), 120); };
const sfxTruck    = () => { playSound(180, 0.5, 'sawtooth', 0.07); playSound(140, 0.6, 'sine', 0.05); };
const sfxWin      = () => { playSound(523, 0.15); setTimeout(() => playSound(659, 0.15), 130); setTimeout(() => playSound(784, 0.15), 260); setTimeout(() => playSound(1047, 0.4), 390); };

// ============================================================
// DOM refs
// ============================================================
const hudEl = document.getElementById('hud');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const winnerEl = document.getElementById('winner');
const finalScoresEl = document.getElementById('final-scores');
const highScoreEl = document.getElementById('high-score');

// ============================================================
// Constants
// ============================================================
const BASE_SPEED = 2.5;
const SPEED_INCREASE = 0.0008;
const MAX_SPEED_MULT = 4;
const LANE_PADDING = 50;
const BOAT_SIZE = 44;
const OBSTACLE_SIZE = 38;
const SPAWN_INTERVAL_BASE = 900;
const SPAWN_INTERVAL_MIN = 350;
const ISLAND_SPAWN_RATE = 1400;
const WAVE_SPAWN_RATE = 2400;
const GATE_SPAWN_RATE = 3200;
const INVINCIBLE_DURATION = 1500;
const EFFECT_DURATION = 3000;
const DIVIDER_WIDTH = 4;
const WIN_SCORE = 20000;
const JUMP_DURATION = 800;
const JUMP_HEIGHT = 70;

// ============================================================
// Obstacle definitions — emoji-based or render-based
// ============================================================
const OBSTACLES = [
  { emoji: '🥩', effect: 'big',         label: '🥩 Too full! BIG boat!',      bad: false },
  { emoji: '🚤', effect: 'bounce',      label: '🚤 BONK! Pushed away!',       bad: true  },
  { emoji: '🐙', effect: 'ink',         label: "🐙 INK! Can't see!",          bad: true  },
  { emoji: '🕷️', effect: 'reverse',     label: '🕷️ Controls reversed!',       bad: true  },
  { emoji: '🐋', effect: 'wave',        label: '🐋 WHOOSH! Big wave!',        bad: true  },
  { emoji: '🌊', effect: 'spin',        label: '🌊 SPINNING!',                bad: true  },
  { emoji: '🦈', effect: 'damage',      label: '🦈 SHARK BITE!',              bad: true  },
  { emoji: '🐢', effect: 'shield',      label: '🐢 Turtle shield!',           bad: false },
  { emoji: '💰', effect: 'money',       label: '💰 +50 gold!',                bad: false },
  { emoji: '💎', effect: 'diamond',     label: '💎 +150 diamond!',            bad: false },
  { emoji: '🐠', effect: 'speed_boost', label: '🐠 Fish boost!',              bad: false },
  { emoji: '🪸', effect: 'slow',        label: '🪸 Coral! Slowing...',        bad: false },
  { emoji: '🐚', effect: 'shrink',      label: '🐚 Tiny boat!',               bad: false },
  { emoji: '🦀', effect: 'zigzag',      label: '🦀 Crab grabbed wheel!',      bad: true  },
  { emoji: '🎈', effect: 'float',       label: '🎈 Floating!',                bad: false },
  { emoji: '🧊', effect: 'freeze',      label: '🧊 BRRR! Frozen!',            bad: true  },
  { render: 'shipwreck', effect: 'damage', label: '🚢 SHIPWRECK! Crash!',     bad: true  },
];

const ISLAND_DECORATIONS = ['🌴', '🌴🌴', '🏠', '🏡', '🏘️', '⛪', '🏰', '🌴🏠', '🏠🌴', '🌲🏡', '🏠🏠'];

// ============================================================
// Global state
// ============================================================
let W, H;
let halfW;
let gameState = 'menu'; // menu | playing | over
let highScore = parseInt(localStorage.getItem('lodicka_high') || '0');
let elapsed = 0;
let keys = {};
let winner = null; // player who reached the port

// ============================================================
// Player factory
// ============================================================
function createPlayer(id, controls) {
  return {
    id,
    controls,
    score: 0,
    lives: 3,
    speedMult: 1,
    lastSpawn: 0,
    lastIslandSpawn: 0,
    lastWaveSpawn: 0,
    lastGateSpawn: 0,
    invincibleUntil: 0,
    shieldUntil: 0,
    activeEffects: {},
    effectTimeouts: {},
    boat: { x: 0, y: 0, w: BOAT_SIZE, h: BOAT_SIZE * 1.3, angle: 0, scale: 1, jumpStart: -1e9 },
    obstacles: [],
    islands: [],
    bigWaves: [],
    gates: [],
    floatTexts: [],
    particles: [],
    wakeParticles: [],
    bowWaves: [],
    ripples: [],
    boatTilt: 0,
    waterOffset: 0,
    alive: true,
    portSpawned: false,
    port: null,
    docked: false,
    dockStart: 0,
    cargoBoxes: [],
    truck: null,
    won: false,
    livesEl: document.getElementById(`lives-${id}`),
    scoreEl: document.getElementById(`score-${id}`),
    speedEl: document.getElementById(`speed-${id}`),
    effectEl: document.getElementById(`effect-${id}`),
  };
}

const players = [
  createPlayer(1, { left: ['a', 'A'], right: ['d', 'D'] }),
  createPlayer(2, { left: ['ArrowLeft'], right: ['ArrowRight'] }),
];

// ============================================================
// Resize
// ============================================================
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  halfW = W / 2;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const p of players) {
    p.boat.y = H - 120;
    if (p.boat.x === 0) p.boat.x = halfW / 2;
    else p.boat.x = Math.max(LANE_PADDING, Math.min(halfW - LANE_PADDING, p.boat.x));
  }
}
window.addEventListener('resize', resize);
resize();

// ============================================================
// Input
// ============================================================
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ' || e.key === 'Enter') {
    if (gameState === 'menu' || gameState === 'over') startGame();
  }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// ============================================================
// Lifecycle
// ============================================================
function startGame() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  elapsed = 0;
  winner = null;
  for (const p of players) {
    p.score = 0;
    p.scoreAcc = 0;
    p.lives = 3;
    p.speedMult = 1;
    p.lastSpawn = 0;
    p.lastIslandSpawn = 0;
    p.lastWaveSpawn = 0;
    p.lastGateSpawn = 0;
    p.invincibleUntil = 0;
    p.shieldUntil = 0;
    p.obstacles = [];
    p.islands = [];
    p.bigWaves = [];
    p.gates = [];
    p.floatTexts = [];
    p.particles = [];
    p.wakeParticles = [];
    p.bowWaves = [];
    p.ripples = [];
    p.boatTilt = 0;
    p.waterOffset = 0;
    p.alive = true;
    p.portSpawned = false;
    p.port = null;
    p.docked = false;
    p.dockStart = 0;
    p.cargoBoxes = [];
    p.truck = null;
    p.won = false;
    Object.values(p.effectTimeouts).forEach(clearTimeout);
    p.effectTimeouts = {};
    p.activeEffects = {};
    p.boat.x = halfW / 2;
    p.boat.y = H - 120;
    p.boat.angle = 0;
    p.boat.scale = 1;
    p.boat.jumpStart = -1e9;
    p.effectEl.classList.add('hidden');
  }
  gameState = 'playing';
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  hudEl.classList.remove('hidden');
}

function gameOver() {
  gameState = 'over';
  hudEl.classList.add('hidden');
  const [p1, p2] = players;
  const best = Math.max(p1.score, p2.score);
  if (best > highScore) {
    highScore = best;
    localStorage.setItem('lodicka_high', String(highScore));
  }
  if (winner) {
    winnerEl.textContent = `🏆 P${winner.id} reached the PORT!`;
  } else if (p1.score > p2.score) winnerEl.textContent = '🏆 P1 wins!';
  else if (p2.score > p1.score) winnerEl.textContent = '🏆 P2 wins!';
  else winnerEl.textContent = '🤝 Tie!';
  finalScoresEl.innerHTML = `P1: ${p1.score}<br>P2: ${p2.score}`;
  highScoreEl.textContent = `Best ever: ${highScore}`;
  gameOverScreen.classList.remove('hidden');
}

// ============================================================
// Helpers
// ============================================================
function isBoatJumping(p) {
  return elapsed - p.boat.jumpStart < JUMP_DURATION;
}
function jumpInfo(p) {
  if (!isBoatJumping(p)) return { y: 0, scale: 1, progress: 0 };
  const progress = (elapsed - p.boat.jumpStart) / JUMP_DURATION;
  return {
    y: -Math.sin(progress * Math.PI) * JUMP_HEIGHT,
    scale: 1 + Math.sin(progress * Math.PI) * 0.2,
    progress,
  };
}

function showEffect(p, text) {
  p.effectEl.textContent = text;
  p.effectEl.classList.remove('hidden');
  clearTimeout(p.effectTimeouts._toast);
  p.effectTimeouts._toast = setTimeout(() => p.effectEl.classList.add('hidden'), 2000);
}

function pushFloatText(p, x, y, text, color = '#ffd700') {
  p.floatTexts.push({ x, y, text, color, life: 1 });
}

// ============================================================
// Apply effect
// ============================================================
function applyEffect(p, obs) {
  const def = obs.def;
  showEffect(p, def.label);

  for (let i = 0; i < 8; i++) {
    p.particles.push({
      x: obs.x, y: obs.y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6,
      life: 1,
      color: def.bad ? '#ff4444' : '#ffdd44',
      size: Math.random() * 8 + 4,
    });
  }

  switch (def.effect) {
    case 'money':
      p.score += 50;
      pushFloatText(p, obs.x, obs.y, '+50 💰', '#ffd700');
      sfxTreasure();
      break;

    case 'diamond':
      p.score += 150;
      pushFloatText(p, obs.x, obs.y, '+150 💎', '#9be7ff');
      sfxTreasure();
      break;

    case 'damage':
      if (p.shieldUntil > elapsed) {
        showEffect(p, '🐢 Shield blocked it!');
        p.shieldUntil = 0;
        sfxPowerup();
        break;
      }
      if (p.invincibleUntil > elapsed) break;
      p.lives--;
      sfxHit();
      p.invincibleUntil = elapsed + INVINCIBLE_DURATION;
      if (p.lives <= 0) {
        p.alive = false;
        sfxSplash();
        if (players.every(pl => !pl.alive)) gameOver();
      }
      break;

    case 'shield':
      p.shieldUntil = elapsed + EFFECT_DURATION * 2;
      sfxPowerup();
      break;

    case 'big':
      p.boat.scale = 1.6;
      sfxWeird();
      clearTimeout(p.effectTimeouts.big);
      p.effectTimeouts.big = setTimeout(() => { p.boat.scale = 1; }, EFFECT_DURATION);
      break;

    case 'shrink':
      p.boat.scale = 0.6;
      clearTimeout(p.effectTimeouts.shrink);
      p.effectTimeouts.shrink = setTimeout(() => { p.boat.scale = 1; }, EFFECT_DURATION);
      break;

    case 'bounce':
      p.boat.x += (p.boat.x > halfW / 2 ? -1 : 1) * 120;
      p.boat.x = Math.max(LANE_PADDING, Math.min(halfW - LANE_PADDING, p.boat.x));
      sfxHit();
      break;

    case 'ink':         p.activeEffects.ink         = elapsed + EFFECT_DURATION; sfxWeird();   break;
    case 'reverse':     p.activeEffects.reverse     = elapsed + EFFECT_DURATION; sfxWeird();   break;
    case 'wave':
      p.boat.x += (Math.random() > 0.5 ? 1 : -1) * 150;
      p.boat.x = Math.max(LANE_PADDING, Math.min(halfW - LANE_PADDING, p.boat.x));
      sfxSplash();
      break;
    case 'spin':        p.activeEffects.spin        = elapsed + EFFECT_DURATION * 0.7; sfxWeird(); break;
    case 'speed_boost': p.activeEffects.speed_boost = elapsed + EFFECT_DURATION; sfxCollect(); break;
    case 'slow':        p.activeEffects.slow        = elapsed + EFFECT_DURATION; sfxWeird();   break;
    case 'zigzag':      p.activeEffects.zigzag      = elapsed + EFFECT_DURATION; sfxWeird();   break;
    case 'float':       p.activeEffects.float       = elapsed + EFFECT_DURATION; sfxPowerup(); break;
    case 'freeze':      p.activeEffects.freeze      = elapsed + 1500;            sfxHit();     break;
  }
}

// ============================================================
// Spawning
// ============================================================
function spawnObstacle(p) {
  const def = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
  const x = LANE_PADDING + Math.random() * (halfW - LANE_PADDING * 2);
  p.obstacles.push({
    x, y: -OBSTACLE_SIZE,
    def,
    size: OBSTACLE_SIZE,
    wobble: Math.random() * Math.PI * 2,
  });
}

function spawnIsland(p) {
  const side = Math.random() > 0.5 ? 'left' : 'right';
  const size = 50 + Math.random() * 90;
  const xEdge = side === 'left'
    ? -size * 0.2 + Math.random() * 30
    : halfW - size * 0.8 - Math.random() * 30;
  const midWater = Math.random() < 0.25;
  const finalX = midWater
    ? LANE_PADDING + Math.random() * (halfW - LANE_PADDING * 2) - size * 0.5
    : xEdge;
  const deco = ISLAND_DECORATIONS[Math.floor(Math.random() * ISLAND_DECORATIONS.length)];
  p.islands.push({
    x: finalX, y: -size * 1.2,
    w: size * 1.6, h: size * 1.1,
    side, deco,
    hasBeach: Math.random() > 0.3,
    hasDock: Math.random() > 0.7,
  });
}

function spawnBigWave(p) {
  const width = halfW * (0.55 + Math.random() * 0.35);
  const x = LANE_PADDING + Math.random() * (halfW - LANE_PADDING * 2 - width) + width / 2;
  p.bigWaves.push({
    x, y: -25, width, height: 28,
    used: false,
    foamSeed: Math.random() * 100,
  });
}

function spawnGate(p) {
  const gap = 100 + Math.random() * 50;
  const x = LANE_PADDING + gap / 2 + Math.random() * (halfW - LANE_PADDING * 2 - gap);
  p.gates.push({
    x, y: -40, gap,
    passed: false,
  });
}

function spawnPort(p) {
  p.portSpawned = true;
  p.port = {
    x: halfW / 2,
    y: -260,
    width: 240,
    height: 180,
    landY: 0,
    dockY: 0,
  };
  // Clear existing obstacles for clean approach
  p.obstacles = [];
  p.gates = [];
  p.bigWaves = [];
  showEffect(p, '⚓ PORT AHEAD!');
}

// ============================================================
// Update one player
// ============================================================
function updatePlayer(p, dt) {
  if (!p.alive) {
    decayParticles(p);
    return;
  }

  // Score grows from elapsed time × speed (only while playing toward goal)
  if (!p.docked) {
    p.scoreAcc = (p.scoreAcc || 0) + dt * 0.06 * p.speedMult;
    const inc = Math.floor(p.scoreAcc);
    p.score += inc;
    p.scoreAcc -= inc;
  }
  p.speedMult = Math.min(MAX_SPEED_MULT, 1 + elapsed * SPEED_INCREASE);

  let moveSpeed = BASE_SPEED * p.speedMult;
  if (p.activeEffects.speed_boost > elapsed) moveSpeed *= 1.5;
  if (p.activeEffects.slow > elapsed) moveSpeed *= 0.5;

  for (const key of Object.keys(p.activeEffects)) {
    if (p.activeEffects[key] <= elapsed) delete p.activeEffects[key];
  }

  // Spawn the port once score crosses the threshold
  if (!p.portSpawned && p.score >= WIN_SCORE) spawnPort(p);

  // Movement input — disabled during dock sequence
  let moveDir = 0;
  if (!p.activeEffects.freeze && !p.docked) {
    if (p.controls.left.some(k => keys[k])) moveDir = -1;
    if (p.controls.right.some(k => keys[k])) moveDir = 1;
  }
  if (p.activeEffects.reverse) moveDir *= -1;
  if (p.activeEffects.zigzag) moveDir += Math.sin(elapsed * 0.008) * 0.8;

  // Auto-pull boat to port center while approaching
  if (p.portSpawned && !p.docked) {
    const targetX = p.port.x;
    p.boat.x += (targetX - p.boat.x) * 0.06;
  }

  if (!p.docked) {
    const lateralSpeed = 5 + p.speedMult;
    p.boat.x += moveDir * lateralSpeed;
    p.boat.x = Math.max(LANE_PADDING, Math.min(halfW - LANE_PADDING, p.boat.x));
  }

  // Tilt
  const targetTilt = moveDir * 0.35;
  p.boatTilt += (targetTilt - p.boatTilt) * 0.1;
  if (p.activeEffects.spin) p.boat.angle += 0.15;
  else p.boat.angle = p.boatTilt;

  // Float bob
  if (p.activeEffects.float && !p.docked) {
    p.boat.y = H - 120 - Math.sin(elapsed * 0.006) * 30;
  } else {
    p.boat.y = H - 120;
  }

  p.waterOffset += moveSpeed * 0.5;

  // Spawn (skip when port is en route)
  if (!p.portSpawned) {
    const spawnInterval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - p.speedMult * 120);
    if (elapsed - p.lastSpawn > spawnInterval) { spawnObstacle(p); p.lastSpawn = elapsed; }
    if (elapsed - p.lastIslandSpawn > ISLAND_SPAWN_RATE) { spawnIsland(p); p.lastIslandSpawn = elapsed; }
    if (elapsed - p.lastWaveSpawn > WAVE_SPAWN_RATE) { spawnBigWave(p); p.lastWaveSpawn = elapsed; }
    if (elapsed - p.lastGateSpawn > GATE_SPAWN_RATE) { spawnGate(p); p.lastGateSpawn = elapsed; }
  }

  const jumping = isBoatJumping(p);

  // Obstacles
  for (let i = p.obstacles.length - 1; i >= 0; i--) {
    const o = p.obstacles[i];
    o.y += moveSpeed;
    o.wobble += 0.05;

    const bw = p.boat.w * p.boat.scale;
    const bh = p.boat.h * p.boat.scale;
    const dx = Math.abs(o.x - p.boat.x);
    const dy = Math.abs(o.y - p.boat.y);
    if (dx < (bw + o.size) * 0.4 && dy < (bh + o.size) * 0.4) {
      // Jumping skips bad obstacles only — you can still grab treasure mid-air
      if (jumping && o.def.bad) continue;
      applyEffect(p, o);
      p.obstacles.splice(i, 1);
      continue;
    }
    if (o.y > H + 60) p.obstacles.splice(i, 1);
  }

  // Islands
  for (let i = p.islands.length - 1; i >= 0; i--) {
    p.islands[i].y += moveSpeed * 0.6;
    if (p.islands[i].y > H + 100) p.islands.splice(i, 1);
  }

  // Big waves — auto-jump on contact
  for (let i = p.bigWaves.length - 1; i >= 0; i--) {
    const w = p.bigWaves[i];
    w.y += moveSpeed;
    if (!w.used && !jumping
        && Math.abs(w.y - p.boat.y) < 18
        && Math.abs(w.x - p.boat.x) < w.width / 2 + p.boat.w * p.boat.scale * 0.3) {
      p.boat.jumpStart = elapsed;
      w.used = true;
      sfxJump();
    }
    if (w.y > H + 40) p.bigWaves.splice(i, 1);
  }

  // Gates — bonus for passing through the gap
  for (let i = p.gates.length - 1; i >= 0; i--) {
    const g = p.gates[i];
    g.y += moveSpeed;
    if (!g.passed && g.y > p.boat.y - 12 && g.y < p.boat.y + 12) {
      if (Math.abs(p.boat.x - g.x) < g.gap / 2 - p.boat.w * p.boat.scale * 0.2) {
        g.passed = true;
        p.score += 100;
        pushFloatText(p, g.x, g.y - 20, '+100', '#7cffb3');
        sfxGate();
      } else {
        g.passed = true; // missed — mark consumed
      }
    }
    if (g.y > H + 60) p.gates.splice(i, 1);
  }

  // Port + dock sequence
  if (p.portSpawned && p.port) updatePort(p, moveSpeed);

  // Wake (skip during dock)
  if (!p.docked) {
    if (Math.random() < 0.5) {
      p.wakeParticles.push({
        x: p.boat.x + (Math.random() - 0.5) * 16 * p.boat.scale,
        y: p.boat.y + p.boat.h * p.boat.scale * 0.45,
        vx: (Math.random() - 0.5) * 1.5,
        vy: Math.random() * 1.5 + 0.5,
        life: 1, size: Math.random() * 4 + 2,
      });
    }
    if (Math.random() < 0.6) {
      const spread = (Math.random() > 0.5 ? 1 : -1);
      p.bowWaves.push({
        x: p.boat.x + spread * 8 * p.boat.scale,
        y: p.boat.y - p.boat.h * p.boat.scale * 0.3,
        vx: spread * (1.5 + p.speedMult * 0.5),
        vy: 0.8 + Math.random() * 0.5,
        life: 1, size: Math.random() * 6 + 4, type: 'arc',
      });
    }
    if (Math.random() < 0.3) {
      const side = Math.random() > 0.5 ? 1 : -1;
      p.bowWaves.push({
        x: p.boat.x + side * p.boat.w * p.boat.scale * 0.4,
        y: p.boat.y,
        vx: side * (2 + p.speedMult * 0.3),
        vy: Math.random() * 0.8,
        life: 1, size: Math.random() * 3 + 2, type: 'splash',
      });
    }
  }

  // Random ripples
  if (Math.random() < 0.03) {
    p.ripples.push({
      x: Math.random() * halfW, y: Math.random() * H, r: 0, life: 1,
    });
  }
  for (let i = p.ripples.length - 1; i >= 0; i--) {
    const r = p.ripples[i];
    r.r += 0.3; r.life -= 0.01; r.y += moveSpeed * 0.3;
    if (r.life <= 0 || r.y > H + 50) p.ripples.splice(i, 1);
  }

  // Float texts
  for (let i = p.floatTexts.length - 1; i >= 0; i--) {
    const ft = p.floatTexts[i];
    ft.y -= 0.8; ft.life -= 0.012;
    if (ft.life <= 0) p.floatTexts.splice(i, 1);
  }

  decayParticles(p);
}

function updatePort(p, moveSpeed) {
  // Port arrives, then locks in place above the boat
  const lockY = p.boat.y - 80;
  if (!p.docked) {
    p.port.y += moveSpeed * 0.6;
    if (p.port.y >= lockY) p.port.y = lockY;
  }

  // Trigger docking when port has arrived AND boat is aligned
  if (!p.docked && p.port.y >= lockY - 1 && Math.abs(p.boat.x - p.port.x) < 20) {
    p.docked = true;
    p.dockStart = elapsed;
    p.cargoBoxes = [];
    for (let i = 0; i < 3; i++) {
      p.cargoBoxes.push({
        startX: p.boat.x + (Math.random() - 0.5) * 18,
        startY: p.boat.y - 12 - i * 6,
        delay: 800 + i * 350,
        progress: 0,
      });
    }
    p.truck = { x: -80, parked: false, leaving: false };
    sfxTruck();
  }

  if (p.docked) runDockSequence(p);
}

function runDockSequence(p) {
  const t = elapsed - p.dockStart;
  const truckParkX = p.port.x - 60;

  // Truck drives in (0–800ms), parks, then drives off (3500ms+)
  if (t < 800) {
    p.truck.x = -80 + (t / 800) * (truckParkX + 80);
  } else if (t < 3500) {
    p.truck.x = truckParkX;
    p.truck.parked = true;
  } else if (t < 5000) {
    p.truck.parked = false;
    p.truck.leaving = true;
    p.truck.x = truckParkX + ((t - 3500) / 1500) * (halfW + 100);
  } else if (!p.won) {
    p.won = true;
    sfxWin();
    if (!winner) winner = p;
    setTimeout(() => gameOver(), 800);
  }

  // Animate cargo boxes flying from boat to truck
  for (const c of p.cargoBoxes) {
    if (t > c.delay && c.progress < 1) {
      c.progress = Math.min(1, (t - c.delay) / 700);
    }
  }
}

function decayParticles(p) {
  for (let i = p.wakeParticles.length - 1; i >= 0; i--) {
    const w = p.wakeParticles[i];
    w.x += w.vx; w.y += w.vy; w.life -= 0.025;
    if (w.life <= 0) p.wakeParticles.splice(i, 1);
  }
  for (let i = p.bowWaves.length - 1; i >= 0; i--) {
    const w = p.bowWaves[i];
    w.x += w.vx; w.y += w.vy; w.size += 0.15; w.life -= 0.02;
    if (w.life <= 0) p.bowWaves.splice(i, 1);
  }
  for (let i = p.particles.length - 1; i >= 0; i--) {
    const pa = p.particles[i];
    pa.x += pa.vx; pa.y += pa.vy; pa.life -= 0.03; pa.vy += 0.1;
    if (pa.life <= 0) p.particles.splice(i, 1);
  }
}

// ============================================================
// Main update
// ============================================================
function update(dt) {
  if (gameState !== 'playing') return;
  elapsed += dt;
  for (const p of players) updatePlayer(p, dt);

  for (const p of players) {
    p.livesEl.textContent = '❤️'.repeat(Math.max(0, p.lives));
    p.scoreEl.textContent = p.score;
    if (!p.alive) p.speedEl.textContent = '💀';
    else if (p.docked) p.speedEl.textContent = '⚓';
    else if (p.portSpawned) p.speedEl.textContent = '🏁';
    else if (p.speedMult < 1.5) p.speedEl.textContent = '🐌';
    else if (p.speedMult < 2.2) p.speedEl.textContent = '🐇';
    else if (p.speedMult < 3) p.speedEl.textContent = '🚀';
    else p.speedEl.textContent = '⚡';
  }
}

// ============================================================
// Custom drawing helpers
// ============================================================
function drawShipwreck(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(0.35);

  // Hull
  ctx.fillStyle = '#3a2818';
  ctx.beginPath();
  ctx.ellipse(0, 4, size * 0.55, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#5a3820';
  ctx.beginPath();
  ctx.ellipse(0, -2, size * 0.5, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  // Plank lines
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 8, -size * 0.15);
    ctx.lineTo(i * 8, size * 0.15);
    ctx.stroke();
  }

  // Broken mast
  ctx.strokeStyle = '#3a2818';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.05);
  ctx.lineTo(-size * 0.15, -size * 0.55);
  ctx.stroke();
  // Splintered top
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-size * 0.15, -size * 0.55);
  ctx.lineTo(-size * 0.05, -size * 0.6);
  ctx.lineTo(-size * 0.22, -size * 0.5);
  ctx.lineTo(-size * 0.1, -size * 0.65);
  ctx.stroke();

  ctx.restore();

  // Foam at base
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(x, y + size * 0.1, size * 0.65, size * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawBigWave(w) {
  const t = elapsed * 0.005 + w.foamSeed;
  // Wave body — wide arc
  ctx.fillStyle = 'rgba(180, 220, 255, 0.55)';
  ctx.beginPath();
  ctx.moveTo(w.x - w.width / 2, w.y + 8);
  for (let x = -w.width / 2; x <= w.width / 2; x += 6) {
    const wobble = Math.sin(x * 0.03 + t) * 4;
    ctx.lineTo(w.x + x, w.y - 8 + wobble);
  }
  ctx.lineTo(w.x + w.width / 2, w.y + 8);
  ctx.closePath();
  ctx.fill();

  // Foam crest
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  for (let x = -w.width / 2; x <= w.width / 2; x += 4) {
    const wobble = Math.sin(x * 0.04 + t * 1.3) * 5;
    if (x === -Math.floor(w.width / 2)) ctx.moveTo(w.x + x, w.y - 10 + wobble);
    else ctx.lineTo(w.x + x, w.y - 10 + wobble);
  }
  ctx.stroke();

  // Foam dots
  for (let i = 0; i < 8; i++) {
    const fx = w.x - w.width / 2 + (i / 7) * w.width;
    ctx.fillStyle = `rgba(255,255,255,${0.6 + Math.sin(t * 2 + i) * 0.2})`;
    ctx.beginPath();
    ctx.arc(fx, w.y - 6 + Math.sin(t + i) * 3, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGate(g) {
  const leftX = g.x - g.gap / 2;
  const rightX = g.x + g.gap / 2;
  const poleH = 70;
  const topY = g.y - poleH;

  const accent = g.passed ? '#44ff77' : '#ff3322';
  const accent2 = g.passed ? '#9bffb5' : '#ffeeaa';

  // Banner string
  ctx.strokeStyle = g.passed ? 'rgba(120,255,180,0.8)' : 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftX, topY + 6);
  ctx.quadraticCurveTo(g.x, topY - 4, rightX, topY + 6);
  ctx.stroke();

  // Tiny flags along banner
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    const fx = leftX + (rightX - leftX) * t;
    const dip = Math.sin(Math.PI * t) * -10;
    const fy = topY + 6 + dip;
    ctx.fillStyle = i % 2 === 0 ? accent : accent2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 6, fy + 4);
    ctx.lineTo(fx, fy + 10);
    ctx.closePath();
    ctx.fill();
  }

  // Both poles + buoy heads
  for (const px of [leftX, rightX]) {
    // Pole
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(px - 2, topY, 4, poleH);
    // Buoy ball (red & white striped)
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(px, g.y, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 10, g.y - 2, 20, 4);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(px, g.y, 10, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.stroke();
  }
}

function drawPort(p) {
  const port = p.port;
  const cx = port.x;
  const cy = port.y;
  const w = port.width;
  const h = port.height;

  // Land base (sand + grass strip)
  ctx.fillStyle = '#d4b96a';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, h * 0.7);
  ctx.fillStyle = '#3a8a3a';
  ctx.fillRect(cx - w / 2, cy - h / 2, w, 8);

  // Road across the land
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(cx - w / 2, cy - h / 2 + 35, w, 22);
  ctx.strokeStyle = '#ffd700';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - w / 2, cy - h / 2 + 46);
  ctx.lineTo(cx + w / 2, cy - h / 2 + 46);
  ctx.stroke();
  ctx.setLineDash([]);

  // Warehouse
  const wx = cx - w * 0.22;
  const wy = cy - h * 0.42;
  ctx.fillStyle = '#b85a3a';
  ctx.fillRect(wx, wy, w * 0.35, 30);
  ctx.fillStyle = '#7a3a22';
  ctx.beginPath();
  ctx.moveTo(wx - 4, wy);
  ctx.lineTo(wx + w * 0.175, wy - 16);
  ctx.lineTo(wx + w * 0.35 + 4, wy);
  ctx.closePath();
  ctx.fill();
  // Door
  ctx.fillStyle = '#2a1a10';
  ctx.fillRect(wx + w * 0.13, wy + 12, 14, 18);
  // Sign
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PORT', wx + w * 0.175, wy + 6);

  // Crane
  const crX = cx + w * 0.25;
  const crY = cy - h * 0.18;
  ctx.fillStyle = '#444';
  ctx.fillRect(crX - 3, crY - 50, 6, 50);
  ctx.fillRect(crX - 3, crY - 50, 40, 5);
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(crX + 35, crY - 47);
  ctx.lineTo(crX + 35, crY - 30);
  ctx.stroke();
  ctx.fillStyle = '#888';
  ctx.fillRect(crX + 30, crY - 30, 10, 8);

  // Wooden dock extending into water
  const dockTopY = cy + h * 0.15;
  const dockBotY = cy + h / 2 + 10;
  ctx.fillStyle = '#8B6914';
  ctx.fillRect(cx - 26, dockTopY, 52, dockBotY - dockTopY);
  // Plank lines
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  for (let py = dockTopY + 8; py < dockBotY; py += 10) {
    ctx.beginPath();
    ctx.moveTo(cx - 26, py);
    ctx.lineTo(cx + 26, py);
    ctx.stroke();
  }
  // Posts
  ctx.fillStyle = '#5a4010';
  ctx.fillRect(cx - 28, dockBotY - 6, 6, 10);
  ctx.fillRect(cx + 22, dockBotY - 6, 6, 10);

  // Cargo stack on dock (visual decoration)
  if (!p.docked || elapsed - p.dockStart < 800) {
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦', cx + 34, dockTopY - 6);
    ctx.fillText('📦', cx + 34, dockTopY - 22);
  }
}

function drawTruckAndCargo(p) {
  if (!p.truck) return;
  const tx = p.truck.x;
  const ty = p.port.y - p.port.height / 2 + 47; // road y

  // Truck body (cab + box)
  ctx.fillStyle = '#2255aa';
  ctx.fillRect(tx - 8, ty - 14, 18, 14);
  ctx.fillStyle = '#88ccff';
  ctx.fillRect(tx - 6, ty - 12, 8, 8);
  ctx.fillStyle = '#ddd';
  ctx.fillRect(tx + 10, ty - 18, 28, 18);
  ctx.strokeStyle = '#888';
  ctx.lineWidth = 1;
  ctx.strokeRect(tx + 10, ty - 18, 28, 18);
  // Wheels
  ctx.fillStyle = '#222';
  ctx.beginPath(); ctx.arc(tx - 2, ty + 1, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx + 18, ty + 1, 4, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx + 33, ty + 1, 4, 0, Math.PI * 2); ctx.fill();

  // Cargo flying from boat to truck
  for (const c of p.cargoBoxes) {
    if (c.progress <= 0) continue;
    const targetX = tx + 24;
    const targetY = ty - 9;
    const cx = c.startX + (targetX - c.startX) * c.progress;
    // Arc trajectory
    const baseY = c.startY + (targetY - c.startY) * c.progress;
    const arc = -Math.sin(c.progress * Math.PI) * 40;
    const cy = baseY + arc;
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('📦', cx, cy);
  }
}

// ============================================================
// Draw a single player's half
// ============================================================
function drawPlayer(p, offsetX) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(offsetX, 0, halfW, H);
  ctx.clip();
  ctx.translate(offsetX, 0);

  // Water gradient
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a5a8a');
  grad.addColorStop(0.5, '#1a7ab5');
  grad.addColorStop(1, '#0d6a9f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, halfW, H);

  // Animated water lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 20; i++) {
    const y = ((i * 60 + p.waterOffset) % (H + 60)) - 30;
    ctx.beginPath();
    for (let x = 0; x < halfW; x += 4) {
      const wave = Math.sin(x * 0.02 + i * 0.5 + elapsed * 0.002) * 8;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  // Ripples
  for (const r of p.ripples) {
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${r.life * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Islands
  for (const island of p.islands) {
    const cx = island.x + island.w / 2;
    const cy = island.y + island.h / 2;
    ctx.fillStyle = 'rgba(40, 180, 220, 0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, island.w / 2 + 12, island.h / 2 + 10, 0, 0, Math.PI * 2);
    ctx.fill();
    if (island.hasBeach) {
      ctx.fillStyle = '#e8d48b';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, island.w / 2 + 4, island.h / 2 + 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#d4b96a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, island.w / 2, island.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a8a3a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 6, island.w * 0.38, island.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2d7a2d';
    ctx.beginPath();
    ctx.ellipse(cx - island.w * 0.1, cy - 10, island.w * 0.2, island.h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    if (island.hasDock) {
      const dockX = cx + island.w * 0.3;
      const dockY = cy + island.h * 0.35;
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(dockX - 3, dockY, 6, 20);
      ctx.fillRect(dockX - 10, dockY + 16, 20, 4);
    }
    const emojiSize = Math.max(16, island.h * 0.35);
    ctx.font = `${emojiSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(island.deco, cx, cy - 8);
  }

  // Big waves
  for (const w of p.bigWaves) drawBigWave(w);

  // Gates
  for (const g of p.gates) drawGate(g);

  // Port (drawn here so it appears in front of waves but behind boat)
  if (p.port) drawPort(p);

  // Bow waves
  for (const w of p.bowWaves) {
    ctx.globalAlpha = w.life * 0.45;
    if (w.type === 'arc') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = w.life * 2.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size, 0, Math.PI * 0.6);
      ctx.stroke();
    } else {
      ctx.fillStyle = 'rgba(200, 230, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size * w.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Wake particles
  for (const wp of p.wakeParticles) {
    ctx.globalAlpha = wp.life * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, wp.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Obstacles (emoji or custom-rendered)
  for (const o of p.obstacles) {
    ctx.save();
    const wobbleX = Math.sin(o.wobble) * 3;
    const wobbleY = Math.cos(o.wobble * 0.7) * 2;
    if (o.def.render === 'shipwreck') {
      drawShipwreck(o.x + wobbleX, o.y + wobbleY, o.size * 1.8);
    } else {
      ctx.font = `${o.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (!o.def.bad) {
        ctx.shadowColor = '#ffdd44';
        ctx.shadowBlur = 15;
      }
      ctx.fillText(o.def.emoji, o.x + wobbleX, o.y + wobbleY);
    }
    ctx.restore();
  }

  // Damage particles
  for (const pa of p.particles) {
    ctx.globalAlpha = pa.life;
    ctx.fillStyle = pa.color;
    ctx.beginPath();
    ctx.arc(pa.x, pa.y, pa.size * pa.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Truck + cargo (above water, below boat)
  if (p.docked) drawTruckAndCargo(p);

  // Boat (only if alive)
  if (p.alive) {
    const j = jumpInfo(p);

    // Shadow under jumping boat
    if (j.progress > 0) {
      const shadowAlpha = 0.3 * (1 - Math.abs(j.y) / JUMP_HEIGHT * 0.7);
      const shadowScale = 1 - Math.abs(j.y) / JUMP_HEIGHT * 0.5;
      ctx.fillStyle = `rgba(0,0,0,${Math.max(0, shadowAlpha)})`;
      ctx.beginPath();
      ctx.ellipse(p.boat.x, p.boat.y + 22, 26 * shadowScale, 8 * shadowScale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.translate(p.boat.x, p.boat.y + j.y);
    ctx.rotate(p.boat.angle);
    ctx.scale(p.boat.scale * j.scale, p.boat.scale * j.scale);

    const isInvincible = p.invincibleUntil > elapsed;
    if (isInvincible && Math.floor(elapsed / 100) % 2 === 0) {
      ctx.globalAlpha = 0.4;
    }

    if (p.shieldUntil > elapsed) {
      ctx.shadowColor = '#44ff88';
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(0, 0, p.boat.w * 0.7, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(68,255,136,0.4)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }

    ctx.font = `${p.boat.w}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⛵', 0, 0);
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, halfW, H);
    ctx.font = '64px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌊', halfW / 2, H / 2 - 30);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('Sunk!', halfW / 2, H / 2 + 30);
  }

  // Float texts (over everything)
  for (const ft of p.floatTexts) {
    ctx.globalAlpha = ft.life;
    ctx.fillStyle = ft.color;
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeText(ft.text, ft.x, ft.y);
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  // Win banner during dock sequence
  if (p.won) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(0, H * 0.35, halfW, 90);
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏆 WINNER!', halfW / 2, H * 0.4);
  }

  // Ink overlay
  if (p.activeEffects.ink > elapsed) {
    const inkAlpha = Math.min(0.85, (p.activeEffects.ink - elapsed) / EFFECT_DURATION);
    ctx.fillStyle = `rgba(20, 10, 40, ${inkAlpha})`;
    ctx.fillRect(0, 0, halfW, H);
    if (p.alive) {
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      const spotR = 70;
      const spotGrad = ctx.createRadialGradient(p.boat.x, p.boat.y, 0, p.boat.x, p.boat.y, spotR);
      spotGrad.addColorStop(0, 'rgba(0,0,0,1)');
      spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = spotGrad;
      ctx.beginPath();
      ctx.arc(p.boat.x, p.boat.y, spotR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Freeze overlay
  if (p.activeEffects.freeze > elapsed) {
    ctx.fillStyle = 'rgba(180, 220, 255, 0.3)';
    ctx.fillRect(0, 0, halfW, H);
    if (p.alive) {
      ctx.font = '48px serif';
      ctx.textAlign = 'center';
      ctx.fillText('🥶', p.boat.x, p.boat.y - 40);
    }
  }

  ctx.restore();
}

// ============================================================
// Main draw
// ============================================================
function draw() {
  ctx.clearRect(0, 0, W, H);
  drawPlayer(players[0], 0);
  drawPlayer(players[1], halfW);

  // Divider
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillRect(halfW - DIVIDER_WIDTH / 2, 0, DIVIDER_WIDTH, H);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(halfW - DIVIDER_WIDTH / 2 - 1, 0, 1, H);
  ctx.fillRect(halfW + DIVIDER_WIDTH / 2, 0, 1, H);
}

// ============================================================
// Game loop
// ============================================================
let lastTime = 0;
function loop(time) {
  const dt = Math.min(time - lastTime, 50);
  lastTime = time;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

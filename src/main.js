import './style.css';

// ============================================================
// LODICKA — 2-Player Boat Adventure
// Split-screen: each player has their own world that scrolls
// at its own pace, so speed effects don't desync them.
// ============================================================

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// ============================================================
// Sound effects (Web Audio API — no files needed!)
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

function sfxCollect() {
  playSound(880, 0.1); playSound(1100, 0.15);
}
function sfxHit() {
  playSound(150, 0.3, 'sawtooth', 0.12);
}
function sfxSplash() {
  playSound(200, 0.5, 'triangle', 0.1);
  playSound(100, 0.6, 'sine', 0.08);
}
function sfxPowerup() {
  playSound(523, 0.1); setTimeout(() => playSound(659, 0.1), 80);
  setTimeout(() => playSound(784, 0.15), 160);
}
function sfxWeird() {
  playSound(300, 0.2, 'square', 0.08);
  playSound(400, 0.15, 'sawtooth', 0.06);
}

// DOM refs
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
const INVINCIBLE_DURATION = 1500;
const EFFECT_DURATION = 3000;
const DIVIDER_WIDTH = 4;

// ============================================================
// Obstacle definitions
// ============================================================
const OBSTACLES = [
  { emoji: '🥩', name: 'Meat',       effect: 'big',         label: '🥩 Too full! BIG boat!',     bad: false },
  { emoji: '🚤', name: 'Speedboat',  effect: 'bounce',      label: '🚤 BONK! Pushed away!',       bad: true  },
  { emoji: '🐙', name: 'Octopus',    effect: 'ink',         label: "🐙 INK! Can't see!",          bad: true  },
  { emoji: '🕷️', name: 'Sea Spider', effect: 'reverse',     label: '🕷️ Controls reversed!',       bad: true  },
  { emoji: '🐋', name: 'Whale',      effect: 'wave',        label: '🐋 WHOOSH! Big wave!',        bad: true  },
  { emoji: '🌊', name: 'Whirlpool',  effect: 'spin',        label: '🌊 SPINNING!',                bad: true  },
  { emoji: '🦈', name: 'Shark',      effect: 'damage',      label: '🦈 SHARK BITE!',              bad: true  },
  { emoji: '🐢', name: 'Sea Turtle', effect: 'shield',      label: '🐢 Turtle shield!',           bad: false },
  { emoji: '⭐', name: 'Star',       effect: 'points',      label: '⭐ +50 points!',              bad: false },
  { emoji: '⭐', name: 'Star',       effect: 'points',      label: '⭐ +50 points!',              bad: false },
  { emoji: '🐠', name: 'Fish',       effect: 'speed_boost', label: '🐠 Fish boost!',              bad: false },
  { emoji: '🪸', name: 'Coral',      effect: 'slow',        label: '🪸 Coral! Slowing...',        bad: false },
  { emoji: '🐚', name: 'Shell',      effect: 'shrink',      label: '🐚 Tiny boat!',               bad: false },
  { emoji: '🦀', name: 'Crab',       effect: 'zigzag',      label: '🦀 Crab grabbed wheel!',      bad: true  },
  { emoji: '🎈', name: 'Balloon',    effect: 'float',       label: '🎈 Floating!',                bad: false },
  { emoji: '🧊', name: 'Iceberg',    effect: 'freeze',      label: '🧊 BRRR! Frozen!',            bad: true  },
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

// ============================================================
// Player factory — one boat, one world per player
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
    invincibleUntil: 0,
    shieldUntil: 0,
    activeEffects: {},
    effectTimeouts: {},
    boat: { x: 0, y: 0, w: BOAT_SIZE, h: BOAT_SIZE * 1.3, angle: 0, scale: 1 },
    obstacles: [],
    islands: [],
    particles: [],
    wakeParticles: [],
    bowWaves: [],
    ripples: [],
    boatTilt: 0,
    waterOffset: 0,
    alive: true,
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
// Game lifecycle
// ============================================================
function startGame() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  elapsed = 0;
  for (const p of players) {
    p.score = 0;
    p.lives = 3;
    p.speedMult = 1;
    p.lastSpawn = 0;
    p.lastIslandSpawn = 0;
    p.invincibleUntil = 0;
    p.shieldUntil = 0;
    p.obstacles = [];
    p.islands = [];
    p.particles = [];
    p.wakeParticles = [];
    p.bowWaves = [];
    p.ripples = [];
    p.boatTilt = 0;
    p.waterOffset = 0;
    p.alive = true;
    Object.values(p.effectTimeouts).forEach(clearTimeout);
    p.effectTimeouts = {};
    p.activeEffects = {};
    p.boat.x = halfW / 2;
    p.boat.y = H - 120;
    p.boat.angle = 0;
    p.boat.scale = 1;
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
  if (p1.score > p2.score) winnerEl.textContent = '🏆 P1 wins!';
  else if (p2.score > p1.score) winnerEl.textContent = '🏆 P2 wins!';
  else winnerEl.textContent = '🤝 Tie!';
  finalScoresEl.innerHTML = `P1: ${p1.score}<br>P2: ${p2.score}`;
  highScoreEl.textContent = `Best ever: ${highScore}`;
  gameOverScreen.classList.remove('hidden');
}

// ============================================================
// Per-player effect toast
// ============================================================
function showEffect(p, text) {
  p.effectEl.textContent = text;
  p.effectEl.classList.remove('hidden');
  clearTimeout(p.effectTimeouts._toast);
  p.effectTimeouts._toast = setTimeout(() => p.effectEl.classList.add('hidden'), 2000);
}

// ============================================================
// Apply effect from obstacle (per player)
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
    case 'points':
      p.score += 50;
      sfxCollect();
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

    case 'ink':
      p.activeEffects.ink = elapsed + EFFECT_DURATION;
      sfxWeird();
      break;

    case 'reverse':
      p.activeEffects.reverse = elapsed + EFFECT_DURATION;
      sfxWeird();
      break;

    case 'wave':
      p.boat.x += (Math.random() > 0.5 ? 1 : -1) * 150;
      p.boat.x = Math.max(LANE_PADDING, Math.min(halfW - LANE_PADDING, p.boat.x));
      sfxSplash();
      break;

    case 'spin':
      p.activeEffects.spin = elapsed + EFFECT_DURATION * 0.7;
      sfxWeird();
      break;

    case 'speed_boost':
      p.activeEffects.speed_boost = elapsed + EFFECT_DURATION;
      sfxCollect();
      break;

    case 'slow':
      p.activeEffects.slow = elapsed + EFFECT_DURATION;
      sfxWeird();
      break;

    case 'zigzag':
      p.activeEffects.zigzag = elapsed + EFFECT_DURATION;
      sfxWeird();
      break;

    case 'float':
      p.activeEffects.float = elapsed + EFFECT_DURATION;
      sfxPowerup();
      break;

    case 'freeze':
      p.activeEffects.freeze = elapsed + 1500;
      sfxHit();
      break;
  }
}

// ============================================================
// Spawning (per player world)
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

// ============================================================
// Update one player's world
// ============================================================
function updatePlayer(p, dt) {
  if (!p.alive) {
    // Drain remaining particles/waves so the world settles after death
    decayParticles(p);
    return;
  }

  p.score += Math.floor(dt * 0.02 * p.speedMult);
  p.speedMult = Math.min(MAX_SPEED_MULT, 1 + elapsed * SPEED_INCREASE);

  let moveSpeed = BASE_SPEED * p.speedMult;
  if (p.activeEffects.speed_boost > elapsed) moveSpeed *= 1.5;
  if (p.activeEffects.slow > elapsed) moveSpeed *= 0.5;

  for (const key of Object.keys(p.activeEffects)) {
    if (p.activeEffects[key] <= elapsed) delete p.activeEffects[key];
  }

  // Player movement
  let moveDir = 0;
  if (!p.activeEffects.freeze) {
    if (p.controls.left.some(k => keys[k])) moveDir = -1;
    if (p.controls.right.some(k => keys[k])) moveDir = 1;
  }
  if (p.activeEffects.reverse) moveDir *= -1;
  if (p.activeEffects.zigzag) moveDir += Math.sin(elapsed * 0.008) * 0.8;

  const lateralSpeed = 5 + p.speedMult;
  p.boat.x += moveDir * lateralSpeed;
  p.boat.x = Math.max(LANE_PADDING, Math.min(halfW - LANE_PADDING, p.boat.x));

  // Tilt
  const targetTilt = moveDir * 0.35;
  p.boatTilt += (targetTilt - p.boatTilt) * 0.1;
  if (p.activeEffects.spin) p.boat.angle += 0.15;
  else p.boat.angle = p.boatTilt;

  // Float bob
  if (p.activeEffects.float) {
    p.boat.y = H - 120 - Math.sin(elapsed * 0.006) * 30;
  } else {
    p.boat.y = H - 120;
  }

  p.waterOffset += moveSpeed * 0.5;

  // Spawn
  const spawnInterval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - p.speedMult * 120);
  if (elapsed - p.lastSpawn > spawnInterval) {
    spawnObstacle(p);
    p.lastSpawn = elapsed;
  }
  if (elapsed - p.lastIslandSpawn > ISLAND_SPAWN_RATE) {
    spawnIsland(p);
    p.lastIslandSpawn = elapsed;
  }

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

  // Wake
  if (Math.random() < 0.5) {
    p.wakeParticles.push({
      x: p.boat.x + (Math.random() - 0.5) * 16 * p.boat.scale,
      y: p.boat.y + p.boat.h * p.boat.scale * 0.45,
      vx: (Math.random() - 0.5) * 1.5,
      vy: Math.random() * 1.5 + 0.5,
      life: 1,
      size: Math.random() * 4 + 2,
    });
  }

  // Bow waves
  if (Math.random() < 0.6) {
    const spread = (Math.random() > 0.5 ? 1 : -1);
    p.bowWaves.push({
      x: p.boat.x + spread * 8 * p.boat.scale,
      y: p.boat.y - p.boat.h * p.boat.scale * 0.3,
      vx: spread * (1.5 + p.speedMult * 0.5),
      vy: 0.8 + Math.random() * 0.5,
      life: 1,
      size: Math.random() * 6 + 4,
      type: 'arc',
    });
  }
  if (Math.random() < 0.3) {
    const side = Math.random() > 0.5 ? 1 : -1;
    p.bowWaves.push({
      x: p.boat.x + side * p.boat.w * p.boat.scale * 0.4,
      y: p.boat.y,
      vx: side * (2 + p.speedMult * 0.3),
      vy: Math.random() * 0.8,
      life: 1,
      size: Math.random() * 3 + 2,
      type: 'splash',
    });
  }

  // Random ripples
  if (Math.random() < 0.03) {
    p.ripples.push({
      x: Math.random() * halfW,
      y: Math.random() * H,
      r: 0,
      life: 1,
    });
  }
  for (let i = p.ripples.length - 1; i >= 0; i--) {
    const r = p.ripples[i];
    r.r += 0.3;
    r.life -= 0.01;
    r.y += moveSpeed * 0.3;
    if (r.life <= 0 || r.y > H + 50) p.ripples.splice(i, 1);
  }

  decayParticles(p);
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

  // HUD
  for (const p of players) {
    p.livesEl.textContent = '❤️'.repeat(Math.max(0, p.lives));
    p.scoreEl.textContent = p.score;
    if (!p.alive) p.speedEl.textContent = '💀';
    else if (p.speedMult < 1.5) p.speedEl.textContent = '🐌';
    else if (p.speedMult < 2.2) p.speedEl.textContent = '🐇';
    else if (p.speedMult < 3) p.speedEl.textContent = '🚀';
    else p.speedEl.textContent = '⚡';
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

  // Obstacles
  for (const o of p.obstacles) {
    ctx.save();
    const wobbleX = Math.sin(o.wobble) * 3;
    const wobbleY = Math.cos(o.wobble * 0.7) * 2;
    ctx.font = `${o.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (!o.def.bad) {
      ctx.shadowColor = '#ffdd44';
      ctx.shadowBlur = 15;
    }
    ctx.fillText(o.def.emoji, o.x + wobbleX, o.y + wobbleY);
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

  // Boat (only if alive)
  if (p.alive) {
    ctx.save();
    ctx.translate(p.boat.x, p.boat.y);
    ctx.rotate(p.boat.angle);
    ctx.scale(p.boat.scale, p.boat.scale);

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
    // "Eliminated" overlay
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

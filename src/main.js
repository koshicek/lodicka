import './style.css';

// ============================================================
// LODICKA — Boat Adventure Game
// A fun boat game for kids! Dodge obstacles, collect stars!
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
const livesEl = document.getElementById('lives');
const scoreEl = document.getElementById('score');
const speedLabelEl = document.getElementById('speed-label');
const effectEl = document.getElementById('effect-label');
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const finalScoreEl = document.getElementById('final-score');
const highScoreEl = document.getElementById('high-score');

// ============================================================
// Constants
// ============================================================
const BASE_SPEED = 2.5;
const SPEED_INCREASE = 0.0008;
const MAX_SPEED_MULT = 4;
const LANE_PADDING = 60;
const BOAT_SIZE = 44;
const OBSTACLE_SIZE = 38;
const SPAWN_INTERVAL_BASE = 900; // ms
const SPAWN_INTERVAL_MIN = 350;
const ISLAND_SPAWN_RATE = 1400;
const INVINCIBLE_DURATION = 1500;
const EFFECT_DURATION = 3000;

// ============================================================
// Obstacle definitions
// ============================================================
const OBSTACLES = [
  {
    emoji: '🥩', name: 'Meat',
    effect: 'big', label: '🥩 Too full! Boat got BIG!',
    bad: false
  },
  {
    emoji: '🚤', name: 'Speedboat',
    effect: 'bounce', label: '🚤 BONK! Pushed away!',
    bad: true
  },
  {
    emoji: '🐙', name: 'Octopus',
    effect: 'ink', label: '🐙 INK ATTACK! Can\'t see!',
    bad: true
  },
  {
    emoji: '🕷️', name: 'Sea Spider',
    effect: 'reverse', label: '🕷️ YIKES! Controls reversed!',
    bad: true
  },
  {
    emoji: '🐋', name: 'Whale',
    effect: 'wave', label: '🐋 WHOOSH! Big wave!',
    bad: true
  },
  {
    emoji: '🌊', name: 'Whirlpool',
    effect: 'spin', label: '🌊 SPINNING!',
    bad: true
  },
  {
    emoji: '🦈', name: 'Shark',
    effect: 'damage', label: '🦈 SHARK BITE! Ouch!',
    bad: true
  },
  {
    emoji: '🐢', name: 'Sea Turtle',
    effect: 'shield', label: '🐢 Turtle shield! Protected!',
    bad: false
  },
  {
    emoji: '⭐', name: 'Star',
    effect: 'points', label: '⭐ +50 points!',
    bad: false
  },
  {
    emoji: '⭐', name: 'Star',
    effect: 'points', label: '⭐ +50 points!',
    bad: false
  },
  {
    emoji: '🐠', name: 'Fish',
    effect: 'speed_boost', label: '🐠 Fish boost! ZOOM!',
    bad: false
  },
  {
    emoji: '🪸', name: 'Coral',
    effect: 'slow', label: '🪸 Coral! Slowing down...',
    bad: false
  },
  {
    emoji: '🐚', name: 'Shell',
    effect: 'shrink', label: '🐚 Magic shell! Tiny boat!',
    bad: false
  },
  {
    emoji: '🦀', name: 'Crab',
    effect: 'zigzag', label: '🦀 Crab grabbed the wheel!',
    bad: true
  },
  {
    emoji: '🎈', name: 'Balloon',
    effect: 'float', label: '🎈 Floating up! Weee!',
    bad: false
  },
  {
    emoji: '🧊', name: 'Iceberg',
    effect: 'freeze', label: '🧊 BRRR! Frozen!',
    bad: true
  },
];

// ============================================================
// State
// ============================================================
let W, H;
let gameState = 'menu'; // menu | playing | over
let score = 0;
let highScore = parseInt(localStorage.getItem('lodicka_high') || '0');
let lives = 3;
let speedMult = 1;
let elapsed = 0;
let lastSpawn = 0;
let lastIslandSpawn = 0;
let invincibleUntil = 0;
let shieldUntil = 0;

// Effects state
let activeEffects = {};
let effectTimeouts = {};

// Player boat
let boat = { x: 0, y: 0, w: BOAT_SIZE, h: BOAT_SIZE * 1.3, angle: 0, scale: 1 };

// World objects
let obstacles = [];
let islands = [];
let particles = [];
let wakeParticles = [];
let bowWaves = [];
let ripples = [];

// Boat tilt tracking
let boatTilt = 0; // smoothed tilt angle for steering direction

// Input
let keys = {};
let touchX = null;

// Water animation
let waterOffset = 0;

// ============================================================
// Resize
// ============================================================
function resize() {
  const dpr = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  boat.y = H - 120;
  if (boat.x === 0) boat.x = W / 2;
}
window.addEventListener('resize', resize);
resize();

// ============================================================
// Input handlers
// ============================================================
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ' || e.key === 'Enter') {
    if (gameState === 'menu') startGame();
    else if (gameState === 'over') startGame();
  }
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Touch
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (gameState === 'menu' || gameState === 'over') return;
  touchX = e.touches[0].clientX;
});
canvas.addEventListener('touchmove', e => {
  e.preventDefault();
  if (gameState !== 'playing') return;
  touchX = e.touches[0].clientX;
});
canvas.addEventListener('touchend', () => { touchX = null; });

// Button handlers
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// ============================================================
// Game lifecycle
// ============================================================
function startGame() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  score = 0;
  lives = 3;
  speedMult = 1;
  elapsed = 0;
  lastSpawn = 0;
  lastIslandSpawn = 0;
  invincibleUntil = 0;
  shieldUntil = 0;
  obstacles = [];
  islands = [];
  particles = [];
  wakeParticles = [];
  bowWaves = [];
  ripples = [];
  activeEffects = {};
  boatTilt = 0;
  Object.values(effectTimeouts).forEach(clearTimeout);
  effectTimeouts = {};
  boat.x = W / 2;
  boat.y = H - 120;
  boat.angle = 0;
  boat.scale = 1;
  effectEl.classList.add('hidden');
  gameState = 'playing';
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  hudEl.classList.remove('hidden');
}

function gameOver() {
  gameState = 'over';
  hudEl.classList.add('hidden');
  if (score > highScore) {
    highScore = score;
    localStorage.setItem('lodicka_high', String(highScore));
  }
  finalScoreEl.textContent = `Score: ${score}`;
  highScoreEl.textContent = `Best: ${highScore}`;
  gameOverScreen.classList.remove('hidden');
}

// ============================================================
// Show effect toast
// ============================================================
function showEffect(text) {
  effectEl.textContent = text;
  effectEl.classList.remove('hidden');
  clearTimeout(effectTimeouts._toast);
  effectTimeouts._toast = setTimeout(() => effectEl.classList.add('hidden'), 2000);
}

// ============================================================
// Apply effect from obstacle
// ============================================================
function applyEffect(obs) {
  const def = obs.def;
  showEffect(def.label);

  // Add fun particles at collision point
  for (let i = 0; i < 8; i++) {
    particles.push({
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
      score += 50;
      sfxCollect();
      break;

    case 'damage':
      if (shieldUntil > elapsed) {
        showEffect('🐢 Shield blocked the shark!');
        shieldUntil = 0;
        sfxPowerup();
        break;
      }
      if (invincibleUntil > elapsed) break;
      lives--;
      sfxHit();
      invincibleUntil = elapsed + INVINCIBLE_DURATION;
      if (lives <= 0) { sfxSplash(); gameOver(); }
      break;

    case 'shield':
      shieldUntil = elapsed + EFFECT_DURATION * 2;
      sfxPowerup();
      break;

    case 'big':
      boat.scale = 1.6;
      sfxWeird();
      clearTimeout(effectTimeouts.big);
      effectTimeouts.big = setTimeout(() => { boat.scale = 1; }, EFFECT_DURATION);
      break;

    case 'shrink':
      boat.scale = 0.6;
      clearTimeout(effectTimeouts.shrink);
      effectTimeouts.shrink = setTimeout(() => { boat.scale = 1; }, EFFECT_DURATION);
      break;

    case 'bounce':
      boat.x += (boat.x > W / 2 ? -1 : 1) * 120;
      boat.x = Math.max(LANE_PADDING, Math.min(W - LANE_PADDING, boat.x));
      sfxHit();
      break;

    case 'ink':
      activeEffects.ink = elapsed + EFFECT_DURATION;
      sfxWeird();
      break;

    case 'reverse':
      activeEffects.reverse = elapsed + EFFECT_DURATION;
      sfxWeird();
      break;

    case 'wave':
      boat.x += (Math.random() > 0.5 ? 1 : -1) * 150;
      boat.x = Math.max(LANE_PADDING, Math.min(W - LANE_PADDING, boat.x));
      sfxSplash();
      break;

    case 'spin':
      activeEffects.spin = elapsed + EFFECT_DURATION * 0.7;
      sfxWeird();
      break;

    case 'speed_boost':
      activeEffects.speed_boost = elapsed + EFFECT_DURATION;
      sfxCollect();
      break;

    case 'slow':
      activeEffects.slow = elapsed + EFFECT_DURATION;
      sfxWeird();
      break;

    case 'zigzag':
      activeEffects.zigzag = elapsed + EFFECT_DURATION;
      sfxWeird();
      break;

    case 'float':
      activeEffects.float = elapsed + EFFECT_DURATION;
      sfxPowerup();
      break;

    case 'freeze':
      activeEffects.freeze = elapsed + 1500;
      sfxHit();
      break;
  }
}

// ============================================================
// Spawning
// ============================================================
function spawnObstacle() {
  const def = OBSTACLES[Math.floor(Math.random() * OBSTACLES.length)];
  const x = LANE_PADDING + Math.random() * (W - LANE_PADDING * 2);
  obstacles.push({
    x, y: -OBSTACLE_SIZE,
    def,
    size: OBSTACLE_SIZE,
    wobble: Math.random() * Math.PI * 2,
  });
}

const ISLAND_DECORATIONS = ['🌴', '🌴🌴', '🏠', '🏡', '🏘️', '⛪', '🏰', '🌴🏠', '🏠🌴', '🌲🏡', '🏠🏠'];

function spawnIsland() {
  const side = Math.random() > 0.5 ? 'left' : 'right';
  // Islands are now much bigger and more varied
  const size = 60 + Math.random() * 120;
  const x = side === 'left'
    ? -size * 0.2 + Math.random() * 40
    : W - size * 0.8 - Math.random() * 40;
  const deco = ISLAND_DECORATIONS[Math.floor(Math.random() * ISLAND_DECORATIONS.length)];
  // Some islands can also appear mid-water (not just edges)
  const midWater = Math.random() < 0.25;
  const finalX = midWater
    ? LANE_PADDING + Math.random() * (W - LANE_PADDING * 2) - size * 0.5
    : x;
  islands.push({
    x: finalX, y: -size * 1.2,
    w: size * 1.6, h: size * 1.1,
    side, deco,
    hasBeach: Math.random() > 0.3,
    hasDock: Math.random() > 0.7,
    treeCount: Math.floor(Math.random() * 3) + 1,
  });
}

// ============================================================
// Update
// ============================================================
function update(dt) {
  if (gameState !== 'playing') return;

  elapsed += dt;
  score += Math.floor(dt * 0.02 * speedMult);

  // Increase speed
  speedMult = Math.min(MAX_SPEED_MULT, 1 + elapsed * SPEED_INCREASE);

  let moveSpeed = BASE_SPEED * speedMult;
  if (activeEffects.speed_boost > elapsed) moveSpeed *= 1.5;
  if (activeEffects.slow > elapsed) moveSpeed *= 0.5;

  // Clean expired effects
  for (const key of Object.keys(activeEffects)) {
    if (activeEffects[key] <= elapsed) delete activeEffects[key];
  }

  // Player movement
  let moveDir = 0;
  if (!activeEffects.freeze) {
    if (keys['ArrowLeft'] || keys['a'] || keys['A']) moveDir = -1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) moveDir = 1;
    if (touchX !== null) {
      const diff = touchX - boat.x;
      if (Math.abs(diff) > 10) moveDir = Math.sign(diff);
    }
  }

  if (activeEffects.reverse) moveDir *= -1;

  if (activeEffects.zigzag) {
    moveDir += Math.sin(elapsed * 0.008) * 0.8;
  }

  const lateralSpeed = 5 + speedMult;
  boat.x += moveDir * lateralSpeed;
  boat.x = Math.max(LANE_PADDING, Math.min(W - LANE_PADDING, boat.x));

  // Boat tilt — face the direction it's steering
  const targetTilt = moveDir * 0.35; // max ~20 degrees
  boatTilt += (targetTilt - boatTilt) * 0.1; // smooth interpolation

  // Spin effect overrides tilt
  if (activeEffects.spin) {
    boat.angle += 0.15;
  } else {
    boat.angle = boatTilt;
  }

  // Float effect (boat bobs up)
  if (activeEffects.float) {
    boat.y = H - 120 - Math.sin(elapsed * 0.006) * 30;
  } else {
    boat.y = H - 120;
  }

  // Water offset
  waterOffset += moveSpeed * 0.5;

  // Spawn obstacles
  const spawnInterval = Math.max(SPAWN_INTERVAL_MIN, SPAWN_INTERVAL_BASE - speedMult * 120);
  if (elapsed - lastSpawn > spawnInterval) {
    spawnObstacle();
    lastSpawn = elapsed;
  }

  // Spawn islands
  if (elapsed - lastIslandSpawn > ISLAND_SPAWN_RATE) {
    spawnIsland();
    lastIslandSpawn = elapsed;
  }

  // Update obstacles
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.y += moveSpeed;
    o.wobble += 0.05;

    // Collision check
    const bw = boat.w * boat.scale;
    const bh = boat.h * boat.scale;
    const dx = Math.abs(o.x - boat.x);
    const dy = Math.abs(o.y - boat.y);
    if (dx < (bw + o.size) * 0.4 && dy < (bh + o.size) * 0.4) {
      applyEffect(o);
      obstacles.splice(i, 1);
      continue;
    }

    // Remove off-screen
    if (o.y > H + 60) {
      obstacles.splice(i, 1);
    }
  }

  // Update islands
  for (let i = islands.length - 1; i >= 0; i--) {
    islands[i].y += moveSpeed * 0.6;
    if (islands[i].y > H + 100) islands.splice(i, 1);
  }

  // Wake particles (behind the boat)
  if (Math.random() < 0.5) {
    wakeParticles.push({
      x: boat.x + (Math.random() - 0.5) * 16 * boat.scale,
      y: boat.y + boat.h * boat.scale * 0.45,
      vx: (Math.random() - 0.5) * 1.5,
      vy: Math.random() * 1.5 + 0.5,
      life: 1,
      size: Math.random() * 4 + 2,
    });
  }

  // Bow waves — V-shaped waves spreading from the front of the boat
  if (Math.random() < 0.6) {
    const spread = (Math.random() > 0.5 ? 1 : -1);
    bowWaves.push({
      x: boat.x + spread * 8 * boat.scale,
      y: boat.y - boat.h * boat.scale * 0.3,
      vx: spread * (1.5 + speedMult * 0.5),
      vy: 0.8 + Math.random() * 0.5,
      life: 1,
      size: Math.random() * 6 + 4,
      type: 'arc',
    });
  }
  // Side splash waves
  if (Math.random() < 0.3) {
    const side = Math.random() > 0.5 ? 1 : -1;
    bowWaves.push({
      x: boat.x + side * boat.w * boat.scale * 0.4,
      y: boat.y,
      vx: side * (2 + speedMult * 0.3),
      vy: Math.random() * 0.8,
      life: 1,
      size: Math.random() * 3 + 2,
      type: 'splash',
    });
  }

  // Update wake
  for (let i = wakeParticles.length - 1; i >= 0; i--) {
    const p = wakeParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.025;
    if (p.life <= 0) wakeParticles.splice(i, 1);
  }

  // Update bow waves
  for (let i = bowWaves.length - 1; i >= 0; i--) {
    const w = bowWaves[i];
    w.x += w.vx;
    w.y += w.vy;
    w.size += 0.15;
    w.life -= 0.02;
    if (w.life <= 0) bowWaves.splice(i, 1);
  }

  // Update particles
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.03;
    p.vy += 0.1;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // Ripples
  if (Math.random() < 0.03) {
    ripples.push({
      x: Math.random() * W,
      y: Math.random() * H,
      r: 0,
      maxR: 20 + Math.random() * 30,
      life: 1,
    });
  }
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.r += 0.3;
    r.life -= 0.01;
    r.y += moveSpeed * 0.3;
    if (r.life <= 0 || r.y > H + 50) ripples.splice(i, 1);
  }

  // Update HUD
  livesEl.textContent = '❤️'.repeat(Math.max(0, lives));
  scoreEl.textContent = score;
  if (speedMult < 1.5) speedLabelEl.textContent = '🐌';
  else if (speedMult < 2.2) speedLabelEl.textContent = '🐇';
  else if (speedMult < 3) speedLabelEl.textContent = '🚀';
  else speedLabelEl.textContent = '⚡';
}

// ============================================================
// Draw
// ============================================================
function draw() {
  // Water background
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#0a5a8a');
  grad.addColorStop(0.5, '#1a7ab5');
  grad.addColorStop(1, '#0d6a9f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Animated water lines
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 20; i++) {
    const y = ((i * 60 + waterOffset) % (H + 60)) - 30;
    ctx.beginPath();
    for (let x = 0; x < W; x += 4) {
      const wave = Math.sin(x * 0.02 + i * 0.5 + elapsed * 0.002) * 8;
      if (x === 0) ctx.moveTo(x, y + wave);
      else ctx.lineTo(x, y + wave);
    }
    ctx.stroke();
  }

  // Ripples
  for (const r of ripples) {
    ctx.beginPath();
    ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(255,255,255,${r.life * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Islands
  for (const island of islands) {
    const cx = island.x + island.w / 2;
    const cy = island.y + island.h / 2;

    // Water ring / shallow water around island
    ctx.fillStyle = 'rgba(40, 180, 220, 0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, island.w / 2 + 12, island.h / 2 + 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Beach / sand base
    if (island.hasBeach) {
      ctx.fillStyle = '#e8d48b';
      ctx.beginPath();
      ctx.ellipse(cx, cy + 4, island.w / 2 + 4, island.h / 2 + 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main island (sand)
    ctx.fillStyle = '#d4b96a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, island.w / 2, island.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Green area
    ctx.fillStyle = '#3a8a3a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 6, island.w * 0.38, island.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();

    // Darker green patch
    ctx.fillStyle = '#2d7a2d';
    ctx.beginPath();
    ctx.ellipse(cx - island.w * 0.1, cy - 10, island.w * 0.2, island.h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dock
    if (island.hasDock) {
      const dockX = cx + island.w * 0.3;
      const dockY = cy + island.h * 0.35;
      ctx.fillStyle = '#8B6914';
      ctx.fillRect(dockX - 3, dockY, 6, 20);
      ctx.fillRect(dockX - 10, dockY + 16, 20, 4);
    }

    // Decorations (houses, trees, etc.)
    const emojiSize = Math.max(16, island.h * 0.35);
    ctx.font = `${emojiSize}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(island.deco, cx, cy - 8);
  }

  // Bow waves (V-shape from boat front)
  for (const w of bowWaves) {
    ctx.globalAlpha = w.life * 0.45;
    if (w.type === 'arc') {
      // Arc-shaped wave crests
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = w.life * 2.5;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size, 0, Math.PI * 0.6);
      ctx.stroke();
    } else {
      // Splash dots
      ctx.fillStyle = 'rgba(200, 230, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.size * w.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Wake particles (behind boat)
  for (const p of wakeParticles) {
    ctx.globalAlpha = p.life * 0.6;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Obstacles
  for (const o of obstacles) {
    ctx.save();
    const wobbleX = Math.sin(o.wobble) * 3;
    const wobbleY = Math.cos(o.wobble * 0.7) * 2;
    ctx.font = `${o.size}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Glow for good items
    if (!o.def.bad) {
      ctx.shadowColor = '#ffdd44';
      ctx.shadowBlur = 15;
    }

    ctx.fillText(o.def.emoji, o.x + wobbleX, o.y + wobbleY);
    ctx.restore();
  }

  // Particles
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Boat
  ctx.save();
  ctx.translate(boat.x, boat.y);
  ctx.rotate(boat.angle);
  ctx.scale(boat.scale, boat.scale);

  // Invincibility blink
  const isInvincible = invincibleUntil > elapsed;
  if (isInvincible && Math.floor(elapsed / 100) % 2 === 0) {
    ctx.globalAlpha = 0.4;
  }

  // Shield glow
  if (shieldUntil > elapsed) {
    ctx.shadowColor = '#44ff88';
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(0, 0, boat.w * 0.7, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(68,255,136,0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  // Draw the boat emoji
  ctx.font = `${boat.w}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('⛵', 0, 0);

  ctx.restore();

  // Ink overlay
  if (activeEffects.ink > elapsed) {
    const inkAlpha = Math.min(0.85, (activeEffects.ink - elapsed) / EFFECT_DURATION);
    ctx.fillStyle = `rgba(20, 10, 40, ${inkAlpha})`;
    ctx.fillRect(0, 0, W, H);
    // Small circle around boat you can still see
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    const spotR = 70;
    const spotGrad = ctx.createRadialGradient(boat.x, boat.y, 0, boat.x, boat.y, spotR);
    spotGrad.addColorStop(0, 'rgba(0,0,0,1)');
    spotGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = spotGrad;
    ctx.beginPath();
    ctx.arc(boat.x, boat.y, spotR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Freeze overlay
  if (activeEffects.freeze > elapsed) {
    ctx.fillStyle = 'rgba(180, 220, 255, 0.3)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🥶', boat.x, boat.y - 40);
  }
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

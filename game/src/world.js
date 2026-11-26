// World state and gameplay for Steel Falcon: arcade flight model, enemy
// AI jets, guns, lock-on missiles, explosions, smoke, scoring and warnings.
// Units are metres, seconds and radians. The player starts on the runway
// and must wipe out the enemy squadron.

import { clamp, dirFromYawPitch, lerp, v3, v3add, v3dist, v3dot, v3len, v3norm, v3scale, v3sub, wrapAngle } from './math.js';
import { mulberry32 } from './rng.js';
import { RUNWAY, terrainHeight } from './terrain.js';

export const ENEMY_COUNT = 6;
const MAX_SPEED = 340;      // m/s, full throttle
const MIN_SPEED = 55;       // stall speed
const GRAVITY_PULL = 9;     // sink when slow

export function createWorld(seed) {
  const rng = mulberry32(seed);
  const startYaw = RUNWAY.heading;
  const world = {
    seed,
    rng,
    time: 0,
    state: 'menu',           // menu | flying | paused | over | win
    score: 0,
    kills: 0,
    wave: 1,
    enemiesDown: 0,
    message: '',
    messageUntil: 0,
    shake: 0,
    player: {
      pos: v3(RUNWAY.x, 28, RUNWAY.z),
      yaw: startYaw, pitch: 0, roll: 0,
      speed: 0, throttle: 0.55,
      hp: 100, ammo: 600, missiles: 8,
      onGround: true, crashed: false,
      gunCooldown: 0, missileCooldown: 0,
    },
    enemies: [],
    bullets: [],       // { pos, vel, life, friendly }
    missiles: [],      // { pos, vel, target, life, friendly, trail: [] }
    particles: [],     // { pos, vel, life, maxLife, size, colour, smoke }
    lockTarget: null,
    lockTime: 0,
    lockMax: 1.1,
    ring: { pos: v3(-600, 420, -2600), radius: 60, passed: false },
    clouds: [],
    stats: { shotsFired: 0, hits: 0, missilesFired: 0 },
    hitFlash: 0,
  };
  for (let i = 0; i < 14; i++) {
    world.clouds.push({
      x: (rng() - 0.5) * 10000,
      y: 700 + rng() * 500,
      z: (rng() - 0.5) * 10000,
      s: 1.5 + rng() * 2.5,
    });
  }
  spawnWave(world);
  return world;
}

export function spawnWave(world) {
  const rng = world.rng;
  world.enemies = [];
  for (let i = 0; i < ENEMY_COUNT; i++) {
    const angle = (i / ENEMY_COUNT) * Math.PI * 2 + rng() * 0.5;
    const dist = 1800 + rng() * 1800;
    const x = clamp(Math.sin(angle) * dist, -4800, 4800);
    const z = clamp(-Math.cos(angle) * dist - 800, -4800, 4800);
    const alt = 350 + rng() * 500;
    world.enemies.push({
      id: i,
      pos: v3(x, alt, z),
      yaw: rng() * Math.PI * 2,
      pitch: 0, roll: 0,
      speed: 170 + rng() * 60,
      hp: 100,
      alive: true,
      mode: 'hunt',          // hunt | evade | flee
      modeUntil: 0,
      gunCooldown: 1 + rng() * 2,
      trail: [],
      bank: 0,
      smoke: 0,
    });
  }
  world.enemiesDown = 0;
}

export function startGame(world) {
  world.state = 'flying';
  world.time = 0;
  world.score = 0;
  world.kills = 0;
  world.wave = 1;
  world.player.pos = v3(RUNWAY.x, 28, RUNWAY.z);
  world.player.yaw = RUNWAY.heading;
  world.player.pitch = 0;
  world.player.roll = 0;
  world.player.speed = 0;
  world.player.throttle = 0.55;
  world.player.hp = 100;
  world.player.ammo = 600;
  world.player.missiles = 8;
  world.player.onGround = true;
  world.player.crashed = false;
  world.bullets = [];
  world.missiles = [];
  world.particles = [];
  world.lockTarget = null;
  world.lockTime = 0;
  world.ring.passed = false;
  spawnWave(world);
  showMessage(world, 'WIPE THEM ALL OUT — ' + ENEMY_COUNT + ' HOSTILES INBOUND', 4);
}

export function showMessage(world, text, dur = 3) {
  world.message = text;
  world.messageUntil = world.time + dur;
}

function addExplosion(world, pos, big) {
  const n = big ? 26 : 14;
  for (let i = 0; i < n; i++) {
    const a = world.rng() * Math.PI * 2;
    const b = (world.rng() - 0.5) * Math.PI;
    const sp = 18 + world.rng() * (big ? 70 : 40);
    world.particles.push({
      pos: [...pos],
      vel: [Math.cos(a) * Math.cos(b) * sp, Math.abs(Math.sin(b)) * sp + 8, Math.sin(a) * Math.cos(b) * sp],
      life: 0, maxLife: 0.7 + world.rng() * (big ? 1.1 : 0.6),
      size: 3 + world.rng() * (big ? 9 : 5),
      colour: pickFire(world.rng),
      smoke: false,
    });
  }
  for (let i = 0; i < (big ? 10 : 5); i++) {
    world.particles.push({
      pos: [pos[0] + (world.rng() - 0.5) * 8, pos[1] + (world.rng() - 0.5) * 8, pos[2] + (world.rng() - 0.5) * 8],
      vel: [(world.rng() - 0.5) * 6, 6 + world.rng() * 10, (world.rng() - 0.5) * 6],
      life: 0, maxLife: 2.2 + world.rng() * 1.4,
      size: 6 + world.rng() * 8,
      colour: [0.25, 0.24, 0.23],
      smoke: true,
    });
  }
  world.shake = Math.max(world.shake, big ? 0.9 : 0.45);
}

// Realistic fire: dark oranges and deep reds, never bright cartoon yellow.
function pickFire(rng) {
  const r = rng();
  if (r < 0.45) return [0.85, 0.32, 0.08];
  if (r < 0.8) return [0.65, 0.22, 0.06];
  return [0.95, 0.52, 0.14];
}

function fireGuns(world, jet, friendly) {
  const fwd = dirFromYawPitch(jet.yaw, jet.pitch);
  const right = [Math.cos(jet.yaw), 0, -Math.sin(jet.yaw)];
  for (const side of [-1, 1]) {
    const origin = [
      jet.pos[0] + fwd[0] * 10 + right[0] * side * 5.3,
      jet.pos[1] + fwd[1] * 10,
      jet.pos[2] + fwd[2] * 10 + right[2] * side * 5.3,
    ];
    const spread = (world.rng() - 0.5) * 0.012;
    world.bullets.push({
      pos: origin,
      vel: [fwd[0] * 900 + spread * 900, fwd[1] * 900, fwd[2] * 900],
      life: 0, maxLife: 1.6, friendly,
    });
  }
}

function launchMissile(world, jet, friendly, target) {
  const fwd = dirFromYawPitch(jet.yaw, jet.pitch);
  const pos = [jet.pos[0] + fwd[0] * 12, jet.pos[1] + fwd[1] * 12 - 1, jet.pos[2] + fwd[2] * 12];
  world.missiles.push({
    pos,
    vel: [fwd[0] * jet.speed + fwd[0] * 120, fwd[1] * jet.speed, fwd[2] * jet.speed + fwd[2] * 120],
    target, life: 0, maxLife: 9, friendly, trail: [],
  });
}

// Update the lock-on: the enemy nearest the screen centre, inside the
// forward cone and within range, builds lock over ~1.1 s.
function updateLock(world, dt, fwd) {
  const p = world.player;
  let best = null, bestScore = 0.35; // cos of max angle off centre
  for (const e of world.enemies) {
    if (!e.alive) continue;
    const to = v3sub(e.pos, p.pos);
    const d = v3len(to);
    if (d > 2600 || d < 60) continue;
    const dot = v3dot(v3norm(to), fwd);
    if (dot > bestScore) { bestScore = dot; best = e; }
  }
  if (best) {
    if (world.lockTarget === best) {
      world.lockTime += dt;
    } else {
      world.lockTarget = best;
      world.lockTime = 0;
    }
  } else {
    world.lockTarget = null;
    world.lockTime = 0;
  }
  return world.lockTarget && world.lockTime >= world.lockMax;
}

export function update(world, input, dt, sounds) {
  if (world.state !== 'flying') return;
  world.time += dt;
  const p = world.player;
  const groundH = terrainHeight(p.pos[0], p.pos[2], world.seed);
  const alt = p.pos[1] - groundH;

  // --- Throttle ---
  if (input.down('ShiftLeft') || input.down('ShiftRight') || input.down('KeyW')) p.throttle += dt * 0.45;
  if (input.down('ControlLeft') || input.down('ControlRight') || input.down('KeyS')) p.throttle -= dt * 0.45;
  p.throttle = clamp(p.throttle, 0, 1);

  // --- Steering: arrows bank + pitch; mouse steers toward cursor ---
  const steerX = input.steerX();
  const steerY = input.steerY();
  let mousePitch = 0, mouseRoll = 0;
  if (input.mouseX !== 0 || input.mouseY !== 0) {
    const w = 1280, h = 800;
    mouseRoll = clamp((input.mouseX / w - 0.5) * 2, -1, 1);
    mousePitch = clamp((input.mouseY / h - 0.5) * 2, -1, 1);
  }
  const rollInput = clamp(steerX + mouseRoll * 0.7, -1, 1);
  const pitchInput = clamp(-steerY - mousePitch * 0.7, -1, 1);
  // Roll toward the commanded bank, then turn with the bank.
  const targetRoll = rollInput * 1.15;
  p.roll = lerp(p.roll, targetRoll, Math.min(1, dt * 3.2));
  const turnRate = -p.roll * 0.85 * clamp(p.speed / 120, 0.25, 1);
  p.yaw += turnRate * dt;
  p.pitch = clamp(p.pitch + pitchInput * 0.55 * dt * clamp(p.speed / 60, 0.3, 1), -0.6, 0.6);
  // Ease the nose back toward level when no pitch input.
  if (Math.abs(pitchInput) < 0.05) p.pitch = lerp(p.pitch, 0, Math.min(1, dt * 0.25));

  // --- Speed & motion ---
  const targetSpeed = p.onGround ? p.throttle * 120 : MIN_SPEED + p.throttle * (MAX_SPEED - MIN_SPEED);
  const accel = p.onGround ? 26 : 34;
  p.speed += clamp(targetSpeed - p.speed, -accel * dt, accel * dt);
  if (!p.onGround && p.speed < MIN_SPEED + 6) {
    p.pitch -= GRAVITY_PULL * dt * 0.02; // sink when slow
  }
  const fwd = dirFromYawPitch(p.yaw, p.pitch);
  p.pos[0] += fwd[0] * p.speed * dt;
  p.pos[1] += fwd[1] * p.speed * dt;
  p.pos[2] += fwd[2] * p.speed * dt;
  // Keep the fight inside the island.
  const half = 5800;
  if (Math.abs(p.pos[0]) > half || Math.abs(p.pos[2]) > half) {
    p.yaw += Math.PI; // turn back — simple soft wall
    showMessage(world, 'TURN BACK — LEAVING THE COMBAT ZONE', 2);
  }
  p.pos[1] = Math.min(p.pos[1], 2400);

  // --- Takeoff / ground handling ---
  const newGroundH = terrainHeight(p.pos[0], p.pos[2], world.seed);
  const newAlt = p.pos[1] - newGroundH;
  if (p.onGround) {
    const onRunway = Math.abs(p.pos[0] - RUNWAY.x) < 500 && Math.abs(p.pos[2] - RUNWAY.z) < 500;
    p.pos[1] = newGroundH + (onRunway ? 1.5 : 1.5);
    if (p.speed > 95 && p.pitch > 0.08) {
      p.onGround = false;
      showMessage(world, 'AIRBORNE — GOOD HUNTING', 2.5);
      sounds.chime();
    }
  } else if (newAlt <= 0.5) {
    // Ground contact in the air: crash unless a gentle runway touchdown.
    const vs = -fwd[1] * p.speed;
    const onRunway = Math.abs(p.pos[0] - RUNWAY.x) < 420 && Math.abs(p.pos[2] - RUNWAY.z) < 420;
    if (onRunway && vs < 6 && Math.abs(p.roll) < 0.35) {
      p.onGround = true;
      p.pitch = 0;
      p.pos[1] = newGroundH + 1.5;
      showMessage(world, 'TOUCHDOWN ON RUNWAY ' + Math.round(RUNWAY.heading * 57.3), 2.5);
    } else {
      crashPlayer(world, sounds);
      return;
    }
  }

  // --- Guns ---
  p.gunCooldown -= dt;
  if ((input.down('Space') || input.mouseDown) && p.gunCooldown <= 0 && p.ammo > 0 && !p.onGround) {
    fireGuns(world, p, true);
    p.ammo -= 2;
    p.gunCooldown = 0.09;
    sounds.gun();
    world.stats.shotsFired += 2;
  }
  if (input.wasPressed('KeyM')) sounds.setMuted(!sounds.muted);

  // --- Lock-on + missiles ---
  const locked = updateLock(world, dt, fwd);
  if (locked && world.lockTime - dt < world.lockMax) sounds.lockBeep();
  p.missileCooldown -= dt;
  if ((input.wasPressed('KeyF') || input.rightClicked) && p.missileCooldown <= 0 && p.missiles > 0) {
    if (world.lockTarget && world.lockTime >= world.lockMax) {
      launchMissile(world, p, true, world.lockTarget);
      p.missiles -= 1;
      p.missileCooldown = 1.2;
      sounds.missileLaunch();
      world.stats.missilesFired += 1;
      showMessage(world, 'FOX 2 — MISSILE AWAY', 1.5);
    } else {
      showMessage(world, 'NO LOCK — HOLD THE ENEMY IN THE DIAMOND', 1.8);
    }
  }

  // --- Ring objective ---
  if (!world.ring.passed && v3dist(p.pos, world.ring.pos) < world.ring.radius + 25) {
    world.ring.passed = true;
    world.score += 250;
    showMessage(world, 'RING CLEARED +250', 2);
    sounds.chime();
  }

  updateEnemies(world, dt, sounds);
  updateBullets(world, dt, sounds);
  updateMissiles(world, dt, sounds);
  updateParticles(world, dt);

  // --- Warnings ---
  if (alt < 120 && !p.onGround && p.speed > 60) {
    if (world.time % 1 < dt * 2) sounds.warning();
  }
  if (p.hp <= 0 && !p.crashed) crashPlayer(world, sounds);
  if (world.enemiesDown >= ENEMY_COUNT && world.state === 'flying') {
    world.state = 'win';
    world.score += 1000;
    showMessage(world, 'ALL HOSTILES DOWN — SQUADRON WIPED OUT', 5);
    sounds.chime();
  }
  world.shake = Math.max(0, world.shake - dt * 1.8);
  world.hitFlash = Math.max(0, world.hitFlash - dt * 3);
}

function crashPlayer(world, sounds) {
  const p = world.player;
  p.crashed = true;
  p.hp = 0;
  addExplosion(world, p.pos, true);
  sounds.explosion(true);
  world.state = 'over';
  showMessage(world, 'STEEL FALCON DOWN', 5);
}

function updateEnemies(world, dt, sounds) {
  const p = world.player;
  for (const e of world.enemies) {
    if (!e.alive) continue;
    // Mode switching.
    if (world.time > e.modeUntil) {
      const toPlayer = v3dist(e.pos, p.pos);
      if (e.hp < 35) { e.mode = 'evade'; e.modeUntil = world.time + 3 + world.rng() * 2; }
      else if (toPlayer < 500) { e.mode = 'evade'; e.modeUntil = world.time + 1.5; }
      else { e.mode = 'hunt'; e.modeUntil = world.time + 4 + world.rng() * 3; }
    }
    // Desired heading: hunt the player, evade by turning hard away + diving.
    let desiredYaw, desiredPitch;
    const toP = v3sub(p.pos, e.pos);
    const dP = v3len(toP);
    if (e.mode === 'hunt' && !p.onGround) {
      desiredYaw = Math.atan2(-toP[0], -toP[2]);
      desiredPitch = clamp(Math.asin(clamp(toP[1] / (dP || 1), -1, 1)), -0.4, 0.4);
    } else if (e.mode === 'evade') {
      desiredYaw = e.yaw + 1.6;
      desiredPitch = -0.25;
    } else {
      // Wander: slow turn toward a point ahead.
      desiredYaw = e.yaw + 0.15 * Math.sin(world.time * 0.3 + e.id);
      desiredPitch = clamp((450 - e.pos[1]) * 0.0004, -0.2, 0.2);
    }
    const dy = wrapAngle(desiredYaw - e.yaw);
    e.yaw += clamp(dy, -0.9 * dt, 0.9 * dt);
    e.pitch = lerp(e.pitch, desiredPitch, Math.min(1, dt * 1.5));
    e.bank = lerp(e.bank, clamp(-dy * 1.2, -1.1, 1.1), Math.min(1, dt * 3));
    e.roll = e.bank;
    e.speed = clamp(e.speed + (e.mode === 'hunt' ? 12 : -6) * dt, 140, 260);
    const fwd = dirFromYawPitch(e.yaw, e.pitch);
    e.pos[0] += fwd[0] * e.speed * dt;
    e.pos[1] += fwd[1] * e.speed * dt;
    e.pos[2] += fwd[2] * e.speed * dt;
    // Stay above the terrain and inside the map.
    const gh = terrainHeight(e.pos[0], e.pos[2], world.seed);
    if (e.pos[1] < gh + 60) { e.pos[1] = gh + 60; e.pitch = Math.max(e.pitch, 0.15); }
    if (e.pos[1] > 1600) e.pitch = Math.min(e.pitch, -0.1);
    if (Math.abs(e.pos[0]) > 5400 || Math.abs(e.pos[2]) > 5400) e.yaw += Math.PI * dt;
    // Smoke trail when damaged.
    if (e.hp < 50) {
      e.smoke += dt;
      if (e.smoke > 0.06) {
        e.smoke = 0;
        world.particles.push({
          pos: [e.pos[0], e.pos[1], e.pos[2] + 8],
          vel: [(world.rng() - 0.5) * 4, 2, (world.rng() - 0.5) * 4],
          life: 0, maxLife: 1.6, size: 4 + world.rng() * 4,
          colour: [0.2, 0.2, 0.2], smoke: true,
        });
      }
    }
    // Enemy guns: fire when the player is ahead and in range.
    e.gunCooldown -= dt;
    if (e.mode === 'hunt' && dP < 900 && dP > 80 && e.gunCooldown <= 0 && !p.onGround) {
      const aim = v3dot(v3norm(toP), fwd);
      if (aim > 0.92) {
        fireGuns(world, e, false);
        e.gunCooldown = 0.35 + world.rng() * 0.4;
      }
    }
    // Collision with the player.
    if (dP < 16 && !p.onGround) {
      e.hp = 0;
      killEnemy(world, e, sounds);
      p.hp -= 40;
      world.hitFlash = 1;
      addExplosion(world, p.pos, false);
    }
  }
}

function updateBullets(world, dt, sounds) {
  const p = world.player;
  for (let i = world.bullets.length - 1; i >= 0; i--) {
    const b = world.bullets[i];
    b.life += dt;
    b.pos[0] += b.vel[0] * dt;
    b.pos[1] += b.vel[1] * dt;
    b.pos[2] += b.vel[2] * dt;
    let dead = b.life > b.maxLife;
    if (!dead && b.friendly) {
      for (const e of world.enemies) {
        if (!e.alive) continue;
        if (v3dist(b.pos, e.pos) < 14) {
          e.hp -= 9;
          world.stats.hits += 1;
          world.score += 10;
          dead = true;
          world.particles.push({
            pos: [...b.pos], vel: [0, 4, 0], life: 0, maxLife: 0.4,
            size: 3, colour: [0.9, 0.5, 0.15], smoke: false,
          });
          if (e.hp <= 0) killEnemy(world, e, sounds);
          break;
        }
      }
    }
    if (!dead && !b.friendly) {
      if (v3dist(b.pos, p.pos) < 12 && !p.onGround) {
        p.hp -= 3;
        world.hitFlash = 0.7;
        dead = true;
        sounds.gun();
      }
    }
    if (!dead && b.pos[1] < terrainHeight(b.pos[0], b.pos[2], world.seed)) dead = true;
    if (dead) world.bullets.splice(i, 1);
  }
}

function killEnemy(world, e, sounds) {
  if (!e.alive) return;
  e.alive = false;
  world.kills += 1;
  world.enemiesDown += 1;
  world.score += 500;
  addExplosion(world, e.pos, true);
  sounds.explosion(true);
  showMessage(world, 'SPLASH ' + world.kills + ' — HOSTILE DOWN +500', 2.5);
}

function updateMissiles(world, dt, sounds) {
  const p = world.player;
  for (let i = world.missiles.length - 1; i >= 0; i--) {
    const m = world.missiles[i];
    m.life += dt;
    // Homing: steer the velocity direction toward the target, with lead
    // prediction (aim where the target will be when the missile arrives).
    // The blend is on unit directions, so the turn rate stays stable.
    if (m.target && m.target.alive !== false) {
      const tgtPos = m.target.pos || m.target;
      const to = v3sub(tgtPos, m.pos);
      const d = v3len(to);
      let aim = tgtPos;
      if (m.target.yaw !== undefined && m.target.speed !== undefined) {
        const tv = v3scale(dirFromYawPitch(m.target.yaw, m.target.pitch), m.target.speed);
        const tHit = d / 380;
        aim = v3add(tgtPos, v3scale(tv, tHit));
      }
      const desiredDir = v3norm(v3sub(aim, m.pos));
      const cur = v3norm(m.vel);
      // Strong turn authority: a missile must pull a tight arc onto a
      // manoeuvring jet, not orbit it in wide circles.
      const steer = v3add(cur, v3scale(v3sub(desiredDir, cur), 0.3));
      m.vel = v3scale(v3norm(steer), 380);
      // Swept proximity fuse: at low frame rates the missile moves ~20 m
      // a frame, so check the whole segment it just flew, not only the
      // endpoint, against the target.
      const oldPos = [...m.pos];
      m.pos[0] += m.vel[0] * dt;
      m.pos[1] += m.vel[1] * dt;
      m.pos[2] += m.vel[2] * dt;
      const seg = v3sub(m.pos, oldPos);
      const segLen2 = v3dot(seg, seg) || 1;
      const tSeg = clamp(v3dot(v3sub(tgtPos, oldPos), seg) / segLen2, 0, 1);
      const closest = v3add(oldPos, v3scale(seg, tSeg));
      const dSeg = v3dist(closest, tgtPos);
      if (dSeg < 22) {
        if (m.friendly && m.target.alive) {
          m.target.hp -= 120;
          if (m.target.hp <= 0) killEnemy(world, m.target, sounds);
        } else if (!m.friendly) {
          p.hp -= 45;
          world.hitFlash = 1;
          addExplosion(world, p.pos, false);
        }
        addExplosion(world, m.pos, true);
        sounds.explosion(true);
        world.missiles.splice(i, 1);
        continue;
      }
    } else {
      // No live target: fly straight.
      m.pos[0] += m.vel[0] * dt;
      m.pos[1] += m.vel[1] * dt;
      m.pos[2] += m.vel[2] * dt;
    }
    // Smoke trail.
    m.trail.push([...m.pos]);
    if (m.trail.length > 25) m.trail.shift();
    if (world.rng() < 0.7) {
      world.particles.push({
        pos: [...m.pos], vel: [(world.rng() - 0.5) * 3, 1, (world.rng() - 0.5) * 3],
        life: 0, maxLife: 1.4, size: 2.5 + world.rng() * 2,
        colour: [0.85, 0.85, 0.86], smoke: true,
      });
    }
    if (m.life > m.maxLife || m.pos[1] < terrainHeight(m.pos[0], m.pos[2], world.seed)) {
      addExplosion(world, m.pos, false);
      world.missiles.splice(i, 1);
    }
  }
}

function updateParticles(world, dt) {
  for (let i = world.particles.length - 1; i >= 0; i--) {
    const pt = world.particles[i];
    pt.life += dt;
    pt.pos[0] += pt.vel[0] * dt;
    pt.pos[1] += pt.vel[1] * dt;
    pt.pos[2] += pt.vel[2] * dt;
    if (pt.smoke) { pt.vel[1] += 2 * dt; pt.size += dt * 6; }
    else pt.vel[1] -= 6 * dt;
    if (pt.life >= pt.maxLife) world.particles.splice(i, 1);
  }
}

// Read-only snapshot the HUD needs.
export function hudState(world) {
  const p = world.player;
  const gh = terrainHeight(p.pos[0], p.pos[2], world.seed);
  return {
    state: world.state,
    score: world.score,
    kills: world.kills,
    total: ENEMY_COUNT,
    wave: world.wave,
    hp: Math.max(0, Math.round(p.hp)),
    ammo: p.ammo,
    missiles: p.missiles,
    speedKmh: Math.round(p.speed * 3.6),
    alt: Math.max(0, Math.round(p.pos[1] - gh)),
    heading: Math.round(((-p.yaw * 180 / Math.PI) % 360 + 360) % 360),
    throttle: p.throttle,
    pitchDeg: Math.round(p.pitch * 57.3),
    rollDeg: Math.round(p.roll * 57.3),
    stall: !p.onGround && p.speed < MIN_SPEED + 8,
    lowAlt: !p.onGround && (p.pos[1] - gh) < 120,
    onGround: p.onGround,
    lockTarget: world.lockTarget,
    lockFrac: world.lockTarget ? Math.min(1, world.lockTime / world.lockMax) : 0,
    locked: world.lockTarget && world.lockTime >= world.lockMax,
    message: world.time < world.messageUntil ? world.message : '',
    enemiesAlive: world.enemies.filter((e) => e.alive).length,
    hitFlash: world.hitFlash,
  };
}

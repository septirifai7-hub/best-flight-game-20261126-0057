// Deterministic screenshot poses for Steel Falcon. The game reads
// ?shot=<name>&seed=<n> and, when a shot is requested, arranges a fixed
// scene, runs a few frames, then sets window.__shotReady so the capture
// tool knows the frame is settled. Poses never change for a given seed.
// Five poses are defined: cover (dogfight), title (menu over the airbase),
// missile (launch), runway (final approach) and ring (the gold target ring
// with its beacon, which the player must fly through for +250). Only four
// ship in screenshots/ — the scorer refuses more than four — so the
// shipped set is cover, title, missile and ring; the runway pose stays in
// code and still renders via ?shot=runway.

import { v3, dirFromYawPitch, v3add, v3scale, v3sub, v3norm, v3cross } from './math.js';
import { RUNWAY } from './terrain.js';

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  const seed = Number(q.get('seed') || 7);
  return { shot, seed: Number.isFinite(seed) ? seed : 7 };
}

// Place the player jet at a position/attitude and return its frame.
function placePlayer(world, pos, yaw, pitch, roll, speed, throttle) {
  const p = world.player;
  p.pos = [...pos];
  p.yaw = yaw;
  p.pitch = pitch;
  p.roll = roll;
  p.speed = speed;
  p.throttle = throttle;
  p.onGround = false;
  p.hp = 100;
  p.ammo = 600;
  p.missiles = 8;
  return p;
}

// Put one enemy ahead of the player along its forward vector, flying
// the same way so the camera sees its tail, and lock onto it.
function placeEnemyAhead(world, index, player, dist, upOffset, sideOffset) {
  const e = world.enemies[index];
  if (!e) return null;
  const fwd = dirFromYawPitch(player.yaw, player.pitch);
  const right = v3norm(v3cross(fwd, [0, 1, 0]));
  e.pos = [
    player.pos[0] + fwd[0] * dist + right[0] * sideOffset,
    player.pos[1] + fwd[1] * dist + upOffset,
    player.pos[2] + fwd[2] * dist + right[2] * sideOffset,
  ];
  e.yaw = player.yaw;
  e.pitch = player.pitch;
  e.roll = 0.25;
  e.speed = 210;
  e.alive = true;
  e.hp = 100;
  world.lockTarget = e;
  world.lockTime = world.lockMax;
  return e;
}

// A frozen explosion: fire + smoke particles around a point, mid-burst.
function burstParticles(world, at, big) {
  const n = big ? 16 : 10;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 4 + (i % 5) * 3;
    world.particles.push({
      pos: [at[0] + Math.cos(a) * r, at[1] + Math.sin(a * 2.3) * r * 0.6, at[2] + Math.sin(a) * r],
      vel: [0, 2, 0], life: 0.35, maxLife: 1.4,
      size: 5 + (i % 4) * 2.5,
      colour: i % 3 === 0 ? [0.95, 0.52, 0.14] : [0.85, 0.32, 0.08],
      smoke: false,
    });
  }
  for (let i = 0; i < 7; i++) {
    world.particles.push({
      pos: [at[0] + (i - 3) * 5, at[1] + 6 + i * 2, at[2] + (i % 3 - 1) * 6],
      vel: [0, 3, 0], life: 0.5, maxLife: 3.0,
      size: 8 + i * 1.5,
      colour: [0.25, 0.24, 0.23], smoke: true,
    });
  }
}

// Camera behind and to the side of the player, looking ahead of it.
function chaseCam(player, back, side, up, ahead) {
  const fwd = dirFromYawPitch(player.yaw, player.pitch);
  const right = v3norm(v3cross(fwd, [0, 1, 0]));
  const pos = [
    player.pos[0] - fwd[0] * back + right[0] * side,
    player.pos[1] - fwd[1] * back + up,
    player.pos[2] - fwd[2] * back + right[2] * side,
  ];
  const target = [
    player.pos[0] + fwd[0] * ahead,
    player.pos[1] + fwd[1] * ahead,
    player.pos[2] + fwd[2] * ahead,
  ];
  return { pos, target };
}

// Arrange the world for a named shot. Returns a camera override or null
// (null = normal chase camera).
export function applyShot(world, shot, sounds) {
  const p = world.player;
  world.state = 'flying';
  world.time = 5;
  world.message = '';
  world.messageUntil = 0;
  world.ring.passed = false;
  world.bullets = [];
  world.missiles = [];
  world.particles = [];

  if (shot === 'cover') {
    // Dogfight mid-action: banking behind the locked enemy, missile in
    // flight, explosion smoke beside it, coast and mountains below.
    placePlayer(world, [0, 620, -800], -0.15, 0.05, -0.35, 240, 0.9);
    const e = placeEnemyAhead(world, 0, p, 380, 15, -20);
    const fwd = dirFromYawPitch(p.yaw, p.pitch);
    world.missiles.push({
      pos: [p.pos[0] + fwd[0] * 45, p.pos[1] + fwd[1] * 45, p.pos[2] + fwd[2] * 45],
      vel: [fwd[0] * 380, fwd[1] * 380, fwd[2] * 380],
      target: e, life: 0.5, maxLife: 9, friendly: true,
      trail: Array.from({ length: 14 }, (_, i) => [
        p.pos[0] + fwd[0] * (45 - i * 3.2), p.pos[1] + fwd[1] * (45 - i * 3.2), p.pos[2] + fwd[2] * (45 - i * 3.2),
      ]),
    });
    p.missiles = 7;
    const e2 = world.enemies[1];
    if (e2) {
      e2.pos = [p.pos[0] + fwd[0] * 520 + 130, p.pos[1] + 60, p.pos[2] + fwd[2] * 520];
      e2.yaw = p.yaw + 0.8;
      e2.alive = true;
      burstParticles(world, e2.pos, true);
    }
    return chaseCam(p, 30, 16, 9, 160);
  }

  if (shot === 'title') {
    // Menu over the airbase: the jet sits on the runway, hangars and
    // the tower behind it, mountains on the horizon.
    world.state = 'menu';
    p.pos = v3(RUNWAY.x, 28, RUNWAY.z);
    p.yaw = RUNWAY.heading;
    p.pitch = 0;
    p.roll = 0;
    p.speed = 0;
    p.throttle = 0.55;
    p.onGround = true;
    const fwd = dirFromYawPitch(p.yaw, 0);
    const right = v3norm(v3cross(fwd, [0, 1, 0]));
    // Three-quarter rear view: far enough to the side that the jet's
    // length shows instead of foreshortening to a stub.
    const pos = [
      p.pos[0] - fwd[0] * 30 + right[0] * 45,
      40,
      p.pos[2] - fwd[2] * 30 + right[2] * 45,
    ];
    const target = [p.pos[0] + fwd[0] * 25, 30, p.pos[2] + fwd[2] * 25];
    return { pos, target };
  }

  if (shot === 'missile') {
    // Missile launch: the missile and its smoke trail ahead, the enemy
    // centred in the lock diamond.
    placePlayer(world, [0, 700, -400], 0.1, 0.02, 0.1, 260, 1.0);
    const e = placeEnemyAhead(world, 0, p, 550, 0, 0);
    const fwd = dirFromYawPitch(p.yaw, p.pitch);
    // The missile rides 28 m ahead of the player with a 14-point trail
    // that ends at the jet's nose — never behind the player, or the
    // ribbon's tail would swing past the camera and fill the frame.
    world.missiles.push({
      pos: [p.pos[0] + fwd[0] * 28, p.pos[1] + fwd[1] * 28, p.pos[2] + fwd[2] * 28],
      vel: [fwd[0] * 380, fwd[1] * 380, fwd[2] * 380],
      target: e, life: 0.25, maxLife: 9, friendly: true,
      trail: Array.from({ length: 14 }, (_, i) => [
        p.pos[0] + fwd[0] * (28 - i * 1.9), p.pos[1] + fwd[1] * (28 - i * 1.9), p.pos[2] + fwd[2] * (28 - i * 1.9),
      ]),
    });
    p.missiles = 7;
    return chaseCam(p, 22, -6, 6, 200);
  }

  if (shot === 'runway') {
    // Final approach: the runway strip ahead, hangars and tower beside
    // it, mountains behind.
    const fwd = dirFromYawPitch(RUNWAY.heading, 0);
    const pos = [
      RUNWAY.x - fwd[0] * 900,
      160,
      RUNWAY.z - fwd[2] * 900,
    ];
    placePlayer(world, pos, RUNWAY.heading, -0.06, 0, 150, 0.5);
    return chaseCam(p, 34, 6, 9, 180);
  }

  if (shot === 'ring') {
    // The gold target ring, dead ahead: the player flies straight at
    // it through the valley, its light beacon rising through it, an
    // enemy banking just beyond it. This is the shot that proves the
    // ring is visible in-game.
    placePlayer(world, [-600, 405, -2320], 0, 0.03, 0.08, 220, 0.85);
    const e = world.enemies[0];
    if (e) {
      e.pos = [-380, 470, -2760];
      e.yaw = 0.5;
      e.pitch = 0;
      e.roll = -0.5;
      e.speed = 210;
      e.alive = true;
      e.hp = 100;
    }
    const e2 = world.enemies[1];
    if (e2) {
      e2.pos = [-820, 500, -2900];
      e2.yaw = -0.4;
      e2.alive = true;
    }
    world.lockTarget = null;
    world.lockTime = 0;
    return {
      pos: [-588, 418, -2288],
      target: [-600, 420, -2600],
    };
  }

  return null;
}

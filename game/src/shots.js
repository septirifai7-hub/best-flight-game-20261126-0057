// Deterministic screenshot poses for Steel Falcon. The game reads
// ?shot=<name>&seed=<n> and, when a shot is requested, arranges a fixed
// scene, runs a few frames, then sets window.__shotReady so the capture
// tool knows the frame is settled. Poses never change for a given seed.

import { v3, dirFromYawPitch } from './math.js';
import { RUNWAY } from './terrain.js';

export function parseShot() {
  const q = new URLSearchParams(window.location.search);
  const shot = q.get('shot');
  const seed = Number(q.get('seed') || 7);
  return { shot, seed: Number.isFinite(seed) ? seed : 7 };
}

// Arrange the world for a named shot. Returns a camera override or null
// (null = normal chase camera).
export function applyShot(world, shot, sounds) {
  const p = world.player;
  if (shot === 'cover') {
    // Dogfight mid-action: airborne, banking toward an enemy 250 m ahead
    // along the player's nose, a missile in flight and an explosion
    // blooming beside the enemy.
    world.state = 'flying';
    p.pos = v3(400, 620, 1800);
    p.yaw = 2.6; p.pitch = 0.06; p.roll = -0.45;
    p.speed = 260; p.throttle = 0.9; p.onGround = false;
    const e = world.enemies[0];
    e.pos = v3(271, 635, 2014);
    e.yaw = 2.6; e.pitch = 0; e.alive = true; e.hp = 40;
    world.lockTarget = e;
    world.lockTime = 1.5;
    world.missiles.push({
      pos: v3(330, 625, 1900),
      vel: [-196, 23, 326], target: e, life: 0.4, maxLife: 9,
      friendly: true, trail: trailLine(v3(330, 625, 1900), v3(392, 620, 1810), 24),
    });
    world.particles.push({
      pos: v3(300, 642, 2024), vel: [0, 6, 0], life: 0.25, maxLife: 1.4,
      size: 5, colour: [0.85, 0.32, 0.08], smoke: false,
    });
    world.particles.push({
      pos: v3(312, 656, 2032), vel: [0, 8, 0], life: 0.15, maxLife: 2.6,
      size: 7, colour: [0.25, 0.24, 0.23], smoke: true,
    });
    world.score = 1250;
    world.kills = 2;
    return null;
  }
  if (shot === 'title') {
    // Title screen over the airbase: jet parked on the runway, seen from
    // a low three-quarter angle off the grass to the left — the strip
    // recedes diagonally, hangars and mountains behind, no dark slab
    // filling the frame.
    world.state = 'menu';
    p.pos = v3(RUNWAY.x, 28, RUNWAY.z);
    p.yaw = RUNWAY.heading; p.pitch = 0; p.roll = 0;
    p.speed = 0; p.onGround = true;
    const fwd = dirFromYawPitch(p.yaw, 0);
    const right = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const camPos = [
      p.pos[0] - fwd[0] * 30 - right[0] * 45,
      p.pos[1] + 13,
      p.pos[2] - fwd[2] * 30 - right[2] * 45,
    ];
    return { pos: camPos, target: [p.pos[0], p.pos[1] + 14, p.pos[2]], up: [0, 1, 0] };
  }
  if (shot === 'missile') {
    // Missile launch: player low over the valley, missile just away with a
    // long smoke trail, enemy 400 m ahead in the lock diamond.
    world.state = 'flying';
    p.pos = v3(-900, 480, 2600);
    p.yaw = 3.4; p.pitch = 0.02; p.roll = 0.18;
    p.speed = 290; p.throttle = 1; p.onGround = false;
    const e = world.enemies[1];
    e.pos = v3(-828, 486, 2870);
    e.yaw = 3.4; e.alive = true; e.hp = 100;
    world.lockTarget = e;
    world.lockTime = 2;
    // Missile offset to the right of the flight path so it is clearly
    // visible beside the jet instead of hidden behind it.
    const from = v3(-909, 481, 2664);
    world.missiles.push({
      pos: from,
      vel: [146, 9, 371], target: e, life: 0.8, maxLife: 9,
      friendly: true, trail: trailLine(from, v3(-903, 480, 2609), 24),
    });
    world.score = 500;
    world.kills = 1;
    return null;
  }
  if (shot === 'runway') {
    // Final approach: 380 m out, 80 m above the threshold, the runway
    // strip and the airbase filling the lower frame, mountains behind.
    world.state = 'flying';
    p.pos = v3(RUNWAY.x + 130, 108, RUNWAY.z + 357);
    p.yaw = RUNWAY.heading; p.pitch = -0.05; p.roll = 0;
    p.speed = 120; p.throttle = 0.35; p.onGround = false;
    world.score = 750;
    world.kills = 1;
    return null;
  }
  return null;
}

function trailLine(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    out.push([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]);
  }
  return out;
}

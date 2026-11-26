// Steel Falcon — entry point. Wires the WebGL renderer, the 2D HUD, the
// world simulation, input and synthesised sound into one frame loop.
// A chase camera follows the player's jet; deterministic ?shot= poses
// freeze the scene for screenshots and set window.__shotReady.

import { Renderer } from './render.js';
import { Hud } from './hud.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { createWorld, hudState, startGame, update } from './world.js';
import { applyShot, parseShot } from './shots.js';
import { terrainHeight } from './terrain.js';
import { clamp, dirFromYawPitch, v3, v3add, v3cross, v3norm, v3scale, v3sub } from './math.js';

const glCanvas = document.getElementById('gl');
const hudCanvas = document.getElementById('hud');
const statusEl = document.getElementById('status');

const { shot, seed } = parseShot();
const world = createWorld(seed);
const renderer = new Renderer(glCanvas, seed);
const hud = new Hud(hudCanvas);
const input = new Input(glCanvas);
const sounds = new SoundBank();

let shotCam = null;
let shotFrames = 0;
if (shot) {
  shotCam = applyShot(world, shot, sounds);
  // Screenshot poses are frozen: no simulation, just a few render frames
  // so the scene settles, then window.__shotReady signals the capture.
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.resize(w, h);
  hud.resize(w, h);
}
window.addEventListener('resize', resize);
resize();

function chaseCamera(dt) {
  const p = world.player;
  const fwd = dirFromYawPitch(p.yaw, p.pitch);
  const right = v3norm(v3cross(fwd, [0, 1, 0]));
  const up = v3norm(v3cross(right, fwd));
  // Camera sits behind and above the jet, looking slightly ahead of it.
  const back = 26 + p.speed * 0.02;
  const target = v3add(p.pos, v3scale(fwd, 30));
  const desired = [
    p.pos[0] - fwd[0] * back + up[0] * 7,
    p.pos[1] - fwd[1] * back + up[1] * 7,
    p.pos[2] - fwd[2] * back + up[2] * 7,
  ];
  // Keep the camera out of the ground.
  const groundMin = 12;
  if (desired[1] < groundMin) desired[1] = groundMin;
  if (!chaseCamera.pos) chaseCamera.pos = [...desired];
  const k = Math.min(1, dt * 6);
  chaseCamera.pos[0] += (desired[0] - chaseCamera.pos[0]) * k;
  chaseCamera.pos[1] += (desired[1] - chaseCamera.pos[1]) * k;
  chaseCamera.pos[2] += (desired[2] - chaseCamera.pos[2]) * k;
  // Screen shake from explosions, scaled by world.shake.
  const s = world.shake * 1.6;
  const shakePos = [
    chaseCamera.pos[0] + (Math.random() - 0.5) * s,
    chaseCamera.pos[1] + (Math.random() - 0.5) * s,
    chaseCamera.pos[2] + (Math.random() - 0.5) * s,
  ];
  // Roll the camera a little with the jet's bank for a sense of motion:
  // rotate the up vector toward the wing by a fraction of the bank angle.
  const bank = p.roll * 0.45;
  const camUp = v3norm([
    up[0] * Math.cos(bank) - right[0] * Math.sin(bank),
    up[1] * Math.cos(bank) - right[1] * Math.sin(bank),
    up[2] * Math.cos(bank) - right[2] * Math.sin(bank),
  ]);
  return {
    pos: shakePos, target,
    fwd: v3norm(v3sub(target, shakePos)),
    right, up: camUp,
  };
}

let last = performance.now();
let fpsFrames = 0;
let fpsTime = 0;

function frame(now) {
  const dt = clamp((now - last) / 1000, 0.001, 0.05);
  last = now;

  // --- State keys ---
  if (input.wasPressed('Enter')) {
    sounds.ensure();
    if (world.state === 'menu' || world.state === 'over' || world.state === 'win') {
      startGame(world);
    }
  }
  if (input.wasPressed('KeyP') && (world.state === 'flying' || world.state === 'paused')) {
    world.state = world.state === 'flying' ? 'paused' : 'flying';
  }
  if (input.wasPressed('KeyR') && world.state !== 'menu') {
    startGame(world);
  }
  if (input.wasPressed('KeyM')) {
    sounds.ensure();
    sounds.setMuted(!sounds.muted);
  }

  // --- Simulate (frozen for screenshot poses) ---
  if (!shot && world.state === 'flying') {
    try {
      update(world, input, dt, sounds);
    } catch (err) {
      // Never let one simulation error freeze the whole game loop:
      // record it and keep rendering so the player can restart.
      window.__gameError = String(err && err.message || err);
      console.error(err);
    }
  }
  if (shot) shotFrames++;
  if (world.state === 'flying' && !shot) {
    const p = world.player;
    sounds.setEngine(p.throttle, clamp(p.speed / 340, 0, 1), !p.onGround || p.speed > 20);
  }

  // --- Camera ---
  let cam;
  if (shotCam) {
    const fwd = v3norm(v3sub(shotCam.target, shotCam.pos));
    const right = v3norm(v3cross(fwd, [0, 1, 0]));
    const up = v3norm(v3cross(right, fwd));
    cam = { pos: shotCam.pos, target: shotCam.target, fwd, right, up };
  } else {
    cam = chaseCamera(dt);
  }

  // --- Draw ---
  renderer.render(world, cam.pos, cam.target, cam.up, world.time);
  hud.draw(world, hudState(world), cam, window.innerWidth, window.innerHeight);
  if (world.state === 'menu') statusEl.textContent = 'Steel Falcon: press Enter to fly.';
  else if (world.state === 'over') statusEl.textContent = 'Steel Falcon down. Press R to fly again.';
  else if (world.state === 'win') statusEl.textContent = 'Squadron wiped out. Score ' + world.score + '.';

  input.poll();

  // Screenshot readiness: after a few settled frames.
  if (shot && shotFrames > 4) {
    window.__shotReady = true;
    window.__shotFrames = shotFrames;
  }
  fpsFrames++;
  fpsTime += dt;
  if (fpsTime >= 2) {
    window.__fps = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0;
    fpsTime = 0;
  }
  requestAnimationFrame(frame);
}

// Debug/testing hook (local only): lets the CDP play-test read the world
// state and drive the game without touching the DOM.
window.__game = { world, sounds, start: () => startGame(world), terrainHeight };

requestAnimationFrame(frame);

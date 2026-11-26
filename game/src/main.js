// Sky Courier — boot and main loop. One job: own the canvas, the
// frame loop, and the URL shot mode the screenshots are taken in.
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createGame, updateGame, renderGame, startMission } from './game.js';
import { applyShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const shot = params.get('shot');
const seed = Number(params.get('seed') || 7);

const input = createInput(canvas);
const audio = createAudio();
const game = createGame();
window.__game = game; // for play-testing from the console / CDP

// Size the canvas to the window (device pixels for crisp screenshots).
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// Click a mission row on the title screen to fly it at once.
canvas.addEventListener('mousedown', () => {
  audio.unlock();
  if (game.phase !== 'title') return;
  const w = window.innerWidth, h = window.innerHeight;
  const bw = 560, bx = w / 2 - bw / 2, by = h * 0.46;
  const mx = input.mouseX * w;
  const my = (window.__mouseY ?? -1);
  for (let i = 0; i < 3; i++) {
    if (mx >= bx && mx <= bx + bw && my >= by + i * 74 && my <= by + i * 74 + 62) {
      startMission(game, i);
      return;
    }
  }
});
canvas.addEventListener('mousemove', (e) => { window.__mouseY = e.clientY; });

if (shot) {
  // Screenshot mode: pose the game, freeze the simulation, render.
  applyShot(game, shot, seed);
  const render = () => {
    renderGame(ctx, game, window.innerWidth, window.innerHeight);
    requestAnimationFrame(render);
  };
  render();
  window.__shotReady = true;
} else {
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    input.poll();
    const edges = input.consumeEdges();
    if (edges.confirm || edges.drop || edges.anyKey) audio.unlock();
    updateGame(game, input, edges, dt, audio);
    renderGame(ctx, game, window.innerWidth, window.innerHeight);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

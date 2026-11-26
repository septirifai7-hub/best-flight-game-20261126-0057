// Seeded random numbers (mulberry32) so the valley, the rings and the
// screenshot poses are identical every run for a given seed.
export function makeRandom(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 1-D value noise: smooth hills from a seeded random, for ridges.
export function makeNoise(seed) {
  const rand = makeRandom(seed);
  const grid = new Float32Array(512);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  const smooth = (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = grid[i & 511];
    const b = grid[(i + 1) & 511];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
  return (x) => smooth(x * 0.5) * 0.6 + smooth(x * 1.7) * 0.3 + smooth(x * 4.3) * 0.1;
}

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

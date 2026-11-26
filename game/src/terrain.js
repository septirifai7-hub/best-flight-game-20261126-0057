// Terrain for Steel Falcon: a 12 km x 12 km heightmap island — coastal
// mountains in the north and west, a river valley, a flat airbase plain in
// the south-east with a visible runway, and sea around the south coast.
// Colours are per-vertex: sand, grass, rock, snow, plus a water plane.

import { fbm } from './rng.js';

export const WORLD_SIZE = 12000;      // metres, square
export const SEA_LEVEL = 0;
export const RUNWAY = {
  x: 2600, z: 3600, heading: 0.35, length: 900, width: 46,
};

// Height of the terrain at world (x, z). Must match the mesh exactly.
export function terrainHeight(x, z, seed) {
  const half = WORLD_SIZE / 2;
  // Distance from the island centre shapes the coast: fall away to sea.
  const r = Math.hypot(x * 0.85, z * 0.85) / half;
  const coast = 1 - smoothstep(0.62, 1.0, r);
  // Mountain ridges in the north (-z) and west (-x).
  const ridge = fbm(x + 900, z - 1400, seed, 4);
  const ridgeMask = smoothstep(0.1, 0.55, (-z + 1400) / WORLD_SIZE + 0.25) * 0.7
    + smoothstep(0.1, 0.5, (-x + 1200) / WORLD_SIZE + 0.25) * 0.5;
  let h = 60 + ridge * 420 * Math.min(1, ridgeMask + 0.15);
  h += fbm(x, z, seed + 7, 3) * 55;
  // River valley carving down the middle toward the south coast.
  const riverD = Math.abs(x + 300 - z * 0.12);
  h -= 90 * Math.exp(-(riverD * riverD) / (2 * 260 * 260)) * smoothstep(-0.2, 0.4, z / WORLD_SIZE);
  // Flatten the airbase plain around the runway.
  const dBase = Math.hypot(x - RUNWAY.x, z - RUNWAY.z);
  const flat = smoothstep(900, 300, dBase);
  h = h * (1 - flat) + 26 * flat;
  // Coast falls to the sea.
  h = h * coast - 140 * (1 - coast);
  return h;
}

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Build the terrain mesh: grid of N x N cells, per-vertex colour by height
// and slope, normals from the height function.
export function buildTerrainMesh(gl, MeshBuilder, seed, N = 150) {
  const mb = new MeshBuilder();
  const half = WORLD_SIZE / 2;
  const step = WORLD_SIZE / N;
  const H = (x, z) => terrainHeight(x, z, seed);
  // Sample heights once so normals reuse them.
  const heights = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      heights[j * (N + 1) + i] = H(-half + i * step, -half + j * step);
    }
  }
  const at = (i, j) => heights[Math.min(N, Math.max(0, j)) * (N + 1) + Math.min(N, Math.max(0, i))];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const h = at(i, j);
      const dx = (at(i + 1, j) - at(i - 1, j)) / (2 * step);
      const dz = (at(i, j + 1) - at(i, j - 1)) / (2 * step);
      const inv = 1 / Math.hypot(dx, 1, dz);
      const nx = -dx * inv, ny = inv, nz = -dz * inv;
      const slope = 1 - ny;
      const c = terrainColour(h, slope, x, z, seed);
      mb.vertex(x, h, z, nx, ny, nz, c[0], c[1], c[2]);
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * (N + 1) + i;
      const b = a + 1;
      const c = a + N + 1;
      const d = c + 1;
      mb.idx.push(a, c, b, b, c, d);
    }
  }
  return mb.build(gl);
}

// Colour ramp — natural, muted, satellite-like: sand, dry grass, olive
// scrub, grey-brown rock, pale snow. No saturated cartoon greens.
// Fine noise mottles the colour so the ground reads as texture, not flat paint.
function terrainColour(h, slope, x, z, seed) {
  let c;
  if (h < 6) c = [0.72, 0.66, 0.50];                    // beach sand
  else if (slope > 0.28) c = [0.40, 0.37, 0.34];       // steep rock
  else if (h > 320) c = [0.86, 0.87, 0.88];            // snow caps
  else if (h > 200) c = [0.44, 0.42, 0.38];            // high rock
  else if (h > 90) c = [0.36, 0.38, 0.27];             // mountain scrub
  else if (h > 45) c = [0.42, 0.44, 0.30];             // olive grass
  else c = [0.52, 0.50, 0.34];                         // dry plain grass
  // Mottling: two scales of value noise vary brightness and hue slightly,
  // like patches of scrub, bare earth and shadowed ground.
  const m1 = fbm(x, z, seed + 31, 3) * 0.5 + 0.5;      // 0..1
  const m2 = fbm(x * 3.1, z * 3.1, seed + 47, 2) * 0.5 + 0.5;
  const bright = 0.86 + m1 * 0.26 - m2 * 0.10;
  // Vegetation patches: darker olive where the fine noise is high.
  const veg = smoothstep(0.55, 0.8, m2);
  const out = [
    c[0] * bright * (1 - veg * 0.18),
    c[1] * bright * (1 - veg * 0.05),
    c[2] * bright * (1 - veg * 0.22),
  ];
  return out;
}

// A flat water plane at sea level, slightly below the beach.
export function buildWaterMesh(gl, MeshBuilder) {
  const mb = new MeshBuilder();
  const half = WORLD_SIZE * 0.75;
  mb.quad(
    [-half, SEA_LEVEL, -half], [half, SEA_LEVEL, -half],
    [half, SEA_LEVEL, half], [-half, SEA_LEVEL, half],
    0, 1, 0, 0.13, 0.27, 0.36,
  );
  return mb.build(gl);
}

// The runway: a dark asphalt strip with white centre dashes and threshold
// bars, plus a small apron and hangars at the airbase, laid flat at y = 27.
export function buildAirbaseMesh(gl, MeshBuilder) {
  const mb = new MeshBuilder();
  const y = 27.2;
  const { x, z, heading, length, width } = RUNWAY;
  const dx = Math.sin(heading), dz = Math.cos(heading);
  const px = Math.cos(heading), pz = -Math.sin(heading);
  const corner = (along, across) => [
    x + dx * along + px * across,
    y,
    z + dz * along + pz * across,
  ];
  // Asphalt strip (dark grey, not black — real tarmac reads as grey).
  mb.quad(corner(-length / 2, -width / 2), corner(-length / 2, width / 2),
    corner(length / 2, width / 2), corner(length / 2, -width / 2),
    0, 1, 0, 0.27, 0.27, 0.28);
  // Centre dashes.
  for (let a = -length / 2 + 60; a < length / 2 - 40; a += 90) {
    mb.quad(corner(a, -2), corner(a, 2), corner(a + 44, 2), corner(a + 44, -2),
      0, 1, 0, 0.92, 0.92, 0.88);
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    const a0 = end * (length / 2 - 40);
    mb.quad(corner(a0, -width / 2 + 4), corner(a0, width / 2 - 4),
      corner(a0 + end * 18, width / 2 - 4), corner(a0 + end * 18, -width / 2 + 4),
      0, 1, 0, 0.92, 0.92, 0.88);
  }
  // Apron beside the strip.
  const ax = x + px * (width / 2 + 130);
  const az = z + pz * (width / 2 + 130);
  mb.quad([ax - 150, y, az - 110], [ax + 150, y, az - 110],
    [ax + 150, y, az + 110], [ax - 150, y, az + 110], 0, 1, 0, 0.38, 0.38, 0.38);
  // Three hangars: simple arched boxes on the apron.
  for (let i = -1; i <= 1; i++) {
    const hx = ax + dx * i * 95;
    const hz = az + dz * i * 95;
    mb.box(hx, y + 11, hz, 56, 22, 40, 0.72, 0.73, 0.74);
    mb.box(hx, y + 24, hz, 40, 7, 30, 0.62, 0.63, 0.64);
  }
  // Control tower, set back from the apron so it never crowds the runway.
  mb.box(ax - 260, y + 16, az + 80, 11, 32, 11, 0.68, 0.68, 0.68);
  mb.box(ax - 260, y + 35, az + 80, 19, 8, 19, 0.25, 0.35, 0.45);
  return mb.build(gl);
}

// The target ring: a glowing torus-ish ring of small quads, standing
// vertical over the valley, used as the dogfight objective marker.
export function buildRingMesh(gl, MeshBuilder, radius = 60) {
  const mb = new MeshBuilder();
  const seg = 28;
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * Math.PI * 2;
    const a1 = ((i + 1) / seg) * Math.PI * 2;
    const p0 = [Math.cos(a0) * radius, Math.sin(a0) * radius, 0];
    const p1 = [Math.cos(a1) * radius, Math.sin(a1) * radius, 0];
    const w = 2.2;
    // Two crossed quads per segment so the ring reads from any angle.
    mb.quad(
      [p0[0], p0[1] - w, -w], [p1[0], p1[1] - w, -w],
      [p1[0], p1[1] + w, -w], [p0[0], p0[1] + w, -w],
      0, 0, -1, 0.92, 0.70, 0.18,
    );
    mb.quad(
      [p0[0] - w, p0[1], 0], [p1[0] - w, p1[1], 0],
      [p1[0] + w, p1[1], 0], [p0[0] + w, p0[1], 0],
      0, 0, 1, 0.92, 0.70, 0.18,
    );
  }
  return mb.build(gl);
}

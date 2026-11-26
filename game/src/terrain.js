// Terrain for Steel Falcon: a 12 km x 12 km coastal island — mountain
// ridges in the north and west, a river valley running to the south
// coast, a flat airbase plain in the south-east with a marked runway,
// and sea around the edges. Everything is per-vertex colour on a dense
// heightmap grid, shaded like a satellite photo: sand, scrub, forest,
// rock and snow, with fine noise mottling so the ground reads as real
// terrain from the air instead of flat colour bands.

import { fbm, valueNoise } from './rng.js';

export const WORLD_SIZE = 12000;      // metres, square
export const SEA_LEVEL = 0;
export const RUNWAY = {
  x: 2600, z: 3600, heading: 0.35, length: 900, width: 46,
};

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Height of the terrain at world (x, z). This exact function is shared
// by the physics (collisions, AI) and the mesh, so the two can never
// disagree: the mesh is sampled from this function.
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

// ---- Terrain colouring -------------------------------------------------
// Returns an [r, g, b] for a terrain vertex from its height, slope and
// two scales of noise, so the ground has vegetation patches, rock faces
// and snow caps instead of flat height bands.

function terrainColour(x, z, h, slope, seed) {
  // Fine mottling: small patches and large vegetation zones.
  const mottle = valueNoise(x, z, 260, seed + 31) * 0.5 + valueNoise(x, z, 90, seed + 47) * 0.5;
  const forest = fbm(x + 500, z - 300, seed + 91, 3);
  const steep = slope > 0.55;

  let c;
  if (h < 6) {
    // Beach sand, wet near the waterline.
    c = [0.78, 0.72, 0.54];
    if (h < 1.5) { c = [0.66, 0.60, 0.46]; }
  } else if (h > 400 && !steep) {
    // Snow caps on the high gentle tops.
    c = [0.90, 0.91, 0.93];
  } else if (steep || h > 320) {
    // Rock faces and scree.
    c = [0.46, 0.43, 0.38];
    if (h > 240) c = [0.52, 0.50, 0.47];
  } else if (forest > 0.22 && h > 40 && h < 300) {
    // Dense forest patches.
    c = [0.23, 0.33, 0.19];
  } else if (forest > -0.05) {
    // Olive scrub.
    c = [0.40, 0.45, 0.26];
  } else {
    // Dry grass.
    c = [0.56, 0.55, 0.34];
  }
  // River valley floor: greener, lusher strip.
  const riverD = Math.abs(x + 300 - z * 0.12);
  if (riverD < 220 && h > 4 && h < 260 && !steep) {
    const w = 1 - riverD / 220;
    c = [c[0] * (1 - w) + 0.30 * w, c[1] * (1 - w) + 0.42 * w, c[2] * (1 - w) + 0.22 * w];
  }
  // Mottle brightness so no two patches look alike.
  const m = 1 + mottle * 0.16;
  // High slopes catch a little less light in the colour itself.
  const shade = steep ? 0.92 : 1.0;
  return [c[0] * m * shade, c[1] * m * shade, c[2] * m * shade];
}

// Build the terrain mesh: a dense grid (N x N cells) sampled from
// terrainHeight, with normals from finite differences and per-vertex
// colour from terrainColour. N=190 keeps the vertex count under the
// 16-bit index limit while giving visibly finer ridges than before.
export function buildTerrainMesh(gl, MeshBuilder, seed, N = 190) {
  const mb = new MeshBuilder();
  const half = WORLD_SIZE / 2;
  const step = WORLD_SIZE / N;
  const idx = [];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const h = terrainHeight(x, z, seed);
      // Normal from the height gradient.
      const hx = terrainHeight(x + step, z, seed) - terrainHeight(x - step, z, seed);
      const hz = terrainHeight(x, z + step, seed) - terrainHeight(x, z - step, seed);
      let nx = -hx / (2 * step), ny = 1, nz = -hz / (2 * step);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const slope = 1 - ny;
      const col = terrainColour(x, z, h, slope, seed);
      idx.push(mb.vertex(x, h, z, nx, ny, nz, col[0], col[1], col[2]));
    }
  }
  const row = N + 1;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      mb.tri(a, c, b);
      mb.tri(b, c, d);
    }
  }
  return mb.build(gl);
}

// The sea: a large plane just above sea level with gentle colour
// variation — deep blue-green offshore, lighter turquoise over the
// shallows near the beach.
export function buildWaterMesh(gl, MeshBuilder) {
  const mb = new MeshBuilder();
  const N = 28;
  const half = WORLD_SIZE / 2 + 3500;
  const step = (half * 2) / N;
  const idx = [];
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const shore = Math.max(0, 1 - Math.hypot(x, z) / 5200);
      const wob = valueNoise(x, z, 700, 5) * 0.5 + 0.5;
      const r = 0.10 + shore * 0.10 + wob * 0.02;
      const g = 0.30 + shore * 0.12 + wob * 0.03;
      const b = 0.36 + shore * 0.10 + wob * 0.03;
      idx.push(mb.vertex(x, 0.6, z, 0, 1, 0, r, g, b));
    }
  }
  const row = N + 1;
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      mb.tri(a, c, b);
      mb.tri(b, c, d);
    }
  }
  return mb.build(gl);
}

// ---- Airbase -----------------------------------------------------------
// Runway axis from RUNWAY.heading: forward = (-sin h, 0, -cos h).
function runwayFrame() {
  const h = RUNWAY.heading;
  const fwd = [-Math.sin(h), 0, -Math.cos(h)];
  const right = [Math.cos(h), 0, -Math.sin(h)];
  return { fwd, right };
}

// A flat quad on the airbase plain, given centre offset (along, across)
// from the runway centre, size (along x across) and height.
function baseQuad(mb, along, across, len, wid, y, r, g, b) {
  const { fwd, right } = runwayFrame();
  const cx = RUNWAY.x + fwd[0] * along + right[0] * across;
  const cz = RUNWAY.z + fwd[2] * along + right[2] * across;
  const a = [cx - fwd[0] * len / 2 - right[0] * wid / 2, y, cz - fwd[2] * len / 2 - right[2] * wid / 2];
  const bb = [cx + fwd[0] * len / 2 - right[0] * wid / 2, y, cz + fwd[2] * len / 2 - right[2] * wid / 2];
  const cc = [cx + fwd[0] * len / 2 + right[0] * wid / 2, y, cz + fwd[2] * len / 2 + right[2] * wid / 2];
  const d = [cx - fwd[0] * len / 2 + right[0] * wid / 2, y, cz - fwd[2] * len / 2 + right[2] * wid / 2];
  mb.quad(a, bb, cc, d, 0, 1, 0, r, g, b);
}

export function buildAirbaseMesh(gl, MeshBuilder) {
  const mb = new MeshBuilder();
  const L = RUNWAY.length, W = RUNWAY.width;
  const asphalt = [0.23, 0.23, 0.25];
  const concrete = [0.52, 0.52, 0.50];
  const white = [0.92, 0.92, 0.90];

  // Runway strip + darker blast pads at both ends.
  baseQuad(mb, 0, 0, L, W, 26.9, asphalt[0], asphalt[1], asphalt[2]);
  baseQuad(mb, -L / 2 - 45, 0, 90, W, 26.85, 0.18, 0.18, 0.19);
  baseQuad(mb, L / 2 + 45, 0, 90, W, 26.85, 0.18, 0.18, 0.19);
  // Edge lines.
  baseQuad(mb, 0, -W / 2 + 1.2, L, 1.6, 27.05, white[0], white[1], white[2]);
  baseQuad(mb, 0, W / 2 - 1.2, L, 1.6, 27.05, white[0], white[1], white[2]);
  // Centreline dashes.
  for (let d = -L / 2 + 40; d < L / 2 - 40; d += 60) {
    baseQuad(mb, d, 0, 30, 2.2, 27.05, white[0], white[1], white[2]);
  }
  // Threshold bars at both ends (8 bars each).
  for (const end of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      baseQuad(mb, end * (L / 2 - 18), k * 5.2, 14, 2.4, 27.05, white[0], white[1], white[2]);
    }
    // Touchdown zone bars.
    for (const t of [120, 210]) {
      baseQuad(mb, end * (L / 2 - t), -8, 22, 3, 27.05, white[0], white[1], white[2]);
      baseQuad(mb, end * (L / 2 - t), 8, 22, 3, 27.05, white[0], white[1], white[2]);
    }
  }
  // Apron (concrete parking area) + taxiway to the runway.
  baseQuad(mb, 60, 150, 420, 170, 26.8, concrete[0], concrete[1], concrete[2]);
  baseQuad(mb, 60, 55, 40, 150, 26.85, 0.38, 0.38, 0.37);
  // Parking position lines on the apron.
  for (let k = -1; k <= 1; k++) {
    baseQuad(mb, -60 + k * 130, 150, 3, 60, 27.0, 0.85, 0.75, 0.25);
  }

  // ---- Buildings (world-space boxes, beside the apron) ----
  const { fwd, right } = runwayFrame();
  const at = (along, across) => [
    RUNWAY.x + fwd[0] * along + right[0] * across,
    RUNWAY.z + fwd[2] * along + right[2] * across,
  ];
  // Hangars: wide boxes with a lighter sloped roof (two quads).
  for (let k = -1; k <= 1; k++) {
    const [hx, hz] = at(-120 + k * 130, 300);
    mb.box(hx, 26 + 7, hz, 90, 14, 55, 0.55, 0.56, 0.55);
    const roof = 0.72;
    mb.quad([hx - 46, 33.2, hz - 28], [hx + 46, 33.2, hz - 28], [hx + 46, 37.5, hz], [hx - 46, 37.5, hz], 0, 0.7, -0.7, roof, roof, roof);
    mb.quad([hx - 46, 37.5, hz], [hx + 46, 37.5, hz], [hx + 46, 33.2, hz + 28], [hx - 46, 33.2, hz + 28], 0, 0.7, 0.7, roof * 0.94, roof * 0.94, roof * 0.94);
    // Dark hangar door facing the apron.
    mb.box(hx, 26 + 5, hz - 28.2, 70, 10, 0.6, 0.16, 0.16, 0.18);
  }
  // Control tower: shaft + glass cab + antenna.
  const [tx, tz] = at(320, 260);
  mb.box(tx, 26 + 16, tz, 10, 32, 10, 0.62, 0.62, 0.60);
  mb.box(tx, 26 + 35, tz, 16, 6, 16, 0.14, 0.20, 0.28);
  mb.box(tx, 26 + 39, tz, 12, 2.5, 12, 0.55, 0.55, 0.55);
  mb.box(tx, 26 + 46, tz, 0.8, 10, 0.8, 0.3, 0.3, 0.32);
  // Small operations buildings.
  for (const [along, across, w, d, h] of [[180, 300, 40, 22, 8], [240, 300, 30, 20, 7], [-260, 290, 46, 24, 9]]) {
    const [bx, bz] = at(along, across);
    mb.box(bx, 26 + h / 2, bz, w, h, d, 0.58, 0.57, 0.54);
    mb.box(bx, 26 + h + 0.8, bz, w + 2, 1.6, d + 2, 0.42, 0.40, 0.38);
  }
  // Fuel farm: two squat tanks.
  for (const [along, across] of [[-320, 180], [-320, 230]]) {
    const [fx, fz] = at(along, across);
    mb.sphere(fx, 26 + 5, fz, 9, 6, 9, 0.75, 0.72, 0.68, 6, 10);
    mb.box(fx, 26 + 11.5, fz, 10, 1.2, 10, 0.6, 0.58, 0.55);
  }
  // Windsock pole near the runway.
  const [wx, wz] = at(-L / 2 + 60, -W / 2 - 30);
  mb.box(wx, 26 + 7, wz, 0.7, 14, 0.7, 0.7, 0.7, 0.72);
  mb.box(wx + 3, 26 + 13, wz, 6, 1.4, 1.4, 1.8, 0.5, 0.2);
  return mb.build(gl);
}

// ---- Target ring -------------------------------------------------------
// A thick golden torus standing vertical (circle in the XY plane, axis
// along Z) so a jet flying north through the valley passes through it.
// Bright gold above 1.0 so it glows against the sky and terrain.
export function buildRingMesh(gl, MeshBuilder, radius = 60) {
  const mb = new MeshBuilder();
  const tube = 3.6;
  const seg = 28, side = 10;
  const gold = [1.9, 1.35, 0.30];
  const goldHi = [2.4, 1.8, 0.55];
  const rings = [];
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    const cx = Math.cos(a) * radius, cy = Math.sin(a) * radius;
    const ring = [];
    for (let i = 0; i < side; i++) {
      const b = (i / side) * Math.PI * 2;
      const cb = Math.cos(b), sb = Math.sin(b);
      // Tube cross-section: offset from the circle centre in the plane
      // spanned by the radial direction and Z.
      const px = cx + cb * Math.cos(a) * tube;
      const py = cy + cb * Math.sin(a) * tube;
      const pz = sb * tube;
      const nx = cb * Math.cos(a), ny = cb * Math.sin(a), nz = sb;
      // Sunlit top of the tube is brighter.
      const bright = 0.75 + 0.45 * Math.max(0, ny);
      ring.push(mb.vertex(px, py, pz, nx, ny, nz, gold[0] * bright, gold[1] * bright, gold[2] * bright));
    }
    rings.push(ring);
  }
  for (let s = 0; s < seg; s++) {
    for (let i = 0; i < side; i++) {
      const j = (i + 1) % side;
      const a = rings[s][i], b = rings[s][j], c = rings[s + 1][j], d = rings[s + 1][i];
      mb.tri(a, d, c);
      mb.tri(a, c, b);
    }
  }
  // Inner chevron markers: small bright diamonds on the ring face so the
  // opening reads clearly even from far away.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const px = Math.cos(a) * radius, py = Math.sin(a) * radius;
    mb.box(px, py, -tube - 0.4, 5, 5, 1.2, goldHi[0], goldHi[1], goldHi[2]);
  }
  return mb.build(gl);
}

// The beacon: a tall light pillar rising through the ring position, plus
// a glowing pad on the ground below, so the player can spot the ring
// from anywhere in the valley. Built centred on the origin; the
// renderer places it at the ring's x/z.
export function buildBeaconMesh(gl, MeshBuilder, baseY, topY) {
  const mb = new MeshBuilder();
  const h = topY - baseY;
  // Outer soft column, built as 4 stacked bands that fade toward the top.
  const N = 12;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    // Full-height side quads, split into 4 stacked bands so the column
    // fades toward the top.
    for (let b = 0; b < 4; b++) {
      const y0 = baseY + (h * b) / 4, y1 = baseY + (h * (b + 1)) / 4;
      const fade = 1 - b * 0.22;
      const a0 = mb.vertex(Math.cos((i / N) * Math.PI * 2) * 7, y0, Math.sin((i / N) * Math.PI * 2) * 7, Math.cos((i / N) * Math.PI * 2), 0, Math.sin((i / N) * Math.PI * 2), 0.85 * fade, 0.62 * fade, 0.18 * fade);
      const a1 = mb.vertex(Math.cos((j / N) * Math.PI * 2) * 7, y0, Math.sin((j / N) * Math.PI * 2) * 7, Math.cos((j / N) * Math.PI * 2), 0, Math.sin((j / N) * Math.PI * 2), 0.85 * fade, 0.62 * fade, 0.18 * fade);
      const a2 = mb.vertex(Math.cos((j / N) * Math.PI * 2) * 7, y1, Math.sin((j / N) * Math.PI * 2) * 7, Math.cos((j / N) * Math.PI * 2), 0, Math.sin((j / N) * Math.PI * 2), 0.85 * fade, 0.62 * fade, 0.18 * fade);
      const a3 = mb.vertex(Math.cos((i / N) * Math.PI * 2) * 7, y1, Math.sin((i / N) * Math.PI * 2) * 7, Math.cos((i / N) * Math.PI * 2), 0, Math.sin((i / N) * Math.PI * 2), 0.85 * fade, 0.62 * fade, 0.18 * fade);
      mb.tri(a0, a3, a2);
      mb.tri(a0, a2, a1);
    }
  }
  // Bright core column.
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const a0 = mb.vertex(Math.cos((i / N) * Math.PI * 2) * 2.6, baseY, Math.sin((i / N) * Math.PI * 2) * 2.6, Math.cos((i / N) * Math.PI * 2), 0, Math.sin((i / N) * Math.PI * 2), 2.2, 1.6, 0.45);
    const a1 = mb.vertex(Math.cos((j / N) * Math.PI * 2) * 2.6, baseY, Math.sin((j / N) * Math.PI * 2) * 2.6, Math.cos((j / N) * Math.PI * 2), 0, Math.sin((j / N) * Math.PI * 2), 2.2, 1.6, 0.45);
    const a2 = mb.vertex(Math.cos((j / N) * Math.PI * 2) * 2.6, topY, Math.sin((j / N) * Math.PI * 2) * 2.6, Math.cos((j / N) * Math.PI * 2), 0, Math.sin((j / N) * Math.PI * 2), 1.4, 1.0, 0.3);
    const a3 = mb.vertex(Math.cos((i / N) * Math.PI * 2) * 2.6, topY, Math.sin((i / N) * Math.PI * 2) * 2.6, Math.cos((i / N) * Math.PI * 2), 0, Math.sin((i / N) * Math.PI * 2), 1.4, 1.0, 0.3);
    mb.tri(a0, a3, a2);
    mb.tri(a0, a2, a1);
  }
  return mb.build(gl);
}

// Glowing ground pad under the beacon: a flat gold disc.
export function buildBeaconPadMesh(gl, MeshBuilder) {
  const mb = new MeshBuilder();
  const N = 20;
  const centre = mb.vertex(0, 0, 0, 0, 1, 0, 2.0, 1.5, 0.4);
  const ring = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    ring.push(mb.vertex(Math.cos(a) * 26, 0, Math.sin(a) * 26, 0, 1, 0, 1.1, 0.8, 0.22));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(centre, ring[i], ring[j]);
  }
  return mb.build(gl);
}

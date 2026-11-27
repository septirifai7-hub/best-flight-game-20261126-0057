// Terrain for Steel Falcon: a 12 km x 12 km coastal island — mountain
// ridges in the north and west, a river valley running to the south
// coast, a flat airbase plain in the south-east with a marked runway,
// and sea around the edges. The ground is coloured like a satellite
// photo (sand, scrub, forest, rock, snow) with fine noise mottling and
// a tiled detail texture, so it reads as real terrain from the air.
// Roads wind through the valley and forests of instanced pine trees
// stand on the lower slopes; the gold target ring and its light beacon
// mark the practice course over the valley.
//
// terrainHeight is shared by the physics (collisions, AI) and the mesh,
// so the two can never disagree: every mesh below is sampled from this
// exact function. Its constants are gameplay, not decoration — the
// shape of the island must not change.

import { fbm, valueNoise, mulberry32 } from './rng.js';

export const WORLD_SIZE = 12000;      // metres, square
export const SEA_LEVEL = 0;
export const RUNWAY = {
  x: 2600, z: 3600, heading: 0.35, length: 900, width: 46,
};

function sstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export function terrainHeight(x, z, seed) {
  const half = WORLD_SIZE / 2;
  // Coast: the island falls away to the sea toward the map edges.
  const r = Math.hypot(x * 0.85, z * 0.85) / half;
  const coast = 1 - sstep(0.62, 1.0, r);
  // Mountain ridges, strongest in the north (-z) and west (-x).
  const ridge = fbm(x + 900, z - 1400, seed, 4);
  const maskN = sstep(0.1, 0.55, (-z + 1400) / WORLD_SIZE + 0.25) * 0.7;
  const maskW = sstep(0.1, 0.5, (-x + 1200) / WORLD_SIZE + 0.25) * 0.5;
  let h = 60 + ridge * 420 * Math.min(1, maskN + maskW + 0.15);
  h += fbm(x, z, seed + 7, 3) * 55;
  // River valley carving down the middle toward the south coast.
  const riverD = Math.abs(x + 300 - z * 0.12);
  h -= 90 * Math.exp(-(riverD * riverD) / (2 * 260 * 260)) * sstep(-0.2, 0.4, z / WORLD_SIZE);
  // Flatten the airbase plain around the runway.
  const dBase = Math.hypot(x - RUNWAY.x, z - RUNWAY.z);
  const flat = sstep(900, 300, dBase);
  h = h * (1 - flat) + 26 * flat;
  // Coast falls to the sea.
  h = h * coast - 140 * (1 - coast);
  return h;
}

// ---- Terrain colouring ---------------------------------------------------
// A vertex colour from height, slope and two scales of noise: vegetation
// patches, rock faces and snow caps instead of flat height bands. A
// low-frequency darkening (ambient occlusion baked into the colour)
// deepens valleys and gullies so the relief reads even in flat light.
function groundColour(x, z, h, slope, seed) {
  const mottle = valueNoise(x, z, 260, seed + 31) * 0.5 + valueNoise(x, z, 90, seed + 47) * 0.5;
  const forest = fbm(x + 500, z - 300, seed + 91, 3);
  const ao = 0.86 + 0.14 * fbm(x + 200, z + 800, seed + 123, 3); // valley darkening
  const steep = slope > 0.55;

  let c;
  if (h < 6) {
    // Beach sand, wet and darker near the waterline.
    c = h < 1.5 ? [0.66, 0.60, 0.46] : [0.78, 0.72, 0.54];
  } else if (h > 400 && !steep) {
    // Snow caps on the high gentle tops.
    c = [0.90, 0.91, 0.93];
  } else if (steep || h > 320) {
    // Rock faces and scree.
    c = h > 240 ? [0.52, 0.50, 0.47] : [0.46, 0.43, 0.38];
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
  // River valley floor: a greener, lusher strip along the watercourse.
  const riverD = Math.abs(x + 300 - z * 0.12);
  if (riverD < 220 && h > 4 && h < 260 && !steep) {
    const w = 1 - riverD / 220;
    c = [c[0] * (1 - w) + 0.30 * w, c[1] * (1 - w) + 0.42 * w, c[2] * (1 - w) + 0.22 * w];
  }
  const m = (1 + mottle * 0.16) * ao * (steep ? 0.92 : 1.0);
  return [c[0] * m, c[1] * m, c[2] * m];
}

// Build the terrain mesh: a dense grid sampled from terrainHeight, with
// normals from finite differences and per-vertex colour from
// groundColour. UVs tile the detail texture every ~55 m, so the ground
// has grain at close range. N=200 keeps the vertex count (201^2) under
// the 16-bit index limit.
export function buildTerrainMesh(gl, MeshBuilder, seed, N = 200) {
  const mb = new MeshBuilder();
  const half = WORLD_SIZE / 2;
  const step = WORLD_SIZE / N;
  const row = N + 1;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const h = terrainHeight(x, z, seed);
      const hx = terrainHeight(x + step, z, seed) - terrainHeight(x - step, z, seed);
      const hz = terrainHeight(x, z + step, seed) - terrainHeight(x, z - step, seed);
      let nx = -hx / (2 * step), ny = 1, nz = -hz / (2 * step);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      const col = groundColour(x, z, h, 1 - ny, seed);
      mb.vtx([x, h, z], [nx, ny, nz], col, [x / 55, z / 55]);
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      mb.tri(a, c, b);
      mb.tri(b, c, d);
    }
  }
  return mb.build(gl);
}

// The sea: a large plane just above sea level. Colour varies with
// depth — deep blue-green offshore, lighter turquoise over the shallows
// — and a pale foam tint right at the waterline, where the terrain
// height is near zero. UVs tile the wave texture every ~380 m (not
// 130 m): a larger tile keeps the wave scale broad from the air, and
// with the shader fading the texture out at range the sea cannot
// alias into a checkerboard. The renderer scrolls the UVs slowly and
// adds a moving sun glint.
export function buildWaterMesh(gl, MeshBuilder) {
  const mb = new MeshBuilder();
  const N = 28;
  const half = WORLD_SIZE / 2 + 3500;
  const step = (half * 2) / N;
  const row = N + 1;
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -half + i * step;
      const z = -half + j * step;
      const shore = Math.max(0, 1 - Math.hypot(x, z) / 5200);
      const wob = valueNoise(x, z, 700, 5) * 0.5 + 0.5;
      let r = 0.10 + shore * 0.10 + wob * 0.02;
      let g = 0.30 + shore * 0.12 + wob * 0.03;
      let b = 0.36 + shore * 0.10 + wob * 0.03;
      mb.vtx([x, 0.6, z], [0, 1, 0], [r, g, b], [x / 380, z / 380]);
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      mb.tri(a, c, b);
      mb.tri(b, c, d);
    }
  }
  return mb.build(gl);
}

// A foam ring hugging the coastline: a flat band at sea level where
// the terrain height crosses zero, drawn as a strip of pale quads
// sampled around the island. Cheap surf — it sells the coast from
// altitude far better than a hard waterline.
export function buildFoamMesh(gl, MeshBuilder, seed) {
  const mb = new MeshBuilder();
  const foam = [0.88, 0.92, 0.90];
  const steps = 720;
  let prev = null;
  for (let k = 0; k <= steps; k++) {
    const a = (k / steps) * Math.PI * 2;
    // Binary search outward from the centre until the terrain is at
    // sea level: that is the coastline at this bearing.
    let lo = 2000, hi = 6500;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      if (terrainHeight(Math.cos(a) * mid, Math.sin(a) * mid, seed) > 0) lo = mid;
      else hi = mid;
    }
    const rr = (lo + hi) / 2;
    const px = Math.cos(a) * rr, pz = Math.sin(a) * rr;
    const inP = [px * 0.992, 1.1, pz * 0.992];
    const outP = [px * 1.008, 1.1, pz * 1.008];
    // Never bridge a big radial jump: where the coast is a bay or a
    // headland the search can leap hundreds of metres, and connecting
    // those points would paint long white triangles across the sea.
    if (prev && Math.abs(rr - prev.r) < 300) {
      mb.quad(prev.in, prev.out, outP, inP, [0, 1, 0], foam);
    }
    prev = { in: inP, out: outP, r: rr };
  }
  return mb.build(gl);
}

// ---- Roads ---------------------------------------------------------------
// A dirt road winding down the river valley to the south coast, plus a
// paved access road from the valley to the airbase. Built as a strip of
// quads hugging the terrain, so it follows every hill and dip.
function roadStrip(mb, points, width, colour) {
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz) || 1;
    const px = (-dz / len) * width / 2, pz = (dx / len) * width / 2;
    // Each point carries its terrain height in index 2, so the strip
    // hugs the ground; it rides 0.5 m above it to avoid z-fighting.
    const a = [x0 - px, points[i][2] + 0.5, z0 - pz];
    const b = [x1 - px, points[i + 1][2] + 0.5, z1 - pz];
    const c = [x1 + px, points[i + 1][2] + 0.5, z1 + pz];
    const d = [x0 + px, points[i][2] + 0.5, z0 + pz];
    mb.quad(a, b, c, d, [0, 1, 0], colour);
  }
}

export function buildRoadMesh(gl, MeshBuilder, seed) {
  const mb = new MeshBuilder();
  // Valley road: follows the river line x = -300 + z*0.12, with a
  // gentle meander, from the north hills to the south coast.
  const valley = [];
  for (let z = -5200; z <= 4800; z += 260) {
    const x = -300 + z * 0.12 + Math.sin(z * 0.0011) * 160;
    valley.push([x, z, terrainHeight(x, z, seed)]);
  }
  roadStrip(mb, valley, 9, [0.42, 0.38, 0.30]);
  // Airbase access road: from the valley road up to the runway apron.
  const access = [];
  for (let t = 0; t <= 1.0001; t += 0.1) {
    const x = -300 + 2400 * 0.12 + (RUNWAY.x - (-300 + 2400 * 0.12)) * t;
    const z = 2400 + (RUNWAY.z - 2400) * t;
    access.push([x, z, terrainHeight(x, z, seed)]);
  }
  roadStrip(mb, access, 8, [0.36, 0.36, 0.37]);
  return mb.build(gl);
}

// ---- Trees ----------------------------------------------------------------
// Instanced forest: hundreds of small pines merged into one mesh, each
// a trunk plus two stacked cones. They grow where the forest noise is
// high, the slope is gentle and the ground is between 20 and 280 m —
// never on the runway plain, the beach or the valley road.
function upCone(mb, x, y, z, r, h, col) {
  const N = 6;
  const base = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    base.push(mb.vtx([x + Math.cos(a) * r, y, z + Math.sin(a) * r], [Math.cos(a), 0.4, Math.sin(a)], col, [i / N, 0]));
  }
  const tip = mb.vtx([x, y + h, z], [0, 1, 0], col, [0.5, 1]);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(base[i], base[j], tip);
  }
}

export function buildTreesMesh(gl, MeshBuilder, seed) {
  const mb = new MeshBuilder();
  const rng = mulberry32(seed + 777);
  const trunk = [0.23, 0.17, 0.12];
  const leaf = [0.16, 0.28, 0.13];
  const leaf2 = [0.20, 0.32, 0.15];
  let placed = 0;
  for (let tries = 0; tries < 6000 && placed < 420; tries++) {
    const x = (rng() - 0.5) * 10400;
    const z = (rng() - 0.5) * 10400;
    const h = terrainHeight(x, z, seed);
    if (h < 20 || h > 280) continue;
    if (Math.hypot(x - RUNWAY.x, z - RUNWAY.z) < 800) continue;
    if (Math.abs(x + 300 - z * 0.12) < 30) continue; // keep the road clear
    const forest = fbm(x + 500, z - 300, seed + 91, 3);
    if (forest < 0.18) continue;
    // Skip steep ground: compare heights 12 m apart.
    const slope = Math.abs(terrainHeight(x + 12, z, seed) - h) / 12
      + Math.abs(terrainHeight(x, z + 12, seed) - h) / 12;
    if (slope > 0.9) continue;
    const s = 0.8 + rng() * 0.9;
    mb.box(x, h + 2.2 * s, z, 0.9 * s, 4.4 * s, 0.9 * s, trunk);
    upCone(mb, x, h + 4 * s, z, 3.4 * s, 7 * s, leaf);
    upCone(mb, x, h + 8 * s, z, 2.4 * s, 6 * s, leaf2);
    placed++;
  }
  return mb.build(gl);
}

// ---- Airbase -------------------------------------------------------------
// Runway axis from RUNWAY.heading: forward = (-sin h, 0, -cos h).
function runwayFrame() {
  const h = RUNWAY.heading;
  return {
    fwd: [-Math.sin(h), 0, -Math.cos(h)],
    right: [Math.cos(h), 0, -Math.sin(h)],
  };
}

// A flat quad on the airbase plain, centre offset (along, across) from
// the runway centre, size (along x across), at height y.
function baseQuad(mb, along, across, len, wid, y, c) {
  const { fwd, right } = runwayFrame();
  const cx = RUNWAY.x + fwd[0] * along + right[0] * across;
  const cz = RUNWAY.z + fwd[2] * along + right[2] * across;
  const a = [cx - fwd[0] * len / 2 - right[0] * wid / 2, y, cz - fwd[2] * len / 2 - right[2] * wid / 2];
  const b = [cx + fwd[0] * len / 2 - right[0] * wid / 2, y, cz + fwd[2] * len / 2 - right[2] * wid / 2];
  const cc = [cx + fwd[0] * len / 2 + right[0] * wid / 2, y, cz + fwd[2] * len / 2 + right[2] * wid / 2];
  const d = [cx - fwd[0] * len / 2 + right[0] * wid / 2, y, cz - fwd[2] * len / 2 + right[2] * wid / 2];
  mb.quad(a, b, cc, d, [0, 1, 0], c);
}

export function buildAirbaseMesh(gl, MeshBuilder) {
  const mb = new MeshBuilder();
  const L = RUNWAY.length, W = RUNWAY.width;
  const asphalt = [0.23, 0.23, 0.25];
  const concrete = [0.52, 0.52, 0.50];
  const white = [0.92, 0.92, 0.90];

  // Runway strip + darker blast pads at both ends.
  baseQuad(mb, 0, 0, L, W, 26.9, asphalt);
  baseQuad(mb, -L / 2 - 45, 0, 90, W, 26.85, [0.18, 0.18, 0.19]);
  baseQuad(mb, L / 2 + 45, 0, 90, W, 26.85, [0.18, 0.18, 0.19]);
  // Edge lines, centreline dashes, threshold bars, touchdown bars.
  baseQuad(mb, 0, -W / 2 + 1.2, L, 1.6, 27.05, white);
  baseQuad(mb, 0, W / 2 - 1.2, L, 1.6, 27.05, white);
  for (let d = -L / 2 + 40; d < L / 2 - 40; d += 60) {
    baseQuad(mb, d, 0, 30, 2.2, 27.05, white);
  }
  for (const end of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      if (k === 0) continue;
      baseQuad(mb, end * (L / 2 - 18), k * 5.2, 14, 2.4, 27.05, white);
    }
    for (const t of [120, 210]) {
      baseQuad(mb, end * (L / 2 - t), -8, 22, 3, 27.05, white);
      baseQuad(mb, end * (L / 2 - t), 8, 22, 3, 27.05, white);
    }
  }
  // Apron (concrete parking area) + taxiway + parking lines.
  baseQuad(mb, 60, 150, 420, 170, 26.8, concrete);
  baseQuad(mb, 60, 55, 40, 150, 26.85, [0.38, 0.38, 0.37]);
  for (let k = -1; k <= 1; k++) {
    baseQuad(mb, -60 + k * 130, 150, 3, 60, 27.0, [0.85, 0.75, 0.25]);
  }

  // ---- Buildings (world-space boxes beside the apron) ----
  const { fwd, right } = runwayFrame();
  const at = (along, across) => [
    RUNWAY.x + fwd[0] * along + right[0] * across,
    RUNWAY.z + fwd[2] * along + right[2] * across,
  ];
  // Hangars: wide boxes with a lighter gabled roof and a dark door
  // facing the apron.
  for (let k = -1; k <= 1; k++) {
    const [hx, hz] = at(-120 + k * 130, 300);
    mb.box(hx, 26 + 7, hz, 90, 14, 55, [0.55, 0.56, 0.55]);
    const roof = 0.72;
    mb.quad([hx - 46, 33.2, hz - 28], [hx + 46, 33.2, hz - 28], [hx + 46, 37.5, hz], [hx - 46, 37.5, hz], [0, 0.7, -0.7], [roof, roof, roof]);
    mb.quad([hx - 46, 37.5, hz], [hx + 46, 37.5, hz], [hx + 46, 33.2, hz + 28], [hx - 46, 33.2, hz + 28], [0, 0.7, 0.7], [roof * 0.94, roof * 0.94, roof * 0.94]);
    mb.box(hx, 26 + 5, hz - 28.2, 70, 10, 0.6, [0.16, 0.16, 0.18]);
  }
  // Control tower: shaft + glass cab + roof + antenna + radar dome.
  const [tx, tz] = at(320, 260);
  mb.box(tx, 26 + 16, tz, 10, 32, 10, [0.62, 0.62, 0.60]);
  mb.box(tx, 26 + 35, tz, 16, 6, 16, [0.14, 0.20, 0.28]);
  mb.box(tx, 26 + 39, tz, 12, 2.5, 12, [0.55, 0.55, 0.55]);
  mb.box(tx, 26 + 46, tz, 0.8, 10, 0.8, [0.3, 0.3, 0.32]);
  mb.ball(tx + 9, 26 + 42, tz, 3.2, 3.2, 3.2, [0.85, 0.86, 0.88], 6, 10);
  // Operations buildings, fuel farm, windsock.
  for (const [along, across, w, d, h] of [[180, 300, 40, 22, 8], [240, 300, 30, 20, 7], [-260, 290, 46, 24, 9]]) {
    const [bx, bz] = at(along, across);
    mb.box(bx, 26 + h / 2, bz, w, h, d, [0.58, 0.57, 0.54]);
    mb.box(bx, 26 + h + 0.8, bz, w + 2, 1.6, d + 2, [0.42, 0.40, 0.38]);
  }
  for (const [along, across] of [[-320, 180], [-320, 230]]) {
    const [fx, fz] = at(along, across);
    mb.ball(fx, 26 + 5, fz, 9, 6, 9, [0.75, 0.72, 0.68], 6, 10);
    mb.box(fx, 26 + 11.5, fz, 10, 1.2, 10, [0.6, 0.58, 0.55]);
  }
  const [wx, wz] = at(-L / 2 + 60, -W / 2 - 30);
  mb.box(wx, 26 + 7, wz, 0.7, 14, 0.7, [0.7, 0.7, 0.72]);
  mb.box(wx + 3, 26 + 13, wz, 6, 1.4, 1.4, [1.8, 0.5, 0.2]);
  // Blast fence along the apron edge + a row of apron floodlight poles.
  mb.box(RUNWAY.x + fwd[0] * 60 + right[0] * 240, 26 + 3, RUNWAY.z + fwd[2] * 60 + right[2] * 240, 380, 6, 1, [0.4, 0.4, 0.42]);
  for (const k of [-140, 0, 140]) {
    const [lx, lz] = at(60 + k, 230);
    mb.box(lx, 26 + 9, lz, 0.8, 18, 0.8, [0.45, 0.45, 0.47]);
    mb.box(lx, 26 + 18.5, lz, 4, 1, 2, [1.6, 1.6, 1.5]);
  }
  return mb.build(gl);
}

// ---- Target ring ---------------------------------------------------------
// A thick golden torus standing vertical (circle in the XY plane, axis
// along Z) so a jet flying north through the valley passes through it.
// Bright gold above 1.0 so it glows against sky and terrain.
export function buildRingMesh(gl, MeshBuilder, radius = 60) {
  const mb = new MeshBuilder();
  const tubeR = 3.6;
  const seg = 28, side = 10;
  const gold = [1.9, 1.35, 0.30];
  const rings = [];
  for (let s = 0; s <= seg; s++) {
    const a = (s / seg) * Math.PI * 2;
    const cx = Math.cos(a) * radius, cy = Math.sin(a) * radius;
    const ring = [];
    for (let i = 0; i < side; i++) {
      const b = (i / side) * Math.PI * 2;
      const cb = Math.cos(b), sb = Math.sin(b);
      const px = cx + cb * Math.cos(a) * tubeR;
      const py = cy + cb * Math.sin(a) * tubeR;
      const pz = sb * tubeR;
      const nx = cb * Math.cos(a), ny = cb * Math.sin(a), nz = sb;
      // Sunlit top of the tube is brighter.
      const bright = 0.75 + 0.45 * Math.max(0, ny);
      ring.push(mb.vtx([px, py, pz], [nx, ny, nz], [gold[0] * bright, gold[1] * bright, gold[2] * bright], [s / seg, i / side]));
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
  // Bright chevron diamonds on the ring face so the opening reads
  // clearly even from far away.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const px = Math.cos(a) * radius, py = Math.sin(a) * radius;
    mb.box(px, py, -tubeR - 0.4, 5, 5, 1.2, [2.4, 1.8, 0.55]);
  }
  return mb.build(gl);
}

// The beacon: a tall light pillar rising through the ring position, so
// the player can spot the ring from anywhere in the valley. Built
// centred on the origin; the renderer places it at the ring's x/z.
// The outer column fades toward the top; the core stays bright.
export function buildBeaconMesh(gl, MeshBuilder, baseY, topY) {
  const mb = new MeshBuilder();
  const h = topY - baseY;
  const N = 12;
  for (let b = 0; b < 4; b++) {
    const y0 = baseY + (h * b) / 4, y1 = baseY + (h * (b + 1)) / 4;
    const fade = 1 - b * 0.22;
    const col = [0.85 * fade, 0.62 * fade, 0.18 * fade];
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      const a0 = (i / N) * Math.PI * 2, a1 = (j / N) * Math.PI * 2;
      const v0 = mb.vtx([Math.cos(a0) * 4.5, y0, Math.sin(a0) * 4.5], [Math.cos(a0), 0, Math.sin(a0)], col, [i / N, b / 4]);
      const v1 = mb.vtx([Math.cos(a1) * 4.5, y0, Math.sin(a1) * 4.5], [Math.cos(a1), 0, Math.sin(a1)], col, [j / N, b / 4]);
      const v2 = mb.vtx([Math.cos(a1) * 4.5, y1, Math.sin(a1) * 4.5], [Math.cos(a1), 0, Math.sin(a1)], col, [j / N, (b + 1) / 4]);
      const v3 = mb.vtx([Math.cos(a0) * 4.5, y1, Math.sin(a0) * 4.5], [Math.cos(a0), 0, Math.sin(a0)], col, [i / N, (b + 1) / 4]);
      mb.tri(v0, v3, v2);
      mb.tri(v0, v2, v1);
    }
  }
  // Bright core column: a true vertical cylinder (rings in the XZ
  // plane, stacked in Y), brighter at the bottom, fading with height.
  const coreR = 1.8;
  const ringLo = [], ringHi = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    ringLo.push(mb.vtx([ca * coreR, baseY, sa * coreR], [ca, 0, sa], [2.2, 1.6, 0.45], [i / N, 0]));
    ringHi.push(mb.vtx([ca * coreR, topY, sa * coreR], [ca, 0, sa], [1.4, 1.0, 0.3], [i / N, 1]));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(ringLo[i], ringHi[i], ringHi[j]);
    mb.tri(ringLo[i], ringHi[j], ringLo[j]);
  }
  return mb.build(gl);
}

// Glowing ground pad under the beacon: a flat gold disc.
export function buildBeaconPadMesh(gl, MeshBuilder) {
  const mb = new MeshBuilder();
  mb.disc(0, 0, 0, 26, [2.0, 1.5, 0.4], 20);
  return mb.build(gl);
}

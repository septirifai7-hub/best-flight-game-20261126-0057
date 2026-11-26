// Jet meshes for Steel Falcon — high-detail twin-engine fighter built
// procedurally from lofted cross-sections, so the silhouette reads as a
// real modern jet (MiG-29 / F-15 family) instead of a box: a smooth
// elliptical fuselage, a blown glass canopy, swept wings with LERX
// strakes, twin canted tails, under-fuselage intakes and twin nozzles.
// Model space: nose toward -Z, +Y up, +X to the right wing, metres.
// Colours are per-vertex; values above 1.0 are deliberate — the renderer
// multiplies them by the lighting, so bright values glow (flames, lights).

import { MeshBuilder } from './gl.js';

const SEG = 14; // points around each fuselage ring

// Two-tone camouflage for one fuselage vertex. `top` is the light grey
// topside, `belly` the dark underside; blotches darken the upper surface
// in irregular patches, and a thin darker band marks panel joints.
function camoColour(nx, ny, nz, z, top, belly, enemy) {
  const up = Math.max(0, ny);
  let r = belly[0] + (top[0] - belly[0]) * up;
  let g = belly[1] + (top[1] - belly[1]) * up;
  let b = belly[2] + (top[2] - belly[2]) * up;
  // Irregular darker camo blotches on the upper fuselage.
  const blotch = Math.sin(z * 1.7 + nx * 4.1) * Math.sin(z * 0.9 - ny * 5.3 + 1.7);
  if (up > 0.35 && blotch > 0.55) {
    const f = enemy ? 0.62 : 0.78;
    r *= f; g *= f; b *= f;
  }
  // Panel joint rings: slightly darker every ~2.2 m along the body.
  const joint = Math.abs(((z + 8.6) % 2.2) - 1.1);
  if (joint > 1.02 && up > 0.15) { r *= 0.86; g *= 0.86; b *= 0.86; }
  return [r, g, b];
}

// Loft a fuselage: sections of { z, cy, w, h } joined into a smooth tube
// with per-vertex normals and camo colours. The bottom is flattened a
// little, like a real fighter belly.
function loftFuselage(mb, sections, top, belly, enemy) {
  const rings = [];
  for (const s of sections) {
    const ring = [];
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const flatten = sa < 0 ? 0.82 : 1.0;
      const x = s.w * ca;
      const y = s.cy + s.h * sa * flatten;
      // Outward normal of the ellipse, flattened the same way.
      let nx = ca / Math.max(0.2, s.w), ny = (sa * flatten) / Math.max(0.2, s.h);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      const col = camoColour(nx, ny, 0, s.z, top, belly, enemy);
      ring.push(mb.vertex(x, y, s.z, nx, ny, 0, col[0], col[1], col[2]));
    }
    rings.push(ring);
  }
  for (let s = 0; s < rings.length - 1; s++) {
    for (let i = 0; i < SEG; i++) {
      const j = (i + 1) % SEG;
      const a = rings[s][i], b = rings[s][j], c = rings[s + 1][j], d = rings[s + 1][i];
      mb.tri(a, d, c);
      mb.tri(a, c, b);
    }
  }
  // Close the nose tip with a fan and cap the tail with a flat disc.
  const noseTip = mb.vertex(0, sections[0].cy, sections[0].z - 0.35, 0, 0, -1, top[0], top[1], top[2]);
  for (let i = 0; i < SEG; i++) {
    const j = (i + 1) % SEG;
    mb.tri(noseTip, rings[0][j], rings[0][i]);
  }
  const tailC = mb.vertex(0, sections[sections.length - 1].cy, sections[sections.length - 1].z, 0, 0, 1, belly[0] * 0.6, belly[1] * 0.6, belly[2] * 0.6);
  const last = rings[rings.length - 1];
  for (let i = 0; i < SEG; i++) {
    const j = (i + 1) % SEG;
    mb.tri(tailC, last[i], last[j]);
  }
}

// A blown canopy: a half-ellipsoid bubble sitting on the fuselage spine,
// dark smoked glass with a bright reflective crown along its top centre.
function buildCanopy(mb, z0, z1, cyBase, w, h) {
  const rings = [];
  const N = 8;
  for (let s = 0; s <= N; s++) {
    const t = s / N;
    const z = z0 + (z1 - z0) * t;
    const profile = Math.sin(t * Math.PI); // 0 at both ends, 1 mid
    const ww = Math.max(0.02, w * (0.35 + 0.65 * profile));
    const hh = Math.max(0.02, h * profile);
    const cy = cyBase + hh * 0.15;
    const ring = [];
    for (let i = 0; i <= SEG / 2; i++) {
      const a = (i / (SEG / 2)) * Math.PI; // upper half only
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = ww * ca;
      const y = cy + hh * sa;
      const nl = Math.hypot(ca, sa) || 1;
      // Glass: near-black at the sides, bright sky reflection on top.
      const shine = Math.pow(Math.max(0, sa), 2.2);
      const r = 0.07 + shine * 0.55, g = 0.09 + shine * 0.62, b = 0.13 + shine * 0.78;
      ring.push(mb.vertex(x, y, z, ca / nl, sa / nl, 0, r, g, b));
    }
    rings.push(ring);
  }
  const per = SEG / 2 + 1;
  for (let s = 0; s < N; s++) {
    for (let i = 0; i < SEG / 2; i++) {
      const a = rings[s][i], b = rings[s][i + 1], c = rings[s + 1][i + 1], d = rings[s + 1][i];
      mb.tri(a, b, c);
      mb.tri(a, c, d);
    }
  }
  // Frame rails along the canopy base.
  mb.box(0, cyBase + 0.02, (z0 + z1) / 2, w * 2 + 0.1, 0.09, z1 - z0, 0.16, 0.16, 0.18);
}

// A thin swept wing plate: planform corners (root LE, root TE, tip TE,
// tip LE) at a given height, with top, bottom and edge faces so it reads
// as a solid surface from every angle.
function wingPlate(mb, x0, x1, zRootLE, zRootTE, zTipLE, zTipTE, y, thick, topCol, botCol) {
  const s = x1 > x0 ? 1 : -1;
  const xr = x0, xt = x1;
  const t2 = thick / 2;
  const top = [
    [xr, y + t2, zRootLE], [xr, y + t2, zRootTE],
    [xt, y + t2, zTipTE], [xt, y + t2, zTipLE],
  ];
  const bot = [
    [xr, y - t2, zRootLE], [xt, y - t2, zTipLE],
    [xt, y - t2, zTipTE], [xr, y - t2, zRootTE],
  ];
  mb.quad(top[0], top[1], top[2], top[3], 0, 1, 0, topCol[0], topCol[1], topCol[2]);
  mb.quad(bot[0], bot[1], bot[2], bot[3], 0, -1, 0, botCol[0], botCol[1], botCol[2]);
  // Leading edge, trailing edge and tip faces.
  mb.quad(top[0], top[3], bot[1], bot[0], 0, 0, -1, topCol[0] * 0.8, topCol[1] * 0.8, topCol[2] * 0.8);
  mb.quad(top[1], bot[3], bot[2], top[2], 0, 0, 1, topCol[0] * 0.8, topCol[1] * 0.8, topCol[2] * 0.8);
  mb.quad(top[3], top[2], bot[2], bot[1], s, 0, 0, topCol[0] * 0.7, topCol[1] * 0.7, topCol[2] * 0.7);
}

// Twin vertical tails, canted outward, swept back.
function verticalTail(mb, side, xBase, zLE, zTE, yBase, height, col) {
  const cant = 0.28; // outward lean per metre of height
  const th = 0.14;
  const x0 = xBase, x1 = xBase + side * cant * height;
  const top = [
    [x0 - th / 2, yBase, zLE], [x0 - th / 2, yBase, zTE],
    [x1 - th / 2, yBase + height, zTE + 2.6], [x1 - th / 2, yBase + height, zLE + 3.4],
  ];
  const out = [
    [x0 + th / 2, yBase, zLE], [x1 + th / 2, yBase + height, zLE + 3.4],
    [x1 + th / 2, yBase + height, zTE + 2.6], [x0 + th / 2, yBase, zTE],
  ];
  const n = [side, 0, 0];
  mb.quad(top[0], top[1], top[2], top[3], -n[0], 0, 0, col[0], col[1], col[2]);
  mb.quad(out[0], out[1], out[2], out[3], n[0], 0, 0, col[0] * 0.92, col[1] * 0.92, col[2] * 0.92);
  mb.quad(top[0], out[0], out[3], top[1], 0, 0, 1, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8);
  mb.quad(top[3], top[2], out[2], out[1], 0, 0, -1, col[0] * 0.8, col[1] * 0.8, col[2] * 0.8);
  mb.quad(top[2], top[3], out[1], out[2], 0, 1, 0, col[0] * 0.75, col[1] * 0.75, col[2] * 0.75);
}

// Engine nozzle: a short dark cylinder with a glowing inner ring.
function nozzle(mb, x, y, z0, z1, r) {
  const N = 10;
  const ringA = [], ringB = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    ringA.push(mb.vertex(x + ca * r, y + sa * r, z0, ca, sa, 0, 0.22, 0.22, 0.24));
    ringB.push(mb.vertex(x + ca * r * 0.92, y + sa * r * 0.92, z1, ca, sa, 0, 0.13, 0.13, 0.15));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(ringA[i], ringB[i], ringB[j]);
    mb.tri(ringA[i], ringB[j], ringA[j]);
  }
  const inner = mb.vertex(x, y, z1, 0, 0, 1, 1.6, 0.75, 0.25);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(inner, ringB[j], ringB[i]);
  }
}

export function buildJetMesh(gl, enemy = false) {
  const mb = new MeshBuilder();
  const top = enemy ? [0.48, 0.38, 0.36] : [0.66, 0.68, 0.70];
  const belly = enemy ? [0.20, 0.17, 0.17] : [0.30, 0.32, 0.35];
  const wingTop = enemy ? [0.44, 0.35, 0.33] : [0.62, 0.64, 0.66];
  const wingBot = enemy ? [0.18, 0.15, 0.15] : [0.26, 0.28, 0.31];

  // Fuselage loft, nose to tail.
  loftFuselage(mb, [
    { z: -8.6, cy: 0.05, w: 0.06, h: 0.06 },
    { z: -8.0, cy: 0.05, w: 0.30, h: 0.32 },
    { z: -7.0, cy: 0.08, w: 0.52, h: 0.52 },
    { z: -5.5, cy: 0.10, w: 0.74, h: 0.70 },
    { z: -4.0, cy: 0.12, w: 0.86, h: 0.82 },
    { z: -2.0, cy: 0.10, w: 0.96, h: 0.86 },
    { z: 0.0, cy: 0.08, w: 1.02, h: 0.90 },
    { z: 2.0, cy: 0.05, w: 1.06, h: 0.90 },
    { z: 4.0, cy: 0.00, w: 1.06, h: 0.86 },
    { z: 6.0, cy: -0.05, w: 1.00, h: 0.80 },
    { z: 7.5, cy: -0.05, w: 0.92, h: 0.70 },
    { z: 8.4, cy: -0.05, w: 0.86, h: 0.60 },
  ], top, belly, enemy);

  // Canopy bubble over the forward fuselage.
  buildCanopy(mb, -5.4, -2.0, 0.72, 0.46, 0.62);
  // Pitot probe on the nose.
  mb.box(0, 0.12, -9.6, 0.06, 0.06, 2.0, 0.25, 0.25, 0.27);

  // LERX strakes: triangular plates blending nose into the wing roots.
  for (const s of [-1, 1]) {
    wingPlate(mb, s * 0.55, s * 1.15, -4.6, -0.8, -1.6, -0.4, 0.28, 0.08, wingTop, wingBot);
    // Main swept wings.
    wingPlate(mb, s * 0.85, s * 5.7, -1.6, 3.4, 1.2, 3.1, -0.05, 0.14, wingTop, wingBot);
    // All-moving tailplanes.
    wingPlate(mb, s * 0.8, s * 3.7, 5.2, 7.6, 6.6, 7.9, 0.05, 0.12, wingTop, wingBot);
    // Twin canted vertical tails.
    verticalTail(mb, s, s * 0.85, 4.6, 7.4, 0.45, 2.5, wingTop);
    // Under-fuselage intakes with dark mouths.
    mb.box(s * 1.12, -0.55, -1.2, 0.55, 0.75, 5.2, wingBot[0], wingBot[1], wingBot[2]);
    mb.box(s * 1.12, -0.5, -3.85, 0.5, 0.62, 0.1, 0.05, 0.05, 0.06);
    // Wingtip missile rails + navigation lights.
    mb.box(s * 5.55, -0.05, 2.0, 0.16, 0.16, 1.6, 0.35, 0.35, 0.37);
    const nav = s < 0 ? [2.2, 0.15, 0.15] : [0.15, 2.2, 0.35];
    mb.box(s * 5.72, -0.02, 2.9, 0.12, 0.12, 0.3, nav[0], nav[1], nav[2]);
    // Engine nozzles.
    nozzle(mb, s * 0.55, -0.05, 8.3, 9.05, 0.44);
  }
  // Ventral fin + tail hook hint.
  mb.box(0, -0.85, 6.4, 0.1, 0.7, 2.2, belly[0] * 0.9, belly[1] * 0.9, belly[2] * 0.9);
  return mb.build(gl);
}

// Afterburner flames: two tapered cones, a hot blue core inside a wider
// orange sheath, drawn behind the nozzles while the throttle is high.
export function buildFlameMesh(gl) {
  const mb = new MeshBuilder();
  for (const s of [-1, 1]) {
    const x = s * 0.55, y = -0.05, z0 = 9.0;
    // Outer orange sheath (8-sided cone), shorter and slimmer so the
    // flame reads as an afterburner, not a traffic cone.
    const N = 8;
    const base = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      base.push(mb.vertex(x + Math.cos(a) * 0.32, y + Math.sin(a) * 0.32, z0, Math.cos(a), Math.sin(a), 0, 2.4, 0.85, 0.18));
    }
    const tip = mb.vertex(x, y, z0 + 3.4, 0, 0, 1, 2.6, 1.1, 0.25);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      mb.tri(base[i], base[j], tip);
    }
    // Inner blue core, shorter and narrower.
    const core = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      core.push(mb.vertex(x + Math.cos(a) * 0.18, y + Math.sin(a) * 0.18, z0, Math.cos(a), Math.sin(a), 0, 0.35, 0.75, 2.6));
    }
    const coreTip = mb.vertex(x, y, z0 + 2.2, 0, 0, 1, 0.5, 0.9, 2.8);
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      mb.tri(core[i], core[j], coreTip);
    }
  }
  return mb.build(gl);
}

// A small air-to-air missile: pointed nose, slim body, rear fins.
export function buildMissileMesh(gl) {
  const mb = new MeshBuilder();
  const body = [0.72, 0.72, 0.74];
  mb.frustum(0, 0, -1.6, 1.4, 0.16, 0.16, 0.16, 0.16, body[0], body[1], body[2]);
  mb.nose(0, 0, -1.6, -2.6, 0.16, 0.16, 0.6, 0.6, 0.62);
  // Four rear fins.
  for (const [dx, dy] of [[0.16, 0], [-0.16, 0], [0, 0.16], [0, -0.16]]) {
    mb.box(dx * 1.6, dy * 1.6, 1.5, Math.abs(dx) > 0 ? 0.5 : 0.05, Math.abs(dy) > 0 ? 0.5 : 0.05, 0.7, 0.5, 0.5, 0.52);
  }
  // Bright motor glow at the tail.
  mb.box(0, 0, 1.45, 0.2, 0.2, 0.12, 2.4, 1.0, 0.3);
  return mb.build(gl);
}

// A long thin tracer streak: a stretched box the renderer aligns with
// a bullet's velocity, tinted hot yellow-white.
export function buildTracerMesh(gl) {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 0.35, 0.35, 18, 1, 1, 1);
  return mb.build(gl);
}

// A soft round puff used for smoke, fire and explosion billboards: a
// white sphere the renderer tints per particle (uTint), so one mesh
// serves every effect colour.
export function buildPuffMesh(gl) {
  const mb = new MeshBuilder();
  mb.sphere(0, 0, 0, 1, 1, 1, 1, 1, 1, 8, 12);
  return mb.build(gl);
}

// A unit cube, tinted by the renderer — tracers, sparks and markers.
export function buildCubeMesh(gl) {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 1, 1, 1, 1, 1, 1);
  return mb.build(gl);
}

export function buildColoredCubeMesh(gl) {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 1, 1, 1, 0.9, 0.9, 0.9);
  return mb.build(gl);
}

// Clouds: a cluster of overlapping flattened puffs with shaded undersides
// — white sunlit tops fading to soft blue-grey bellies — so each cloud
// reads as a soft billowing mass instead of a single smooth ellipsoid.
export function buildCloudMesh(gl) {
  const mb = new MeshBuilder();
  const puffs = [
    [0, 0, 0, 30, 14, 18],
    [-20, -1, 4, 20, 10, 13],
    [20, -1, -3, 22, 10, 14],
    [-9, 4, -6, 16, 10, 11],
    [11, 4, 6, 17, 10, 11],
    [-29, -2, -4, 12, 7, 9],
    [30, -2, 3, 13, 7, 9],
    [0, 7, 0, 14, 9, 10],
  ];
  for (const [cx, cy, cz, rx, ry, rz] of puffs) {
    // Colour varies with height inside the puff: bright top, light
    // grey belly (kept light so the underside never reads as black).
    const top = [1.0, 1.0, 1.0], bot = [0.84, 0.87, 0.92];
    const start = mb.pos.length / 3;
    const lat = 7, lon = 10;
    for (let j = 0; j <= lat; j++) {
      const phi = (j / lat) * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let i = 0; i <= lon; i++) {
        const th = (i / lon) * Math.PI * 2;
        const st = Math.sin(th), ct = Math.cos(th);
        const shade = 0.5 + 0.5 * cp;
        const r = bot[0] + (top[0] - bot[0]) * shade;
        const g = bot[1] + (top[1] - bot[1]) * shade;
        const b = bot[2] + (top[2] - bot[2]) * shade;
        mb.vertex(cx + sp * ct * rx, cy + cp * ry, cz + sp * st * rz, sp * ct, cp, sp * st, r, g, b);
      }
    }
    const row = lon + 1;
    for (let j = 0; j < lat; j++) {
      for (let i = 0; i < lon; i++) {
        const a = start + j * row + i, b = a + 1, c = a + row, d = c + 1;
        mb.idx.push(a, c, b, b, c, d);
      }
    }
  }
  return mb.build(gl);
}

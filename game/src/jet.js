// Jet meshes for Steel Falcon — a twin-engine modern fighter built
// procedurally from lofted elliptical sections, so the silhouette reads
// as a real jet (MiG-29 / F-15 family) instead of a box: smooth
// fuselage, blown glass canopy, swept wings with LERX strakes, twin
// canted tails, deep intakes, twin nozzles. Model space: nose toward
// -Z, +Y up, +X to the right wing, metres.
//
// The fuselage carries UVs (u around the body, v nose-to-tail) so the
// painted camouflage texture wraps it; vertex colours stay near white
// up top and darker underneath, so the texture does the patterning and
// the lighting does the shading. Values above 1.0 are deliberate — the
// renderer multiplies them by the light, so bright values glow (nav
// lights, nozzle cores, flames).

import { MeshBuilder } from './gl.js';

const RING_PTS = 16; // points around each fuselage ring

// Loft a fuselage from sections { z, cy, w, h }: rings of an ellipse,
// joined into a smooth tube. The belly is flattened a little, like a
// real fighter, and the underside vertices are darkened (ambient
// occlusion baked in: the belly never sees the sun directly).
function loft(mb, sections, top, belly, enemy) {
  const zMin = sections[0].z, zMax = sections[sections.length - 1].z;
  const rings = [];
  for (const s of sections) {
    const ring = [];
    for (let i = 0; i < RING_PTS; i++) {
      const a = (i / RING_PTS) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const flat = sa < 0 ? 0.8 : 1.0; // flattened belly
      const x = s.w * ca;
      const y = s.cy + s.h * sa * flat;
      let nx = ca / Math.max(0.2, s.w), ny = (sa * flat) / Math.max(0.2, s.h);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      const up = Math.max(0, ny);
      // Top colour near white so the camo texture shows; belly darker.
      let r = belly[0] + (top[0] - belly[0]) * up;
      let g = belly[1] + (top[1] - belly[1]) * up;
      let b = belly[2] + (top[2] - belly[2]) * up;
      // Slight darkening toward the tail (soot, heat staining).
      const tailShade = 1 - 0.18 * Math.max(0, (s.z - 4) / 4.4);
      r *= tailShade; g *= tailShade; b *= tailShade;
      ring.push(mb.vtx(
        [x, y, s.z], [nx, ny, 0], [r, g, b],
        [i / RING_PTS, (s.z - zMin) / (zMax - zMin)],
      ));
    }
    rings.push(ring);
  }
  for (let s = 0; s < rings.length - 1; s++) {
    for (let i = 0; i < RING_PTS; i++) {
      const j = (i + 1) % RING_PTS;
      const a = rings[s][i], b = rings[s][j], c = rings[s + 1][j], d = rings[s + 1][i];
      mb.tri(a, d, c);
      mb.tri(a, c, b);
    }
  }
  // Nose tip fan and a flat tail cap.
  const noseTip = mb.vtx([0, sections[0].cy, sections[0].z - 0.4], [0, 0, -1], top, [0.5, 0]);
  for (let i = 0; i < RING_PTS; i++) {
    const j = (i + 1) % RING_PTS;
    mb.tri(noseTip, rings[0][j], rings[0][i]);
  }
  const tailC = mb.vtx([0, sections[sections.length - 1].cy, sections[sections.length - 1].z], [0, 0, 1], [belly[0] * 0.5, belly[1] * 0.5, belly[2] * 0.5], [0.5, 1]);
  const last = rings[rings.length - 1];
  for (let i = 0; i < RING_PTS; i++) {
    const j = (i + 1) % RING_PTS;
    mb.tri(tailC, last[i], last[j]);
  }
}

// A blown canopy: a squashed ellipsoid bubble on the fuselage spine.
// Dark smoked glass with a bright sky-reflection crown (baked into the
// vertex colours: bright on top, near-black at the sides). The lower
// half sinks into the fuselage and is never seen.
function canopy(mb, z0, z1, cyBase, w, h) {
  const cz = (z0 + z1) / 2;
  const rz = (z1 - z0) / 2;
  mb.ball(0, cyBase + h * 0.28, cz, w, h, rz, [0.10, 0.12, 0.17], 8, 14, true);
  // Frame rails along the canopy base and a rear frame arch.
  mb.box(0, cyBase + 0.02, cz, w * 2 + 0.12, 0.1, z1 - z0, [0.16, 0.16, 0.18]);
  mb.box(0, cyBase + h * 0.55, z1 - 0.15, w * 1.5, 0.1, 0.18, [0.16, 0.16, 0.18]);
}

// A thin swept wing plate with a slight dihedral (tips raised) and a
// tapered thickness, so it reads as an airfoil, not a flat card.
// Corners: root leading/trailing edge, tip leading/trailing edge.
function plate(mb, xRoot, xTip, zRootLE, zRootTE, zTipLE, zTipTE, y, thick, topCol, botCol) {
  const s = xTip > xRoot ? 1 : -1;
  const tipLift = 0.35; // dihedral: tip sits higher than the root
  const t2 = thick / 2;
  const top = [
    [xRoot, y + t2, zRootLE], [xRoot, y + t2, zRootTE],
    [xTip, y + tipLift + t2, zTipTE], [xTip, y + tipLift + t2, zTipLE],
  ];
  const bot = [
    [xRoot, y - t2, zRootLE], [xTip, y + tipLift - t2, zTipLE],
    [xTip, y + tipLift - t2, zTipTE], [xRoot, y - t2, zRootTE],
  ];
  mb.quad(top[0], top[1], top[2], top[3], [0, 1, 0], topCol);
  mb.quad(bot[0], bot[1], bot[2], bot[3], [0, -1, 0], botCol);
  // Leading edge, trailing edge, tip faces — slightly darker.
  const edge = [topCol[0] * 0.75, topCol[1] * 0.75, topCol[2] * 0.75];
  mb.quad(top[0], top[3], bot[1], bot[0], [0, 0, -1], edge);
  mb.quad(top[1], bot[3], bot[2], top[2], [0, 0, 1], edge);
  mb.quad(top[3], top[2], bot[2], bot[1], [s, 0, 0], edge);
  // A wing fence: a thin vertical blade mid-span, like the real thing.
  const fx = xRoot + (xTip - xRoot) * 0.55;
  const fz = zRootLE + (zTipLE - zRootLE) * 0.55;
  mb.box(fx, y + tipLift * 0.55 + 0.22, fz, 0.06, 0.44, 1.5, edge);
}

// Twin vertical tail, canted outward and swept back, with a coloured
// tip cap (red for the player, dark for enemies — set by the caller).
function fin(mb, side, xBase, zLE, zTE, yBase, height, col, tipCol) {
  const cant = 0.3; // outward lean per metre of height
  const th = 0.14;
  const xTop = xBase + side * cant * height;
  const inFace = [
    [xBase - th / 2, yBase, zLE], [xBase - th / 2, yBase, zTE],
    [xTop - th / 2, yBase + height, zTE + 2.6], [xTop - th / 2, yBase + height, zLE + 3.4],
  ];
  const outFace = [
    [xBase + th / 2, yBase, zLE], [xTop + th / 2, yBase + height, zLE + 3.4],
    [xTop + th / 2, yBase + height, zTE + 2.6], [xBase + th / 2, yBase, zTE],
  ];
  mb.quad(inFace[0], inFace[1], inFace[2], inFace[3], [-side, 0, 0], col);
  mb.quad(outFace[0], outFace[1], outFace[2], outFace[3], [side, 0, 0], [col[0] * 0.92, col[1] * 0.92, col[2] * 0.92]);
  mb.quad(inFace[0], outFace[0], outFace[3], inFace[1], [0, 0, 1], [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
  mb.quad(inFace[3], inFace[2], outFace[2], outFace[1], [0, 0, -1], [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
  // Tip cap band near the top of the fin.
  const ty = yBase + height * 0.82;
  const tx = xBase + side * cant * height * 0.82;
  mb.box(tx, ty, zLE + 3.0, th + 0.06, height * 0.36, 1.4, tipCol);
}

// Engine nozzle: a short petal-textured cylinder with a glowing core
// disc at the exit plane, so the exhaust reads as a real turbofan.
function nozzle(mb, x, y, z0, z1, r) {
  // Petal shading: alternate segments slightly darker.
  const N = 12;
  const ringA = [], ringB = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const shade = i % 2 === 0 ? 1.0 : 0.72;
    ringA.push(mb.vtx([x + ca * r, y + sa * r, z0], [ca, sa, 0], [0.24 * shade, 0.24 * shade, 0.26 * shade], [i / N, 0]));
    ringB.push(mb.vtx([x + ca * r * 0.9, y + sa * r * 0.9, z1], [ca, sa, 0], [0.14 * shade, 0.14 * shade, 0.16 * shade], [i / N, 1]));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(ringA[i], ringB[i], ringB[j]);
    mb.tri(ringA[i], ringB[j], ringA[j]);
  }
  // Glowing turbine face inside the nozzle.
  const core = mb.vtx([x, y, z1 - 0.05], [0, 0, 1], [1.9, 0.85, 0.3], [0.5, 0.5]);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(core, ringB[j], ringB[i]);
  }
}

export function buildJetMesh(gl, enemy = false) {
  const mb = new MeshBuilder();
  // Vertex colours: near-white tops so the camo texture shows through,
  // darker bellies. Enemies get a dark red-grey tint baked in.
  const top = enemy ? [0.62, 0.48, 0.46] : [0.96, 0.97, 0.99];
  const belly = enemy ? [0.34, 0.28, 0.28] : [0.58, 0.60, 0.64];
  const wingTop = enemy ? [0.56, 0.44, 0.42] : [0.90, 0.91, 0.93];
  const wingBot = enemy ? [0.30, 0.25, 0.25] : [0.50, 0.52, 0.56];
  const tipCol = enemy ? [0.35, 0.30, 0.30] : [0.75, 0.18, 0.14];

  // Fuselage loft, nose to tail, with a spine hump behind the canopy.
  loft(mb, [
    { z: -8.6, cy: 0.05, w: 0.06, h: 0.06 },
    { z: -8.0, cy: 0.05, w: 0.30, h: 0.32 },
    { z: -7.0, cy: 0.08, w: 0.52, h: 0.52 },
    { z: -5.5, cy: 0.10, w: 0.74, h: 0.70 },
    { z: -4.0, cy: 0.14, w: 0.86, h: 0.84 },
    { z: -2.0, cy: 0.12, w: 0.96, h: 0.88 },
    { z: 0.0, cy: 0.10, w: 1.02, h: 0.92 },
    { z: 2.0, cy: 0.08, w: 1.06, h: 0.92 },
    { z: 4.0, cy: 0.02, w: 1.06, h: 0.88 },
    { z: 6.0, cy: -0.03, w: 1.00, h: 0.82 },
    { z: 7.5, cy: -0.05, w: 0.92, h: 0.72 },
    { z: 8.4, cy: -0.05, w: 0.86, h: 0.62 },
  ], top, belly, enemy);

  // Canopy bubble over the forward fuselage + pitot + AOA probe.
  canopy(mb, -5.4, -2.0, 0.72, 0.46, 0.62);
  mb.box(0, 0.12, -9.6, 0.06, 0.06, 2.0, [0.25, 0.25, 0.27]);
  mb.box(0.35, -0.1, -7.6, 0.05, 0.05, 0.7, [0.3, 0.3, 0.32]);
  // Spine antenna blade behind the canopy.
  mb.box(0, 0.95, -0.6, 0.06, 0.5, 1.1, [0.4, 0.4, 0.42]);

  for (const s of [-1, 1]) {
    // LERX strakes blending the nose into the wing roots.
    plate(mb, s * 0.55, s * 1.15, -4.6, -0.8, -1.6, -0.4, 0.28, 0.08, wingTop, wingBot);
    // Main swept wings.
    plate(mb, s * 0.85, s * 5.7, -1.6, 3.4, 1.2, 3.1, -0.05, 0.14, wingTop, wingBot);
    // All-moving tailplanes.
    plate(mb, s * 0.8, s * 3.7, 5.2, 7.6, 6.6, 7.9, 0.05, 0.12, wingTop, wingBot);
    // Twin canted vertical tails.
    fin(mb, s, s * 0.85, 4.6, 7.4, 0.45, 2.5, wingTop, tipCol);
    // Under-fuselage intakes: a fairing box with a dark mouth facing
    // forward, and a splitter plate lip above it.
    mb.box(s * 1.12, -0.55, -1.2, 0.55, 0.75, 5.2, wingBot);
    mb.quad(
      [s * 1.12 - 0.26, -0.88, -3.82], [s * 1.12 + 0.26, -0.88, -3.82],
      [s * 1.12 + 0.26, -0.22, -3.82], [s * 1.12 - 0.26, -0.22, -3.82],
      [0, 0, -1], [0.04, 0.04, 0.05],
    );
    mb.box(s * 1.12, -0.12, -3.9, 0.6, 0.08, 0.5, wingTop);
    // Wingtip missile rails + navigation lights (red left, green right).
    mb.box(s * 5.55, -0.05, 2.0, 0.16, 0.16, 1.6, [0.35, 0.35, 0.37]);
    const nav = s < 0 ? [2.4, 0.15, 0.15] : [0.15, 2.4, 0.35];
    mb.box(s * 5.72, -0.02, 2.9, 0.12, 0.12, 0.3, nav);
    // Wingtip strobe on the tailplane tip.
    mb.box(s * 3.72, 0.06, 7.9, 0.1, 0.1, 0.24, [2.2, 2.2, 2.2]);
    // Engine nozzles.
    nozzle(mb, s * 0.55, -0.05, 8.3, 9.05, 0.44);
  }
  // Ventral fin + tail hook + gun muzzle on the nose side.
  mb.box(0, -0.85, 6.4, 0.1, 0.7, 2.2, [belly[0] * 0.9, belly[1] * 0.9, belly[2] * 0.9]);
  mb.box(0, -0.95, 7.6, 0.08, 0.35, 1.4, [0.3, 0.3, 0.32]);
  mb.box(0.45, 0.05, -6.9, 0.12, 0.12, 0.3, [0.08, 0.08, 0.09]);
  return mb.build(gl);
}

// Afterburner flames: two nested cones behind the nozzles — a wide
// orange sheath around a hot blue core — plus a bright base disc at
// the nozzle exit. The renderer scales the whole mesh with throttle.
function cone(mb, x, y, z0, len, r, col, tipCol) {
  const N = 8;
  const base = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    base.push(mb.vtx(
      [x + Math.cos(a) * r, y + Math.sin(a) * r, z0],
      [Math.cos(a), Math.sin(a), 0], col, [i / N, 0],
    ));
  }
  const tip = mb.vtx([x, y, z0 + len], [0, 0, 1], tipCol, [0.5, 1]);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(base[i], base[j], tip);
  }
}

export function buildFlameMesh(gl) {
  const mb = new MeshBuilder();
  for (const s of [-1, 1]) {
    const x = s * 0.55, y = -0.05, z0 = 9.0;
    cone(mb, x, y, z0, 2.9, 0.34, [2.5, 0.9, 0.2], [2.7, 1.2, 0.3]);
    cone(mb, x, y, z0, 1.9, 0.19, [0.4, 0.8, 2.7], [0.55, 0.95, 2.9]);
  }
  return mb.build(gl);
}

// A small air-to-air missile: pointed nose, slim body, rear fins and a
// bright motor glow at the tail.
export function buildMissileMesh(gl) {
  const mb = new MeshBuilder();
  const body = [0.72, 0.72, 0.74];
  mb.prism(0, 0, -1.6, 1.4, 0.16, 0.16, 0.16, 0.16, body);
  mb.spike(0, 0, -1.6, -2.6, 0.16, 0.16, [0.6, 0.6, 0.62]);
  // Four rear fins, two horizontal and two vertical.
  for (const [dx, dy] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) {
    mb.box(dx, dy, 1.5, Math.abs(dx) > 0 ? 0.55 : 0.05, Math.abs(dy) > 0 ? 0.55 : 0.05, 0.7, [0.5, 0.5, 0.52]);
  }
  // Bright motor glow at the tail + a thin exhaust cone.
  mb.box(0, 0, 1.45, 0.2, 0.2, 0.12, [2.4, 1.0, 0.3]);
  cone(mb, 0, 0, 1.5, 1.6, 0.14, [2.2, 0.9, 0.25], [2.4, 1.1, 0.3]);
  return mb.build(gl);
}

// A long thin tracer streak: a stretched box the renderer aligns with
// a bullet's velocity and tints hot yellow-white.
export function buildTracerMesh(gl) {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 0.3, 0.3, 20, [1, 1, 1]);
  return mb.build(gl);
}

// A soft round puff: a white sphere the renderer tints per particle,
// so one mesh serves smoke, fire and explosion glow (with the puff or
// flame sprite bound).
export function buildPuffMesh(gl) {
  const mb = new MeshBuilder();
  mb.ball(0, 0, 0, 1, 1, 1, [1, 1, 1], 8, 12);
  return mb.build(gl);
}

// Unit cubes, tinted by the renderer — sparks, markers, small props.
export function buildCubeMesh(gl) {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 1, 1, 1, [1, 1, 1]);
  return mb.build(gl);
}

export function buildColoredCubeMesh(gl) {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 1, 1, 1, [0.9, 0.9, 0.9]);
  return mb.build(gl);
}

// Clouds as camera-facing billboards: a wide flat quad (180 x 84 m
// before scaling) in the XY plane — its 2.1:1 aspect matches the
// 256x128 cloud sprite, so the puffs stay round instead of being
// stretched into thin horizontal streaks (a 180x54 quad stretched
// the sprite 3.3:1 and every cloud read as a flat grey bar); the
// renderer rotates it toward the camera and binds the soft cloud
// sprite, so clouds are cheap, soft and never look like boxes.
export function buildCloudBillboardMesh(gl) {
  const mb = new MeshBuilder();
  mb.quad([-90, -42, 0], [90, -42, 0], [90, 42, 0], [-90, 42, 0], [0, 0, 1], [1, 1, 1]);
  return mb.build(gl);
}

// The old 3D cloud cluster, kept for compatibility: a cluster of
// overlapping flattened puffs with bright tops and light grey bellies.
export function buildCloudMesh(gl) {
  const mb = new MeshBuilder();
  const puffs = [
    [0, 0, 0, 30, 14, 18], [-20, -1, 4, 20, 10, 13], [20, -1, -3, 22, 10, 14],
    [-9, 4, -6, 16, 10, 11], [11, 4, 6, 17, 10, 11],
    [-29, -2, -4, 12, 7, 9], [30, -2, 3, 13, 7, 9], [0, 7, 0, 14, 9, 10],
  ];
  for (const [cx, cy, cz, rx, ry, rz] of puffs) {
    mb.ball(cx, cy, cz, rx, ry, rz, [0.94, 0.95, 0.97], 7, 10, true);
  }
  return mb.build(gl);
}

// Blob shadow: a flat dark disc the renderer lays on the terrain under
// each jet and fades with altitude — the cheap shadow that grounds the
// jets in the scene. Unit radius; the renderer scales it.
export function buildShadowMesh(gl) {
  const mb = new MeshBuilder();
  mb.disc(0, 0, 0, 1, [0.02, 0.02, 0.03], 20);
  return mb.build(gl);
}

// A square camera-facing sprite: a 2x2 quad in the XY plane, used for
// particles (fire and smoke) so they render as soft textured glows
// instead of hard shaded spheres. The renderer billboards it toward
// the camera and scales it per particle.
export function buildSpriteMesh(gl) {
  const mb = new MeshBuilder();
  mb.quad([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0], [0, 0, 1], [1, 1, 1]);
  return mb.build(gl);
}

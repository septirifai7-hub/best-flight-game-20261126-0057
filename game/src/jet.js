// Procedural jet models for Steel Falcon — built from boxes, frustums and
// swept quads, no external art. The player flies a steel-blue twin-engine
// fighter ("Falcon"); enemies fly a crimson variant ("Viper"). Local axes:
// forward is -Z, up is +Y, span is X. Length ~18 m, span ~11 m.

import { MeshBuilder } from './gl.js';

// Shared palette — realistic, muted: two-tone grey camouflage like a
// real MiG-29 (light grey topsides, darker grey undersides), smoked-glass
// canopy, dark intakes. No bright colours anywhere on the airframe.
const STEEL = [0.58, 0.60, 0.63];
const STEEL_DARK = [0.38, 0.40, 0.43];
const STEEL_LIGHT = [0.68, 0.70, 0.72];
const CAMO = [0.48, 0.50, 0.52];       // darker camo patches on the topsides
const CANOPY = [0.10, 0.13, 0.16];     // smoked glass, near-black with a hint of blue
const CANOPY_HI = [0.22, 0.30, 0.38];  // faint reflective sheen on the canopy crown
const INTAKE = [0.08, 0.08, 0.09];
const NOZZLE = [0.20, 0.20, 0.22];
const FLAME = [0.45, 0.58, 1.0];       // afterburner blue core
const FLAME_TIP = [0.85, 0.45, 0.15];  // orange outer flame
const CRIMSON = [0.45, 0.16, 0.13];    // enemy: muted dark red-grey camo
const CRIMSON_DARK = [0.32, 0.13, 0.11];

export function buildJetMesh(gl, enemy = false) {
  const mb = new MeshBuilder();
  const body = enemy ? CRIMSON : STEEL;
  const dark = enemy ? CRIMSON_DARK : STEEL_DARK;
  const light = enemy ? [0.78, 0.30, 0.26] : STEEL_LIGHT;

  // Fuselage: nose cone, mid body, tail — tapering toward nose and tail.
  mb.nose(0, 0.15, -6.2, -9.6, 0.55, 0.55, ...body);
  mb.frustum(0, 0.15, -6.2, 1.5, 0.95, 0.95, 1.15, 1.05, ...body);
  mb.frustum(0, 0.15, 1.5, 7.2, 1.15, 1.05, 0.95, 0.9, ...body);
  // Camo patches: darker grey slabs on the topsides, like real grey camo.
  mb.frustum(0, 1.0, -5.0, -1.0, 0.6, 0.18, 0.75, 0.2, ...CAMO);
  mb.frustum(0, 1.0, 1.0, 4.0, 0.7, 0.18, 0.6, 0.2, ...CAMO);
  // Spine hump behind the canopy.
  mb.frustum(0, 0.95, -2.0, 4.5, 0.5, 0.35, 0.42, 0.3, ...dark);
  // Belly keel.
  mb.frustum(0, -0.75, -3.5, 5.0, 0.55, 0.35, 0.5, 0.3, ...dark);

  // Canopy: dark smoked glass bubble over the front cockpit, with a faint
  // lighter crown where the sky reflects.
  mb.frustum(0, 0.95, -4.6, -1.2, 0.42, 0.5, 0.5, 0.55, ...CANOPY);
  mb.nose(0, 0.95, -4.6, -5.6, 0.4, 0.42, ...CANOPY);
  mb.frustum(0, 1.32, -4.2, -1.6, 0.3, 0.14, 0.36, 0.16, ...CANOPY_HI);

  // Main wings: swept back, thin, with a lighter tip stripe.
  wing(mb, 1, body, light);
  wing(mb, -1, body, light);
  // Tailplanes (horizontal stabilisers), smaller and further back.
  tailplane(mb, 1, dark);
  tailplane(mb, -1, dark);
  // Twin vertical tails, canted outward.
  fin(mb, 1, body);
  fin(mb, -1, body);
  // Twin intakes under the wing roots.
  mb.box(1.15, -0.55, -1.2, 0.9, 0.7, 4.4, ...INTAKE);
  mb.box(-1.15, -0.55, -1.2, 0.9, 0.7, 4.4, ...INTAKE);
  // Engine nozzles at the tail.
  mb.box(0.62, 0.1, 7.6, 0.85, 0.85, 1.0, ...NOZZLE);
  mb.box(-0.62, 0.1, 7.6, 0.85, 0.85, 1.0, ...NOZZLE);
  // Afterburner flames: blue core cones with a shorter orange outer cone,
  // like a real jet exhaust (blue inside, orange at the edge).
  mb.nose(0.62, 0.1, 8.1, 10.6, 0.3, 0.3, ...FLAME);
  mb.nose(-0.62, 0.1, 8.1, 10.6, 0.3, 0.3, ...FLAME);
  mb.nose(0.62, 0.1, 8.1, 9.4, 0.42, 0.42, ...FLAME_TIP);
  mb.nose(-0.62, 0.1, 8.1, 9.4, 0.42, 0.42, ...FLAME_TIP);
  // Wingtip missile rails + small navigation lights (dim, realistic).
  mb.box(5.35, 0.05, 2.6, 0.22, 0.22, 2.2, ...dark);
  mb.box(-5.35, 0.05, 2.6, 0.22, 0.22, 2.2, ...dark);
  mb.box(5.5, 0.05, 1.6, 0.18, 0.18, 0.5, 0.1, 0.45, 0.15);
  mb.box(-5.5, 0.05, 1.6, 0.18, 0.18, 0.5, 0.5, 0.1, 0.1);
  // Panel lines: thin dark strips along the fuselage top and wings.
  mb.box(0, 1.12, -2.0, 0.06, 0.06, 7.0, ...dark);
  mb.box(0, 1.06, 3.5, 0.06, 0.06, 4.0, ...dark);
  mb.box(2.8, 0.14, 0.8, 0.05, 0.05, 3.4, ...dark);
  mb.box(-2.8, 0.14, 0.8, 0.05, 0.05, 3.4, ...dark);
  return mb.build(gl);
}

// Swept main wing on one side (side = +1 right, -1 left). Root chord at
// z = -1.5..3.5, tip swept back to z = 2.2..5.4, span out to x = 5.5.
function wing(mb, side, colour, tipColour) {
  const x0 = 0.9 * side, x1 = 5.4 * side;
  const top = [
    [x0, 0.12, -1.6], [x1, 0.08, 2.0], [x1, 0.08, 5.2], [x0, 0.12, 3.6],
  ];
  const bot = [
    [x0, -0.06, -1.6], [x1, -0.06, 2.0], [x1, -0.06, 5.2], [x0, -0.06, 3.6],
  ];
  mb.quad(top[0], top[1], top[2], top[3], 0, 1, 0, ...colour);
  mb.quad(bot[3], bot[2], bot[1], bot[0], 0, -1, 0, ...colour);
  // Leading edge and tip faces.
  mb.quad(top[0], bot[0], bot[1], top[1], 0, 0, -1, ...colour);
  mb.quad(top[1], bot[1], bot[2], top[2], 1 * side, 0, 0, ...tipColour);
  mb.quad(top[2], bot[2], bot[3], top[3], 0, 0, 1, ...colour);
}

function tailplane(mb, side, colour) {
  const x0 = 0.8 * side, x1 = 3.1 * side;
  const top = [
    [x0, 0.35, 4.6], [x1, 0.32, 6.0], [x1, 0.32, 7.6], [x0, 0.35, 7.0],
  ];
  const bot = [
    [x0, 0.2, 4.6], [x1, 0.2, 6.0], [x1, 0.2, 7.6], [x0, 0.2, 7.0],
  ];
  mb.quad(top[0], top[1], top[2], top[3], 0, 1, 0, ...colour);
  mb.quad(bot[3], bot[2], bot[1], bot[0], 0, -1, 0, ...colour);
  mb.quad(top[1], bot[1], bot[2], top[2], 1 * side, 0, 0, ...colour);
  mb.quad(top[2], bot[2], bot[3], top[3], 0, 0, 1, ...colour);
}

// Twin tail fin, canted outward by ~12 degrees.
function fin(mb, side, colour) {
  const tilt = 0.22 * side;
  const base = (x, y, z) => [x + tilt * (y - 0.9), y, z];
  const x0 = 0.85 * side, x1 = 1.05 * side;
  const pts = [
    base(x0, 0.9, 4.4), base(x1, 0.9, 4.4),
    base(x1 + 0.15 * side, 3.4, 6.6), base(x0 + 0.1 * side, 3.4, 6.2),
  ];
  // Two faces (front/back) so the fin reads from both sides.
  mb.quad(pts[0], pts[1], pts[2], pts[3], side, 0, 0, ...colour);
  mb.quad(pts[3], pts[2], pts[1], pts[0], -side, 0, 0, ...colour);
  // Red tip cap on the fin.
  const cap = [
    base(x0 + 0.1 * side, 3.4, 6.2), base(x1 + 0.15 * side, 3.4, 6.6),
    base(x1 + 0.18 * side, 3.9, 6.9), base(x0 + 0.12 * side, 3.9, 6.5),
  ];
  mb.quad(cap[0], cap[1], cap[2], cap[3], side, 0, 0, 0.55, 0.12, 0.10);
  mb.quad(cap[3], cap[2], cap[1], cap[0], -side, 0, 0, 0.55, 0.12, 0.10);
}

// A small air-to-air missile: white body, grey nose, orange tail flame.
export function buildMissileMesh(gl) {
  const mb = new MeshBuilder();
  mb.frustum(0, 0, -2.2, 1.6, 0.16, 0.16, 0.16, 0.16, 0.9, 0.9, 0.88);
  mb.nose(0, 0, -2.2, -3.0, 0.16, 0.16, 0.45, 0.45, 0.48);
  mb.box(0, 0.2, 1.2, 0.7, 0.06, 0.9, 0.6, 0.6, 0.62);
  mb.box(0.2, 0, 1.2, 0.06, 0.7, 0.9, 0.6, 0.6, 0.62);
  mb.nose(0, 0, 1.6, 3.4, 0.14, 0.14, 1.0, 0.6, 0.15);
  return mb.build(gl);
}

// A unit cube in a fixed colour, used for bullets (tracers), fire and
// debris — one mesh per colour so particles render in their own colour.
export function buildColoredCubeMesh(gl, r, g, b) {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 1, 1, 1, r, g, b);
  return mb.build(gl);
}

// A soft grey sphere puff: smoke, missile trails and explosion haze.
// A sphere reads as volume; a cube reads as a toy block.
export function buildPuffMesh(gl, r = 0.78, g = 0.78, b = 0.79) {
  const mb = new MeshBuilder();
  mb.sphere(0, 0, 0, 1, 1, 1, r, g, b, 8, 10);
  return mb.build(gl);
}

// A unit cube, used for bullets (stretched), smoke puffs and explosion
// debris — one mesh, many scales.
export function buildCubeMesh(gl) {
  const mb = new MeshBuilder();
  mb.box(0, 0, 0, 1, 1, 1, 1, 1, 1);
  return mb.build(gl);
}

// A soft cloud puff: several overlapping flattened spheres (smooth shaded
// ellipsoids, not boxes) in slightly varied whites and greys, so the cloud
// reads as volume with soft shading rather than a cartoon lump.
export function buildCloudMesh(gl) {
  const mb = new MeshBuilder();
  const puffs = [
    [0, 0, 0, 46, 13, 22, 0.96, 0.97, 0.98],
    [-36, -3, 3, 30, 10, 16, 0.93, 0.94, 0.96],
    [38, -3, -3, 32, 10, 17, 0.93, 0.94, 0.96],
    [10, 6, 2, 26, 9, 14, 0.97, 0.98, 0.99],
    [-12, 5, -5, 22, 8, 12, 0.90, 0.91, 0.93],
    [52, -5, 6, 18, 7, 11, 0.90, 0.91, 0.93],
    [-52, -5, -6, 18, 7, 11, 0.90, 0.91, 0.93],
  ];
  for (const [cx, cy, cz, rx, ry, rz, r, g, b] of puffs) {
    mb.sphere(cx, cy, cz, rx, ry, rz, r, g, b);
  }
  return mb.build(gl);
}

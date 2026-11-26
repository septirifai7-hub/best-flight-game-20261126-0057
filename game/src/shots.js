// Deterministic screenshot poses. A shot freezes the game in one
// composed state — same seed, same frame, every time — and renders it
// with the game's own renderers, so the screenshots are real renders
// of the game's code, not mock-ups.
import { createWorld } from './terrain.js';
import { buildMissionObjects } from './missions.js';
import { createPlane } from './plane.js';
import { MISSIONS } from './config.js';

// Put the game in the named pose and freeze it (the main loop then
// renders without advancing the simulation).
export function applyShot(g, shot, seed = 7) {
  g.seed = seed;
  if (shot === 'title') {
    g.phase = 'title';
    g.selectedMission = 0;
    g.mission = MISSIONS[0];
    g.timeOfDay = 'dawn';
    g.time = 14; // fixed scene clock: sun, clouds and ridges sit still
    g.world = createWorld(seed);
    g.objects = null;
    g.plane = null;
    return;
  }

  const missionIndex = shot === 'drop' ? 1 : shot === 'landing' ? 2 : 0;
  const mission = MISSIONS[missionIndex];
  g.selectedMission = missionIndex;
  g.mission = mission;
  g.timeOfDay = mission.timeOfDay;
  g.world = createWorld(seed);
  g.objects = buildMissionObjects(mission, seed);
  g.plane = createPlane(mission);
  g.objects.nextRing = g.objects.rings[0] || null;
  g.phase = 'flying';
  g.score = shot === 'flight' ? 350 : shot === 'drop' ? 520 : 150;
  g.ringsHit = shot === 'flight' ? 3 : shot === 'drop' ? 0 : 0;
  g.ringsTotal = g.objects.rings.length;
  g.dropsHit = shot === 'drop' ? 1 : 0;
  g.dropsTotal = g.objects.dropZones.length;
  g.parcelsLeft = g.dropsTotal - g.dropsHit;
  g.elapsed = shot === 'flight' ? 74 : shot === 'drop' ? 96 : 41;
  g.time = 8;
  g.popups = [];
  g.message = '';
  const p = g.plane;

  if (shot === 'flight') {
    // Mid-course: banking gently toward the next ring, 260 m out.
    p.airborne = true; p.onGround = false;
    p.alt = 285; p.speed = 66; p.throttle = 0.62;
    p.heading = 0.04; p.bank = 0.3; p.pitch = 0.03;
    p.distanceFlown = 1250;
    p.fuel = 71;
    const r0 = g.objects.rings[0];
    const r1 = g.objects.rings[1];
    const r2 = g.objects.rings[2];
    if (r0) r0.done = true;
    if (r1) r1.done = true;
    if (r2) r2.done = true;
    // Rings 1–3 are already threaded; ring 4 waits 260 m ahead.
    const r3 = g.objects.rings[3];
    if (r3) { r3.x = 26; r3.y = 292; r3.z = 260; }
    const r4 = g.objects.rings[4];
    if (r4) { r4.x = -90; r4.y = 330; r4.z = 720; }
    const r5 = g.objects.rings[5];
    if (r5) { r5.x = 120; r5.y = 250; r5.z = 1250; }
    g.objects.nextRing = r3 || null;
    g.objects.takeoff.z = -1350; // the take-off strip is far behind now
    g.objectiveText = 'Thread ring 4 of 8';
    g.guideAngle = 0.12;
    g.guideLabel = 'RING 4 · 260m';
  } else if (shot === 'drop') {
    // Over the second drop zone, a parcel already falling away below.
    p.airborne = true; p.onGround = false;
    p.alt = 300; p.speed = 58; p.throttle = 0.55;
    p.heading = -0.03; p.bank = -0.18; p.pitch = 0.02;
    p.distanceFlown = 2100;
    p.fuel = 64;
    const dz = g.objects.dropZones[1] || g.objects.dropZones[0];
    if (dz) { dz.x = -14; dz.z = 190; }
    g.objects.parcels = [{ x: -52, y: 270, z: 200, zone: 1, scored: false }];
    g.objects.takeoff.z = -2200; // the take-off strip is far behind now
    g.objectiveText = 'Drop zone 2 of 3 — press SPACE overhead';
    g.guideAngle = -0.08;
    g.guideLabel = 'DROP ZONE · 190m';
  } else if (shot === 'landing') {
    // Final approach at dusk: gear down, low fuel, runway 09 ahead.
    // Well right of the centreline and turning back toward it, so the
    // strip reads as a diagonal band beside the plane, not behind it.
    p.airborne = true; p.onGround = false;
    p.alt = 58; p.speed = 52; p.throttle = 0.34;
    p.heading = -0.09; p.bank = 0.22; p.pitch = 0.06;
    p.x = 130;
    p.distanceFlown = 1480;
    p.fuel = 11;
    p.gearDown = true;
    g.objects.runway.z = 420;
    g.objects.takeoff.z = -1580; // the take-off strip is far behind now
    g.objectiveText = 'Land on runway 09  ·  LOW FUEL';
    g.guideAngle = 0.02;
    g.guideLabel = 'RUNWAY 09 · 420m';
  }
  g.shotFrozen = true;
}

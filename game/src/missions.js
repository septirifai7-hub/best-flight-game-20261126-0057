// Missions: where the rings, drop zones and the runway sit along the
// course, and how the pilot's flying turns into points.
// One job: the sortie's objectives and its scoring rules.
import { CONFIG } from './config.js';
import { makeRandom } from './random.js';

// Build the world objects for a mission. Distances are metres ahead of
// the take-off point; the runway waits at the end of the course.
export function buildMissionObjects(mission, seed) {
  const rand = makeRandom(seed);
  const rings = [];
  const dropZones = [];
  // The take-off strip sits under the plane at the start; the landing
  // strip waits at the far end of the course.
  const takeoff = { z: -100 };
  let z = 1200;
  const ringCount = mission.rings || 0;
  for (let i = 0; i < ringCount; i++) {
    rings.push({
      index: i,
      x: (rand() - 0.5) * 420,
      y: 190 + rand() * 260,
      z,
      done: false,
      flash: 0,
    });
    z += 380 + rand() * 220;
  }
  const dropCount = mission.drops || 0;
  for (let i = 0; i < dropCount; i++) {
    dropZones.push({ index: i, x: (rand() - 0.5) * 360, z, done: false, hit: false });
    z += 520 + rand() * 240;
  }
  const runway = { z: z + 420 };
  return { rings, dropZones, runway, takeoff, parcels: [], courseEnd: runway.z + CONFIG.runwayLength };
}

// The next thing the pilot must fly to: a ring, a drop zone, or the runway.
export function nextTarget(objects, mission) {
  const ring = objects.rings.find((r) => !r.done);
  if (ring) return { kind: 'ring', ring, x: ring.x, y: ring.y, z: ring.z, label: `RING ${ring.index + 1}` };
  const dz = objects.dropZones.find((d) => !d.done);
  if (dz) return { kind: 'drop', dz, x: dz.x, y: 0, z: dz.z, label: 'DROP ZONE' };
  return { kind: 'runway', x: 0, y: 0, z: objects.runway.z, label: 'RUNWAY 09' };
}

// Judge a ring pass: the ring's z has just crossed the plane.
export function judgeRing(ring, plane) {
  const dx = Math.abs(plane.x - ring.x);
  const dy = Math.abs(plane.alt - ring.y);
  const off = Math.hypot(dx, dy);
  if (off > CONFIG.ringRadius * 0.95) return { hit: false, centre: false, off };
  return { hit: true, centre: off < CONFIG.ringRadius * 0.38, off };
}

// Judge a parcel drop: how close the parcel lands to the zone centre.
export function judgeDrop(dz, parcelX) {
  const off = Math.abs(parcelX - dz.x);
  if (off > 70) return { hit: false, off };
  return { hit: true, off, quality: off < 18 ? 'bullseye' : off < 40 ? 'close' : 'wide' };
}

// Judge a touchdown: vertical speed and centreline decide the verdict.
export function judgeLanding(plane) {
  const vs = plane.verticalSpeed;
  const offCentre = Math.abs(plane.x);
  if (vs < -6 || plane.speed > CONFIG.maxSpeed * 0.62) {
    return { ok: false, text: 'TOO HARD — THE KESTREL IS A WRITE-OFF', points: 0 };
  }
  if (vs < -3.5) {
    return { ok: true, rough: true, text: 'HARD LANDING', points: 150 };
  }
  const centre = offCentre < 8 ? 150 : offCentre < 16 ? 80 : 30;
  const gentle = vs > -2 ? 250 : 150;
  return { ok: true, text: vs > -2 ? 'BUTTER-SMOOTH TOUCHDOWN' : 'FIRM BUT SAFE', points: centre + gentle };
}

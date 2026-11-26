// Game state machine: title → briefing → flying → landed / crashed /
// out of fuel → results. One job: own the phases, the objectives and
// the score, and call the renderers in the right order.
import { CONFIG, MISSIONS } from './config.js';
import { createWorld, drawScene } from './terrain.js';
import { createPlane, updatePlane, drawPlane } from './plane.js';
import { drawHUD, drawTitle, drawBriefing, drawResults, drawPaused, fmtTime } from './hud.js';
import { buildMissionObjects, nextTarget, judgeRing, judgeDrop, judgeLanding } from './missions.js';
import { clamp, wrapAngle } from './random.js';

const BEST_KEY = 'sky-courier-best';

export function createGame() {
  return {
    phase: 'title', // title | briefing | flying | complete | crashed | outoffuel | paused
    prevPhase: 'flying',
    missions: MISSIONS,
    selectedMission: 0,
    mission: MISSIONS[0],
    plane: null,
    world: null,
    objects: null,
    time: 0,        // scene clock (drives clouds, beacons, strobes)
    elapsed: 0,     // mission timer
    score: 0,
    ringsHit: 0,
    ringsTotal: 0,
    dropsHit: 0,
    dropsTotal: 0,
    parcelsLeft: 0,
    bestScore: 0,
    objectiveText: '',
    guideAngle: null,
    guideLabel: '',
    message: '',
    messageT: 0,
    popups: [],
    rollingOut: null, // 'runway' | 'field' once the wheels are down
    resultLine: '',
    landingText: '—',
    timeOfDay: 'dawn',
    horizonY: 300,
    seed: 7,
  };
}

function loadBest(g) {
  try { g.bestScore = Number(localStorage.getItem(BEST_KEY + '-' + g.mission.id) || 0) || 0; } catch { g.bestScore = 0; }
}
function saveBest(g) {
  try {
    if (g.score > g.bestScore) localStorage.setItem(BEST_KEY + '-' + g.mission.id, String(g.score));
  } catch { /* hosted pages may block storage; the game plays on */ }
}

export function startMission(g, index, seed = 7) {
  g.selectedMission = index;
  g.mission = MISSIONS[index];
  g.seed = seed;
  g.timeOfDay = g.mission.timeOfDay;
  g.world = createWorld(seed);
  g.objects = buildMissionObjects(g.mission, seed);
  g.plane = createPlane(g.mission);
  g.objects.nextRing = g.objects.rings[0] || null;
  g.score = 0;
  g.ringsHit = 0;
  g.ringsTotal = g.objects.rings.length;
  g.dropsHit = 0;
  g.dropsTotal = g.objects.dropZones.length;
  g.parcelsLeft = g.dropsTotal;
  g.elapsed = 0;
  g.time = 0;
  g.popups = [];
  g.message = '';
  g.landingText = '—';
  g.resultLine = '';
  g.phase = 'briefing';
  loadBest(g);
  updateObjective(g);
}

function updateObjective(g) {
  const target = nextTarget(g.objects, g.mission);
  if (target.kind === 'ring') g.objectiveText = `Thread ring ${target.ring.index + 1} of ${g.ringsTotal}`;
  else if (target.kind === 'drop') g.objectiveText = `Drop zone ${target.dz.index + 1} of ${g.dropsTotal} — press SPACE overhead`;
  else g.objectiveText = 'Land on runway 09';
  if (g.phase === 'flying' && g.plane.fuel < 18) g.objectiveText += '  ·  LOW FUEL';
}

function addPopup(g, x, y, text) {
  g.popups.push({ x, y, text, life: 1.6 });
}
function say(g, msg, seconds = 2.5) {
  g.message = msg;
  g.messageT = seconds;
}

function endSortie(g, phase, resultLine) {
  g.phase = phase;
  g.resultLine = resultLine;
  saveBest(g);
  if (phase === 'complete') loadBest(g);
}

// One frame of the flying phase.
function updateFlying(g, ctl, edges, dt, audio) {
  const p = g.plane;
  const prevZ = p.distanceFlown;
  updatePlane(p, ctl, dt, g.mission);
  g.elapsed += dt;
  g.time += dt;

  // Rings: when a ring's z passes the plane, judge the pass.
  for (const ring of g.objects.rings) {
    if (ring.done) continue;
    ring.z -= (p.distanceFlown - prevZ);
    if (ring.z <= 0) {
      ring.done = true;
      const r = judgeRing(ring, p);
      if (r.hit) {
        g.ringsHit++;
        const pts = CONFIG.ringScore + (r.centre ? CONFIG.ringCentreBonus : 0);
        g.score += pts;
        addPopup(g, window.innerWidth / 2, window.innerHeight * 0.4, `+${pts}${r.centre ? ' CENTRE!' : ''}`);
        say(g, r.centre ? 'DEAD CENTRE — BEAUTIFUL FLYING' : 'RING CLEAR');
        audio.ring();
        if (r.centre) audio.centre();
      } else {
        say(g, 'RING MISSED — KEEP FLYING THE COURSE');
      }
      g.objects.nextRing = g.objects.rings.find((x) => !x.done) || null;
    }
    ring.flash = Math.max(0, ring.flash - dt * 2);
  }

  // Drop zones and parcels.
  for (const dz of g.objects.dropZones) dz.z -= (p.distanceFlown - prevZ);
  g.objects.runway.z -= (p.distanceFlown - prevZ);
  if (g.objects.takeoff) g.objects.takeoff.z -= (p.distanceFlown - prevZ);
  for (const parcel of g.objects.parcels) {
    parcel.z -= (p.distanceFlown - prevZ);
    parcel.y -= 110 * dt; // the parcel falls fast so it lands near the zone
    if (parcel.y <= 0 && !parcel.scored) {
      parcel.scored = true;
      const dz = g.objects.dropZones[parcel.zone];
      const r = judgeDrop(dz, parcel.x);
      dz.done = true;
      if (r.hit) {
        g.dropsHit++;
        const pts = r.quality === 'bullseye' ? 300 : r.quality === 'close' ? 200 : 120;
        g.score += pts;
        addPopup(g, window.innerWidth / 2, window.innerHeight * 0.42, `+${pts} ${r.quality.toUpperCase()}!`);
        say(g, `PARCEL ${r.quality.toUpperCase()} — ${g.dropsHit} OF ${g.dropsTotal} DELIVERED`);
        audio.drop();
      } else {
        say(g, 'PARCEL MISSED THE ZONE');
      }
    }
  }
  g.objects.parcels = g.objects.parcels.filter((pc) => pc.y > 0 || !pc.scored);

  // Drop a parcel on SPACE / click, if any are left.
  if (edges.drop && g.parcelsLeft > 0 && p.airborne) {
    const dz = g.objects.dropZones.find((d) => !d.done);
    if (dz && Math.abs(dz.z) < 350) {
      g.objects.parcels.push({ x: p.x, y: p.alt, z: 8, zone: dz.index, scored: false });
      g.parcelsLeft--;
      say(g, `PARCEL AWAY — ${g.parcelsLeft} LEFT`);
      audio.drop();
    } else if (dz) {
      say(g, 'NO DROP ZONE BELOW — LINE UP FIRST');
    }
  }

  // Guidance arrow: angle to the next target relative to the nose.
  const target = nextTarget(g.objects, g.mission);
  const dx = target.x - p.x;
  const dy = target.y - p.alt;
  const dz = target.z;
  const bearing = Math.atan2(dx, Math.max(30, dz)) - p.heading;
  const elev = Math.atan2(dy, Math.max(30, dz));
  g.guideAngle = clamp(bearing * 2.2, -1.1, 1.1);
  g.guideLabel = target.label + (target.kind === 'ring' ? ` · ${Math.round(dz)}m` : target.kind === 'drop' ? ` · ${Math.round(dz)}m` : ` · ${Math.round(dz)}m`);
  void elev;

  // Fuel and damage.
  if (p.fuel <= 0 && p.airborne) {
    // Flame-out: glide her down; the sortie ends on the ground.
    say(g, 'FUEL EXHAUSTED — GLIDE HER IN');
  }
  if (p.fuel <= 0 && !p.airborne && p.speed < 8) {
    endSortie(g, 'outoffuel', 'Ran dry on the ground');
    return;
  }
  if (p.damage >= 100) {
    endSortie(g, 'crashed', 'The Kestrel is a write-off');
    audio.crash();
    return;
  }

  // Ground contact. Only when actually descending: on the rotation
  // frame the plane is airborne with alt still ~0 and vs 0, and that
  // must not read as a touchdown.
  if (p.alt <= 0.5 && p.airborne && p.verticalSpeed < -0.5) {
    const rw = g.objects.runway;
    const tw = g.objects.takeoff;
    const over = (r) => r && r.z <= 0 && r.z + CONFIG.runwayLength >= 0;
    const onRunway = (over(rw) || over(tw)) && Math.abs(p.x) < CONFIG.runwayWidth / 2 + 4;
    if (onRunway) {
      const landing = judgeLanding(p);
      if (landing.ok) {
        g.score += landing.points;
        g.landingText = landing.text;
        p.airborne = false;
        p.onGround = true;
        g.rollingOut = 'runway';
        audio.thud();
      } else {
        p.damage = 100;
        endSortie(g, 'crashed', landing.text);
        audio.crash();
      }
    } else {
      // Off-runway ground contact: a crash, or a rough field landing.
      if (p.verticalSpeed < -6 || p.speed > 60) {
        p.damage = 100;
        endSortie(g, 'crashed', 'Went down in the fields');
        audio.crash();
      } else {
        p.damage = Math.min(100, p.damage + CONFIG.damageHardLanding);
        p.airborne = false;
        p.onGround = true;
        g.rollingOut = 'field';
        say(g, 'ROUGH FIELD LANDING — THE RUNWAY WAS THE PLAN');
        audio.thud();
      }
    }
  }

  // Rollout after touchdown: cut power and bleed speed, then close the sortie.
  if (g.rollingOut && p.onGround && g.phase === 'flying') {
    p.throttle = 0; // power off, or the engine would keep driving the roll
    p.speed = Math.max(0, p.speed - (g.rollingOut === 'runway' ? 26 : 40) * dt);
    if (p.speed < 6) {
      if (g.rollingOut === 'runway') {
        const timeBonus = Math.max(0, 600 - Math.floor(g.elapsed) * 2);
        g.score += timeBonus;
        endSortie(g, 'complete', `${g.landingText} · time bonus +${timeBonus}`);
        audio.win();
      } else {
        endSortie(g, 'crashed', 'Down in the fields, short of the runway');
      }
      g.rollingOut = null;
    }
  }

  // Take-off roll: the plane accelerates down the runway until rotation.
  if (!p.airborne && p.onGround && p.speed > 4) {
    p.alt = 0;
  }

  // Messages and popups age out.
  if (g.messageT > 0) { g.messageT -= dt; if (g.messageT <= 0) g.message = ''; }
  for (const pop of g.popups) pop.life -= dt * 0.9;
  g.popups = g.popups.filter((pop) => pop.life > 0);

  updateObjective(g);
  audio.update(p.throttle, clamp(p.speed / CONFIG.maxSpeed, 0, 1));
}

// Dispatch one frame for the current phase.
export function updateGame(g, ctl, edges, dt, audio) {
  if (edges.mute) audio.setMuted(!audio.isMuted());
  if (g.phase === 'title') {
    if (edges.mission >= 1 && edges.mission <= 3) g.selectedMission = edges.mission - 1;
    if (edges.confirm) startMission(g, g.selectedMission);
    // The title scene idles: slow flight over the valley behind the menu.
    g.time += dt;
    return;
  }
  if (g.phase === 'briefing') {
    if (edges.confirm) { g.phase = 'flying'; audio.unlock(); }
    return;
  }
  if (g.phase === 'paused') {
    if (edges.pause || edges.confirm) g.phase = g.prevPhase;
    return;
  }
  if (g.phase === 'flying') {
    if (edges.pause) { g.prevPhase = 'flying'; g.phase = 'paused'; return; }
    if (edges.restart) { startMission(g, g.selectedMission, g.seed); return; }
    updateFlying(g, ctl, edges, dt, audio);
    return;
  }
  // complete / crashed / outoffuel
  if (edges.confirm || edges.restart) startMission(g, g.selectedMission, g.seed);
  if (edges.toTitle) g.phase = 'title';
  if (edges.mission >= 1 && edges.mission <= 3) { g.phase = 'title'; g.selectedMission = edges.mission - 1; }
}

// Render one frame for the current phase.
export function renderGame(ctx, g, w, h) {
  const p = g.plane;
  // Horizon height follows pitch so the world tilts with the nose.
  const pitch = p ? p.pitch : 0;
  const bank = p ? p.bank : 0;
  g.horizonY = h * 0.42 + pitch * 320;
  const st = {
    alt: p ? p.alt : CONFIG.startAltitude,
    heading: p ? p.heading : 0,
    x: p ? p.x : 0,
    distanceFlown: p ? p.distanceFlown : g.time * 40,
    time: g.time,
    timeOfDay: g.timeOfDay,
    horizonY: g.horizonY,
  };

  ctx.save();
  // Bank the whole world around the screen centre; the HUD stays level.
  ctx.translate(w / 2, h * 0.52);
  ctx.rotate(-bank * 0.55);
  ctx.translate(-w / 2, -h * 0.52);
  if (g.world && g.objects) drawScene(ctx, st, g.world, g.objects, w, h);
  else drawTitleBackdrop(ctx, g, w, h);
  ctx.restore();

  if (g.phase === 'flying' || g.phase === 'paused') {
    if (p) drawPlane(ctx, p, w, h, g.time);
    drawHUD(ctx, g, w, h);
    if (g.phase === 'paused') drawPaused(ctx, w, h);
  } else if (g.phase === 'title') {
    // The menu flies over a live valley: a parked plane on the apron.
    drawTitle(ctx, g, w, h);
  } else if (g.phase === 'briefing') {
    if (p) drawPlane(ctx, p, w, h, g.time);
    drawBriefing(ctx, g, w, h);
  } else {
    if (p && g.phase !== 'crashed') drawPlane(ctx, p, w, h, g.time);
    drawResults(ctx, g, w, h);
  }

  // Screen-reader status line.
  const status = document.getElementById('status');
  if (status) {
    status.textContent = g.phase === 'flying' && p
      ? `Flying: altitude ${Math.round(p.alt * 3.28)} feet, speed ${Math.round(p.speed * 1.94)} knots, heading ${Math.round(((p.heading * 180) / Math.PI % 360 + 360) % 360)} degrees. ${g.objectiveText}. Score ${g.score}.`
      : `Sky Courier: ${g.phase}. ${g.mission.name}.`;
  }
}

// Title backdrop before the first mission starts: sky, ridges, ground.
function drawTitleBackdrop(ctx, g, w, h) {
  const st = {
    alt: CONFIG.startAltitude, heading: 0, x: 0,
    distanceFlown: g.time * 40, time: g.time,
    timeOfDay: g.timeOfDay, horizonY: h * 0.42,
  };
  const world = g.world || (g.world = createWorld(g.seed));
  drawScene(ctx, st, world, { rings: [], dropZones: [], parcels: [], runway: { z: 900 }, nextRing: null }, w, h);
}

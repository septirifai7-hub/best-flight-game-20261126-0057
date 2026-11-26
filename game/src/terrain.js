// World rendering: sky, mountain ridges, the scrolling valley floor,
// the runway, rings, drop zones, clouds and trees. One job: turn the
// flight state into the picture behind the plane. All projection is a
// simple pinhole camera: screenX = cx + L*f/D, screenY = horizon + (A-Y)*f/D.
import { CONFIG, SKIES } from './config.js';
import { makeNoise, makeRandom, clamp } from './random.js';

// Build the valley once per seed: ridge noise, a patchwork ground tile,
// clouds and trees placed along the course.
export function createWorld(seed) {
  const rand = makeRandom(seed);
  const farNoise = makeNoise(seed + 11);
  const nearNoise = makeNoise(seed + 77);

  // Ground tile: 1024x1024 of fields, a river and roads, sampled row by
  // row as the plane flies over it.
  const tile = document.createElement('canvas');
  tile.width = 1024; tile.height = 1024;
  const g = tile.getContext('2d');
  const fieldCols = ['#6d8148', '#7d8f4e', '#5d7040', '#8a9455', '#6b7d3f', '#93a05c', '#57683a'];
  g.fillStyle = '#6d8148'; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 220; i++) {
    g.fillStyle = fieldCols[(rand() * fieldCols.length) | 0];
    const x = rand() * 1024, y = rand() * 1024;
    g.fillRect(x, y, 40 + rand() * 130, 30 + rand() * 90);
  }
  // River: a winding blue band down the tile.
  g.strokeStyle = '#5d8fb5'; g.lineWidth = 26; g.lineCap = 'round';
  g.beginPath();
  for (let y = 0; y <= 1024; y += 64) {
    const x = 700 + Math.sin(y * 0.006 + 1.2) * 90;
    y === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
  }
  g.stroke();
  g.strokeStyle = '#7fb3d5'; g.lineWidth = 12; g.stroke();
  // Roads: pale bands with a centre line.
  g.strokeStyle = '#b9a98a'; g.lineWidth = 10;
  g.beginPath(); g.moveTo(0, 300); g.lineTo(1024, 260); g.stroke();
  g.beginPath(); g.moveTo(180, 0); g.lineTo(260, 1024); g.stroke();
  // Tree dots: darker speckles along field edges.
  g.fillStyle = '#3f5a2e';
  for (let i = 0; i < 900; i++) g.fillRect(rand() * 1024, rand() * 1024, 3, 3);

  // Clouds: billboards drifting high above the valley.
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    clouds.push({
      x: (rand() - 0.5) * 2400,
      y: 480 + rand() * 320,
      z: rand() * 2600,
      s: 60 + rand() * 130,
      a: 0.55 + rand() * 0.3,
    });
  }
  // Trees: small billboards near the ground along the course.
  const trees = [];
  for (let i = 0; i < 90; i++) {
    trees.push({ x: (rand() - 0.5) * 900, z: 120 + rand() * 2400, s: 7 + rand() * 10 });
  }
  return { rand, farNoise, nearNoise, tile, clouds, trees };
}

// Pinhole projection of a world point (L lateral m, Y height m, D ahead m).
// The eye sits 6 m above the plane so the ground reads even on the runway.
// Screen x is the point's bearing from the nose: lateral offset from the
// plane, over distance, minus the heading the nose points at.
function project(L, Y, D, st, w, h) {
  const f = CONFIG.focal * (w / 1280);
  const cx = w / 2;
  const horizon = st.horizonY;
  const eye = st.alt + 6;
  return {
    x: cx + (((L - st.x) / Math.max(20, D)) - st.heading) * f,
    y: horizon + ((eye - Y) * f) / Math.max(20, D),
    s: f / Math.max(20, D),
  };
}

function drawRidge(ctx, noise, w, horizon, base, amp, color, heading, parallax, snow) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-4, horizon + 2);
  const step = 16;
  for (let x = -4; x <= w + 4; x += step) {
    const n = noise(x * 0.004 + heading * parallax);
    ctx.lineTo(x, horizon - n * amp - base);
  }
  ctx.lineTo(w + 4, horizon + 2);
  ctx.closePath();
  ctx.fill();
  if (snow) {
    // Snow caps: white flecks where the ridge is highest.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    for (let x = 0; x <= w; x += step) {
      const n = noise(x * 0.004 + heading * parallax);
      if (n > 0.62) {
        const y = horizon - n * amp - base;
        ctx.beginPath();
        ctx.moveTo(x - 9, y + 7); ctx.lineTo(x, y - 3); ctx.lineTo(x + 9, y + 7);
        ctx.closePath(); ctx.fill();
      }
    }
  }
}

function drawCloud(ctx, p, s, a, tint) {
  // A puffy cloud: several overlapping soft circles, not one flat disc.
  ctx.save();
  ctx.globalAlpha = a;
  const puffs = [
    [0, 0, 1.0],
    [-0.55, 0.10, 0.62],
    [0.55, 0.10, 0.62],
    [-0.28, -0.16, 0.55],
    [0.30, -0.14, 0.55],
  ];
  for (const [dx, dy, r] of puffs) {
    const cx = p.x + dx * s, cy = p.y + dy * s, cr = s * 0.36 * r;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, cr);
    grad.addColorStop(0, tint);
    grad.addColorStop(0.75, tint);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

// The whole scene. `st` is the flight state; `world` the built valley;
// `objects` holds rings, drop zones, parcels and the runway position.
export function drawScene(ctx, st, world, objects, w, h) {
  const sky = SKIES[st.timeOfDay];
  const horizon = st.horizonY;
  const cx = w / 2;

  // --- Sky ---
  const grad = ctx.createLinearGradient(0, 0, 0, Math.max(horizon, 1));
  grad.addColorStop(0, sky.top);
  grad.addColorStop(0.62, sky.mid);
  grad.addColorStop(1, sky.horizon);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, Math.max(horizon + 1, 1));
  // Sun with a soft halo.
  const sunX = w * sky.sunX, sunY = h * sky.sunY;
  const halo = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 130);
  halo.addColorStop(0, sky.sun);
  halo.addColorStop(0.25, sky.sun + 'cc');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
  ctx.fillStyle = sky.sun;
  ctx.beginPath(); ctx.arc(sunX, sunY, 26, 0, Math.PI * 2); ctx.fill();

  // --- Mountain ridges (parallax with heading) ---
  drawRidge(ctx, world.farNoise, w, horizon, 6, h * 0.16, sky.far, st.heading, 2.2, true);
  drawRidge(ctx, world.nearNoise, w, horizon, 2, h * 0.09, sky.near, st.heading, 4.5, false);

  // --- Valley floor: sample the ground tile row by row. ---
  // Distance grows as 1/(y - horizon); the tile scrolls with distance
  // flown and shifts sideways with heading and lateral position.
  const tile = world.tile;
  const groundTop = Math.max(0, Math.floor(horizon));
  const rows = 64;
  const rowH = Math.max(1, Math.ceil((h - groundTop) / rows));
  for (let i = 0; i < rows; i++) {
    const y = groundTop + i * rowH;
    const t = (y - horizon + 2) / Math.max(2, h - horizon); // 0 far .. 1 near
    const dist = 60 + (1 - t) * (1 - t) * 2400; // metres ahead this row shows
    const v = Math.floor((st.distanceFlown + dist) % 1024);
    const scale = clamp(dist / 900, 0.25, 3.2);
    const u = 512 + (st.heading * 900 + st.x) * scale * 0.9;
    const srcW = Math.min(1024, Math.max(90, 1024 / scale));
    const srcX = clamp(u - srcW / 2, 0, 1024 - srcW);
    ctx.drawImage(tile, srcX, v, srcW, 1.6, 0, y, w, rowH + 1);
  }

  // --- Runways: projected quads on the ground, with centre dashes. ---
  const drawRunway = (rw) => {
    if (!rw || rw.z >= CONFIG.drawDistance || rw.z + CONFIG.runwayLength <= 0) return;
    const hw = CONFIG.runwayWidth / 2;
    const near = project(-hw, 0, Math.max(30, rw.z), st, w, h);
    const nearR = project(hw, 0, Math.max(30, rw.z), st, w, h);
    const far = project(-hw, 0, rw.z + CONFIG.runwayLength, st, w, h);
    const farR = project(hw, 0, rw.z + CONFIG.runwayLength, st, w, h);
    ctx.fillStyle = '#3a3f46';
    ctx.beginPath();
    ctx.moveTo(near.x, near.y); ctx.lineTo(nearR.x, nearR.y);
    ctx.lineTo(farR.x, farR.y); ctx.lineTo(far.x, far.y);
    ctx.closePath(); ctx.fill();
    // Edge lines and centre dashes.
    ctx.strokeStyle = '#f5f0dc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(near.x, near.y); ctx.lineTo(far.x, far.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(nearR.x, nearR.y); ctx.lineTo(farR.x, farR.y); ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3;
    for (let d = 60; d < CONFIG.runwayLength; d += 120) {
      const a = project(0, 0, rw.z + d, st, w, h);
      const b = project(0, 0, rw.z + d + 55, st, w, h);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // Threshold number at the near end.
    ctx.fillStyle = '#f5f0dc';
    const th = project(0, 0, Math.max(30, rw.z + 18), st, w, h);
    ctx.font = `bold ${Math.max(10, th.s * 9)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('09', th.x, th.y);
  };
  drawRunway(objects.runway);
  drawRunway(objects.takeoff);

  // --- Drop zones: glowing circles on the ground with a light column. ---
  for (const dz of objects.dropZones) {
    if (dz.done || dz.z < -40 || dz.z > CONFIG.drawDistance) continue;
    const p = project(dz.x, 0, dz.z, st, w, h);
    const r = Math.max(3, 16 * p.s);
    ctx.save();
    ctx.globalAlpha = 0.28 + 0.12 * Math.sin(st.time * 4);
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = '#ffd25e'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(p.x, p.y, r, r * 0.32, 0, 0, Math.PI * 2); ctx.stroke();
    // Beacon column up into the sky.
    const top = project(dz.x, 130, dz.z, st, w, h);
    const beam = ctx.createLinearGradient(p.x, p.y, top.x, top.y);
    beam.addColorStop(0, 'rgba(255,178,32,0.5)');
    beam.addColorStop(1, 'rgba(255,178,32,0)');
    ctx.fillStyle = beam;
    ctx.fillRect(p.x - 3, top.y, 6, p.y - top.y);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(11, r * 0.5)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('DROP', p.x, p.y - r * 0.4);
  }

  // --- Rings: glowing hoops the pilot threads. ---
  for (const ring of objects.rings) {
    if (ring.done || ring.z < -30 || ring.z > CONFIG.drawDistance) continue;
    const p = project(ring.x, ring.y, ring.z, st, w, h);
    const r = CONFIG.ringRadius * p.s;
    if (r < 2) continue;
    const isNext = ring === objects.nextRing;
    ctx.save();
    ctx.shadowBlur = isNext ? 26 : 12;
    ctx.shadowColor = ring.flash > 0 ? '#7dff9a' : isNext ? '#ffb020' : '#7ec8ff';
    ctx.strokeStyle = ring.flash > 0 ? '#7dff9a' : isNext ? '#ffb020' : '#9fd8ff';
    ctx.lineWidth = Math.max(2, r * 0.09);
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, r * 0.03);
    ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.82, 0, Math.PI * 2); ctx.stroke();
    // Chevrons on the hoop, pointing the way through.
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + st.time * 0.6;
      const px = p.x + Math.cos(a) * r * 0.82;
      const py = p.y + Math.sin(a) * r * 0.82;
      ctx.beginPath(); ctx.arc(px, py, Math.max(1.5, r * 0.05), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (isNext) {
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(12, r * 0.16)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${ring.index + 1}`, p.x, p.y - r - 10);
    }
  }

  // --- Falling parcels (dropped, drifting down to the zone). ---
  for (const parcel of objects.parcels) {
    if (parcel.z <= 5) continue;
    const p = project(parcel.x, parcel.y, parcel.z, st, w, h);
    const s = Math.max(2, 5 * p.s);
    ctx.fillStyle = '#c98a3d';
    ctx.fillRect(p.x - s, p.y - s * 0.7, s * 2, s * 1.4);
    ctx.strokeStyle = '#7a4d16'; ctx.lineWidth = 1;
    ctx.strokeRect(p.x - s, p.y - s * 0.7, s * 2, s * 1.4);
    ctx.beginPath(); ctx.moveTo(p.x, p.y - s * 0.7); ctx.lineTo(p.x, p.y + s * 0.7); ctx.stroke();
  }

  // --- Trees: small billboards on the ground. Trees closer than 200 m
  // are skipped, and none is drawn taller than a pine should look.
  ctx.fillStyle = '#2f4d24';
  for (const t of world.trees) {
    const d = ((t.z - st.distanceFlown) % 2400 + 2400) % 2400 + 60;
    if (d < 200 || d > CONFIG.drawDistance) continue;
    const p = project(t.x, 0, d, st, w, h);
    const s = Math.min(55, t.s * p.s);
    if (s < 1.5 || p.y < horizon) continue;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - s * 2.2);
    ctx.lineTo(p.x - s, p.y);
    ctx.lineTo(p.x + s, p.y);
    ctx.closePath(); ctx.fill();
  }

  // --- Clouds: soft billboards high above the valley. ---
  for (const c of world.clouds) {
    const d = ((c.z - st.distanceFlown * 0.92) % 2600 + 2600) % 2600 + 40;
    const p = project(c.x, c.y, d, st, w, h);
    const s = c.s * p.s;
    if (s < 4 || p.y > horizon + 4) continue;
    drawCloud(ctx, p, Math.min(s, 260), c.a, 'rgba(255,255,255,0.9)');
  }
}

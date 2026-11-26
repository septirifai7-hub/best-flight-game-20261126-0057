// HUD and screens: instruments, compass, mission banners, warnings,
// title / briefing / results. One job: everything drawn on top of the
// scene, in screen space, never rotated with the world.
import { CONFIG } from './config.js';
import { clamp } from './random.js';

const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

function panel(ctx, x, y, w, h, alpha = 0.55) {
  ctx.fillStyle = `rgba(8, 16, 32, ${alpha})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function text(ctx, s, x, y, size, color, align = 'left', bold = true) {
  ctx.fillStyle = color;
  ctx.font = `${bold ? '700' : '400'} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
}

// Vertical tape (speed left, altitude right) with a centre readout.
function tape(ctx, x, y, h, value, step, unit, label, format) {
  panel(ctx, x - 34, y, 68, h, 0.5);
  text(ctx, label, x, y - 8, 11, '#9fd8ff', 'center');
  ctx.save();
  ctx.beginPath(); ctx.rect(x - 34, y, 68, h); ctx.clip();
  const mid = y + h / 2;
  const pxPer = h / (step * 6);
  const base = Math.floor(value / step) * step;
  for (let v = base - step * 3; v <= base + step * 3; v += step) {
    const yy = mid - (v - value) * pxPer;
    if (yy < y + 4 || yy > y + h - 4) continue;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.moveTo(x - 12, yy); ctx.lineTo(x + 12, yy); ctx.stroke();
    text(ctx, String(v), x + (v === base ? 0 : 0), yy + 4, 11, v === base ? '#fff' : '#cfe6ff', 'center', v === base);
  }
  ctx.restore();
  // Centre readout box.
  ctx.fillStyle = '#ffb020';
  ctx.beginPath(); ctx.roundRect(x - 32, mid - 13, 64, 26, 5); ctx.fill();
  text(ctx, format(value), x, mid + 5, 14, '#1a1206', 'center');
  text(ctx, unit, x, y + h + 14, 10, '#9fd8ff', 'center', false);
}

export function drawHUD(ctx, g, w, h) {
  const p = g.plane;
  const kt = Math.round(p.speed * 1.94384);
  const altFt = Math.round(p.alt * 3.28084);
  const hdg = Math.round(((p.heading * 180) / Math.PI % 360 + 360) % 360);

  // Artificial horizon: a small round gauge, top centre.
  const ax = w / 2, ay = 66, ar = 34;
  ctx.save();
  ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.clip();
  ctx.translate(ax, ay);
  ctx.rotate(-p.bank * 0.7);
  ctx.translate(0, p.pitch * 120);
  ctx.fillStyle = '#3f7ec2'; ctx.fillRect(-ar, -ar * 2, ar * 2, ar * 2);
  ctx.fillStyle = '#7a5a34'; ctx.fillRect(-ar, 0, ar * 2, ar * 2);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-ar, 0); ctx.lineTo(ar, 0); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = '#ffb020';
  ctx.beginPath(); ctx.moveTo(ax - 8, ay); ctx.lineTo(ax + 8, ay); ctx.lineTo(ax, ay + 5); ctx.closePath(); ctx.fill();
  text(ctx, 'HDG ' + String(hdg).padStart(3, '0') + '°', ax, ay + ar + 18, 13, '#fff', 'center');

  // Speed tape (left) and altitude tape (right), below the top panels.
  tape(ctx, 62, 150, 210, kt, 20, 'KT', 'SPEED', (v) => String(Math.round(v)));
  tape(ctx, w - 62, 150, 210, altFt, 100, 'FT', 'ALT', (v) => String(Math.round(v)));

  // Compass strip along the bottom.
  const cy = h - 26;
  panel(ctx, w / 2 - 260, cy - 16, 520, 32, 0.5);
  ctx.save();
  ctx.beginPath(); ctx.rect(w / 2 - 260, cy - 16, 520, 32); ctx.clip();
  for (let d = -60; d <= 60; d += 5) {
    const deg = ((hdg + d) % 360 + 360) % 360;
    const x = w / 2 + d * 4.2;
    ctx.strokeStyle = d === 0 ? '#ffb020' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = d === 0 ? 2.5 : 1;
    ctx.beginPath(); ctx.moveTo(x, cy - 10); ctx.lineTo(x, cy + (d % 30 === 0 ? 10 : 4)); ctx.stroke();
    if (d % 30 === 0) {
      const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg] ?? String(deg).padStart(3, '0');
      text(ctx, label, x, cy + 14, 10, d === 0 ? '#ffb020' : '#dfeeff', 'center');
    }
  }
  ctx.restore();

  // Top-left: mission + objective progress.
  panel(ctx, 16, 14, 330, 66, 0.55);
  text(ctx, g.mission.name.toUpperCase(), 30, 38, 15, '#fff');
  text(ctx, g.objectiveText, 30, 60, 12, '#ffd25e', 'left', false);

  // Top-right: score, time, fuel, hull and throttle — one panel.
  panel(ctx, w - 246, 14, 230, 118, 0.55);
  text(ctx, 'SCORE ' + g.score.toLocaleString('en-US'), w - 30, 38, 15, '#fff', 'right');
  text(ctx, 'TIME ' + fmtTime(g.elapsed), w - 30, 60, 12, '#cfe6ff', 'right', false);
  // Fuel bar.
  bar(ctx, w - 230, 78, 110, 10, p.fuel / 100, p.fuel < 20 ? '#ff5252' : '#37c978', 'FUEL');
  bar(ctx, w - 110, 78, 94, 10, 1 - p.damage / 100, '#37c978', 'HULL');
  // Throttle bar under the fuel.
  bar(ctx, w - 230, 104, 214, 8, p.throttle, '#7ec8ff', 'THR');

  // Centre reticle + next-target guidance arrow.
  const rx = w / 2, ry = h * 0.44;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(rx, ry, 14, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rx - 22, ry); ctx.lineTo(rx - 8, ry);
  ctx.moveTo(rx + 8, ry); ctx.lineTo(rx + 22, ry);
  ctx.moveTo(rx, ry - 22); ctx.lineTo(rx, ry - 8);
  ctx.moveTo(rx, ry + 8); ctx.lineTo(rx, ry + 22);
  ctx.stroke();
  if (g.guideAngle !== null && g.phase === 'flying') {
    const a = g.guideAngle;
    const gx = rx + Math.sin(a) * 74, gy = ry - Math.cos(a) * 74;
    ctx.save();
    ctx.translate(gx, gy); ctx.rotate(a);
    ctx.fillStyle = '#ffb020';
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(8, 8); ctx.lineTo(-8, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
    text(ctx, g.guideLabel, gx, gy + 26, 11, '#ffd25e', 'center');
  }

  // Warnings.
  let warnY = 150;
  const warns = [];
  if (p.stalled) warns.push(['STALL — NOSE DOWN, ADD POWER', '#ff5252']);
  if (p.fuel > 0 && p.fuel < 18) warns.push(['LOW FUEL', '#ff5252']);
  if (p.alt < 60 && p.alt > 2 && p.verticalSpeed < -6) warns.push(['PULL UP', '#ffb020']);
  if (g.message) warns.push([g.message, '#7dff9a']);
  for (const [s, c] of warns) {
    const blink = c === '#ff5252' ? (Math.floor(g.time * 3) % 2 === 0 ? 1 : 0.35) : 1;
    ctx.globalAlpha = blink;
    text(ctx, s, w / 2, warnY, 17, c, 'center');
    ctx.globalAlpha = 1;
    warnY += 26;
  }

  // Score popups (floating +points).
  ctx.save();
  for (const pop of g.popups) {
    ctx.globalAlpha = clamp(pop.life, 0, 1);
    text(ctx, pop.text, pop.x, pop.y - (1.6 - pop.life) * 40, 16, '#7dff9a', 'center');
  }
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, color, label) {
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x, y, Math.max(0, w * clamp(frac, 0, 1)), h, 4); ctx.fill();
  text(ctx, label, x, y - 4, 9, '#9fd8ff', 'left');
}

export function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

// --- Screens drawn over the scene -------------------------------------

function overlay(ctx, w, h, alpha = 0.45) {
  ctx.fillStyle = `rgba(5, 10, 22, ${alpha})`;
  ctx.fillRect(0, 0, w, h);
}

export function drawTitle(ctx, g, w, h) {
  overlay(ctx, w, h, 0.32);
  text(ctx, 'SKY COURIER', w / 2, h * 0.3, 64, '#fff', 'center');
  text(ctx, 'A KESTREL K-7 FLIGHT GAME  ·  AUREA VALLEY', w / 2, h * 0.3 + 34, 15, '#ffd25e', 'center', false);
  text(ctx, 'Fly the rings. Drop the parcels. Land her gently.', w / 2, h * 0.3 + 66, 16, '#dfeeff', 'center', false);
  const bw = 560, bx = w / 2 - bw / 2, by = h * 0.46;
  g.missions.forEach((m, i) => {
    const y = by + i * 74;
    const sel = i === g.selectedMission;
    panel(ctx, bx, y, bw, 62, sel ? 0.85 : 0.5);
    if (sel) { ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 2; ctx.stroke(); }
    text(ctx, `${i + 1} · ${m.name.toUpperCase()}`, bx + 20, y + 26, 16, '#fff');
    text(ctx, m.tagline, bx + 20, y + 48, 12, '#cfe6ff', 'left', false);
    text(ctx, '›', bx + bw - 26, y + 34, 22, '#ffb020', 'center');
  });
  text(ctx, 'CLICK A MISSION OR PRESS 1 / 2 / 3, THEN ENTER TO FLY', w / 2, by + 3 * 74 + 26, 13, '#fff', 'center');
  text(ctx, 'UP / DOWN pitch · LEFT / RIGHT bank · SHIFT throttle up · CTRL throttle down · SPACE drop · P pause · M mute', w / 2, h - 34, 13, '#cfe6ff', 'center', false);
}

export function drawBriefing(ctx, g, w, h) {
  overlay(ctx, w, h, 0.55);
  const m = g.mission;
  panel(ctx, w / 2 - 320, h * 0.24, 640, 300, 0.9);
  text(ctx, m.name.toUpperCase(), w / 2, h * 0.24 + 48, 30, '#fff', 'center');
  text(ctx, m.tagline, w / 2, h * 0.24 + 80, 15, '#ffd25e', 'center', false);
  wrapText(ctx, m.blurb, w / 2 - 280, h * 0.24 + 118, 560, 20, 14, '#e8f2ff');
  text(ctx, 'PRESS ENTER TO TAKE OFF', w / 2, h * 0.24 + 268, 15, '#7dff9a', 'center');
}

export function drawResults(ctx, g, w, h) {
  overlay(ctx, w, h, 0.6);
  const won = g.phase === 'complete';
  panel(ctx, w / 2 - 330, h * 0.18, 660, 400, 0.92);
  text(ctx, won ? 'SORTIE COMPLETE' : g.phase === 'crashed' ? 'CRASHED' : 'OUT OF FUEL', w / 2, h * 0.18 + 56, 34, won ? '#7dff9a' : '#ff5252', 'center');
  text(ctx, g.mission.name + '  ·  ' + g.resultLine, w / 2, h * 0.18 + 90, 14, '#cfe6ff', 'center', false);
  const rows = [
    ['FINAL SCORE', g.score.toLocaleString('en-US')],
    ['RINGS THREADED', `${g.ringsHit} / ${g.ringsTotal}`],
    ['PARCELS ON TARGET', `${g.dropsHit} / ${g.dropsTotal}`],
    ['LANDING', g.landingText],
    ['TIME', fmtTime(g.elapsed)],
    ['BEST SCORE', (g.bestScore || 0).toLocaleString('en-US')],
  ];
  rows.forEach(([k, v], i) => {
    const y = h * 0.18 + 140 + i * 34;
    text(ctx, k, w / 2 - 280, y, 14, '#9fd8ff', 'left', false);
    text(ctx, v, w / 2 + 280, y, 14, '#fff', 'right');
  });
  text(ctx, 'ENTER — FLY AGAIN      ·      T — BACK TO MISSIONS', w / 2, h * 0.18 + 372, 13, '#ffd25e', 'center');
}

export function drawPaused(ctx, w, h) {
  overlay(ctx, w, h, 0.5);
  text(ctx, 'PAUSED', w / 2, h / 2 - 10, 40, '#fff', 'center');
  text(ctx, 'P to resume · R to restart the sortie', w / 2, h / 2 + 28, 14, '#cfe6ff', 'center', false);
}

function wrapText(ctx, s, x, y, maxW, lineH, size, color) {
  ctx.fillStyle = color;
  ctx.font = `400 ${size}px ${FONT}`;
  ctx.textAlign = 'left';
  const words = s.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else line = test;
  }
  ctx.fillText(line, x, yy);
}

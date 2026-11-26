// HUD for Steel Falcon: a 2D canvas overlay on top of the WebGL view.
// Speed and altitude tapes, compass strip, artificial horizon bar, radar,
// crosshair with lock diamond, throttle/ammo/score readouts, warnings and
// the title / pause / game-over screens. All drawn fresh each frame.

import { clamp, v3sub, v3len, v3norm, v3dot, dirFromYawPitch } from './math.js';
import { RUNWAY } from './terrain.js';

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  draw(world, hs, cam, w, h) {
    const c = this.ctx;
    c.clearRect(0, 0, w, h);
    c.save();
    if (hs.state === 'menu') { this.drawMenu(world, hs, w, h); c.restore(); return; }
    if (hs.state === 'over' || hs.state === 'win') {
      this.drawWorldOverlay(world, hs, cam, w, h, true);
      this.drawEnd(world, hs, w, h);
      c.restore();
      return;
    }
    this.drawWorldOverlay(world, hs, cam, w, h, false);
    if (hs.state === 'paused') this.drawPaused(w, h);
    c.restore();
  }

  // --- in-world overlay: crosshair, tapes, compass, radar, warnings ---
  drawWorldOverlay(world, hs, cam, w, h, dim) {
    const c = this.ctx;
    if (dim) { c.fillStyle = 'rgba(4, 10, 18, 0.45)'; c.fillRect(0, 0, w, h); }
    const cx = w / 2, cy = h / 2;

    // Hit flash vignette.
    if (hs.hitFlash > 0) {
      c.fillStyle = `rgba(255, 30, 20, ${0.22 * hs.hitFlash})`;
      c.fillRect(0, 0, w, h);
    }

    // Crosshair.
    c.strokeStyle = '#93d8a8';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(cx, cy, 14, 0, Math.PI * 2);
    c.moveTo(cx - 26, cy); c.lineTo(cx - 10, cy);
    c.moveTo(cx + 10, cy); c.lineTo(cx + 26, cy);
    c.moveTo(cx, cy - 26); c.lineTo(cx, cy - 10);
    c.moveTo(cx, cy + 10); c.lineTo(cx, cy + 26);
    c.stroke();
    c.fillStyle = '#93d8a8';
    c.beginPath(); c.arc(cx, cy, 2.5, 0, Math.PI * 2); c.fill();

    // Lock diamond around the locked target, projected to screen.
    if (hs.lockTarget) this.drawLock(world, hs, cam, w, h);

    // Artificial horizon bar under the crosshair, low enough to clear the jet.
    const rollRad = hs.rollDeg * Math.PI / 180;
    c.save();
    c.translate(cx, cy + 132);
    c.rotate(-rollRad);
    c.strokeStyle = 'rgba(125, 255, 154, 0.8)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-70, 0); c.lineTo(-24, 0);
    c.moveTo(24, 0); c.lineTo(70, 0);
    c.moveTo(0, -6); c.lineTo(0, 6);
    c.stroke();
    c.restore();

    this.drawTape(c, 46, h / 2 - 170, 340, 'SPD', hs.speedKmh, 10, 'km/h', 0, 1400);
    this.drawTape(c, w - 86, h / 2 - 170, 340, 'ALT', hs.alt, 50, 'm', 0, 2400);
    this.drawCompass(c, w, hs.heading);
    this.drawRadar(c, world, hs, w, h);
    this.drawReadouts(c, world, hs, w, h);
    this.drawWarnings(c, hs, w, h);
    if (hs.message) {
      c.font = 'bold 26px system-ui, sans-serif';
      c.textAlign = 'center';
      c.fillStyle = '#ffd94d';
      c.shadowColor = '#000'; c.shadowBlur = 6;
      c.fillText(hs.message, cx, 108);
      c.shadowBlur = 0;
    }
  }

  drawTape(c, x, y, height, label, value, step, unit, min, max) {
    c.save();
    c.fillStyle = 'rgba(4, 14, 22, 0.55)';
    c.fillRect(x, y, 40, height);
    c.strokeStyle = 'rgba(125, 255, 154, 0.5)';
    c.lineWidth = 1;
    c.strokeRect(x, y, 40, height);
    const cy = y + height / 2;
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'center';
    // Tick marks: values within view of the current value.
    const pxPerUnit = height / (step * 8);
    const base = Math.round(value / step) * step;
    for (let k = -4; k <= 4; k++) {
      const v = base + k * step;
      if (v < min || v > max) continue;
      const yy = cy - (v - value) * pxPerUnit;
      if (yy < y + 16 || yy > y + height - 10) continue; // keep labels inside the tape
      c.strokeStyle = 'rgba(147,216,168,0.7)';
      c.beginPath(); c.moveTo(x + 28, yy); c.lineTo(x + 40, yy); c.stroke();
      c.fillStyle = '#bfe8c8';
      c.fillText(String(v), x + 14, yy + 4);
    }
    // Centre value box.
    c.fillStyle = '#0a2a16';
    c.fillRect(x - 6, cy - 13, 52, 26);
    c.strokeStyle = '#93d8a8'; c.lineWidth = 1.5;
    c.strokeRect(x - 6, cy - 13, 52, 26);
    c.fillStyle = '#93d8a8';
    c.font = 'bold 15px system-ui, sans-serif';
    c.fillText(String(value), x + 20, cy + 5);
    c.fillStyle = '#93d8a8';
    c.font = 'bold 12px system-ui, sans-serif';
    c.fillText(label, x + 20, y - 8);
    c.font = '10px system-ui, sans-serif';
    c.fillStyle = '#9db8a6';
    c.fillText(unit, x + 20, y + height + 26);
    c.restore();
  }

  drawCompass(c, w, heading) {
    const cx = w / 2, y = 34;
    c.save();
    c.fillStyle = 'rgba(4, 14, 22, 0.55)';
    c.fillRect(cx - 190, y - 18, 380, 36);
    c.strokeStyle = 'rgba(125, 255, 154, 0.5)';
    c.strokeRect(cx - 190, y - 18, 380, 36);
    const names = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    c.font = '12px system-ui, sans-serif';
    c.textAlign = 'center';
    for (let d = 0; d < 360; d += 15) {
      let rel = ((d - heading + 540) % 360) - 180;
      if (Math.abs(rel) > 85) continue;
      const x = cx + rel * 2.1;
      const major = d % 45 === 0;
      c.strokeStyle = major ? '#93d8a8' : 'rgba(125,255,154,0.4)';
      c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x, y + (major ? -4 : 2)); c.stroke();
      if (major) {
        c.fillStyle = '#cfe9d6';
        c.fillText(names[d] || String(d), x, y - 6);
      }
    }
    // Centre caret + heading number.
    c.fillStyle = '#ffd94d';
    c.beginPath(); c.moveTo(cx - 7, y + 14); c.lineTo(cx + 7, y + 14); c.lineTo(cx, y + 22); c.fill();
    c.font = 'bold 13px system-ui, sans-serif';
    c.fillText(String(heading).padStart(3, '0') + '°', cx, y + 38);
    c.restore();
  }

  drawRadar(c, world, hs, w, h) {
    const rx = 118, ry = h - 118, R = 92;
    c.save();
    c.fillStyle = 'rgba(4, 14, 22, 0.6)';
    c.beginPath(); c.arc(rx, ry, R, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#93d8a8'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(rx, ry, R, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = 'rgba(125,255,154,0.35)';
    c.beginPath(); c.arc(rx, ry, R / 2, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(rx - R, ry); c.lineTo(rx + R, ry); c.stroke();
    c.beginPath(); c.moveTo(rx, ry - R); c.lineTo(rx, ry + R); c.stroke();
    const p = world.player;
    const range = 5200;
    const plot = (pos, colour, size, ring) => {
      const dx = pos[0] - p.pos[0], dz = pos[2] - p.pos[2];
      // Rotate so up on the radar is the player's heading.
      const yaw = p.yaw;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const rx2 = dx * fz - dz * fx;   // right component
      const ry2 = dx * fx + dz * fz;   // forward component
      const px = rx + clamp(rx2 / range, -1, 1) * (R - 8);
      const py = ry - clamp(ry2 / range, -1, 1) * (R - 8);
      c.fillStyle = colour;
      if (ring) { c.beginPath(); c.arc(px, py, size, 0, Math.PI * 2); c.stroke(); }
      else { c.beginPath(); c.arc(px, py, size, 0, Math.PI * 2); c.fill(); }
    };
    // Runway (white square), ring (yellow circle), enemies (red dots).
    plot([RUNWAY.x, 0, RUNWAY.z], '#ffffff', 4, false);
    if (!world.ring.passed) {
      c.strokeStyle = '#ffd94d'; c.lineWidth = 1.5;
      plot(world.ring.pos, '#ffd94d', 7, true);
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      plot(e.pos, '#ff4d3d', e === hs.lockTarget ? 7 : 4.5, false);
    }
    // Player wedge at the centre, pointing up.
    c.fillStyle = '#93d8a8';
    c.beginPath(); c.moveTo(rx, ry - 9); c.lineTo(rx - 6, ry + 7); c.lineTo(rx + 6, ry + 7); c.closePath(); c.fill();
    c.fillStyle = '#93d8a8';
    c.font = 'bold 11px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('RADAR', rx, ry + R + 16);
    c.restore();
  }

  drawReadouts(c, world, hs, w, h) {
    c.save();
    c.textAlign = 'left';
    c.font = 'bold 15px system-ui, sans-serif';
    c.fillStyle = '#e8f5ec';
    c.fillText('SCORE  ' + hs.score, w - 250, 46);
    c.fillText('KILLS  ' + hs.kills + ' / ' + hs.total, w - 250, 70);
    c.fillText('WAVE  ' + hs.wave, w - 250, 94);
    // Hull bar.
    this.drawBar(c, w - 250, 108, 200, 12, hs.hp / 100, hs.hp > 40 ? '#37d67a' : '#ff4d3d', 'HULL ' + hs.hp + '%');
    // Throttle bar.
    this.drawBar(c, w - 250, 132, 200, 12, hs.throttle, '#4db2ff', 'THR ' + Math.round(hs.throttle * 100) + '%');
    c.font = '14px system-ui, sans-serif';
    c.fillStyle = '#e8f5ec';
    c.fillText('GUN  ' + hs.ammo, w - 250, 176);
    c.fillText('MSL  ' + '◆'.repeat(Math.max(0, hs.missiles)) + '  x' + hs.missiles, w - 250, 198);
    // Pitch / roll readout, bottom right.
    c.textAlign = 'right';
    c.fillStyle = '#9db8a6';
    c.font = '12px system-ui, sans-serif';
    c.fillText('PITCH ' + hs.pitchDeg + '°   ROLL ' + hs.rollDeg + '°', w - 24, h - 24);
    c.restore();
  }

  drawBar(c, x, y, w, h, frac, colour, label) {
    c.fillStyle = 'rgba(4, 14, 22, 0.6)';
    c.fillRect(x, y, w, h);
    c.fillStyle = colour;
    c.fillRect(x, y, w * clamp(frac, 0, 1), h);
    c.strokeStyle = 'rgba(125,255,154,0.5)';
    c.strokeRect(x, y, w, h);
    c.fillStyle = '#e8f5ec';
    c.font = '10px system-ui, sans-serif';
    c.textAlign = 'left';
    c.fillText(label, x + 4, y + h - 3);
  }

  drawWarnings(c, hs, w, h) {
    const cx = w / 2;
    c.save();
    c.textAlign = 'center';
    c.font = 'bold 30px system-ui, sans-serif';
    let warn = '';
    if (hs.state === 'flying' && hs.stall) warn = 'STALL — NOSE DOWN, THROTTLE UP';
    else if (hs.state === 'flying' && hs.lowAlt) warn = 'PULL UP';
    if (warn) {
      const blink = Math.floor(Date.now() / 350) % 2 === 0;
      if (blink) {
        c.fillStyle = '#ff4d3d';
        c.shadowColor = '#000'; c.shadowBlur = 8;
        c.fillText(warn, cx, h - 170);
        c.shadowBlur = 0;
      }
    }
    if (hs.locked) {
      c.fillStyle = '#ff4d3d';
      c.font = 'bold 20px system-ui, sans-serif';
      c.fillText('LOCK', cx, h / 2 - 64);
    } else if (hs.lockTarget) {
      c.fillStyle = '#ffd94d';
      c.font = 'bold 20px system-ui, sans-serif';
      c.fillText('LOCKING ' + Math.round(hs.lockFrac * 100) + '%', cx, h / 2 - 64);
    }
    c.restore();
  }

  drawLock(world, hs, cam, w, h) {
    const c = this.ctx;
    const t = hs.lockTarget;
    if (!t) return;
    const p = projectToScreen(t.pos, cam, w, h);
    if (!p || p.z > 1) return;
    const size = clamp(9000 / p.dist, 22, 70);
    c.save();
    c.strokeStyle = hs.locked ? '#ff4d3d' : '#ffd94d';
    c.lineWidth = 2.5;
    const s = size, x = p.x, y = p.y;
    c.beginPath();
    c.moveTo(x - s, y - s + 12); c.lineTo(x - s, y - s); c.lineTo(x - s + 12, y - s);
    c.moveTo(x + s - 12, y - s); c.lineTo(x + s, y - s); c.lineTo(x + s, y - s + 12);
    c.moveTo(x + s, y + s - 12); c.lineTo(x + s, y + s); c.lineTo(x + s - 12, y + s);
    c.moveTo(x - s + 12, y + s); c.lineTo(x - s, y + s); c.lineTo(x - s, y + s - 12);
    c.stroke();
    c.restore();
  }

  drawMenu(world, hs, w, h) {
    const c = this.ctx;
    const cx = w / 2;
    c.fillStyle = 'rgba(4, 10, 18, 0.20)';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.fillStyle = '#e8f5ec';
    c.font = 'bold 64px system-ui, sans-serif';
    c.shadowColor = '#000'; c.shadowBlur = 14;
    c.fillText('STEEL FALCON', cx, h / 2 - 110);
    c.shadowBlur = 0;
    c.fillStyle = '#ffd94d';
    c.font = 'bold 22px system-ui, sans-serif';
    c.fillText('3D JET DOGFIGHT OVER THE COASTAL RANGE', cx, h / 2 - 72);
    c.fillStyle = '#cfe9d6';
    c.font = '17px system-ui, sans-serif';
    c.fillText('Six hostile jets are hunting over the valley. Wipe them all out.', cx, h / 2 - 34);
    c.fillText('Thread the gold ring for +250. Land gently on the runway to re-arm.', cx, h / 2 - 8);
    c.font = 'bold 24px system-ui, sans-serif';
    c.fillStyle = '#93d8a8';
    const blink = Math.floor(Date.now() / 500) % 2 === 0;
    if (blink) c.fillText('PRESS ENTER TO FLY', cx, h / 2 + 52);
    c.font = '15px system-ui, sans-serif';
    c.fillStyle = '#9db8a6';
    c.fillText('ARROWS steer · SHIFT / CTRL throttle · SPACE guns · F missile (needs lock) · P pause · M mute', cx, h / 2 + 96);
    c.fillText('Mouse steers too — move to aim, click to fire, right-click to launch a locked missile.', cx, h / 2 + 120);
  }

  drawPaused(w, h) {
    const c = this.ctx;
    c.fillStyle = 'rgba(4, 10, 18, 0.55)';
    c.fillRect(0, 0, w, h);
    c.textAlign = 'center';
    c.fillStyle = '#e8f5ec';
    c.font = 'bold 44px system-ui, sans-serif';
    c.fillText('PAUSED', w / 2, h / 2 - 10);
    c.font = '17px system-ui, sans-serif';
    c.fillStyle = '#9db8a6';
    c.fillText('Press P to resume · R to restart', w / 2, h / 2 + 28);
  }

  drawEnd(world, hs, w, h) {
    const c = this.ctx;
    const cx = w / 2;
    c.textAlign = 'center';
    if (hs.state === 'win') {
      c.fillStyle = '#ffd94d';
      c.font = 'bold 52px system-ui, sans-serif';
      c.fillText('SQUADRON WIPED OUT', cx, h / 2 - 60);
      c.fillStyle = '#e8f5ec';
      c.font = '22px system-ui, sans-serif';
      c.fillText('All hostiles down. The coast is yours, Falcon.', cx, h / 2 - 20);
    } else {
      c.fillStyle = '#ff4d3d';
      c.font = 'bold 52px system-ui, sans-serif';
      c.fillText('STEEL FALCON DOWN', cx, h / 2 - 60);
      c.fillStyle = '#e8f5ec';
      c.font = '22px system-ui, sans-serif';
      c.fillText('Your jet is gone — but the squadron still flies.', cx, h / 2 - 20);
    }
    c.fillStyle = '#e8f5ec';
    c.font = 'bold 24px system-ui, sans-serif';
    c.fillText('SCORE ' + hs.score + '   ·   KILLS ' + hs.kills, cx, h / 2 + 30);
    c.font = '17px system-ui, sans-serif';
    c.fillStyle = '#9db8a6';
    c.fillText('Press R or ENTER to fly again', cx, h / 2 + 66);
  }
}

// Project a world point to screen pixels using the camera's view-projection.
// Returns { x, y, z, dist } or null if behind the camera.
export function projectToScreen(pos, cam, w, h) {
  const rel = v3sub(pos, cam.pos);
  const dist = v3len(rel);
  const fwd = cam.fwd, right = cam.right, up = cam.up;
  const cx = v3dot(rel, right);
  const cy = v3dot(rel, up);
  const cz = v3dot(rel, fwd);
  if (cz < 1) return null;
  const f = 1 / Math.tan(1.15 / 2); // matches the renderer's fov
  const x = w / 2 + (cx / cz) * f * (h / 2);
  const y = h / 2 - (cy / cz) * f * (h / 2);
  return { x, y, z: cz, dist };
}

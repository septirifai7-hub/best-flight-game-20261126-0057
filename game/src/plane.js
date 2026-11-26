// The Kestrel K-7: flight model and the vector-drawn aircraft.
// One job: how the plane moves, and how it looks from the chase view.
import { CONFIG } from './config.js';
import { clamp, wrapAngle } from './random.js';

export function createPlane(mission) {
  return {
    alt: 0, // on the runway at take-off; the valley backdrop uses startAltitude
    speed: 0,
    heading: 0,        // rad; 0 = runway heading
    bank: 0,           // rad; visual + turn input
    pitch: 0,          // rad; + = nose up
    throttle: 0.55,
    fuel: mission.fuel,
    damage: 0,
    x: 0,              // lateral metres from the runway centreline
    distanceFlown: 0,  // metres along the course
    verticalSpeed: 0,  // m/s
    stalled: false,
    gearDown: false,
    propAngle: 0,
    airborne: false,
    onGround: true,
  };
}

// Advance the flight model one frame. `ctl` is the polled input.
export function updatePlane(p, ctl, dt, mission) {
  // Throttle: Shift/+ spools up, Ctrl/- spools down, 0.5/s.
  p.throttle = clamp(p.throttle + ctl.throttle * 0.5 * dt, 0, 1);
  // Gentle mouse steering: the mouse nudges the bank toward its side.
  let rollInput = ctl.roll;
  if (ctl.mouseActive) rollInput += clamp((ctl.mouseX - 0.5) * 1.2, -0.6, 0.6);
  rollInput = clamp(rollInput, -1, 1);

  const targetBank = rollInput * CONFIG.maxBank;
  p.bank += (targetBank - p.bank) * Math.min(1, dt * 3.2);
  const targetPitch = -ctl.pitch * CONFIG.maxPitch;
  p.pitch += (targetPitch - p.pitch) * Math.min(1, dt * 2.6);

  // Speed chases the throttle, bled by climbing and fed by descending.
  const targetSpeed = CONFIG.minSpeed + p.throttle * (CONFIG.maxSpeed - CONFIG.minSpeed);
  let speed = p.speed + (targetSpeed - p.speed) * Math.min(1, dt * 0.55);
  speed -= Math.sin(p.pitch) * 22 * dt;
  speed = clamp(speed, 0, CONFIG.maxSpeed * 1.08);
  p.speed = speed;

  // Turn: bank turns the heading, more at higher speed.
  const turn = p.bank * CONFIG.turnRate * (0.35 + 0.65 * (speed / CONFIG.cruiseSpeed));
  p.heading = wrapAngle(p.heading + turn * dt);
  p.x += Math.sin(p.heading) * speed * dt;
  p.distanceFlown += Math.cos(p.heading) * speed * dt;

  // Vertical: pitch and power decide climb or sink; stall drops the nose.
  p.stalled = p.airborne && speed < CONFIG.minSpeed * 0.92;
  let vs;
  if (!p.airborne) {
    vs = 0;
    if (speed > CONFIG.minSpeed * 1.05 && p.pitch > 0.05) {
      p.airborne = true; // rotate: the Kestrel lifts off the runway
    }
  } else if (p.stalled) {
    vs = -14;
    p.pitch += (-0.28 - p.pitch) * Math.min(1, dt * 1.5); // nose drops
  } else {
    vs = Math.sin(p.pitch) * speed * 0.85 + (p.throttle - 0.5) * CONFIG.climbRate;
    vs = clamp(vs, -CONFIG.sinkRate * 2.4, CONFIG.climbRate * 1.8);
  }
  p.verticalSpeed = vs;
  p.alt = Math.max(0, p.alt + vs * dt);

  // Fuel: full throttle drinks it; idling sips.
  const burn = CONFIG.fuelBurnIdle + (CONFIG.fuelBurn - CONFIG.fuelBurnIdle) * p.throttle;
  p.fuel = Math.max(0, p.fuel - burn * dt);
  if (p.fuel <= 0) p.throttle = Math.max(0, p.throttle - dt * 0.4); // flame-out

  // Gear: down automatically when slow and low, up once climbing away.
  if (!p.gearDown && p.alt < 90 && speed < CONFIG.cruiseSpeed * 0.75) p.gearDown = true;
  if (p.gearDown && p.alt > 160) p.gearDown = false;
  p.propAngle += dt * (6 + p.throttle * 42);
  return p;
}

// Draw the Kestrel from behind and slightly above, banked with the turn.
// The plane is drawn in screen space at the centre of the chase view.
export function drawPlane(ctx, p, w, h, time) {
  const cx = w / 2;
  const cy = h * 0.56;
  const S = (w / 1280) * (1 + clamp(p.speed / CONFIG.maxSpeed, 0, 1) * 0.06);
  ctx.save();
  ctx.translate(cx, cy + p.pitch * 60);
  ctx.rotate(p.bank * 0.85);
  ctx.scale(S, S);

  // Speed lines when fast.
  if (p.speed > 90) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.5;
    const n = Math.floor((p.speed - 90) / 14);
    for (let i = 0; i < n; i++) {
      const y = -120 + ((i * 53 + Math.floor(time * 900)) % 260);
      ctx.beginPath();
      ctx.moveTo(-260 - (i % 3) * 30, y); ctx.lineTo(-190 - (i % 3) * 30, y);
      ctx.moveTo(190 + (i % 3) * 30, y); ctx.lineTo(260 + (i % 3) * 30, y);
      ctx.stroke();
    }
  }

  // Main wing (swept, two-tone) and tailplane.
  ctx.fillStyle = '#e8542f';
  ctx.beginPath();
  ctx.moveTo(-150, 6); ctx.lineTo(-28, -14); ctx.lineTo(28, -14); ctx.lineTo(150, 6);
  ctx.lineTo(138, 20); ctx.lineTo(30, 8); ctx.lineTo(-30, 8); ctx.lineTo(-138, 20);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f6f1e3';
  ctx.beginPath();
  ctx.moveTo(-150, 6); ctx.lineTo(-28, -14); ctx.lineTo(28, -14); ctx.lineTo(150, 6);
  ctx.lineTo(146, 11); ctx.lineTo(0, -6); ctx.lineTo(-146, 11);
  ctx.closePath(); ctx.fill();
  // Wing-tip nav lights: red left, green right.
  ctx.fillStyle = '#ff2d2d';
  ctx.beginPath(); ctx.arc(-148, 12, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2dff5e';
  ctx.beginPath(); ctx.arc(148, 12, 4, 0, Math.PI * 2); ctx.fill();

  // Tail fin and tailplane.
  ctx.fillStyle = '#e8542f';
  ctx.beginPath();
  ctx.moveTo(-8, -78); ctx.lineTo(10, -78); ctx.lineTo(16, -34); ctx.lineTo(-10, -34);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c7431f';
  ctx.beginPath();
  ctx.moveTo(-58, -30); ctx.lineTo(58, -30); ctx.lineTo(46, -20); ctx.lineTo(-46, -20);
  ctx.closePath(); ctx.fill();

  // Fuselage: tapered body, cream top over orange, with a shaded belly.
  const body = ctx.createLinearGradient(0, -30, 0, 26);
  body.addColorStop(0, '#fdf6e3');
  body.addColorStop(0.45, '#f2a541');
  body.addColorStop(1, '#c7431f');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(0, -84);
  ctx.quadraticCurveTo(20, -70, 22, -30);
  ctx.quadraticCurveTo(24, 6, 12, 22);
  ctx.lineTo(-12, 22);
  ctx.quadraticCurveTo(-24, 6, -22, -30);
  ctx.quadraticCurveTo(-20, -70, 0, -84);
  ctx.closePath(); ctx.fill();
  // Belly stripe and registration.
  ctx.fillStyle = '#26324a';
  ctx.fillRect(-22, 2, 44, 4);
  ctx.fillStyle = '#26324a';
  ctx.font = 'bold 9px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('K-7', 0, 17);

  // Cockpit glass.
  const glass = ctx.createLinearGradient(0, -64, 0, -38);
  glass.addColorStop(0, '#bfe6ff');
  glass.addColorStop(1, '#2f6ea8');
  ctx.fillStyle = glass;
  ctx.beginPath();
  ctx.ellipse(0, -51, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath(); ctx.ellipse(-4, -56, 3, 5, -0.4, 0, Math.PI * 2); ctx.fill();

  // Propeller: blurred disc + two blades at the spin angle.
  ctx.save();
  ctx.translate(0, -84);
  ctx.rotate(p.propAngle);
  ctx.fillStyle = 'rgba(40,40,50,0.28)';
  ctx.beginPath(); ctx.ellipse(0, 0, 7, 46, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2b2f38';
  ctx.beginPath(); ctx.ellipse(0, -34, 4, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 34, 4, 16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#e8b64c';
  ctx.beginPath(); ctx.arc(0, -84, 5, 0, Math.PI * 2); ctx.fill();

  // Landing gear when down.
  if (p.gearDown) {
    ctx.strokeStyle = '#2b2f38'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-14, 20); ctx.lineTo(-18, 34); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 20); ctx.lineTo(18, 34); ctx.stroke();
    ctx.fillStyle = '#1c1f26';
    ctx.beginPath(); ctx.arc(-18, 36, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(18, 36, 5, 0, Math.PI * 2); ctx.fill();
  }

  // Tail strobe: a blink every second.
  if (Math.floor(time * 1.4) % 2 === 0) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, -80, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

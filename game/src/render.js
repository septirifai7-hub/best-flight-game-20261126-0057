// WebGL renderer for Steel Falcon: one lambert-ish shader with distance
// fog and a sky gradient, drawing terrain, water, the airbase, the target
// ring, jets, missiles, bullets, particles and clouds. The camera chases
// the player's jet.

import { MeshBuilder, createGL, createProgram } from './gl.js';
import { mat4LookAt, mat4Model, mat4Multiply, mat4Perspective, v3, v3add, v3dist, v3len, v3norm, v3scale, v3sub } from './math.js';
import { buildAirbaseMesh, buildRingMesh, buildTerrainMesh, buildWaterMesh } from './terrain.js';
import { buildCloudMesh, buildColoredCubeMesh, buildCubeMesh, buildJetMesh, buildMissileMesh, buildPuffMesh } from './jet.js';

const VS = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vCol;
varying vec3 vNor;
varying vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNor = mat3(uModel) * aNor;
  vCol = aCol;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `
precision mediump float;
varying vec3 vCol;
varying vec3 vNor;
varying vec3 vWorld;
uniform vec3 uCam;
uniform vec3 uSun;
uniform vec3 uFogCol;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEmissive;
void main() {
  vec3 n = normalize(vNor);
  float diff = max(dot(n, normalize(uSun)), 0.0);
  float amb = 0.42;
  // Warm afternoon sunlight: the diffuse term carries a warm tint,
  // the ambient stays neutral so shadows read cool, like real daylight.
  vec3 warm = vec3(1.0, 0.92, 0.78);
  vec3 col = vCol * (amb + 0.58 * diff * warm) + vCol * uEmissive;
  float d = distance(vWorld, uCam);
  float f = clamp((d - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  gl_FragColor = vec4(mix(col, uFogCol, f), 1.0);
}`;

const SKY_TOP = [0.26, 0.48, 0.73];
const SKY_HORIZON = [0.83, 0.88, 0.93];

export class Renderer {
  constructor(canvas, seed) {
    this.gl = createGL(canvas);
    this.canvas = canvas;
    this.seed = seed;
    this.prog = createProgram(this.gl, VS, FS);
    const gl = this.gl;
    this.loc = {
      aPos: gl.getAttribLocation(this.prog, 'aPos'),
      aNor: gl.getAttribLocation(this.prog, 'aNor'),
      aCol: gl.getAttribLocation(this.prog, 'aCol'),
      uMVP: gl.getUniformLocation(this.prog, 'uMVP'),
      uModel: gl.getUniformLocation(this.prog, 'uModel'),
      uCam: gl.getUniformLocation(this.prog, 'uCam'),
      uSun: gl.getUniformLocation(this.prog, 'uSun'),
      uFogCol: gl.getUniformLocation(this.prog, 'uFogCol'),
      uFogNear: gl.getUniformLocation(this.prog, 'uFogNear'),
      uFogFar: gl.getUniformLocation(this.prog, 'uFogFar'),
      uEmissive: gl.getUniformLocation(this.prog, 'uEmissive'),
    };
    this.terrain = buildTerrainMesh(gl, MeshBuilder, seed);
    this.water = buildWaterMesh(gl, MeshBuilder);
    this.airbase = buildAirbaseMesh(gl, MeshBuilder);
    this.ring = buildRingMesh(gl, MeshBuilder);
    this.jet = buildJetMesh(gl, false);
    this.enemyJet = buildJetMesh(gl, true);
    this.missile = buildMissileMesh(gl);
    this.cube = buildCubeMesh(gl);
    this.cloud = buildCloudMesh(gl);
    // Coloured cubes: warm tracer rounds, dark-orange fire, dark smoke.
    this.tracer = buildColoredCubeMesh(gl, 1.0, 0.78, 0.35);
    this.fire = buildColoredCubeMesh(gl, 0.82, 0.32, 0.08);
    this.smokeCube = buildColoredCubeMesh(gl, 0.28, 0.27, 0.26);
    // Soft sphere puffs for smoke and missile trails.
    this.puff = buildPuffMesh(gl, 0.78, 0.78, 0.79);
    // The sun: a pale sphere drawn far away along the sun direction, with
    // a larger faint halo sphere for a soft glare. Fog is switched off
    // for it so it stays bright against the haze.
    const sunMb = new MeshBuilder();
    sunMb.sphere(0, 0, 0, 1, 1, 1, 1.0, 0.96, 0.84);
    this.sun = sunMb.build(gl);
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  drawMesh(mesh, model, mvp, emissive = 0) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.loc.aNor);
    gl.vertexAttribPointer(this.loc.aNor, 3, gl.FLOAT, false, stride, 12);
    gl.enableVertexAttribArray(this.loc.aCol);
    gl.vertexAttribPointer(this.loc.aCol, 3, gl.FLOAT, false, stride, 24);
    gl.uniformMatrix4fv(this.loc.uModel, false, new Float32Array(model));
    gl.uniformMatrix4fv(this.loc.uMVP, false, new Float32Array(mvp));
    gl.uniform1f(this.loc.uEmissive, emissive);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  render(world, camPos, camTarget, camUp, time) {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    // Sky: clear colour blends horizon blue to deeper blue with altitude.
    const altFrac = Math.min(1, Math.max(0, (camPos[1] - 100) / 1200));
    const sky = [
      SKY_HORIZON[0] + (SKY_TOP[0] - SKY_HORIZON[0]) * altFrac,
      SKY_HORIZON[1] + (SKY_TOP[1] - SKY_HORIZON[1]) * altFrac,
      SKY_HORIZON[2] + (SKY_TOP[2] - SKY_HORIZON[2]) * altFrac,
    ];
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(this.prog);
    const proj = mat4Perspective(1.15, w / h, 1, 20000);
    const view = mat4LookAt(camPos, camTarget, camUp);
    const vp = mat4Multiply(proj, view);
    gl.uniform3fv(this.loc.uCam, new Float32Array(camPos));
    gl.uniform3fv(this.loc.uSun, new Float32Array(v3norm([0.5, 0.75, 0.35])));
    gl.uniform3fv(this.loc.uFogCol, new Float32Array(sky));
    gl.uniform1f(this.loc.uFogNear, 1000);
    gl.uniform1f(this.loc.uFogFar, 12000);

    const ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    // Sun disc + halo, drawn first so terrain can cover it at the horizon.
    const sunDir = v3norm([0.5, 0.75, 0.35]);
    const sunPos = v3add(camPos, v3scale(sunDir, 14000));
    gl.uniform1f(this.loc.uFogFar, 1e9);
    gl.disable(gl.DEPTH_TEST);
    const haloModel = mat4Model(sunPos, 0, 0, 0, 1100);
    this.drawMesh(this.sun, haloModel, mat4Multiply(vp, haloModel), 0.35);
    const sunModel = mat4Model(sunPos, 0, 0, 0, 420);
    this.drawMesh(this.sun, sunModel, mat4Multiply(vp, sunModel), 1.6);
    gl.enable(gl.DEPTH_TEST);
    gl.uniform1f(this.loc.uFogFar, 12000);

    this.drawMesh(this.terrain, ident, vp);
    this.drawMesh(this.water, ident, vp);
    this.drawMesh(this.airbase, ident, vp);

    // Target ring, gently pulsing, only while unpassed.
    if (!world.ring.passed) {
      const pulse = 0.25 + 0.15 * Math.sin(time * 3);
      const ringModel = mat4Model(world.ring.pos, 0.6, 0, 0, 1);
      this.drawMesh(this.ring, ringModel, mat4Multiply(vp, ringModel), pulse);
    }

    // Player jet (skip while crashed / on the game-over screen). The
    // afterburner flames are part of the jet mesh itself — no extra glow
    // geometry, so nothing reads as a flat banner behind the jet.
    const p = world.player;
    if (!p.crashed) {
      const model = mat4Model(p.pos, p.yaw, p.pitch, p.roll, 1);
      this.drawMesh(this.jet, model, mat4Multiply(vp, model));
    }

    // Enemy jets.
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const model = mat4Model(e.pos, e.yaw, e.pitch, e.roll, 1);
      this.drawMesh(this.enemyJet, model, mat4Multiply(vp, model));
    }

    // Missiles with smoke trails drawn as small soft puffs.
    for (const m of world.missiles) {
      const yaw = Math.atan2(-m.vel[0], -m.vel[2]);
      const pitch = Math.asin(Math.max(-1, Math.min(1, m.vel[1] / (v3len(m.vel) || 1))));
      const model = mat4Model(m.pos, yaw, pitch, 0, 1);
      this.drawMesh(this.missile, model, mat4Multiply(vp, model), 0.25);
      // Smoke trail: small puffs interpolated between recorded points so
      // the trail reads as one thin plume, tapering toward the missile
      // (new smoke is thin, old smoke spreads) and never as a string of
      // big beads. Points closer than 30 m to the camera are skipped —
      // they would otherwise fill the frame as giant spheres.
      for (let ti = 0; ti < m.trail.length - 1; ti++) {
        const a = m.trail[ti], b = m.trail[ti + 1];
        const grow = 0.25 + (ti / Math.max(1, m.trail.length - 1)) * 0.45;
        for (let s = 0; s < 4; s++) {
          const t = s / 4;
          const tp = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
          if (v3dist(tp, camPos) < 30) continue;
          const tm = mat4Model(tp, 0, 0, 0, 1);
          const ts = scaleModel(tm, grow, grow, grow);
          this.drawMesh(this.puff, ts, mat4Multiply(vp, ts), 0.05);
        }
      }
    }

    // Bullets: warm tracer streaks along their velocity.
    for (const b of world.bullets) {
      const yaw = Math.atan2(-b.vel[0], -b.vel[2]);
      const pitch = Math.asin(Math.max(-1, Math.min(1, b.vel[1] / (v3len(b.vel) || 1))));
      const model = mat4Model(b.pos, yaw, pitch, 0, 1);
      const sm = scaleModel(model, 0.4, 0.4, 12);
      this.drawMesh(this.tracer, sm, mat4Multiply(vp, sm), 1.4);
    }

    // Particles: fire as dark-orange cubes that shrink, smoke as soft
    // grey puffs that grow. Colours come from the mesh, not the particle.
    for (const pt of world.particles) {
      const frac = 1 - pt.life / pt.maxLife;
      const s = pt.size * (pt.smoke ? 1 + pt.life * 0.8 : frac * 0.9 + 0.1);
      const model = mat4Model(pt.pos, 0, 0, 0, 1);
      const sm = scaleModel(model, s, s, s);
      if (pt.smoke) this.drawMesh(this.puff, sm, mat4Multiply(vp, sm), 0.05);
      else this.drawMesh(this.fire, sm, mat4Multiply(vp, sm), 0.9 * frac);
    }

    // Clouds: big soft puffs drifting slowly. A little emissive lifts
    // their undersides so they read as sunlit cloud, not dark slabs.
    for (const c of world.clouds) {
      const cx = c.x + time * 2;
      const model = mat4Model([cx, c.y, c.z], 0, 0, 0, c.s);
      this.drawMesh(this.cloud, model, mat4Multiply(vp, model), 0.3);
    }
  }
}

// Scale a model matrix's basis vectors (non-uniform scale).
function scaleModel(m, sx, sy, sz) {
  const o = m.slice();
  o[0] *= sx; o[1] *= sx; o[2] *= sx;
  o[4] *= sy; o[5] *= sy; o[6] *= sy;
  o[8] *= sz; o[9] *= sz; o[10] *= sz;
  return o;
}
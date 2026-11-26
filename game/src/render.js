// WebGL renderer for Steel Falcon — one lit shader with warm afternoon
// sun, cool ambient shadows and distance haze, a gradient sky dome with
// a sun disc, and per-draw tinting so one white puff mesh can be fire,
// smoke or a missile trail. Draws terrain, sea, airbase, the gold ring
// with its light beacon, jets (with afterburner), missiles, tracers,
// particles and drifting cloud clusters. No textures, no network.

import { MeshBuilder, createGL, createProgram } from './gl.js';
import { mat4LookAt, mat4Model, mat4Multiply, mat4Perspective, v3, v3add, v3dist, v3len, v3norm, v3scale, v3sub } from './math.js';
import { buildAirbaseMesh, buildBeaconMesh, buildBeaconPadMesh, buildRingMesh, buildTerrainMesh, buildWaterMesh, terrainHeight } from './terrain.js';
import { buildCloudMesh, buildColoredCubeMesh, buildCubeMesh, buildFlameMesh, buildJetMesh, buildMissileMesh, buildPuffMesh, buildTracerMesh } from './jet.js';

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
  vNor = normalize(mat3(uModel) * aNor);
  vCol = aCol;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `
precision mediump float;
varying vec3 vCol;
varying vec3 vNor;
varying vec3 vWorld;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform vec3 uAmbCol;
uniform vec3 uFogCol;
uniform vec3 uCamPos;
uniform vec3 uTint;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogAmt;
uniform float uAlpha;
void main() {
  vec3 n = normalize(vNor);
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 viewDir = normalize(uCamPos - vWorld);
  float spec = pow(max(dot(reflect(-uSunDir, n), viewDir), 0.0), 28.0) * 0.45;
  vec3 lit = vCol * uTint * (uAmbCol + uSunCol * diff) + uSunCol * spec * 0.35;
  float dist = distance(uCamPos, vWorld);
  float f = smoothstep(uFogNear, uFogFar, dist) * uFogAmt;
  vec3 col = mix(lit, uFogCol, f);
  gl_FragColor = vec4(col, uAlpha);
}`;

// Sky dome: a big sphere centred on the camera, coloured by height —
// pale warm haze at the horizon, deep blue above. Drawn first with
// depth writes off so it can never hide the terrain.
function buildSkyMesh(gl) {
  const mb = new MeshBuilder();
  const R = 8800;
  const lat = 10, lon = 20;
  const start = 0;
  for (let j = 0; j <= lat; j++) {
    const phi = (j / lat) * Math.PI * 0.5; // upper hemisphere only
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let i = 0; i <= lon; i++) {
      const th = (i / lon) * Math.PI * 2;
      const st = Math.sin(th), ct = Math.cos(th);
      const ny = cp; // 1 at zenith, 0 at horizon
      const t = Math.pow(Math.max(0, ny), 0.65);
      const r = 0.80 + (0.22 - 0.80) * t;
      const g = 0.86 + (0.45 - 0.86) * t;
      const b = 0.93 + (0.76 - 0.93) * t;
      mb.vertex(sp * ct * R, cp * R - 200, sp * st * R, 0, 1, 0, r, g, b);
    }
  }
  const row = lon + 1;
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const a = start + j * row + i, b = a + 1, c = a + row, d = c + 1;
      mb.idx.push(a, b, c, b, d, c);
    }
  }
  return mb.build(gl);
}

// A flat sun disc (plus a wider soft halo) placed far away in the sun's
// direction; the renderer positions it relative to the camera.
function buildSunMesh(gl, radius, r, g, b) {
  const mb = new MeshBuilder();
  const N = 24;
  const centre = mb.vertex(0, 0, 0, 0, 0, 1, r, g, b);
  const ring = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    ring.push(mb.vertex(Math.cos(a) * radius, Math.sin(a) * radius, 0, 0, 0, 1, r, g, b));
  }
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    mb.tri(centre, ring[i], ring[j]);
  }
  return mb.build(gl);
}

// Yaw/pitch that point a -Z-forward model along a velocity vector.
function yawPitchFromVel(v) {
  const len = v3len(v) || 1;
  const yaw = Math.atan2(-v[0], -v[2]);
  const pitch = Math.asin(Math.max(-1, Math.min(1, v[1] / len)));
  return [yaw, pitch];
}

export class Renderer {
  constructor(canvas, seed) {
    this.canvas = canvas;
    this.gl = createGL(canvas);
    this.seed = seed;
    this.w = 1280;
    this.h = 800;
    const gl = this.gl;
    this.prog = createProgram(gl, VS, FS);
    gl.useProgram(this.prog);
    this.loc = {};
    for (const name of ['aPos', 'aNor', 'aCol']) {
      this.loc[name] = gl.getAttribLocation(this.prog, name);
    }
    for (const name of ['uMVP', 'uModel', 'uSunDir', 'uSunCol', 'uAmbCol', 'uFogCol', 'uCamPos', 'uTint', 'uFogNear', 'uFogFar', 'uFogAmt', 'uAlpha']) {
      this.loc[name] = gl.getUniformLocation(this.prog, name);
    }
    // Warm afternoon sun, low from the west-southwest.
    this.sunDir = v3norm(v3(-0.55, 0.52, -0.42));
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.78, 0.85, 0.92, 1);

    this.terrain = buildTerrainMesh(gl, MeshBuilder, seed);
    this.water = buildWaterMesh(gl, MeshBuilder);
    this.airbase = buildAirbaseMesh(gl, MeshBuilder);
    this.ring = buildRingMesh(gl, MeshBuilder);
    const ringGround = terrainHeight(-600, -2600, seed);
    this.beacon = buildBeaconMesh(gl, MeshBuilder, ringGround, 820);
    this.beaconPad = buildBeaconPadMesh(gl, MeshBuilder);
    this.ringGround = ringGround;
    this.jet = buildJetMesh(gl, false);
    this.enemyJet = buildJetMesh(gl, true);
    this.flame = buildFlameMesh(gl);
    this.missile = buildMissileMesh(gl);
    this.puff = buildPuffMesh(gl);
    this.tracer = buildTracerMesh(gl);
    this.cube = buildCubeMesh(gl);
    this.coloredCube = buildColoredCubeMesh(gl);
    this.cloud = buildCloudMesh(gl);
    this.sky = buildSkyMesh(gl);
    this.sun = buildSunMesh(gl, 320, 2.6, 2.3, 1.7);
    this.sunHalo = buildSunMesh(gl, 950, 1.15, 0.95, 0.62);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    // The drawing buffer must match the display size: without this the
    // canvas stays at its 300x150 default and only a corner of the view
    // renders, stretched over the whole screen.
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  drawMesh(mesh, model, viewProj, tint, fogAmt, alpha) {
    const gl = this.gl;
    const mvp = mat4Multiply(viewProj, model);
    gl.uniformMatrix4fv(this.loc.uMVP, false, new Float32Array(mvp));
    gl.uniformMatrix4fv(this.loc.uModel, false, new Float32Array(model));
    gl.uniform3fv(this.loc.uTint, new Float32Array(tint || [1, 1, 1]));
    gl.uniform1f(this.loc.uFogAmt, fogAmt === undefined ? 1 : fogAmt);
    gl.uniform1f(this.loc.uAlpha, alpha === undefined ? 1 : alpha);
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    const stride = 9 * 4;
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.loc.aNor);
    gl.vertexAttribPointer(this.loc.aNor, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(this.loc.aCol);
    gl.vertexAttribPointer(this.loc.aCol, 3, gl.FLOAT, false, stride, 6 * 4);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  render(world, camPos, camTarget, camUp, time) {
    const gl = this.gl;
    const view = mat4LookAt(camPos, camTarget, camUp);
    const proj = mat4Perspective(1.15, this.w / this.h, 0.5, 20000);
    const viewProj = mat4Multiply(proj, view);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniform3fv(this.loc.uSunDir, new Float32Array(this.sunDir));
    gl.uniform3fv(this.loc.uSunCol, new Float32Array([1.0, 0.90, 0.74]));
    gl.uniform3fv(this.loc.uAmbCol, new Float32Array([0.34, 0.38, 0.46]));
    gl.uniform3fv(this.loc.uFogCol, new Float32Array([0.76, 0.83, 0.90]));
    gl.uniform3fv(this.loc.uCamPos, new Float32Array(camPos));
    gl.uniform1f(this.loc.uFogNear, 1100);
    gl.uniform1f(this.loc.uFogFar, 11500);

    // --- Sky dome + sun, drawn first without depth writes. ---
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    const skyModel = mat4Model([camPos[0], camPos[1], camPos[2]], 0, 0, 0, 1);
    this.drawMesh(this.sky, skyModel, viewProj, [1.25, 1.25, 1.25], 0, 1);
    // Sun disc + halo, billboarded toward the camera.
    const sunPos = v3add(camPos, v3scale(this.sunDir, 8200));
    const sunRight = v3norm(v3sub(sunPos, camPos));
    const sunYaw = Math.atan2(-this.sunDir[0], -this.sunDir[2]);
    const sunPitch = Math.asin(Math.max(-1, Math.min(1, this.sunDir[1])));
    const sunModel = mat4Model(sunPos, sunYaw, sunPitch, 0, 1);
    this.drawMesh(this.sunHalo, sunModel, viewProj, [1, 1, 1], 0, 0.30);
    this.drawMesh(this.sun, sunModel, viewProj, [1, 1, 1], 0, 1);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // --- World ---
    this.drawMesh(this.terrain, mat4Model([0, 0, 0], 0, 0, 0, 1), viewProj);
    this.drawMesh(this.water, mat4Model([0, 0, 0], 0, 0, 0, 1), viewProj);
    this.drawMesh(this.airbase, mat4Model([0, 0, 0], 0, 0, 0, 1), viewProj);

    // --- Target ring + beacon (only while the ring is still unpassed). ---
    if (world.ring && !world.ring.passed) {
      const pulse = 1 + 0.02 * Math.sin(time * 2.4);
      this.drawMesh(this.ring, mat4Model(world.ring.pos, 0, 0, 0, pulse), viewProj);
      gl.depthMask(false);
      this.drawMesh(this.beacon, mat4Model([world.ring.pos[0], 0, world.ring.pos[2]], 0, 0, 0, 1), viewProj, [1, 1, 1], 0.4, 0.55);
      gl.depthMask(true);
      this.drawMesh(this.beaconPad, mat4Model([world.ring.pos[0], this.ringGround + 2, world.ring.pos[2]], 0, 0, 0, 1), viewProj, [1, 1, 1], 0, 0.9);
    }

    // --- Jets ---
    const p = world.player;
    this.drawMesh(this.jet, mat4Model(p.pos, p.yaw, p.pitch, p.roll, 1), viewProj);
    if (p.throttle > 0.6 && !p.crashed) {
      const fs = 0.6 + p.throttle * 0.35;
      this.drawMesh(this.flame, mat4Model(p.pos, p.yaw, p.pitch, p.roll, fs), viewProj, [1, 1, 1], 0, 0.92);
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      this.drawMesh(this.enemyJet, mat4Model(e.pos, e.yaw, e.pitch, e.roll, 1), viewProj);
      if (e.speed > 170) {
        this.drawMesh(this.flame, mat4Model(e.pos, e.yaw, e.pitch, e.roll, 0.7), viewProj, [1, 1, 1], 0, 0.92);
      }
    }

    // --- Missiles + their smoke trails ---
    for (const m of world.missiles) {
      const [yaw, pitch] = yawPitchFromVel(m.vel);
      this.drawMesh(this.missile, mat4Model(m.pos, yaw, pitch, 0, 1), viewProj);
      for (let i = 0; i < m.trail.length; i += 2) {
        const tp = m.trail[i];
        const age = (m.trail.length - i) / m.trail.length;
        // Thin wispy trail: small puffs that grow and fade with age.
        this.drawMesh(this.puff, mat4Model(tp, 0, 0, 0, 0.6 + age * 1.1), viewProj, [0.95, 0.95, 0.97], 1, 0.55);
      }
    }

    // --- Tracers: long thin bright streaks along each bullet's path. ---
    for (const b of world.bullets) {
      const [yaw, pitch] = yawPitchFromVel(b.vel);
      const mid = [b.pos[0] - b.vel[0] * 0.008, b.pos[1] - b.vel[1] * 0.008, b.pos[2] - b.vel[2] * 0.008];
      this.drawMesh(this.tracer, mat4Model(mid, yaw, pitch, 0, 1), viewProj, [2.6, 1.7, 0.35], 0, 1);
    }

    // --- Particles: fire glows hot, smoke is pale and grows as it ages. ---
    for (const pt of world.particles) {
      const frac = pt.maxLife ? pt.life / pt.maxLife : 0;
      if (pt.smoke) {
        const s = pt.size * (0.7 + frac * 1.1);
        this.drawMesh(this.puff, mat4Model(pt.pos, 0, 0, 0, s), viewProj, [pt.colour[0] * 3.4, pt.colour[1] * 3.4, pt.colour[2] * 3.4], 1, 0.85);
      } else {
        const s = pt.size * (1 - frac * 0.45);
        this.drawMesh(this.puff, mat4Model(pt.pos, 0, 0, 0, Math.max(0.4, s)), viewProj, [pt.colour[0] * 1.5, pt.colour[1] * 1.5, pt.colour[2] * 1.5], 0, 1);
      }
    }

    // --- Clouds: drifting clusters, far ones faded by the haze. ---
    // Bright tint: cloud undersides are lit only by ambient light, so
    // without the lift they render as dark grey slabs.
    for (let i = 0; i < world.clouds.length; i++) {
      const c = world.clouds[i];
      const drift = Math.sin(time * 0.008 + i * 1.7) * 120;
      const bob = Math.sin(time * 0.05 + i * 2.3) * 12;
      this.drawMesh(this.cloud, mat4Model([c.x + drift, c.y + bob, c.z], 0, 0, 0, c.s), viewProj, [1.9, 1.9, 1.9]);
    }
  }
}

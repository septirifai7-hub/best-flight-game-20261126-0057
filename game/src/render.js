// WebGL renderer for Steel Falcon — one textured shader with a warm
// afternoon sun, Blinn specular highlights (canopy glint, sea sparkle),
// distance haze and a gradient sky dome with a sun disc. Draws the
// textured terrain, sea with animated waves, roads, forests, the
// airbase, the gold ring with its light beacon, jets with blob shadows
// and afterburners, missiles with continuous smoke ribbons, tracers,
// explosion fireballs and smoke, and layered billboard clouds. No
// external assets, no network — every texture is painted at load time.

import { MeshBuilder, createGL, createProgram } from './gl.js';
import { mat4LookAt, mat4Model, mat4Multiply, mat4Perspective, v3, v3add, v3dist, v3len, v3norm, v3scale, v3sub } from './math.js';
import { buildAirbaseMesh, buildBeaconMesh, buildBeaconPadMesh, buildFoamMesh, buildRingMesh, buildRoadMesh, buildTerrainMesh, buildTreesMesh, buildWaterMesh, terrainHeight } from './terrain.js';
import { buildCloudBillboardMesh, buildColoredCubeMesh, buildCubeMesh, buildFlameMesh, buildJetMesh, buildMissileMesh, buildPuffMesh, buildShadowMesh, buildSpriteMesh, buildTracerMesh } from './jet.js';
import { makeTextures } from './textures.js';

const VS = `
attribute vec3 aPos;
attribute vec3 aNor;
attribute vec3 aCol;
attribute vec2 aUV;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vCol;
varying vec3 vNor;
varying vec3 vWorld;
varying vec2 vUV;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNor = normalize(mat3(uModel) * aNor);
  vCol = aCol;
  vUV = aUV;
  gl_Position = uMVP * vec4(aPos, 1.0);
}`;

const FS = `
precision mediump float;
varying vec3 vCol;
varying vec3 vNor;
varying vec3 vWorld;
varying vec2 vUV;
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
uniform sampler2D uTex;
uniform float uUseTex;
uniform vec2 uTexScale;
uniform vec2 uTexScroll;
uniform float uShine;
uniform float uGlint;
uniform float uTime;
uniform float uFlat;
uniform float uDistFade;
void main() {
  vec4 tex4 = vec4(1.0);
  if (uUseTex > 0.5) {
    tex4 = texture2D(uTex, vUV * uTexScale + uTexScroll);
  }
  vec3 tex = tex4.rgb;
  // Sprites (clouds, smoke, fire) are soft blobs on transparent
  // canvas: their alpha IS their shape. Without this the transparent
  // corners sample as black and every sprite renders as a black box.
  float texA = tex4.a;
  vec3 n = normalize(vNor);
  float dist = distance(uCamPos, vWorld);
  // Distance fade for surface detail (sea waves): beyond ~600 m the
  // texture blends to plain white, so fine wave streaks can never
  // alias into a checkerboard moiré at range — the sea reads as
  // smooth water with a sun glint instead.
  if (uDistFade > 0.5) {
    float tf = 1.0 - smoothstep(600.0, 3000.0, dist);
    tex = mix(vec3(1.0), tex, tf);
  }
  // Water glint: a moving ripple wobble on the normal, so the sea
  // sparkles as the sun catches the waves. Low spatial frequency and
  // faded out with distance — a fast wobble aliases into a
  // crosshatch pattern when the sea is kilometres away.
  if (uGlint > 0.01) {
    float gf = 1.0 - smoothstep(400.0, 2200.0, dist);
    float w1 = sin(vWorld.x * 0.045 + uTime * 1.4) * cos(vWorld.z * 0.052 - uTime * 1.1);
    float w2 = sin(vWorld.x * 0.021 - uTime * 0.6) * sin(vWorld.z * 0.028 + uTime * 0.8);
    n = normalize(n + vec3(w1 * 0.10 * gf, 0.0, w2 * 0.10 * gf));
  }
  float diff = max(dot(n, uSunDir), 0.0);
  vec3 viewDir = normalize(uCamPos - vWorld);
  vec3 halfV = normalize(uSunDir + viewDir);
  float spec = pow(max(dot(n, halfV), 0.0), 42.0) * uShine;
  // Flat (unlit) surfaces — clouds and the sun: a billboard whose
  // normal faces away from the sun must NOT go dark grey from the
  // diffuse term. Flat draws keep their painted brightness and only
  // the haze below still applies.
  vec3 lit;
  if (uFlat > 0.5) {
    lit = vCol * uTint * tex;
  } else {
    lit = vCol * uTint * tex * (uAmbCol + uSunCol * diff) + uSunCol * spec;
  }
  float f = smoothstep(uFogNear, uFogFar, dist) * uFogAmt;
  vec3 col = mix(lit, uFogCol, f);
  gl_FragColor = vec4(col, uAlpha * texA);
}`;

// Sky dome: a big sphere centred on the camera, coloured by height —
// pale warm haze at the horizon, deep blue above, a faint warm band
// low in the west where the sun sits. Drawn first with depth writes
// off so it can never hide the terrain.
function buildSkyMesh(gl) {
  const mb = new MeshBuilder();
  const R = 8800;
  const lat = 12, lon = 24;
  for (let j = 0; j <= lat; j++) {
    // From just below the horizon (-0.12) up to the zenith.
    const phi = -0.12 + (j / lat) * (Math.PI * 0.5 + 0.12);
    const sp = Math.sin(phi), cp = Math.cos(phi);
    for (let i = 0; i <= lon; i++) {
      const th = (i / lon) * Math.PI * 2;
      const st = Math.sin(th), ct = Math.cos(th);
      const ny = Math.max(0, cp);
      const t = Math.pow(ny, 0.6);
      const r = 0.86 + (0.20 - 0.86) * t;
      const g = 0.88 + (0.44 - 0.88) * t;
      const b = 0.92 + (0.76 - 0.92) * t;
      mb.vtx([sp * ct * R, cp * R - 200, sp * st * R], [0, 1, 0], [r, g, b], [i / lon, j / lat]);
    }
  }
  const row = lon + 1;
  for (let j = 0; j < lat; j++) {
    for (let i = 0; i < lon; i++) {
      const a = j * row + i, b = a + 1, c = a + row, d = c + 1;
      mb.tri(a, b, c);
      mb.tri(b, d, c);
    }
  }
  return mb.build(gl);
}

// A flat sun disc: a fan of triangles in the XY plane, normal +Z.
function buildSunMesh(gl, radius, r, g, b) {
  const mb = new MeshBuilder();
  const N = 24;
  const centre = mb.vtx([0, 0, 0], [0, 0, 1], [r, g, b], [0.5, 0.5]);
  const ring = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    ring.push(mb.vtx([Math.cos(a) * radius, Math.sin(a) * radius, 0], [0, 0, 1], [r, g, b], [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]));
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
    for (const name of ['aPos', 'aNor', 'aCol', 'aUV']) {
      this.loc[name] = gl.getAttribLocation(this.prog, name);
    }
    for (const name of ['uMVP', 'uModel', 'uSunDir', 'uSunCol', 'uAmbCol', 'uFogCol', 'uCamPos', 'uTint', 'uFogNear', 'uFogFar', 'uFogAmt', 'uAlpha', 'uTex', 'uUseTex', 'uTexScale', 'uTexScroll', 'uShine', 'uGlint', 'uTime', 'uFlat', 'uDistFade']) {
      this.loc[name] = gl.getUniformLocation(this.prog, name);
    }
    // Warm afternoon sun, low from the west-southwest.
    this.sunDir = v3norm(v3(-0.55, 0.52, -0.42));
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0.78, 0.85, 0.92, 1);

    this.tex = makeTextures(gl, seed);

    this.terrain = buildTerrainMesh(gl, MeshBuilder, seed);
    this.water = buildWaterMesh(gl, MeshBuilder);
    this.foam = buildFoamMesh(gl, MeshBuilder, seed);
    this.roads = buildRoadMesh(gl, MeshBuilder, seed);
    this.trees = buildTreesMesh(gl, MeshBuilder, seed);
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
    this.cloud = buildCloudBillboardMesh(gl);
    this.sprite = buildSpriteMesh(gl);
    this.sky = buildSkyMesh(gl);
    this.sun = buildSunMesh(gl, 320, 2.6, 2.3, 1.7);
    this.sunHalo = buildSunMesh(gl, 950, 1.15, 0.95, 0.62);
    this.shadow = buildShadowMesh(gl);

    // High thin cirrus streaks, fixed positions from the seed, drawn
    // as wide flat billboards high above the cumulus layer.
    this.cirrus = [];
    let s = seed * 2654435761 % 100000;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (let i = 0; i < 7; i++) {
      this.cirrus.push({
        x: (rnd() - 0.5) * 11000,
        y: 1750 + rnd() * 450,
        z: (rnd() - 0.5) * 11000,
        s: 2.2 + rnd() * 2.4,
        yaw: rnd() * Math.PI,
      });
    }

    // Dynamic ribbon buffer for missile smoke trails: up to 26 trail
    // points, two vertices each, rebuilt every frame per missile.
    this.ribbonMax = 26;
    this.ribbonVbo = gl.createBuffer();
    this.ribbonIbo = gl.createBuffer();
    const ribIdx = [];
    for (let i = 0; i < this.ribbonMax - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      ribIdx.push(a, b, c, b, d, c);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ribbonIbo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(ribIdx), gl.STATIC_DRAW);
    this.ribbonVertCount = 0;
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

  // One draw call. opts: tint, fogAmt, alpha, tex, useTex, texScale,
  // texScroll, shine, glint — every draw sets all of them, so no state
  // leaks between draws.
  drawMesh(mesh, model, viewProj, opts) {
    const gl = this.gl;
    const o = opts || {};
    const mvp = mat4Multiply(viewProj, model);
    gl.uniformMatrix4fv(this.loc.uMVP, false, new Float32Array(mvp));
    gl.uniformMatrix4fv(this.loc.uModel, false, new Float32Array(model));
    gl.uniform3fv(this.loc.uTint, new Float32Array(o.tint || [1, 1, 1]));
    gl.uniform1f(this.loc.uFogAmt, o.fogAmt === undefined ? 1 : o.fogAmt);
    gl.uniform1f(this.loc.uAlpha, o.alpha === undefined ? 1 : o.alpha);
    gl.uniform1f(this.loc.uUseTex, o.tex ? 1 : 0);
    gl.uniform1f(this.loc.uShine, o.shine === undefined ? 0.25 : o.shine);
    gl.uniform1f(this.loc.uGlint, o.glint === undefined ? 0 : o.glint);
    gl.uniform1f(this.loc.uFlat, o.flat ? 1 : 0);
    gl.uniform1f(this.loc.uDistFade, o.distFade ? 1 : 0);
    const ts = o.texScale || [1, 1];
    const tc = o.texScroll || [0, 0];
    gl.uniform2f(this.loc.uTexScale, ts[0], ts[1]);
    gl.uniform2f(this.loc.uTexScroll, tc[0], tc[1]);
    if (o.tex) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, o.tex);
      gl.uniform1i(this.loc.uTex, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.vbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    const stride = 11 * 4;
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.loc.aNor);
    gl.vertexAttribPointer(this.loc.aNor, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(this.loc.aCol);
    gl.vertexAttribPointer(this.loc.aCol, 3, gl.FLOAT, false, stride, 6 * 4);
    gl.enableVertexAttribArray(this.loc.aUV);
    gl.vertexAttribPointer(this.loc.aUV, 2, gl.FLOAT, false, stride, 9 * 4);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }

  // Bind the shared attribute pointers for the dynamic ribbon buffer.
  bindRibbonAttribs() {
    const gl = this.gl;
    const stride = 11 * 4;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVbo);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ribbonIbo);
    gl.enableVertexAttribArray(this.loc.aPos);
    gl.vertexAttribPointer(this.loc.aPos, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.loc.aNor);
    gl.vertexAttribPointer(this.loc.aNor, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(this.loc.aCol);
    gl.vertexAttribPointer(this.loc.aCol, 3, gl.FLOAT, false, stride, 6 * 4);
    gl.enableVertexAttribArray(this.loc.aUV);
    gl.vertexAttribPointer(this.loc.aUV, 2, gl.FLOAT, false, stride, 9 * 4);
  }

  // A missile's smoke trail as one continuous ribbon: a camera-facing
  // triangle strip built from its trail points, thin near the missile
  // and widening as the smoke ages, fading to the haze colour.
  drawTrail(m, camPos, viewProj, time) {
    const gl = this.gl;
    const pts = m.trail;
    if (!pts || pts.length < 2) return;
    const n = Math.min(pts.length, this.ribbonMax);
    const data = new Float32Array(n * 2 * 11);
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      // Age: trail[0] is the oldest point (left behind near the jet),
      // trail[n-1] is fresh at the missile — smoke widens and fades
      // as it ages, so the ribbon is narrow at the missile and broad
      // and faint at the tail.
      const age = 1 - i / Math.max(1, n - 1);
      const next = pts[Math.min(i + 1, n - 1)];
      const prev = pts[Math.max(i - 1, 0)];
      const dir = v3norm(v3sub(next, prev));
      // Side vector: perpendicular to the trail direction and to the
      // view direction, so the ribbon always faces the camera.
      const toCam = v3norm(v3sub(camPos, p));
      let sx = dir[1] * toCam[2] - dir[2] * toCam[1];
      let sy = dir[2] * toCam[0] - dir[0] * toCam[2];
      let sz = dir[0] * toCam[1] - dir[1] * toCam[0];
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx /= sl; sy /= sl; sz /= sl;
      const halfW = 0.8 + age * 2.6;
      const shade = 1.05 - age * 0.35;
      for (let k = 0; k < 2; k++) {
        const sgn = k === 0 ? -1 : 1;
        const o = (i * 2 + k) * 11;
        data[o] = p[0] + sx * halfW * sgn;
        data[o + 1] = p[1] + sy * halfW * sgn;
        data[o + 2] = p[2] + sz * halfW * sgn;
        data[o + 3] = toCam[0]; data[o + 4] = toCam[1]; data[o + 5] = toCam[2];
        data[o + 6] = shade; data[o + 7] = shade; data[o + 8] = shade * 1.02;
        // v tiles along the ribbon so the puff blob repeats instead
        // of stretching once over the whole trail.
        data[o + 9] = k; data[o + 10] = i * 0.4;
      }
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ribbonVbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    const mvp = mat4Multiply(viewProj, mat4Model([0, 0, 0], 0, 0, 0, 1));
    gl.uniformMatrix4fv(this.loc.uMVP, false, new Float32Array(mvp));
    gl.uniformMatrix4fv(this.loc.uModel, false, new Float32Array(mat4Model([0, 0, 0], 0, 0, 0, 1)));
    gl.uniform3fv(this.loc.uTint, new Float32Array([1, 1, 1]));
    gl.uniform1f(this.loc.uFogAmt, 1);
    gl.uniform1f(this.loc.uAlpha, 0.9);
    gl.uniform1f(this.loc.uUseTex, 1);
    gl.uniform1f(this.loc.uShine, 0);
    gl.uniform1f(this.loc.uGlint, 0);
    gl.uniform2f(this.loc.uTexScale, 1, 1);
    gl.uniform2f(this.loc.uTexScroll, 0, 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex.puffRepeat);
    gl.uniform1i(this.loc.uTex, 0);
    this.bindRibbonAttribs();
    gl.drawElements(gl.TRIANGLES, (n - 1) * 6, gl.UNSIGNED_SHORT, 0);
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
    gl.uniform3fv(this.loc.uAmbCol, new Float32Array([0.36, 0.40, 0.48]));
    gl.uniform3fv(this.loc.uFogCol, new Float32Array([0.76, 0.83, 0.90]));
    gl.uniform3fv(this.loc.uCamPos, new Float32Array(camPos));
    gl.uniform1f(this.loc.uFogNear, 900);
    gl.uniform1f(this.loc.uFogFar, 14000);
    gl.uniform1f(this.loc.uTime, time || 0);
    const ident = mat4Model([0, 0, 0], 0, 0, 0, 1);

    // --- Sky dome + sun, drawn first without depth writes. ---
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);
    const skyModel = mat4Model([camPos[0], camPos[1], camPos[2]], 0, 0, 0, 1);
    this.drawMesh(this.sky, skyModel, viewProj, { tint: [1.25, 1.25, 1.25], fogAmt: 0, alpha: 1 });
    const sunPos = v3add(camPos, v3scale(this.sunDir, 8200));
    const sunYaw = Math.atan2(-this.sunDir[0], -this.sunDir[2]);
    const sunPitch = Math.asin(Math.max(-1, Math.min(1, this.sunDir[1])));
    const sunModel = mat4Model(sunPos, sunYaw, sunPitch, 0, 1);
    this.drawMesh(this.sunHalo, sunModel, viewProj, { fogAmt: 0, alpha: 0.30, flat: 1 });
    this.drawMesh(this.sun, sunModel, viewProj, { fogAmt: 0, alpha: 1, flat: 1 });
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    // --- World: terrain (detail texture), sea (waves + glint), foam,
    // roads, forests, airbase. ---
    this.drawMesh(this.terrain, ident, viewProj, { tex: this.tex.detail, shine: 0.05 });
    this.drawMesh(this.water, ident, viewProj, {
      tex: this.tex.water, texScroll: [time * 0.004, time * 0.0025],
      shine: 0.55, glint: 1.0, distFade: 1,
    });
    gl.depthMask(false);
    this.drawMesh(this.foam, ident, viewProj, { alpha: 0.55, fogAmt: 0.8 });
    gl.depthMask(true);
    this.drawMesh(this.roads, ident, viewProj, { shine: 0.05 });
    this.drawMesh(this.trees, ident, viewProj, { shine: 0.08 });
    this.drawMesh(this.airbase, ident, viewProj, { shine: 0.15 });

    // --- Target ring + beacon (only while the ring is unpassed). ---
    if (world.ring && !world.ring.passed) {
      const pulse = 1 + 0.02 * Math.sin(time * 2.4);
      this.drawMesh(this.ring, mat4Model(world.ring.pos, 0, 0, 0, pulse), viewProj, { shine: 0.5, fogAmt: 0.6 });
      gl.depthMask(false);
      this.drawMesh(this.beacon, mat4Model([world.ring.pos[0], 0, world.ring.pos[2]], 0, 0, 0, 1), viewProj, { fogAmt: 0.4, alpha: 0.4 });
      gl.depthMask(true);
      this.drawMesh(this.beaconPad, mat4Model([world.ring.pos[0], this.ringGround + 2, world.ring.pos[2]], 0, 0, 0, 1), viewProj, { fogAmt: 0, alpha: 0.9 });
    }

    // --- Blob shadows under the jets: a dark ellipse on the ground
    // that shrinks and fades as the jet climbs, grounding it in the
    // scene (the cheap shadow that sells altitude). ---
    const shadowFor = (jet, scale) => {
      const gh = terrainHeight(jet.pos[0], jet.pos[2], this.seed);
      const alt = Math.max(0, jet.pos[1] - gh);
      if (alt > 900) return;
      const s = scale * Math.max(0.3, 1 - alt / 700);
      const a = 0.34 * Math.max(0.12, 1 - alt / 800);
      gl.depthMask(false);
      this.drawMesh(this.shadow, mat4Model([jet.pos[0], gh + 1.2, jet.pos[2]], 0, 0, 0, s), viewProj, { fogAmt: 0.4, alpha: a });
      gl.depthMask(true);
    };
    const p = world.player;
    if (!p.crashed) shadowFor(p, 11);
    for (const e of world.enemies) {
      if (e.alive) shadowFor(e, 11);
    }

    // --- Jets (camouflage texture, canopy specular) + afterburners. ---
    this.drawMesh(this.jet, mat4Model(p.pos, p.yaw, p.pitch, p.roll, 1), viewProj, { tex: this.tex.camo, shine: 0.55, fogAmt: 0.7 });
    if (p.throttle > 0.6 && !p.crashed) {
      const fs = 0.6 + p.throttle * 0.35;
      this.drawMesh(this.flame, mat4Model(p.pos, p.yaw, p.pitch, p.roll, fs), viewProj, { fogAmt: 0, alpha: 0.92 });
    }
    for (const e of world.enemies) {
      if (!e.alive) continue;
      this.drawMesh(this.enemyJet, mat4Model(e.pos, e.yaw, e.pitch, e.roll, 1), viewProj, { tex: this.tex.camoEnemy, shine: 0.5, fogAmt: 0.7 });
      if (e.speed > 170) {
        this.drawMesh(this.flame, mat4Model(e.pos, e.yaw, e.pitch, e.roll, 0.7), viewProj, { fogAmt: 0, alpha: 0.92 });
      }
    }

    // --- Missiles: body + continuous smoke ribbon. ---
    for (const m of world.missiles) {
      const [yaw, pitch] = yawPitchFromVel(m.vel);
      this.drawMesh(this.missile, mat4Model(m.pos, yaw, pitch, 0, 1), viewProj, { shine: 0.4, fogAmt: 0.5 });
      this.drawTrail(m, camPos, viewProj, time);
    }

    // --- Tracers: long thin bright streaks along each bullet's path. ---
    for (const b of world.bullets) {
      const [yaw, pitch] = yawPitchFromVel(b.vel);
      const mid = [b.pos[0] - b.vel[0] * 0.008, b.pos[1] - b.vel[1] * 0.008, b.pos[2] - b.vel[2] * 0.008];
      this.drawMesh(this.tracer, mat4Model(mid, yaw, pitch, 0, 1), viewProj, { tint: [2.6, 1.7, 0.35], fogAmt: 0, alpha: 1 });
    }

    // --- Particles: fire is a hot core (flame sprite, bright tint),
    // smoke is a pale puff that grows as it ages. Both are camera-
    // facing sprites, so they read as soft glowing gas, not hard
    // shaded spheres — the difference between a fireball and a
    // cluster of billiard balls.
    for (const pt of world.particles) {
      const frac = pt.maxLife ? pt.life / pt.maxLife : 0;
      const [yaw, pitch] = yawPitchFromVel(v3sub(camPos, pt.pos));
      if (pt.smoke) {
        const s = pt.size * (0.7 + frac * 1.1);
        this.drawMesh(this.sprite, mat4Model(pt.pos, yaw, pitch, 0, s), viewProj, {
          tex: this.tex.puff, tint: [pt.colour[0] * 3.4, pt.colour[1] * 3.4, pt.colour[2] * 3.4],
          alpha: 0.8 * (1 - frac * 0.4), fogAmt: 0.8,
        });
      } else {
        const s = Math.max(0.4, pt.size * (1 - frac * 0.45));
        this.drawMesh(this.sprite, mat4Model(pt.pos, yaw, pitch, 0, s), viewProj, {
          tex: this.tex.flame, tint: [pt.colour[0] * 1.6, pt.colour[1] * 1.6, pt.colour[2] * 1.6],
          alpha: 1 - frac * 0.3, fogAmt: 0.3,
        });
      }
    }

    // --- Clouds: billboard sprites, drifting slowly, far ones faded
    // by the haze; a high thin cirrus layer above them. ---
    gl.depthMask(false);
    for (let i = 0; i < world.clouds.length; i++) {
      const c = world.clouds[i];
      const drift = Math.sin(time * 0.008 + i * 1.7) * 120;
      const bob = Math.sin(time * 0.05 + i * 2.3) * 12;
      const pos = [c.x + drift, c.y + bob, c.z];
      const [yaw, pitch] = yawPitchFromVel(v3sub(camPos, pos));
      this.drawMesh(this.cloud, mat4Model(pos, yaw, pitch, 0, c.s), viewProj, {
        tex: this.tex.cloud, tint: [1, 1, 1], alpha: 0.85, flat: 1,
      });
    }
    for (const c of this.cirrus) {
      const [yaw, pitch] = yawPitchFromVel(v3sub(camPos, [c.x, c.y, c.z]));
      // No roll: a rolled wide streak reads as a vertical scratch.
      this.drawMesh(this.cloud, mat4Model([c.x, c.y, c.z], yaw, pitch, 0, c.s), viewProj, {
        tex: this.tex.cloud, tint: [1.05, 1.05, 1.05], alpha: 0.38, fogAmt: 0.4, flat: 1,
      });
    }
    gl.depthMask(true);
  }
}

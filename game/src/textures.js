// Procedural textures for Steel Falcon, all painted on offscreen 2D
// canvases at load time and uploaded to the GPU. The game still ships
// zero external assets and makes zero network requests: every surface
// detail — jet camouflage, ground grain, sea waves, cloud fluff, smoke
// puffs — is generated here from a seeded random stream, so the same
// seed always paints the same textures.
//
// Textures made here:
//   camo / camoEnemy — 512x256 jet skin: panel lines, rivets, stencils,
//                       weathering streaks, two-tone camouflage
//   detail           — 256x256 fine ground grain, tiled over the terrain
//   water            — 256x256 wave streaks, scrolled by the renderer
//   cloud            — 256x128 soft lumpy billboard sprite
//   puff             — 128x128 soft round smoke/fire sprite
//   flame            — 128x128 hot core sprite for explosions

import { mulberry32 } from './rng.js';

// One offscreen canvas plus its 2D context.
function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Upload a canvas as a GL texture. `repeat` allows world-space UV tiling.
function upload(gl, canvas, repeat) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.generateMipmap(gl.TEXTURE_2D);
  return tex;
}

// Soft radial blob, the building block of clouds and smoke.
function blob(g, x, y, r, colour) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, colour);
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

// ---- Jet camouflage ------------------------------------------------------
// u runs around the fuselage, v runs nose-to-tail. The shader multiplies
// the vertex colour by this texture, so the base stays pale: darkening
// comes from the blotches and the panel lines, not from a dark base.
function paintCamo(rng, base, blotches, lineAlpha) {
  const [c, g] = mkCanvas(512, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 256);
  // Big soft camouflage patches, each one two overlapping ellipses so
  // no patch reads as a clean oval.
  for (const col of blotches) {
    g.fillStyle = col;
    for (let i = 0; i < 24; i++) {
      const x = rng() * 512, y = rng() * 256;
      const rx = 26 + rng() * 58, ry = 13 + rng() * 30;
      const rot = rng() * Math.PI;
      g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + rx * 0.45, y + ry * 0.25, rx * 0.55, ry * 0.7, rot, 0, Math.PI * 2); g.fill();
    }
  }
  // Panel joint lines: vertical (around the body) every ~2 m and two
  // long horizontal (along the body) seams, with rivet dots on them.
  g.strokeStyle = 'rgba(40,42,48,' + lineAlpha + ')';
  g.fillStyle = 'rgba(40,42,48,' + (lineAlpha + 0.12) + ')';
  g.lineWidth = 1.4;
  for (let x = 16; x < 512; x += 34) {
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke();
    for (let y = 8; y < 256; y += 12) {
      g.beginPath(); g.arc(x + 3, y, 1.1, 0, Math.PI * 2); g.fill();
    }
  }
  for (const y of [64, 128, 192]) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke();
  }
  // Stencils and markings: rescue arrow, serial, warning chevrons.
  g.fillStyle = 'rgba(30,30,34,0.85)';
  g.font = 'bold 15px sans-serif';
  g.fillText('01', 44, 40);
  g.fillText('RESCUE', 300, 210);
  g.fillStyle = 'rgba(190,40,30,0.8)';
  g.beginPath(); g.moveTo(300, 196); g.lineTo(318, 202); g.lineTo(300, 208); g.closePath(); g.fill();
  g.fillStyle = 'rgba(30,30,34,0.7)';
  g.font = 'bold 11px sans-serif';
  g.fillText('NO STEP', 150, 232);
  // Grime streaks running aft from the nose and the gun ports.
  for (let i = 0; i < 26; i++) {
    const x = rng() * 512, y = rng() * 256;
    const len = 14 + rng() * 42;
    const grad = g.createLinearGradient(x, y, x + len, y);
    grad.addColorStop(0, 'rgba(52,50,46,0.20)');
    grad.addColorStop(1, 'rgba(52,50,46,0)');
    g.fillStyle = grad;
    g.fillRect(x, y, len, 1.6 + rng() * 1.6);
  }
  return c;
}

// ---- Ground detail grain -------------------------------------------------
// Fine speckle + larger patchy mottling, tiled over the terrain mesh so
// the ground has grain at close range instead of smooth vertex colour.
function paintDetail(rng) {
  const [c, g] = mkCanvas(256, 256);
  g.fillStyle = '#b8b8b8';
  g.fillRect(0, 0, 256, 256);
  // Thousands of tiny speckles, darker and lighter.
  for (let i = 0; i < 5200; i++) {
    const v = 120 + Math.floor(rng() * 110);
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.5)';
    g.fillRect(rng() * 256, rng() * 256, 1.4, 1.4);
  }
  // Medium blotches for patchiness at a few metres' scale.
  for (let i = 0; i < 90; i++) {
    const v = 100 + Math.floor(rng() * 90);
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + (v - 8) + ',0.28)';
    g.beginPath();
    g.ellipse(rng() * 256, rng() * 256, 6 + rng() * 22, 4 + rng() * 14, rng() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  // A few thin cracks / twigs.
  g.strokeStyle = 'rgba(70,68,60,0.5)';
  g.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    let x = rng() * 256, y = rng() * 256;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rng() - 0.5) * 18; y += (rng() - 0.5) * 18; g.lineTo(x, y); }
    g.stroke();
  }
  return c;
}

// ---- Sea waves -----------------------------------------------------------
// Pale streaks on a mid blue base; the renderer scrolls the UVs slowly
// and the shader adds a moving specular glint on top. The streaks are
// kept LOW contrast and soft on purpose: at altitude a high-contrast
// fine pattern aliases into a crosshatch/checkerboard moiré over the
// whole sea, so the detail here is deliberately faint — the shader
// fades it out entirely with distance (see render.js uDistFade).
function paintWater(rng) {
  const [c, g] = mkCanvas(256, 256);
  g.fillStyle = '#6d99a8';
  g.fillRect(0, 0, 256, 256);
  // Large soft blotches first, so the sea has slow variation and the
  // fine streaks never tile into a regular grid (moiré at distance).
  for (let i = 0; i < 22; i++) {
    const x = rng() * 256, y = rng() * 256, r = 30 + rng() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    const light = rng() < 0.5;
    grad.addColorStop(0, light ? 'rgba(200,225,235,0.10)' : 'rgba(25,60,85,0.09)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // Long, soft, low-contrast wave streaks at varied angles — never
  // all parallel, never thin and bright, or the tiling reads as a
  // checkerboard from altitude.
  for (let i = 0; i < 70; i++) {
    const x = rng() * 256, y = rng() * 256;
    const len = 30 + rng() * 60;
    const ang = (rng() - 0.5) * 1.1 + (rng() < 0.25 ? Math.PI / 2 : 0);
    const dx = Math.cos(ang) * len, dy = Math.sin(ang) * len;
    g.strokeStyle = rng() < 0.5 ? 'rgba(235,245,248,0.10)' : 'rgba(30,70,95,0.08)';
    g.lineWidth = 1.5 + rng() * 1.5;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + dx * 0.5, y + dy * 0.5 + (rng() - 0.5) * 10, x + dx, y + dy);
    g.stroke();
  }
  for (let i = 0; i < 250; i++) {
    const v = 200 + Math.floor(rng() * 55);
    g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',0.08)';
    g.fillRect(rng() * 256, rng() * 256, 1.5, 1.5);
  }
  return c;
}

// ---- Cloud billboard -----------------------------------------------------
// A cluster of overlapping soft blobs, brighter on top, with a flat-ish
// grey-blue belly so the sprite reads as a 3D cloud, not a white disc.
// The belly wash is painted with 'source-atop', so it only lands on
// pixels the puffs already painted — a plain fillRect over the whole
// canvas would leave a hard rectangular grey slab at the sprite's
// bottom edge, visible whenever the billboard is seen side-on.
function paintCloud(rng) {
  const [c, g] = mkCanvas(256, 128);
  g.clearRect(0, 0, 256, 128);
  // Puffs spread across the whole width and stacked two high, so the
  // sprite fills its billboard instead of leaving a thin bar.
  const puffs = [
    [128, 78, 52], [88, 84, 40], [170, 84, 42], [52, 88, 30], [206, 88, 32],
    [104, 58, 34], [154, 56, 36], [70, 66, 26], [188, 64, 28], [128, 44, 30],
    [30, 96, 20], [228, 96, 22], [128, 96, 26],
  ];
  for (const [x, y, r] of puffs) {
    blob(g, x, y, r, 'rgba(255,255,255,0.85)');
  }
  // Belly shading: a soft grey-blue wash low in the sprite, clipped
  // to the painted puffs only, fading to nothing at its top edge so
  // no hard horizontal line survives.
  g.globalCompositeOperation = 'source-atop';
  const shade = g.createLinearGradient(0, 62, 0, 128);
  shade.addColorStop(0, 'rgba(150,165,185,0)');
  shade.addColorStop(0.55, 'rgba(158,170,188,0.14)');
  shade.addColorStop(1, 'rgba(150,165,185,0.24)');
  g.fillStyle = shade;
  g.fillRect(0, 62, 256, 66);
  g.globalCompositeOperation = 'source-over';
  return c;
}

// ---- Smoke / fire puff ---------------------------------------------------
// Soft round sprite with lumpy edges, used for smoke, explosions and
// the afterburner glow; the renderer tints it per particle.
function paintPuff(rng) {
  const [c, g] = mkCanvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  blob(g, 64, 64, 58, 'rgba(255,255,255,0.95)');
  for (let i = 0; i < 10; i++) {
    const a = rng() * Math.PI * 2, d = 18 + rng() * 30;
    blob(g, 64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 14 + rng() * 16, 'rgba(255,255,255,0.55)');
  }
  return c;
}

// ---- Explosion core ------------------------------------------------------
// Hot white-yellow centre fading to deep orange at the rim.
function paintFlame() {
  const [c, g] = mkCanvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.35, 'rgba(255,200,90,0.95)');
  grad.addColorStop(0.7, 'rgba(230,110,25,0.7)');
  grad.addColorStop(1, 'rgba(160,40,5,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

// Build every texture once per game load. The enemy skin uses a darker,
// red-grey palette so hostiles read as hostile at a glance. The puff
// sprite is uploaded twice: clamped for particle sprites, and tiled
// (repeat) for the missile smoke ribbon, whose UVs run past 1.0 along
// the trail — with a clamped texture the whole ribbon would sample the
// texture's transparent top edge and vanish.
export function makeTextures(gl, seed) {
  const rng = mulberry32(seed);
  const puffCanvas = paintPuff(rng);
  return {
    camo: upload(gl, paintCamo(rng, '#c6c9cd',
      ['rgba(148,154,162,0.7)', 'rgba(158,163,156,0.7)', 'rgba(138,145,153,0.7)'], 0.5), false),
    camoEnemy: upload(gl, paintCamo(rng, '#8a6f68',
      ['rgba(96,72,68,0.75)', 'rgba(70,66,70,0.75)', 'rgba(110,82,74,0.7)'], 0.55), false),
    detail: upload(gl, paintDetail(rng), true),
    water: upload(gl, paintWater(rng), true),
    cloud: upload(gl, paintCloud(rng), false),
    puff: upload(gl, puffCanvas, false),
    puffRepeat: upload(gl, puffCanvas, true),
    flame: upload(gl, paintFlame(), false),
  };
}

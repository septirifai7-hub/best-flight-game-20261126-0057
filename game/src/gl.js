// Raw WebGL1 helpers for Steel Falcon: context + shader setup and a
// small indexed mesh builder. One vertex format everywhere:
//   position(3), normal(3), colour(3), uv(2)  — 11 floats.
// Colour is per-vertex (the art direction), uv samples the procedural
// textures from textures.js; a mesh that needs no texture just leaves
// its uv at 0,0 and is drawn with uUseTex = 0.

export function createGL(canvas) {
  const gl = canvas.getContext('webgl', {
    antialias: true, alpha: false, preserveDrawingBuffer: true,
  });
  if (!gl) throw new Error('WebGL is not available in this browser');
  return gl;
}

export function compileShader(gl, type, source) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, source);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

export function createProgram(gl, vsSource, fsSource) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vsSource));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fsSource));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link failed: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}

// Outward normal of the triangle (a, b, c), unit length.
export function faceNormal(a, b, c) {
  const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
  const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// Mesh builder: append vertices with colour + uv, then upload once.
export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
    this.idx = [];
  }

  // Push one vertex, return its index. Colour as [r,g,b], uv as [u,v].
  vtx(p, n, c, uv) {
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0], c[1], c[2]);
    this.uv.push(uv ? uv[0] : 0, uv ? uv[1] : 0);
    return this.pos.length / 3 - 1;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }

  // A quad from four corners with one flat normal and colour; uv maps
  // the corners onto the unit square so a texture covers the quad.
  quad(pa, pb, pc, pd, n, c, uvScale) {
    const s = uvScale || 1;
    const ia = this.vtx(pa, n, c, [0, 0]);
    const ib = this.vtx(pb, n, c, [s, 0]);
    const ic = this.vtx(pc, n, c, [s, s]);
    const id = this.vtx(pd, n, c, [0, s]);
    this.idx.push(ia, ib, ic, ia, ic, id);
  }

  // Axis-aligned box centred at (cx, cy, cz), size (sx, sy, sz).
  box(cx, cy, cz, sx, sy, sz, c) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], c);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], c);
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], c);
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0], c);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], c);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], c);
  }

  // A tapered box along Z: half extents (w0,h0) at z0, (w1,h1) at z1.
  // Fuselage sections, missile bodies, intakes — all one helper.
  prism(cx, cy, z0, z1, w0, h0, w1, h1, c) {
    const f = [
      [cx - w0, cy - h0, z0], [cx + w0, cy - h0, z0],
      [cx + w0, cy + h0, z0], [cx - w0, cy + h0, z0],
    ];
    const k = [
      [cx - w1, cy - h1, z1], [cx + w1, cy - h1, z1],
      [cx + w1, cy + h1, z1], [cx - w1, cy + h1, z1],
    ];
    this.quad(f[3], f[2], k[2], k[3], [0, 1, 0], c);
    this.quad(f[1], f[0], k[0], k[1], [0, -1, 0], c);
    this.quad(f[0], f[3], k[3], k[0], [-1, 0, 0], c);
    this.quad(f[2], f[1], k[1], k[2], [1, 0, 0], c);
    this.quad(f[0], f[1], f[2], f[3], [0, 0, -1], c);
    this.quad(k[3], k[2], k[1], k[0], [0, 0, 1], c);
  }

  // A 4-sided pyramid pointing along -Z, base at z0, tip at z1.
  spike(cx, cy, z0, z1, w, h, c) {
    const tip = [cx, cy, z1];
    const base = [
      [cx - w, cy - h, z0], [cx + w, cy - h, z0],
      [cx + w, cy + h, z0], [cx - w, cy + h, z0],
    ];
    for (let i = 0; i < 4; i++) {
      const a = base[i], b = base[(i + 1) % 4];
      const n = faceNormal(a, b, tip);
      const ia = this.vtx(a, n, c, [0, 0]);
      const ib = this.vtx(b, n, c, [1, 0]);
      const ic = this.vtx(tip, n, c, [0.5, 1]);
      this.idx.push(ia, ib, ic);
    }
    this.quad(base[0], base[1], base[2], base[3], [0, 0, 1], c);
  }

  // A smooth ellipsoid centred at (cx, cy, cz) with radii (rx, ry, rz).
  // Normals are the true ellipsoid normals; uv wraps once around the
  // body so a texture (camo, puff) can cover it. Cloud puffs, smoke,
  // fuel tanks and canopy bubbles all use this.
  ball(cx, cy, cz, rx, ry, rz, c, latSegs, lonSegs, shadeTop) {
    const lat = latSegs || 10, lon = lonSegs || 14;
    const start = this.pos.length / 3;
    for (let j = 0; j <= lat; j++) {
      const phi = (j / lat) * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let i = 0; i <= lon; i++) {
        const th = (i / lon) * Math.PI * 2;
        const st = Math.sin(th), ct = Math.cos(th);
        const nx = sp * ct, ny = cp, nz = sp * st;
        // Optional vertical shading: bright crown, darker belly.
        let col = c;
        if (shadeTop) {
          const t = 0.5 + 0.5 * cp;
          col = [c[0] * (0.72 + 0.45 * t), c[1] * (0.72 + 0.45 * t), c[2] * (0.72 + 0.45 * t)];
        }
        this.vtx(
          [cx + nx * rx, cy + ny * ry, cz + nz * rz],
          [nx, ny, nz], col, [i / lon, j / lat],
        );
      }
    }
    const row = lon + 1;
    for (let j = 0; j < lat; j++) {
      for (let i = 0; i < lon; i++) {
        const a = start + j * row + i, b = a + 1, cc = a + row, d = cc + 1;
        this.idx.push(a, cc, b, b, cc, d);
      }
    }
  }

  // A flat disc in the XZ plane (a shadow blob, a ground pad): N fan
  // triangles around a centre vertex, normal +Y.
  disc(cx, y, cz, radius, c, segments) {
    const n = segments || 20;
    const centre = this.vtx([cx, y, cz], [0, 1, 0], c, [0.5, 0.5]);
    const ring = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      ring.push(this.vtx(
        [cx + Math.cos(a) * radius, y, cz + Math.sin(a) * radius],
        [0, 1, 0], c, [0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)],
      ));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.idx.push(centre, ring[i], ring[j]);
    }
  }

  // A cylinder along Z: ring at z0 with radius r0, ring at z1 with r1.
  // Nozzles, beacon columns, tree trunks — one helper.
  tube(cx, cy, z0, z1, r0, r1, c, segments, fadeTop) {
    const n = segments || 12;
    const ringA = [], ringB = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      ringA.push(this.vtx([cx + ca * r0, cy + sa * r0, z0], [ca, sa, 0], c, [i / n, 0]));
      const colB = fadeTop
        ? [c[0] * fadeTop, c[1] * fadeTop, c[2] * fadeTop] : c;
      ringB.push(this.vtx([cx + ca * r1, cy + sa * r1, z1], [ca, sa, 0], colB, [i / n, 1]));
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      this.idx.push(ringA[i], ringB[i], ringB[j]);
      this.idx.push(ringA[i], ringB[j], ringA[j]);
    }
  }

  // Upload to the GPU and return { vbo, ibo, count }. Interleaved
  // 11-float vertices: pos(3) nor(3) col(3) uv(2).
  build(gl) {
    const count = this.pos.length / 3;
    const data = new Float32Array(count * 11);
    for (let i = 0; i < count; i++) {
      const o = i * 11;
      data[o] = this.pos[i * 3]; data[o + 1] = this.pos[i * 3 + 1]; data[o + 2] = this.pos[i * 3 + 2];
      data[o + 3] = this.nor[i * 3]; data[o + 4] = this.nor[i * 3 + 1]; data[o + 5] = this.nor[i * 3 + 2];
      data[o + 6] = this.col[i * 3]; data[o + 7] = this.col[i * 3 + 1]; data[o + 8] = this.col[i * 3 + 2];
      data[o + 9] = this.uv[i * 2]; data[o + 10] = this.uv[i * 2 + 1];
    }
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.idx), gl.STATIC_DRAW);
    return { vbo, ibo, count: this.idx.length };
  }
}

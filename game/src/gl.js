// Raw WebGL1 helpers for Steel Falcon: shader setup and a small indexed
// mesh builder. One vertex format everywhere: position(3), normal(3),
// colour(3). No textures, no external assets — all colour is per-vertex.

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

// Mesh builder: append quads / triangles with a flat colour, then upload.
export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }

  // Push one vertex, return its index.
  vertex(x, y, z, nx, ny, nz, r, g, b) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(r, g, b);
    return this.pos.length / 3 - 1;
  }

  tri(a, b, c) { this.idx.push(a, b, c); }

  // A quad (pa, pb, pc, pd) with a single flat normal and colour.
  quad(pa, pb, pc, pd, nx, ny, nz, r, g, b) {
    const ia = this.vertex(pa[0], pa[1], pa[2], nx, ny, nz, r, g, b);
    const ib = this.vertex(pb[0], pb[1], pb[2], nx, ny, nz, r, g, b);
    const ic = this.vertex(pc[0], pc[1], pc[2], nx, ny, nz, r, g, b);
    const id = this.vertex(pd[0], pd[1], pd[2], nx, ny, nz, r, g, b);
    this.idx.push(ia, ib, ic, ia, ic, id);
  }

  // Axis-aligned box centred at (cx, cy, cz) with size (sx, sy, sz).
  box(cx, cy, cz, sx, sy, sz, r, g, b) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2;
    const y0 = cy - sy / 2, y1 = cy + sy / 2;
    const z0 = cz - sz / 2, z1 = cz + sz / 2;
    // +X, -X, +Y, -Y, +Z, -Z faces
    this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], 1, 0, 0, r, g, b);
    this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], -1, 0, 0, r, g, b);
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], 0, 1, 0, r, g, b);
    this.quad([x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], 0, -1, 0, r, g, b);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, r, g, b);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, r, g, b);
  }

  // A tapered box (frustum) along Z: front half-width/depth (w0, h0) at z0,
  // back half-width/depth (w1, h1) at z1. Used for fuselage sections.
  frustum(cx, cy, z0, z1, w0, h0, w1, h1, r, g, b) {
    const f = [
      [cx - w0, cy - h0, z0], [cx + w0, cy - h0, z0],
      [cx + w0, cy + h0, z0], [cx - w0, cy + h0, z0],
    ];
    const k = [
      [cx - w1, cy - h1, z1], [cx + w1, cy - h1, z1],
      [cx + w1, cy + h1, z1], [cx - w1, cy + h1, z1],
    ];
    // Top, bottom, left, right sides; caps at both ends.
    this.quad(f[3], f[2], k[2], k[3], 0, 1, 0, r, g, b);
    this.quad(f[1], f[0], k[0], k[1], 0, -1, 0, r, g, b);
    this.quad(f[0], f[3], k[3], k[0], -1, 0, 0, r, g, b);
    this.quad(f[2], f[1], k[1], k[2], 1, 0, 0, r, g, b);
    this.quad(f[0], f[1], f[2], f[3], 0, 0, -1, r, g, b);
    this.quad(k[3], k[2], k[1], k[0], 0, 0, 1, r, g, b);
  }

  // A 4-sided cone (pyramid) pointing along -Z from base z0 to tip z1.
  nose(cx, cy, z0, z1, w, h, r, g, b) {
    const tip = [cx, cy, z1];
    const base = [
      [cx - w, cy - h, z0], [cx + w, cy - h, z0],
      [cx + w, cy + h, z0], [cx - w, cy + h, z0],
    ];
    for (let i = 0; i < 4; i++) {
      const a = base[i], c = base[(i + 1) % 4];
      const n = faceNormal(a, c, tip);
      const ia = this.vertex(a[0], a[1], a[2], n[0], n[1], n[2], r, g, b);
      const ib = this.vertex(c[0], c[1], c[2], n[0], n[1], n[2], r, g, b);
      const ic = this.vertex(tip[0], tip[1], tip[2], n[0], n[1], n[2], r, g, b);
      this.idx.push(ia, ib, ic);
    }
    this.quad(base[0], base[1], base[2], base[3], 0, 0, 1, r, g, b);
  }

  // A smooth ellipsoid centred at (cx, cy, cz) with radii (rx, ry, rz).
  // Used for cloud puffs: smooth shading, no hard edges.
  sphere(cx, cy, cz, rx, ry, rz, r, g, b, latSegs = 10, lonSegs = 14) {
    const start = this.pos.length / 3;
    for (let j = 0; j <= latSegs; j++) {
      const phi = (j / latSegs) * Math.PI;
      const sp = Math.sin(phi), cp = Math.cos(phi);
      for (let i = 0; i <= lonSegs; i++) {
        const theta = (i / lonSegs) * Math.PI * 2;
        const st = Math.sin(theta), ct = Math.cos(theta);
        const nx = sp * ct, ny = cp, nz = sp * st;
        this.vertex(cx + nx * rx, cy + ny * ry, cz + nz * rz, nx, ny, nz, r, g, b);
      }
    }
    const row = lonSegs + 1;
    for (let j = 0; j < latSegs; j++) {
      for (let i = 0; i < lonSegs; i++) {
        const a = start + j * row + i;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
  }

  // Upload to the GPU and return { vbo, ibo, count }.
  build(gl) {
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    const data = new Float32Array(this.pos.length * 3);
    for (let i = 0; i < this.pos.length / 3; i++) {
      data[i * 9] = this.pos[i * 3];
      data[i * 9 + 1] = this.pos[i * 3 + 1];
      data[i * 9 + 2] = this.pos[i * 3 + 2];
      data[i * 9 + 3] = this.nor[i * 3];
      data[i * 9 + 4] = this.nor[i * 3 + 1];
      data[i * 9 + 5] = this.nor[i * 3 + 2];
      data[i * 9 + 6] = this.col[i * 3];
      data[i * 9 + 7] = this.col[i * 3 + 1];
      data[i * 9 + 8] = this.col[i * 3 + 2];
    }
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.idx), gl.STATIC_DRAW);
    return { vbo, ibo, count: this.idx.length };
  }
}

function faceNormal(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

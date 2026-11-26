// Small vector / matrix helpers for Steel Falcon. Plain arrays, no allocation
// in the hot path where it matters. Angles in radians, Y is up.

export function v3(x = 0, y = 0, z = 0) { return [x, y, z]; }

export function v3add(a, b, out = v3()) {
  out[0] = a[0] + b[0]; out[1] = a[1] + b[1]; out[2] = a[2] + b[2];
  return out;
}

export function v3sub(a, b, out = v3()) {
  out[0] = a[0] - b[0]; out[1] = a[1] - b[1]; out[2] = a[2] - b[2];
  return out;
}

export function v3scale(a, s, out = v3()) {
  out[0] = a[0] * s; out[1] = a[1] * s; out[2] = a[2] * s;
  return out;
}

export function v3len(a) { return Math.hypot(a[0], a[1], a[2]); }

export function v3norm(a, out = v3()) {
  const l = v3len(a) || 1;
  out[0] = a[0] / l; out[1] = a[1] / l; out[2] = a[2] / l;
  return out;
}

export function v3dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

export function v3cross(a, b, out = v3()) {
  out[0] = a[1] * b[2] - a[2] * b[1];
  out[1] = a[2] * b[0] - a[0] * b[2];
  out[2] = a[0] * b[1] - a[1] * b[0];
  return out;
}

export function v3dist(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); }

export function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

export function lerp(a, b, t) { return a + (b - a) * t; }

// Wrap an angle to [-PI, PI].
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Forward vector from yaw (heading, 0 = -Z / north) and pitch (up positive).
export function dirFromYawPitch(yaw, pitch, out = v3()) {
  const cp = Math.cos(pitch);
  out[0] = -Math.sin(yaw) * cp;
  out[1] = Math.sin(pitch);
  out[2] = -Math.cos(yaw) * cp;
  return out;
}

// Column-major 4x4 matrices, matching WebGL conventions.
export function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

export function mat4Multiply(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      o[c * 4 + r] =
        a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] +
        a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return o;
}

export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

// View matrix from eye, target and up.
export function mat4LookAt(eye, target, up) {
  const z = v3norm(v3sub(eye, target));
  const x = v3norm(v3cross(up, z));
  const y = v3cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -v3dot(x, eye), -v3dot(y, eye), -v3dot(z, eye), 1,
  ];
}

// Model matrix: translate, then rotate yaw (Y), pitch (X), roll (Z), then scale.
export function mat4Model(pos, yaw, pitch, roll, scale = 1) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // R = Ry(yaw) * Rx(pitch) * Rz(roll)
  const m = mat4Multiply(
    [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1],
    mat4Multiply(
      [1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1],
      [cr, sr, 0, 0, -sr, cr, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    ),
  );
  m[0] *= scale; m[1] *= scale; m[2] *= scale;
  m[4] *= scale; m[5] *= scale; m[6] *= scale;
  m[8] *= scale; m[9] *= scale; m[10] *= scale;
  m[12] = pos[0]; m[13] = pos[1]; m[14] = pos[2];
  return m;
}

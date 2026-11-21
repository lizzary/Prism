// Canvas2D impasto engine.
//
// Ported from scene 12 "The Starry Night" of The Pelican Test (MIT, © 2026 Royce Bella) and kept faithful to it:
//   • a DASH is one loaded brush stroke: a body in the base colour plus 2–9 bristle streaks, each its own mix of two
//     colours (wet-in-wet), with ragged starts/ends. It also writes a HEIGHT map (body, bristle ridges, a lift ridge).
//   • light() turns the height map into normals → diffuse + wet gloss + cavity → the impasto relief.
// Everything is drawn in composition units. A Painter renders at S px/unit; bristle counts and lighting are tuned at
// the reference scale SR, so the paint looks the same at any resolution.

export const TAU = Math.PI * 2;
export const SR = 2;

// ------------------------------------------------------------------ deterministic maths
export function hash(...parts) {
  const s = parts.join('|');
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** mulberry32 → [0, 1) */
export function rng(seed) {
  let a = (typeof seed === 'number' ? seed : hash(seed)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

export function hash3(x, y, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x, y, s) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash3(ix, iy, s), b = hash3(ix + 1, iy, s), c = hash3(ix, iy + 1, s), d = hash3(ix + 1, iy + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/** Catmull-Rom resample of an open polyline. */
export function smoothPath(pts, perSeg = 8) {
  if (pts.length < 3) return pts.slice();
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** y(x) lookup from control points (Catmull-Rom, tabulated every unit). */
export function curveFn(ctrl) {
  const P = smoothPath(ctrl, 16);
  const x0 = Math.floor(P[0][0]), x1 = Math.ceil(P[P.length - 1][0]);
  const N = x1 - x0 + 1, tab = new Float32Array(N);
  let k = 0;
  for (let i = 0; i < N; i++) {
    const x = x0 + i;
    while (k < P.length - 2 && P[k + 1][0] < x) k++;
    const a = P[k], b = P[k + 1], t = clamp((x - a[0]) / ((b[0] - a[0]) || 1));
    tab[i] = a[1] + (b[1] - a[1]) * t;
  }
  return (x) => tab[clamp(Math.round(x - x0), 0, N - 1)];
}

export const inPoly = (pts, x, y) => {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};
export const arcPts = (cx, cy, r, a0, a1, n = 6) => {
  const o = [];
  for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return o;
};
export const shuffleSort = (items) => items.sort((a, b) => a.k - b.k);

/** Streamline of a direction field through (x, y), centred, about L long. */
export function stream(x, y, L, dirFn, step = 2.6) {
  const n = Math.max(1, Math.round(L / 2 / step));
  const fw = [[x, y]], bw = [];
  const d0 = dirFn(x, y);
  for (const sgn of [1, -1]) {
    let px = x, py = y, pdx = d0[0] * sgn, pdy = d0[1] * sgn;
    for (let i = 0; i < n; i++) {
      let [ex, ey] = dirFn(px, py);
      if (ex * pdx + ey * pdy < 0) { ex = -ex; ey = -ey; }
      px += ex * step; py += ey * step; pdx = ex; pdy = ey;
      (sgn > 0 ? fw : bw).push([px, py]);
    }
  }
  return bw.reverse().concat(fw);
}

// ------------------------------------------------------------------ colour
export const hx = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export const pal = (arr) => arr.map(hx);
export const pick = (p, R) => p[(R() * p.length) | 0];
export const mixC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const css = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
export const grey = (v) => { v = v < 0 ? 0 : v > 255 ? 255 : v | 0; return `rgb(${v},${v},${v})`; };

// ------------------------------------------------------------------ surfaces
export const mk = (w, h) => new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h)));
const ctx2d = (c) => c.getContext('2d', { willReadFrequently: true });

/** A paint surface: colour canvas + height canvas, drawn in composition units at S px/unit. */
export class Painter {
  constructor(S, x0, y0, wU, hU) {
    this.S = S;
    this.wU = wU; this.hU = hU;
    this.W = Math.ceil(wU * S); this.H = Math.ceil(hU * S);
    this.cv = mk(this.W, this.H); this.c = ctx2d(this.cv);
    this.hv = mk(this.W, this.H); this.h = ctx2d(this.hv);
    this.thin = null;
    this.origin(x0, y0);
  }
  origin(x0, y0) {
    this.x0 = x0; this.y0 = y0;
    for (const c of [this.c, this.h]) {
      c.setTransform(this.S, 0, 0, this.S, -x0 * this.S, -y0 * this.S);
      c.lineCap = 'round'; c.lineJoin = 'round';
    }
  }
  /** Colour transparent, height opaque black (so edges blend correctly). */
  clear() {
    this.c.save(); this.c.setTransform(1, 0, 0, 1, 0, 0); this.c.clearRect(0, 0, this.W, this.H); this.c.restore();
    this.h.save(); this.h.setTransform(1, 0, 0, 1, 0, 0); this.h.globalAlpha = 1; this.h.fillStyle = '#000'; this.h.fillRect(0, 0, this.W, this.H); this.h.restore();
  }
}

export function pathOf(c, pts) {
  c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
}
export function closedPath(c, pts) { pathOf(c, pts); c.closePath(); }

/** Sub-path [t0, t1] (arc length) of pts offset by `off` along the normals. */
function subPath(c, pts, L, NX, NY, off, t0, t1) {
  const n = pts.length;
  let i = 1;
  while (i < n - 1 && L[i] < t0) i++;
  let f = (t0 - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
  c.beginPath();
  c.moveTo(lerp(pts[i - 1][0] + NX[i - 1] * off, pts[i][0] + NX[i] * off, f), lerp(pts[i - 1][1] + NY[i - 1] * off, pts[i][1] + NY[i] * off, f));
  while (i < n - 1 && L[i] < t1) { c.lineTo(pts[i][0] + NX[i] * off, pts[i][1] + NY[i] * off); i++; }
  f = clamp((t1 - L[i - 1]) / ((L[i] - L[i - 1]) || 1));
  c.lineTo(lerp(pts[i - 1][0] + NX[i - 1] * off, pts[i][0] + NX[i] * off, f), lerp(pts[i - 1][1] + NY[i - 1] * off, pts[i][1] + NY[i] * off, f));
}

const NOOPT = {};
/**
 * One loaded brush stroke along pts, width w. ca = base colour, cb = the second paint on the brush.
 * o: { h: base height (0–255), alpha, nb: bristles, mix: how far bristles pull toward cb, pAlt: share of mixed
 *      bristles, jit: lightness jitter, ridge: false to skip the lift ridge, taper: flick strokes, noH: colour only }
 */
export function dash(P, pts, w, ca, cb, R, o = NOOPT) {
  const tp = o.taper ?? 0;
  if (tp && pts.length < 6) pts = smoothPath(pts.length === 2 ? [pts[0], [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2], pts[1]] : pts, 3);
  const n = pts.length;
  if (n < 2) return;
  const L = new Array(n); L[0] = 0;
  for (let i = 1; i < n; i++) L[i] = L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const tot = L[n - 1];
  if (tot < 0.3) return;
  const NX = new Array(n), NY = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = pts[i > 0 ? i - 1 : 0], b = pts[i < n - 1 ? i + 1 : n - 1];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    NX[i] = -dy / l; NY[i] = dx / l;
  }
  const c = P.c, h = P.h;
  const alpha = o.alpha ?? 1;
  // thin paint: in some zones the brush is nearly dry — no body, separated bristles, the weave shows between them
  let dry = false;
  if (P.thin) {
    const m = pts[n >> 1], th = P.thin(m[0], m[1]);
    if (th > 0) { const v = R(); if (v < th * 0.45) return; dry = v < th * 0.95; }
  }
  const hb = (o.h ?? 150) + (R() - 0.5) * 36 - (dry ? 45 : 0);
  if (!dry && tp) {
    c.globalAlpha = alpha; c.strokeStyle = css(ca); if (!o.noH) h.strokeStyle = grey(hb);
    for (let i = 1; i < n; i++) {
      const k = 1 - tp * Math.pow(L[i] / tot, 1.3);
      c.lineWidth = w * 0.84 * k; c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke();
      if (!o.noH) { h.lineWidth = w * 0.9 * k; h.beginPath(); h.moveTo(pts[i - 1][0], pts[i - 1][1]); h.lineTo(pts[i][0], pts[i][1]); h.stroke(); }
    }
  } else if (!dry) {
    c.globalAlpha = alpha; c.strokeStyle = css(ca); c.lineWidth = w * 0.84; pathOf(c, pts); c.stroke();
    if (!o.noH) { h.strokeStyle = grey(hb); h.lineWidth = w * 0.9; pathOf(h, pts); h.stroke(); }
  }
  const nb = o.nb ?? Math.max(2, Math.min(9, Math.round((w * SR) / 2.6)));
  const mixA = o.mix ?? 0.55, jit = o.jit ?? 0.08, pAlt = o.pAlt ?? 0.45;
  for (let j = 0; j < nb; j++) {
    const f = (j + 0.5) / nb - 0.5;
    const off = (f * w * 0.9 + (R() - 0.5) * w * 0.06) * (1 - tp * 0.35);
    const t0 = R() * R() * 0.22 * tot, t1 = tot * (1 - R() * R() * 0.34) * (1 - tp * Math.abs(f) * 0.9);
    const m = R() < pAlt ? mixA * (0.35 + 0.65 * R()) : mixA * 0.16 * R();
    const k = 1 + (R() - 0.5) * 2 * jit;
    const bw = (w / nb) * (0.95 + R() * 0.75) * (dry ? 0.62 : 1);
    subPath(c, pts, L, NX, NY, off, t0, dry ? t1 * (0.7 + 0.3 * R()) : t1);
    c.globalAlpha = alpha * (0.74 + 0.26 * R()) * (dry ? 0.9 : 1);
    c.strokeStyle = `rgb(${(ca[0] + (cb[0] - ca[0]) * m) * k | 0},${(ca[1] + (cb[1] - ca[1]) * m) * k | 0},${(ca[2] + (cb[2] - ca[2]) * m) * k | 0})`;
    c.lineWidth = bw; c.stroke();
    if (!o.noH) {
      subPath(h, pts, L, NX, NY, off, t0, t1);
      h.strokeStyle = grey(hb + (j & 1 ? 18 : -14) + (R() - 0.5) * 10); h.lineWidth = bw * 0.7; h.stroke();
    }
  }
  if (!o.noH && o.ridge !== false && !tp) {
    const e = pts[n - 1], q = pts[n - 2];
    h.strokeStyle = grey(hb + 30); h.lineWidth = w * 0.5;
    h.beginPath(); h.moveTo(lerp(q[0], e[0], 0.3), lerp(q[1], e[1], 0.3)); h.lineTo(e[0], e[1]); h.stroke();
  }
  c.globalAlpha = 1;
}

/** Opaque underlayer of a shape (paint body under the dashes). */
export function fillPoly(P, pts, col, hv = 90, alpha = 1) {
  P.c.globalAlpha = alpha; P.c.fillStyle = css(col); closedPath(P.c, pts); P.c.fill(); P.c.globalAlpha = 1;
  if (hv != null) { P.h.fillStyle = grey(hv); closedPath(P.h, pts); P.h.fill(); }
}
export function fillCircle(P, x, y, r, col, hv = 120) {
  P.c.fillStyle = css(col); P.c.beginPath(); P.c.arc(x, y, r, 0, TAU); P.c.fill();
  if (hv != null) { P.h.fillStyle = grey(hv); P.h.beginPath(); P.h.arc(x, y, r, 0, TAU); P.h.fill(); }
}

// ------------------------------------------------------------------ lighting
/** Separable gaussian blur of a single-channel float image. */
function blurF32(src, w, h, sigma) {
  if (sigma < 0.05) return src;
  const r = Math.max(1, Math.ceil(sigma * 2.6));
  const ker = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); ker[i + r] = v; sum += v; }
  for (let i = 0; i < ker.length; i++) ker[i] /= sum;
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) { const xx = x + i < 0 ? 0 : x + i >= w ? w - 1 : x + i; acc += src[row + xx] * ker[i + r]; }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) { const yy = y + i < 0 ? 0 : y + i >= h ? h - 1 : y + i; acc += tmp[yy * w + x] * ker[i + r]; }
      out[y * w + x] = acc;
    }
  }
  return out;
}

const LV = (() => { const x = -0.48, y = -0.62, z = 0.62, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })();
const HV = (() => { const x = LV[0], y = LV[1], z = LV[2] + 1, l = Math.hypot(x, y, z); return [x / l, y / l, z / l]; })();

/** Light the paint: normals from the (slightly blurred) height map → diffuse + wet gloss + cavity. */
export function light(P, o = NOOPT) {
  const w = P.W, h = P.H, k = P.S / SR;
  const hd = P.h.getImageData(0, 0, w, h).data;
  const raw = new Float32Array(w * h);
  for (let i = 0, j = 0; i < raw.length; i++, j += 4) raw[i] = hd[j];
  const H = blurF32(raw, w, h, (o.blur ?? 0.8) * k);
  const img = P.c.getImageData(0, 0, w, h), cd = img.data;
  // per-pixel gradients grow as px/unit shrinks: relief scales with k, the (laplacian) cavity term with k²
  const kz = (o.relief ?? 0.022) * k, shA = o.shade ?? 0.72, spA = o.spec ?? 60, cav = (o.cav ?? 0.0035) * k * k;
  const Lx = LV[0], Ly = LV[1], Lz = LV[2], Hx = HV[0], Hy = HV[1], Hz = HV[2];
  for (let j = 1; j < h - 1; j++) {
    let i0 = j * w + 1, q = i0 * 4;
    for (let i = 1; i < w - 1; i++, i0++, q += 4) {
      if (cd[q + 3] === 0) continue;
      const hc = H[i0], hl = H[i0 - 1], hr = H[i0 + 1], hu = H[i0 - w], hn = H[i0 + w];
      const nx = -(hr - hl) * 0.5 * kz, ny = -(hn - hu) * 0.5 * kz;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      let sh = 1 + (((nx * Lx + ny * Ly + Lz) * inv) / Lz - 1) * shA;
      sh *= 1 + (4 * hc - hl - hr - hu - hn) * cav;
      sh = sh < 0.42 ? 0.42 : sh > 1.55 ? 1.55 : sh;
      let sp = ((nx * Hx + ny * Hy + Hz) * inv - Hz) / (1 - Hz);
      sp = sp > 0 ? sp * sp * spA : 0;
      cd[q] = cd[q] * sh + sp; cd[q + 1] = cd[q + 1] * sh + sp; cd[q + 2] = cd[q + 2] * sh + sp * 0.9;
    }
  }
  return img;
}

/** Lit result as a fresh canvas. */
export function litCanvas(P, o) {
  const img = light(P, o);
  const cv = mk(P.W, P.H);
  cv.getContext('2d').putImageData(img, 0, 0);
  return cv;
}

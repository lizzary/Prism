// Painting routines for the home-page Starry Night (adapted from The Pelican Test, scene 12, MIT).
import {
  TAU, rng, hash, clamp, lerp, smoothstep, vnoise, hash3, smoothPath, inPoly, arcPts, shuffleSort, stream,
  hx, pal, pick, mixC, mk, Painter, dash, fillPoly, fillCircle,
} from './engine.js';
import {
  W, H, C0, SMALL, MOON, STARS, WIND, WIND_W, ridgeFar, ridgeNear, FIELD_Y, SKY_BOTTOM,
  HOUSES, CHURCH, TREES, CYP,
} from './composition.js';

const ID = 'starry';

/** Where the brush runs dry on the main picture (the window layers repeat it so their strokes match). */
export const THIN = (x, y) => smoothstep(0.62, 0.8, vnoise(x / 70 + 3.1, y / 55, 33)) * (y < 430 ? 0.75 : 0.85);
/** Draw as an eraser (true) or as paint (false), on both the colour and the height canvas. */
const erasing = (P, on) => { for (const c of [P.c, P.h]) c.globalCompositeOperation = on ? 'destination-out' : 'source-over'; };

export const SKY = {
  deep: pal(['#152259', '#1b2b68', '#13264a', '#22357a', '#1a2f70', '#1d2f6b']),
  mid: pal(['#24418a', '#2f5fb3', '#27499c', '#1d2f6b', '#35609f', '#2a52a0']),
  low: pal(['#4e7db0', '#6fa3b8', '#5a8cbc', '#3f6fa8', '#86b2bd', '#5f96b4']),
  light: pal(['#9cc6c8', '#bcd9d2', '#80b4c4', '#d0e4d4', '#a6cbd8', '#6fa3b8']),
  white: pal(['#e6eedf', '#f1efd6', '#d2e4dc', '#dfeadf']),
  star: pal(['#e9e39a', '#f1d35a', '#e0e0a0', '#f4ecb8', '#f6e27a']),
  green: pal(['#a8c4a0', '#c4d4a0', '#9cc0b0', '#b8d0a8']),
  moon: pal(['#ecc45a', '#e8b84c', '#d8c070', '#f0d888', '#e8a53a']),
  dark: pal(['#101a45', '#142a4f', '#13205a']),
};
const PRUSSIAN = hx('#142a4f');

// ------------------------------------------------------------------ the sky's flow (stream function ψ)
const VORTS = [
  { x: C0.x, y: C0.y, R: 215, A: 520 },
  ...SMALL.map((s) => ({ x: s.x, y: s.y, R: s.f * 1.21, A: -150 * (s.r / 54) })),
  { x: MOON.x, y: MOON.y, R: 92, A: 130 },
  ...STARS.map((s) => ({ x: s.x, y: s.y, R: s.r * 1.4, A: 40 + s.r * 1.2 })),
];
// The wind only matters within ~160 units, so segments are culled by their bounding boxes against that reach.
const WIND_REACH = 170;
const WSEG = [];
let WLEN = 0;
for (let i = 0; i < WIND.length - 1; i++) {
  const a = WIND[i], b = WIND[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy, l = Math.sqrt(l2);
  WSEG.push({ ax: a[0], ay: a[1], dx, dy, l2, l, acc: WLEN,
    x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y0: Math.min(a[1], b[1]), y1: Math.max(a[1], b[1]) });
  WLEN += l;
}
// x-bins of the segments that can lie within reach of a point in the bin
const BIN = 24, BIN_X0 = -WIND_REACH - BIN;
const BINS = Array.from({ length: Math.ceil((W + 2 * WIND_REACH + 2 * BIN) / BIN) }, (_, b) => {
  const bx0 = BIN_X0 + b * BIN, bx1 = bx0 + BIN;
  return WSEG.filter((s) => s.x1 > bx0 - WIND_REACH && s.x0 < bx1 + WIND_REACH);
});
const NO_SEGS = [];
function windAt(x, y) {
  const segs = BINS[Math.floor((x - BIN_X0) / BIN)] || NO_SEGS;
  let best = WIND_REACH, n = 0, along = 0, hit = false;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ex = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0;
    if (ex >= best) continue;
    const ey = y < s.y0 ? s.y0 - y : y > s.y1 ? y - s.y1 : 0;
    if (ey >= best) continue;
    const t = clamp(((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.l2);
    const qx = s.ax + s.dx * t, qy = s.ay + s.dy * t, d = Math.hypot(x - qx, y - qy);
    if (d < best) { best = d; hit = true; n = Math.sign(s.dx * (y - s.ay) - s.dy * (x - s.ax)) * d; along = s.acc + t * s.l; }
  }
  return hit ? { n, d: best, along, len: WLEN } : { n: 0, d: 1e9, along: 0, len: WLEN };
}
function psiExact(x, y) {
  let v = y + 38 * Math.sin(x * 0.0095 + 0.7) + 16 * Math.sin(x * 0.024 + y * 0.012 + 1.9) + 10 * Math.sin(x * 0.05 - y * 0.02);
  for (let i = 0; i < VORTS.length; i++) {
    const q = VORTS[i], dx = x - q.x, dy = y - q.y, d2 = (dx * dx + dy * dy) / (q.R * q.R);
    if (d2 < 5) v += q.A * Math.exp(-d2 * d2);
  }
  const w = windAt(x, y);
  if (w.d < 160) v += 2.4 * WIND_W * Math.tanh(w.n / WIND_W) * smoothstep(0, 80, w.along) * smoothstep(w.len, w.len - 60, w.along) * (1 - smoothstep(90, 160, w.d));
  return v;
}
const PG = 2, PX0 = -24, PY0 = -24, PNX = Math.ceil((W + 48) / PG), PNY = Math.ceil((SKY_BOTTOM + 80) / PG);
let PSI = null;
function psi(x, y) {
  if (!PSI) {
    PSI = new Float32Array(PNX * PNY);
    for (let j = 0; j < PNY; j++) for (let i = 0; i < PNX; i++) PSI[j * PNX + i] = psiExact(PX0 + i * PG, PY0 + j * PG);
  }
  const fx = clamp((x - PX0) / PG, 0, PNX - 1.001), fy = clamp((y - PY0) / PG, 0, PNY - 1.001);
  const i = Math.floor(fx), j = Math.floor(fy), tx = fx - i, ty = fy - j, k = j * PNX + i;
  const a = PSI[k], b = PSI[k + 1], c = PSI[k + PNX], d = PSI[k + PNX + 1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}
function skyDir(x, y) {
  const e = 0.8, gx = psi(x + e, y) - psi(x - e, y), gy = psi(x, y + e) - psi(x, y - e);
  const l = Math.hypot(gx, gy) || 1;
  return [gy / l, -gx / l];
}
/** Colour of a sky dash: height gradient, light streams along the flow, star / moon glow. */
function skyColour(x, y, R) {
  const t = clamp((y - 20) / 430);
  const z = t + (R() - 0.5) * 0.34;
  let ca = pick(z < 0.36 ? SKY.deep : z < 0.74 ? SKY.mid : SKY.low, R);
  let cb = pick(z < 0.5 ? SKY.mid : SKY.light, R);
  const e = 0.8, g = Math.hypot(psi(x + e, y) - psi(x - e, y), psi(x, y + e) - psi(x, y - e)) / (2 * e);
  const band = Math.cos((psi(x, y) / (40 * (0.55 + 0.45 * Math.min(g, 3)))) * TAU + 5 * (vnoise(x / 130, y / 130, 3) - 0.5));
  if (band > 0.62 && R() < 0.75) {
    ca = pick(t > 0.6 || R() < 0.45 ? SKY.light : SKY.mid, R);
    cb = pick(R() < 0.5 ? SKY.white : SKY.light, R);
  } else if (band < -0.35 && R() < 0.55) {
    ca = mixC(ca, pick(SKY.dark, R), 0.5);
  }
  const wd = windAt(x, y);
  const wf = 1 - wd.d / (WIND_W * 1.15) + 0.35 * (vnoise(x / 40, y / 40, 9) - 0.5);
  if (wf > 0 && R() < 0.4 + wf) {
    ca = pick(wf > 0.45 ? (R() < 0.3 ? SKY.white : SKY.light) : SKY.light, R);
    cb = pick(R() < 0.3 ? SKY.green : SKY.white, R);
  }
  for (const s of STARS) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < s.r * 2.1) {
      const f = 1 - (d - s.r * 1.05) / (s.r * 1.05);
      if (R() < f) { ca = pick(f > 0.55 ? SKY.star : SKY.green, R); cb = pick(SKY.white, R); }
    }
  }
  const dm = Math.hypot(x - MOON.x, y - MOON.y);
  if (dm < MOON.halo * 1.6) {
    const f = 1 - (dm - MOON.halo) / (MOON.halo * 0.6);
    if (R() < f) { ca = pick(f > 0.6 ? SKY.moon : SKY.green, R); cb = pick(SKY.star, R); }
  }
  return [ca, cb];
}

// ------------------------------------------------------------------ ground: canvas weave + thin underpainting
export function weaveTiles(S) {
  const tw = 3 * S, T = Math.round(16 * tw);             // 16 threads of 3 units
  const col = mk(T, T), hgt = mk(T, T);
  const cc = col.getContext('2d'), hc = hgt.getContext('2d');
  const ci = cc.createImageData(T, T), hi = hc.createImageData(T, T);
  for (let j = 0; j < T; j++) for (let i = 0; i < T; i++) {
    const a = Math.floor(i / tw), b = Math.floor(j / tw);
    const fx = ((i % tw) + 0.5) / tw, fy = ((j % tw) + 0.5) / tw;
    const tx = Math.sin(Math.PI * fx), ty = Math.sin(Math.PI * fy);
    const over = (a + b) & 1;
    const thA = 0.78 + 0.44 * hash3(a, 0, 71), thB = 0.78 + 0.44 * hash3(0, b, 72);
    const v = over ? tx * (0.62 + 0.38 * ty) * thA : ty * (0.62 + 0.38 * tx) * thB;
    const k = (j * T + i) * 4;
    const sh = 0.8 + 0.28 * v + (hash3(i, j, 73) - 0.5) * 0.06;
    ci.data[k] = 196 * sh; ci.data[k + 1] = 182 * sh; ci.data[k + 2] = 150 * sh; ci.data[k + 3] = 255;
    const hv = 4 + 46 * v;
    hi.data[k] = hi.data[k + 1] = hi.data[k + 2] = hv; hi.data[k + 3] = 255;
  }
  cc.putImageData(ci, 0, 0); hc.putImageData(hi, 0, 0);
  return { col, hgt };
}

export function paintGround(P, weave) {
  const { c, h } = P;
  for (const [ctx, pat] of [[c, weave.col], [h, weave.hgt]]) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = ctx.createPattern(pat, 'repeat'); ctx.fillRect(0, 0, P.W, P.H);
    ctx.restore();
  }
  c.globalAlpha = 0.68;
  const g = c.createLinearGradient(0, 0, 0, SKY_BOTTOM);
  g.addColorStop(0, '#16245c'); g.addColorStop(0.55, '#24428a'); g.addColorStop(1, '#4a78a6');
  c.fillStyle = g; c.fillRect(0, 0, W, SKY_BOTTOM + 10);
  const band = (top, bot, col) => {
    c.fillStyle = col; c.beginPath(); c.moveTo(-5, top(-5));
    for (let x = 0; x <= W + 5; x += 10) c.lineTo(x, top(x));
    for (let x = W + 5; x >= -5; x -= 10) c.lineTo(x, bot(x));
    c.closePath(); c.fill();
  };
  band(ridgeFar, ridgeNear, '#22407a');
  band(ridgeNear, () => 600, '#1d3a48');
  band(() => 560, FIELD_Y, '#1f3830');
  band(FIELD_Y, () => H + 5, '#3a4a2c');
  c.globalAlpha = 1;
}

/** @param tick optional: called with the fraction done every few hundred strokes (the sky is most of the work). */
export function paintSky(P, tick) {
  const items = [];
  const g = 8.6;
  for (let gy = -2; gy * g < SKY_BOTTOM + 20; gy++) for (let gx = -2; gx * g < W + 14; gx++) {
    const R = rng(hash(ID, 'sky', gx, gy));
    const x = (gx + R()) * g, y = (gy + R()) * g;
    if (y > ridgeFar(x) + 6) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  items.forEach(({ x, y, R }, i) => {
    if (tick && (i & 511) === 0) tick(i / items.length);
    let L = lerp(15, 30, R());
    for (const s of STARS) { const d = Math.hypot(x - s.x, y - s.y); if (d < s.r * 2) L = Math.min(L, 8 + d * 0.45); }
    const w = lerp(5, 7.4, R());
    const [ca, cb] = skyColour(x, y, R);
    dash(P, stream(x, y, L, skyDir), w, ca, cb, R, { h: 135 + R() * 40 });
  });
}

// ------------------------------------------------------------------ hills
const HILLS = {
  far: pal(['#2a4a86', '#34589a', '#24407a', '#3a6aa0', '#1f3566', '#2c5290']),
  farHi: pal(['#7aa6c4', '#9cc0c8', '#86b0c8', '#6a96bc']),
  near: pal(['#1f4050', '#2a5060', '#1c3646', '#2e4a40', '#244a58', '#1a3040']),
  nearHi: pal(['#4f7a80', '#5a8a8a', '#46707a']),
  olive: pal(['#3a4a32', '#44583a']),
};
export function paintHills(P) {
  const slope = (f, x) => (f(x + 3) - f(x - 3)) / 6;
  const items = [];
  const g = 8, Y0 = 400, Y1 = 608;
  for (let gy = 0; Y0 + gy * g < Y1 + 2; gy++) for (let gx = -2; gx * g < W + 14; gx++) {
    const R = rng(hash(ID, 'hill', gx, gy));
    const x = (gx + R()) * g, y = Y0 + (gy + R()) * g;
    const yf = ridgeFar(x), yn = ridgeNear(x);
    if (y < yf - 1 || y > Y1) continue;
    items.push({ k: R(), x, y, R, near: y > yn - 2 });
  }
  shuffleSort(items);
  for (const it of items) {
    const { x, y, R } = it;
    const dir = (px, py) => {
      const yf = ridgeFar(px), yn = ridgeNear(px);
      let s;
      if (py < yn) { const d = clamp((py - yf) / Math.max(8, yn - yf)); s = lerp(slope(ridgeFar, px), slope(ridgeNear, px), d); }
      else s = slope(ridgeNear, px) * (1 - clamp((py - yn) / 80));
      s += 0.12 * Math.sin(px * 0.05 + py * 0.08);
      const l = Math.hypot(1, s); return [1 / l, s / l];
    };
    const pts = stream(x, y, lerp(14, 26, R()), dir);
    let ca, cb;
    if (!it.near) {
      const d = (y - ridgeFar(x)) / Math.max(8, ridgeNear(x) - ridgeFar(x));
      ca = d < 0.18 && R() < 0.7 ? pick(HILLS.farHi, R) : pick(HILLS.far, R);
      cb = pick(d < 0.3 ? SKY.light : HILLS.farHi, R);
      if (d > 0.75 && R() < 0.5) ca = mixC(ca, PRUSSIAN, 0.4);
    } else {
      const d = y - ridgeNear(x);
      ca = d < 10 && R() < 0.55 ? pick(HILLS.nearHi, R) : R() < 0.18 ? pick(HILLS.olive, R) : pick(HILLS.near, R);
      cb = pick(HILLS.nearHi, R);
    }
    dash(P, pts, lerp(5, 7, R()), ca, cb, R, { h: 140 });
  }
  // contour lines: Prussian outline along the ridges + a pale lit line just below the far ridge
  for (const [key, f, col, cb, w, off, gap] of [
    ['cfar', ridgeFar, PRUSSIAN, hx('#2a4070'), 3.4, 0, 0.18], ['cnear', ridgeNear, hx('#0f2030'), PRUSSIAN, 3.2, 0, 0.15],
    ['lfar', ridgeFar, hx('#9cc0c8'), hx('#d0e0d8'), 2.6, 6, 0.45]]) {
    const R = rng(hash(ID, key));
    for (let x = -10; x < W + 10;) {
      const L = 26 + R() * 30;
      const pts = [];
      for (let s = 0; s <= L; s += 4) pts.push([x + s, f(x + s) + off + (R() - 0.5) * 0.8]);
      if (R() > gap) dash(P, pts, w, col, cb, rng(hash(ID, key, x | 0)), { h: 175, nb: 3 });
      x += L * (0.75 + R() * 0.4);
    }
  }
}

// ------------------------------------------------------------------ village
const VILLAGE = {
  ground: pal(['#1f3a2e', '#23402f', '#2a4a36', '#1a2f2a', '#1e3550', '#253f3a']),
  groundHi: pal(['#3a5a40', '#44604a', '#3a5a5a']),
  wall: pal(['#e8e0c0', '#f0e8c8', '#ddd5b4', '#e6dcac', '#d8d4c0']),
  wallB: pal(['#c8c0a0', '#b8c8d8', '#f4ecc8']),
  side: pal(['#8c9cc0', '#a0a8c8', '#7a8ab0', '#96a2c0']),
  sideB: pal(['#c0c8d8', '#6a7aa8']),
  roof: { blue: pal(['#3a5a9a', '#2f4f8a', '#4a6aa8', '#28407a']), green: pal(['#3a6a6a', '#2f5a5a', '#4a7a70', '#2a4a58']), red: pal(['#a8583a', '#b8683a', '#985030', '#8a4a34']) },
  roofB: { blue: hx('#6a8ac0'), green: hx('#7aa0a0'), red: hx('#c88850') },
  lit: pal(['#f2c84a', '#f6d860', '#eebc40']), litB: hx('#fff0a8'),
  dark: pal(['#1c2640', '#232c48', '#1a2238']),
  tree: pal(['#16261c', '#1c3024', '#1f3a2a', '#12201a', '#1a2c34']), treeHi: pal(['#2f4a34', '#3a5a3a', '#2a4a4a']),
};

/** Fill a polygon with small dashes in a given direction (grid in the shape's own bbox). */
function dashFill(P, key, poly, o) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const gx = o.gx ?? 4.5, gy = o.gy ?? 6;
  const items = [];
  for (let j = 0; y0 + j * gy < y1 + gy; j++) for (let i = 0; x0 + i * gx < x1 + gx; i++) {
    const R = rng(hash(ID, key, i, j));
    const x = x0 + (i + R()) * gx - gx * 0.5, y = y0 + (j + R()) * gy - gy * 0.5;
    if (!inPoly(poly, x, y)) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  for (const { x, y, R } of items) {
    const [dx, dy] = o.dir(x, y, R);
    const L = lerp(o.L[0], o.L[1], R());
    const pts = [[x - dx * L / 2, y - dy * L / 2], [x + dx * L * 0.05 + (R() - 0.5) * 0.6, y + dy * L * 0.05], [x + dx * L / 2, y + dy * L / 2]];
    const [ca, cb] = o.col(x, y, R);
    dash(P, pts, lerp(o.w[0], o.w[1], R()), ca, cb, R, { h: o.h ?? 150, nb: o.nb });
  }
}

function outline(P, key, pts, w = 1.7, col = PRUSSIAN, gap = 0.2) {
  const R = rng(hash(ID, key));
  const sp = smoothPath(pts, 3);
  for (let i = 0; i < sp.length - 1;) {
    const n = 2 + ((R() * 4) | 0);
    const seg = sp.slice(i, Math.min(sp.length, i + n + 1));
    if (seg.length > 1 && R() > gap) dash(P, seg, w, col, hx('#24406a'), rng(hash(ID, key, i)), { h: 185, nb: 2, ridge: false });
    i += n;
  }
}

/**
 * What a window does, decided once per window from its seed: about half stay dark, a few are lit from the start,
 * the rest light up later in one of three waves, and only some of those give off a glow.
 */
export function windowPlan(key, i) {
  const R = rng(hash(ID, 'plan', key, i));
  const v = R();
  if (v < 0.5) return { group: -1, glow: false };
  if (v < 0.66) return { group: 0, glow: false };
  return { group: 1 + Math.floor(R() * 3), glow: R() < 0.3 };
}

const windowShape = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
function paintWindow(P, key, x, y, w, h, lit) {
  const R = rng(hash(ID, key));
  if (lit) {
    fillPoly(P, windowShape(x, y, w, h), pick(VILLAGE.lit, R), 170);
    dash(P, [[x + w * 0.3, y + 1], [x + w * 0.35, y + h - 1]], w * 0.55, VILLAGE.litB, pick(VILLAGE.lit, R), R, { h: 205, nb: 2 });
  } else {
    fillPoly(P, windowShape(x, y, w, h), pick(VILLAGE.dark, R), 120);
  }
}

function paintHouse(P, hs, key, wave = null) {
  const { x, yb, w, h, roof, side, type, roofC } = hs;
  const sc = w < 30 ? 0.6 : 1;
  const top = yb - h, dz = side * 0.35;
  const wallCol = (px, py, R) => [pick(VILLAGE.wall, R), pick(VILLAGE.wallB, R)];
  const sideCol = (px, py, R) => [pick(VILLAGE.side, R), pick(VILLAGE.sideB, R)];
  const roofCol = (px, py, R) => [pick(VILLAGE.roof[roofC], R), VILLAGE.roofB[roofC]];
  const vert = () => [0, 1];
  const front = [[x, yb], [x, top], [x + w, top], [x + w, yb]];
  const sideW = [[x + w, yb], [x + w, top], [x + w + side, top - dz], [x + w + side, yb - dz]];
  const fw = [2.4 * sc + 0.6, 3.6 * sc], fL = [5 * sc + 2, 9 * sc + 1];
  fillPoly(P, sideW, VILLAGE.side[0]);
  dashFill(P, key + 's', sideW, { dir: vert, L: fL, w: fw, col: sideCol, gx: 3.6 * sc + 1, gy: 6 * sc });
  if (type === 'long') {
    const rf = [[x - 4 * sc, top + 1], [x + w + 3 * sc, top + 1], [x + w + side, top - dz], [x + w - 5 * sc + side * 0.3, top - roof], [x + 5 * sc, top - roof]];
    fillPoly(P, front, VILLAGE.wall[0]);
    dashFill(P, key + 'f', front, { dir: vert, L: fL, w: fw, col: wallCol, gx: 3.6 * sc + 1, gy: 6 * sc });
    fillPoly(P, rf, VILLAGE.roof[roofC][0]);
    dashFill(P, key + 'r', rf, { dir: (px, py, R) => [1, (R() - 0.5) * 0.2], L: [8 * sc + 2, 14 * sc + 2], w: fw, col: roofCol, gx: 5 * sc + 1, gy: 3.6 * sc + 0.6 });
    outline(P, key + 'o1', [[x - 4 * sc, top + 1], [x + 5 * sc, top - roof], [x + w - 5 * sc + side * 0.3, top - roof], [x + w + side, top - dz]], 1.6 * sc + 0.4);
  } else {
    const gable = [[x, top], [x + w / 2, top - roof], [x + w, top]];
    const rf = [[x + w / 2, top - roof], [x + w + 2 * sc, top + 1], [x + w + side + 2 * sc, top + 1 - dz], [x + w / 2 + side, top - roof - dz]];
    const wall = front.slice(0, 2).concat(gable.slice(1), front.slice(2));
    fillPoly(P, wall, VILLAGE.wall[0]);
    dashFill(P, key + 'f', wall, { dir: vert, L: fL, w: fw, col: wallCol, gx: 3.6 * sc + 1, gy: 6 * sc });
    fillPoly(P, rf, VILLAGE.roof[roofC][0]);
    dashFill(P, key + 'r', rf, { dir: () => [0.86, -0.5], L: [8 * sc + 2, 13 * sc + 2], w: fw, col: roofCol, gx: 4.5 * sc + 1, gy: 4 * sc + 0.6 });
    outline(P, key + 'o1', [[x - 2 * sc, top + 2], [x + w / 2, top - roof], [x + w + 2 * sc, top + 2]], 1.6 * sc + 0.4);
    outline(P, key + 'o3', [[x + w / 2, top - roof], [x + w / 2 + side, top - roof - dz]], 1.4 * sc + 0.4);
  }
  outline(P, key + 'o2', [[x, top + 2], [x, yb]], 1.4 * sc + 0.3, PRUSSIAN, 0.3);
  outline(P, key + 'o4', [[x + w, top], [x + w, yb]], 1.4 * sc + 0.3, PRUSSIAN, 0.3);
  const ww = w < 30 ? 4 : 6, wh = w < 30 ? 5 : 8;
  const ours = [];
  hs.win.forEach(([dx, dy], i) => {
    const plan = windowPlan(key, i);
    if (wave != null && plan.group === wave) ours.push([x + dx, top + dy, plan.glow, `${key}w${i}`]);
    else paintWindow(P, `${key}w${i}`, x + dx, top + dy, ww, wh, wave == null && plan.group === 0);
  });
  if (hs.door) fillPoly(P, windowShape(x + hs.door, yb - 12, 7, 12), hx('#1f2a40'), 110);
  if (ours.length) {
    erasing(P, false);
    for (const [wx, wy, glow, k] of ours) if (glow) paintGlow(P, wx, wy, ww, wh, rng(hash(ID, 'glow', k)));
    for (const [wx, wy, , k] of ours) paintWindow(P, k, wx, wy, ww, wh, true);
    erasing(P, true);
  }
}

function paintChurch(P, wave = null) {
  const C = CHURCH;
  paintHouse(P, { x: C.x, yb: C.yb, w: C.w, h: C.h, roof: C.roof, side: 12, type: 'long', roofC: 'blue', win: C.win }, 'housech', wave);
  const tx = C.tx, tw = C.tw, top = C.top;
  const tower = [[tx, C.yb], [tx, top], [tx + tw, top], [tx + tw, C.yb]];
  const tside = [[tx + tw, C.yb], [tx + tw, top], [tx + tw + 8, top - 3], [tx + tw + 8, C.yb - 3]];
  fillPoly(P, tside, VILLAGE.side[0]);
  dashFill(P, 'tws', tside, { dir: () => [0, 1], L: [6, 10], w: [2.6, 3.4], col: (x, y, R) => [pick(VILLAGE.side, R), pick(VILLAGE.sideB, R)], gx: 3.4, gy: 6 });
  fillPoly(P, tower, VILLAGE.wall[0]);
  dashFill(P, 'tw', tower, { dir: () => [0, 1], L: [6, 11], w: [2.8, 3.6], col: (x, y, R) => [pick(VILLAGE.wall, R), pick(VILLAGE.wallB, R)], gx: 4, gy: 6.5 });
  fillPoly(P, windowShape(tx + 7, top + 6, 10, 13), hx('#141c30'), 100);
  // the bell hangs in the belfry opening
  fillPoly(P, [[tx + 9.5, top + 9], [tx + 14.5, top + 9], [tx + 16, top + 15], [tx + 17.5, top + 18], [tx + 6.5, top + 18], [tx + 8, top + 15]], hx('#c9a24a'), 170);
  paintWindow(P, 'tww', tx + 9, top + 40, 6, 9, false);
  const sp = [[tx - 3, top + 1], [tx + tw / 2 + 1, C.spire], [tx + tw + 9, top - 2]];
  fillPoly(P, sp, hx('#1f3a4a'));
  dashFill(P, 'sp', sp, {
    dir: (x, y) => { const dx = tx + tw / 2 - x, dy = C.spire - y, l = Math.hypot(dx, dy); return [dx / l, dy / l]; },
    L: [10, 18], w: [2.8, 3.8], gx: 4, gy: 9,
    col: (x, y, R) => (x < tx + tw / 2 - 2 ? [pick(pal(['#4a6a8a', '#3a5a7a', '#5a7a9a']), R), hx('#8aa8c0')] : [pick(pal(['#1f3a4a', '#1a2f40', '#24405a']), R), hx('#2f5070')]),
  });
  outline(P, 'spo1', [[tx - 3, top + 1], [tx + tw / 2 + 1, C.spire]], 1.8);
  outline(P, 'spo2', [[tx + tw / 2 + 1, C.spire], [tx + tw + 9, top - 2]], 1.8);
  outline(P, 'two', [[tx, top], [tx, C.yb - C.h]], 1.4, PRUSSIAN, 0.2);
}

function paintTree(P, tr, k) {
  const key = `tree${k}`;
  if (tr.kind === 'poplar') {
    const n = Math.round(tr.h / 5);
    for (let i = 0; i < n * 3; i++) {
      const R = rng(hash(ID, key, i));
      const t = R();
      const hw = tr.w * 0.5 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.7);
      const s = (R() * 2 - 1);
      const x = tr.x + s * hw, y = tr.yb - t * tr.h;
      const L = lerp(8, 15, R());
      const pts = [[x, y + L * 0.5], [x - s * 1.5, y], [x - s * 3, y - L * 0.5]];
      dash(P, pts, lerp(3.2, 4.4, R()), s < -0.3 && R() < 0.6 ? pick(VILLAGE.treeHi, R) : pick(VILLAGE.tree, R), pick(VILLAGE.treeHi, R), R, { h: 155 });
    }
  } else {
    const cx = tr.x, cy = tr.yb - tr.h * 0.5;
    const n = Math.round((tr.w * tr.h) / 28);
    for (let i = 0; i < n; i++) {
      const R = rng(hash(ID, key, i));
      const a = R() * TAU, rr = Math.sqrt(R());
      const x = cx + Math.cos(a) * rr * tr.w * 0.5, y = cy + Math.sin(a) * rr * tr.h * 0.5;
      const ta = a + Math.PI / 2 + 0.3;
      const L = lerp(7, 12, R());
      const pts = [[x - Math.cos(ta) * L / 2, y - Math.sin(ta) * L / 2], [x + Math.cos(ta + 0.3) * 0.5, y + Math.sin(ta + 0.3) * 0.5], [x + Math.cos(ta) * L / 2, y + Math.sin(ta) * L / 2]];
      const lit = Math.cos(a) * -0.6 + Math.sin(a) * -0.8 > 0.3;
      dash(P, pts, lerp(3.2, 4.4, R()), lit && R() < 0.6 ? pick(VILLAGE.treeHi, R) : pick(VILLAGE.tree, R), pick(VILLAGE.treeHi, R), R, { h: 155 });
    }
  }
}

/**
 * The village. With `wave`, paints the layer of windows that light up in that wave instead: the village is replayed in
 * the same order as the main picture, but as an eraser, so whatever stands in front of a window (a house, a tree, the
 * church tower) hides it exactly as it does in the picture.
 */
export function paintVillage(P, wave = null) {
  const items = [];
  const g = 7.5, Y0 = 520, Y1 = 690;
  for (let gy = 0; Y0 + gy * g < Y1; gy++) for (let gx = -2; gx * g < W + 14; gx++) {
    const R = rng(hash(ID, 'vg', gx, gy));
    const x = (gx + R()) * g, y = Y0 + (gy + R()) * g;
    if (y < ridgeNear(x) + 22 || y > FIELD_Y(x) + 4) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  if (wave == null) for (const { x, y, R } of items) {
    const pts = stream(x, y, lerp(12, 22, R()), (px, py) => { const s = 0.15 * Math.sin(px * 0.03 + py * 0.05); const l = Math.hypot(1, s); return [1 / l, s / l]; });
    dash(P, pts, lerp(4.6, 6.4, R()), R() < 0.2 ? pick(VILLAGE.groundHi, R) : pick(VILLAGE.ground, R), pick(VILLAGE.groundHi, R), R, { h: 140 });
  }
  TREES.forEach((tr, k) => { if (tr.z === 0) paintTree(P, tr, k); });
  HOUSES.forEach((hs, k) => { if (hs.z <= 1) paintHouse(P, hs, `house${k}`, wave); });
  paintChurch(P, wave);
  TREES.forEach((tr, k) => { if (tr.z === 2 && !tr.front) paintTree(P, tr, k); });
  HOUSES.forEach((hs, k) => { if (hs.z === 3) paintHouse(P, hs, `house${k}`, wave); });
  TREES.forEach((tr, k) => { if (tr.z === 2 && tr.front) paintTree(P, tr, k); });
}

// ------------------------------------------------------------------ field
const FIELD = {
  base: pal(['#2e4629', '#38522e', '#28422b', '#243a30', '#324c2d', '#2c4028']),
  hi: pal(['#86963e', '#7a8c3a', '#a39446', '#6e7e36', '#90a044']),
  night: hx('#14221b'),
};
export function paintField(P) {
  const items = [];
  const g = 8, Y0 = 660;
  for (let gy = 0; Y0 + gy * g < H + 12; gy++) for (let gx = -2; gx * g < W + 14; gx++) {
    const R = rng(hash(ID, 'fd', gx, gy));
    const x = (gx + R()) * g, y = Y0 + (gy + R()) * g;
    if (y < FIELD_Y(x) - 2) continue;
    items.push({ k: R(), x, y, R });
  }
  shuffleSort(items);
  for (const { x, y, R } of items) {
    const dir = (px, py) => { const s = 0.06 * Math.sin(px * 0.012 + 1) + 0.1 * Math.sin(px * 0.04 + py * 0.15); const l = Math.hypot(1, s); return [1 / l, s / l]; };
    const row = Math.sin(y * 0.42 + Math.sin(x * 0.01) * 2);
    const depth = clamp((y - FIELD_Y(x)) / 140);            // 0 at the field's top edge → 1 at the bottom
    const hi = row > 0.6 && R() < 0.55 * (1 - depth * 0.7);
    const ca = mixC(hi ? pick(FIELD.hi, R) : pick(FIELD.base, R), FIELD.night, depth * 0.45);
    dash(P, stream(x, y, lerp(18, 32, R()), dir), lerp(5, 6.8, R()), ca, pick(FIELD.hi, R), R, { h: 145, mix: 0.4 });
  }
}

// ------------------------------------------------------------------ rotating discs (local coords, centre 0,0)
const COIL = {
  light: pal(['#a8d4d0', '#dfeee6', '#c6e2da', '#eef0c8', '#8cc0c8', '#b8dcd8']),
  mid: pal(['#5f8fc0', '#6fa3b8', '#4f7fb8', '#7aa8c8']),
  dark: pal(['#2f5fb3', '#1d2f6b', '#253f8f', '#24418a', '#1a2c66']),
};
export function paintCoil(P, key, Rs, Rf, lam, hand) {
  const items = [];
  const g = 7;
  const n = Math.ceil(Rf / g) + 1;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const R = rng(hash(ID, key, i, j));
    const x = (i + R() - 0.5) * g, y = (j + R() - 0.5) * g;
    const r = Math.hypot(x, y);
    if (r > Rs + (Rf - Rs) * Math.pow(R(), 0.7)) continue;
    items.push({ k: R(), x, y, R, r });
  }
  shuffleSort(items);
  const dir = (x, y) => {
    const r = Math.hypot(x, y) || 1, ux = x / r, uy = y / r;
    const vr = (hand * lam) / TAU, vt = r;
    const l = Math.hypot(vr, vt);
    return [(vr * ux - vt * uy) / l, (vr * uy + vt * ux) / l];
  };
  for (const { x, y, R, r } of items) {
    const th = Math.atan2(y, x);
    const ph = r / lam - (hand * th) / TAU + 0.06 * Math.sin(3 * th);
    const b = Math.cos(ph * TAU + (R() - 0.5) * 0.7);
    const edge = smoothstep(Rs * 0.82, Rf, r);
    let ca, cb;
    if (r < lam * 0.3) { ca = pick(R() < 0.4 ? SKY.white : COIL.light, R); cb = pick(SKY.star, R); }
    else if (b > -0.2 + edge * 0.6) { ca = pick(r < lam * 0.9 && R() < 0.3 ? SKY.white : COIL.light, R); cb = pick(R() < 0.5 ? SKY.white : COIL.mid, R); }
    else if (b < -0.62) { ca = pick(COIL.dark, R); cb = pick(COIL.mid, R); }
    else { ca = pick(COIL.mid, R); cb = pick(R() < 0.5 ? COIL.light : COIL.dark, R); }
    const L = clamp(r * 0.5, 7, 26) * (0.8 + 0.4 * R());
    dash(P, stream(x, y, L, dir, 2), lerp(4.8, 6.8, R()) * clamp(0.6 + r / 120, 0.7, 1), ca, cb, R, { h: 140 + R() * 40 });
  }
}
/** The ring band wrapped around the coil: one broad luminous band of varying radius and width. */
export function paintRing(P, key, r0, r1, rf) {
  const items = [];
  const g = 7.6;
  const n = Math.ceil(rf / g) + 1;
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const R = rng(hash(ID, key, i, j));
    const x = (i + R() - 0.5) * g, y = (j + R() - 0.5) * g;
    const r = Math.hypot(x, y);
    if (r < r0 || r > r1 + (rf - r1) * Math.pow(R(), 0.8)) continue;
    items.push({ k: R(), x, y, R, r });
  }
  shuffleSort(items);
  const dir = (x, y) => { const r = Math.hypot(x, y) || 1; return [-y / r, x / r]; };
  for (const { x, y, R, r } of items) {
    const th = Math.atan2(y, x);
    const rc = 146 + 9 * Math.sin(2 * th + 0.8) + 5 * Math.sin(5 * th), wb = 15 + 6 * Math.sin(3 * th + 2);
    const d = Math.abs(r - rc) + (R() - 0.5) * 8;
    let ca, cb;
    if (d < wb) { ca = pick(R() < 0.25 ? SKY.white : R() < 0.6 ? COIL.light : SKY.light, R); cb = pick(R() < 0.4 ? SKY.white : SKY.green, R); }
    else if (r < rc) { ca = pick(R() < 0.75 ? COIL.dark : COIL.mid, R); cb = pick(COIL.mid, R); }
    else if (d < wb + 14 && R() < 0.5) { ca = pick(COIL.mid, R); cb = pick(COIL.light, R); }
    else { ca = pick(R() < 0.6 ? SKY.mid : SKY.deep, R); cb = pick(R() < 0.3 ? SKY.light : SKY.mid, R); }
    dash(P, stream(x, y, lerp(16, 30, R()), dir, 2.6), lerp(5, 7, R()), ca, cb, R, { h: 140 + R() * 40 });
  }
}
export function paintStar(P, s) {
  const core = s.r * 0.36;
  const RINGS = [pal(['#f8f2c8', '#f4ecb0', '#fbf6dc', '#f6e27a']), pal(['#d8dc8a', '#c8d49a', '#e0d870']), pal(['#f1d35a', '#f4e48a', '#ecdc90']),
    pal(['#a8c8b0', '#b8d4b8', '#9cc0b8']), pal(['#e0e0a0', '#d4dc98', '#eee6a8']), pal(['#8cb8c8', '#a0c8cc', '#7aaac0'])];
  let ri = 0;
  for (let rr = core + 3.2; rr < s.r * 1.24; rr += 4.6, ri++) {
    const f = (rr - core) / (s.r * 1.24 - core);
    const n = Math.max(4, Math.round((TAU * rr) / 9));
    const rp = RINGS[Math.min(RINGS.length - 1, ri)];
    for (let k = 0; k < n; k++) {
      const R = rng(hash(ID, 'st', s.x, ri, k));
      if (f > 0.8 && R() < (f - 0.8) * 3.5) continue;
      const a0 = ((k + R() * 0.5) / n) * TAU, span = Math.min(1.1, 13 / rr);
      dash(P, arcPts(0, 0, rr + (R() - 0.5) * 1.2, a0, a0 + span, 4), lerp(4, 5.2, R()), pick(rp, R), pick(f < 0.5 ? SKY.white : SKY.star, R), R, { h: 150 + (1 - f) * 40 });
    }
  }
  fillCircle(P, 0, 0, core * 1.2, hx('#fbf4cc'), 185);
  for (let k = 0; k < 6; k++) {
    const R = rng(hash(ID, 'stc', s.x, k));
    const a = R() * TAU, l = core * (0.6 + R() * 0.8);
    dash(P, [[Math.cos(a) * l * 0.6, Math.sin(a) * l * 0.6], [-Math.cos(a) * l * 0.6, -Math.sin(a) * l * 0.6]], core * 0.75, pick(pal(['#fffbe8', '#f8f2c0', '#f6e27a']), R), hx('#ffffff'), R, { h: 196, nb: 3, ridge: false });
  }
}
export function paintFlare(P, s) {
  const n = 18;
  for (let k = 0; k < n; k++) {
    const R = rng(hash(ID, 'fl', s.x, k));
    const a = ((k + R() * 0.6) / n) * TAU;
    const r0 = s.r * (0.95 + R() * 0.15), r1 = s.r * (1.55 + R() * 0.3);
    const curl = 0.32 + R() * 0.16;
    const ray = []; for (let i = 0; i <= 4; i++) { const f = i / 4, rr = lerp(r0, r1, f), aa = a + curl * f * f; ray.push([Math.cos(aa) * rr, Math.sin(aa) * rr]); }
    dash(P, ray, lerp(4, 5.4, R()), pick(R() < 0.4 ? SKY.white : SKY.star, R), pick(SKY.white, R), R, { h: 170 });
  }
  for (const [ri, rf] of [[0, 1.3], [1, 1.12]]) for (let k = 0; k < 16; k++) {
    const R = rng(hash(ID, 'flr', s.x, ri, k));
    const a0 = (k / 16) * TAU + R() * 0.2, rr = s.r * rf;
    dash(P, arcPts(0, 0, rr, a0, a0 + 0.34, 3), 4, pick(ri ? pal(['#fbf6dc', '#f8f0c0']) : SKY.star, R), pick(SKY.white, R), R, { h: 165 });
  }
}
export function paintMoonHalo(P) {
  const Hh = MOON.halo;
  const RINGS = [pal(['#f8f0c0', '#f6e8a8', '#fbf4d0']), pal(['#f1d35a', '#f4e08a', '#f6e27a']), pal(['#ecc45a', '#e8b84c', '#f0c860']),
    pal(['#f4e48a', '#f0dc90', '#e8dc98']), pal(['#e8a53a', '#ecb848', '#e09a38']), pal(['#d8c070', '#e0c878', '#c8c070']),
    // the outer rings end in the same moon-yellows as the sky's glow beneath, so the halo melts into it
    pal(['#ecc45a', '#f0d070', '#e8b84c']), pal(['#e0c060', '#e8c868', '#d8c070'])];
  const INNER = pal(['#1f3f6a', '#264a72', '#2a4c62', '#1d3a5c', '#2f5a6a']);
  fillCircle(P, 0, 0, 8, INNER[0], 140);
  for (let rr = 4; rr < MOON.r + 2; rr += 4.6) {
    const n = Math.max(3, Math.round((TAU * rr) / 9));
    for (let k = 0; k < n; k++) {
      const R = rng(hash(ID, 'mi', rr | 0, k));
      const a0 = ((k + R() * 0.5) / n) * TAU;
      dash(P, arcPts(0, 0, rr, a0, a0 + Math.min(1.6, 12 / rr), 4), 4.8, pick(INNER, R), hx('#4f7a8a'), R, { h: 140 });
    }
  }
  let ri = 0;
  for (let rr = MOON.r + 3; rr < Hh; rr += 4.8, ri++) {
    const f = (rr - MOON.r) / (Hh - MOON.r);
    const n = Math.max(5, Math.round((TAU * rr) / 10));
    const rp = RINGS[Math.min(RINGS.length - 1, ri)];
    for (let k = 0; k < n; k++) {
      const R = rng(hash(ID, 'mh', ri, k));
      if (f > 0.68 && R() < (f - 0.68) * 2.4) continue;
      const a0 = ((k + R() * 0.5) / n) * TAU, span = Math.min(1, 15 / rr);
      dash(P, arcPts(0, 0, rr + (R() - 0.5), a0, a0 + span, 4), lerp(4.4, 5.8, R()), pick(rp, R), pick(SKY.star, R), R, { h: 155 });
    }
  }
}
/** The moon: a dim gold disc (earthshine) with a blazing orange crescent on its lower right. */
export function paintCrescent(P) {
  const r = MOON.r;
  const off = [-13, -11], ri = r * 0.82;
  P.c.save(); P.h.save();
  for (const c of [P.c, P.h]) { c.beginPath(); c.arc(0, 0, r + 1, 0, TAU); c.arc(off[0], off[1], ri, 0, TAU, true); c.clip('evenodd'); }
  fillCircle(P, 0, 0, r + 1, hx('#f4b838'), 170);
  for (let k = 0; k < 18; k++) {
    const R = rng(hash(ID, 'cr', k));
    const rr = r - 1.5 - R() * 10, a0 = -1.0 + R() * 2.7;
    const outer = rr > r - 4;
    dash(P, arcPts(0, 0, rr, a0, a0 + 0.9 + R() * 0.6, 5), lerp(4.2, 5.6, R()), outer ? pick(pal(['#f0a030', '#e8902a', '#f4a83a']), R) : pick(pal(['#f8d860', '#f6c844', '#fbe890', '#f4b838']), R), hx('#fff4c0'), R, { h: 205 });
  }
  P.c.restore(); P.h.restore();
  dash(P, arcPts(0, 0, r + 0.6, -0.95, 2.45, 12), 2.6, hx('#d0601c'), hx('#e88a2a'), rng(hash(ID, 'crO')), { h: 195, nb: 2, ridge: false });
}

// ------------------------------------------------------------------ cypress
const CYPC = {
  lit: pal(['#24382a', '#2c4430', '#34502f', '#2a3e28']), litB: pal(['#55703a', '#6a7a3a', '#4a6a3a', '#7a7a40']),
  mid: pal(['#121a14', '#18241a', '#1c2a1e', '#16201c', '#1a2618']), midB: pal(['#2a3a28', '#24342a']),
  dark: pal(['#0d1418', '#101c26', '#142430', '#0f1a1c']), darkB: pal(['#1d3050', '#142a4f']),
  brown: pal(['#3a3020', '#4a4026']),
};
const CYP_H = CYP.by - CYP.top;
const cypHW = (t) => CYP.hw * (0.5 + 0.5 * smoothstep(0, 0.2, t)) * Math.pow(Math.max(0, 1 - t), 0.72);
const flameAng = (t, s) => 0.5 * s + 0.35 * Math.sin(t * 19 + s * 2.2 + 1.1) + 0.2 * Math.sin(t * 41 - s * 2.7);
const lobe = (t, side) => 1 + 0.34 * Math.max(0, Math.sin(t * (side < 0 ? 31 : 27) + (side < 0 ? 0.4 : 2.1))) ** 2 - 0.1;
export function buildCypress() {
  const out = [];
  const dy = 10, dxs = 7.4;
  for (let iy = 0; iy * dy < CYP_H - 4; iy++) {
    const yy = iy * dy, t = yy / CYP_H, hw = cypHW(t);
    if (hw < 2.5) continue;
    const n = Math.max(1, Math.round((2 * hw) / dxs));
    for (let ix = 0; ix < n; ix++) {
      const R = rng(hash(ID, 'cyp', iy, ix));
      let x = -hw + (ix + R()) * ((2 * hw) / n);
      let y = yy + (R() - 0.5) * dy;
      const L = lerp(16, 30, R()) * (0.55 + 0.45 * Math.min(1, hw / 30));
      const pts = [];
      y -= L * 0.45;
      for (let st = 0; st * 3 <= L; st++) {
        const tt = clamp(y / CYP_H, 0, 1), hh = Math.max(3, cypHW(tt));
        pts.push([tt, clamp(x / hh, -1.05, 1.05)]);
        const a = flameAng(tt, x / hh);
        x += Math.sin(a) * 3; y += Math.cos(a) * 3;
      }
      const s = (-hw + (ix + 0.5) * ((2 * hw) / n)) / hw;
      const v = R();
      let ca, cb;
      if (s < -0.25 && v < 0.55) { ca = pick(CYPC.lit, R); cb = pick(CYPC.litB, R); }
      else if (s > 0.3 && v < 0.6) { ca = pick(CYPC.dark, R); cb = pick(CYPC.darkB, R); }
      else if (v > 0.94) { ca = pick(CYPC.brown, R); cb = pick(CYPC.litB, R); }
      else { ca = pick(CYPC.mid, R); cb = pick(R() < 0.3 ? CYPC.litB : CYPC.midB, R); }
      out.push({ pts, w: lerp(6.2, 8.4, R()), ca, cb, seed: hash(ID, 'cypd', iy, ix), s, k: R() });
    }
  }
  for (const sg of [-1, 1]) for (let k = 0; k < 22; k++) {
    const R = rng(hash(ID, 'tongue', sg, k));
    const t = 0.04 + k * 0.042 + R() * 0.02;
    const pts = [[t - 0.012, 0.4 * sg], [t + 0.008, 0.8 * sg], [t + 0.026, 1.02 * sg], [t + 0.046, 1.1 * sg], [t + 0.066, 1.04 * sg], [t + 0.08, 0.9 * sg]];
    const lit = sg < 0 && R() < 0.6;
    out.push({ pts, w: lerp(7, 9, R()) * (1 - t * 0.5), ca: pick(lit ? CYPC.lit : sg < 0 ? CYPC.mid : CYPC.dark, R), cb: pick(lit ? CYPC.litB : CYPC.darkB, R), seed: hash(ID, 'tg', sg, k), s: sg, k: 2 + R(), tongue: true });
  }
  out.sort((a, b) => a.k - b.k);
  return out;
}
/** Paint the cypress at sway phase ph (radians). */
export function paintCypress(P, list, ph, amp = 1) {
  const A = 3.5 * amp, B = 1.2 * amp;
  const xc = (t) => CYP.bx + CYP.lean * t + A * Math.pow(t, 1.7) * Math.sin(ph - 3.2 * t) + B * t * t * Math.sin(2 * ph - 7 * t + 1);
  const map = (t, s) => [xc(t) + s * cypHW(t) * lobe(t, s), CYP.by - t * CYP_H];
  const sil = [];
  for (let i = 0; i <= 60; i++) sil.push(map(i / 60, -0.98));
  for (let i = 60; i >= 0; i--) sil.push(map(i / 60, 0.98));
  fillPoly(P, sil, hx('#141e18'), 110);
  for (const d of list) {
    const flick = d.tongue ? 0.03 * amp * Math.sin(ph * 3 + (d.seed % 7)) : 0;
    const pts = d.pts.map(([t, s]) => map(t, s + flick * Math.abs(s)));
    dash(P, pts, d.w, d.ca, d.cb, rng(d.seed), { h: 150 });
  }
}

// ------------------------------------------------------------------ lit windows (one layer per wave)
/**
 * Lamplight spilling out of a window: a soft warm falloff, wider than tall. No strokes: small yellow dabs on a pale
 * wall read as extra windows.
 */
function paintGlow(P, x, y, w, h, R) {
  const cx = x + w / 2, cy = y + h / 2, rad = 13 + R() * 4;
  const c = P.c;
  c.save();
  c.translate(cx, cy + 0.5);
  c.scale(1.35, 1);
  const g = c.createRadialGradient(0, 0, Math.min(w, h) * 0.35, 0, 0, rad);
  g.addColorStop(0, 'rgba(255, 224, 140, 0.8)');
  g.addColorStop(0.3, 'rgba(246, 202, 100, 0.42)');
  g.addColorStop(0.65, 'rgba(234, 172, 70, 0.13)');
  g.addColorStop(1, 'rgba(232, 168, 64, 0)');
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, rad, 0, TAU); c.fill();
  c.restore();
}

/** The windows that light up in wave g (null when the wave is empty). */
export function windowGroup(S, g) {
  const list = [];
  const add = (hs, key) => {
    const top = hs.yb - hs.h, small = hs.w < 30;
    hs.win.forEach(([dx, dy], i) => {
      const p = windowPlan(key, i);
      if (p.group === g) list.push({ x: hs.x + dx, y: top + dy, w: small ? 4 : 6, h: small ? 5 : 8, glow: p.glow, key: `${key}w${i}` });
    });
  };
  HOUSES.forEach((hs, k) => add(hs, `house${k}`));
  add({ x: CHURCH.x, yb: CHURCH.yb, w: CHURCH.w, h: CHURCH.h, win: CHURCH.win }, 'housech');
  if (!list.length) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const { x, y, w, h } of list) { x0 = Math.min(x0, x - 20); y0 = Math.min(y0, y - 16); x1 = Math.max(x1, x + w + 20); y1 = Math.max(y1, y + h + 16); }
  const Wn = new Painter(S, x0, y0, x1 - x0, y1 - y0); Wn.clear();
  Wn.thin = THIN;
  erasing(Wn, true);
  paintVillage(Wn, g);
  erasing(Wn, false);
  return { painter: Wn, x0, y0, w: x1 - x0, h: y1 - y0 };
}

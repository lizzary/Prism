// The home-page Starry Night: the reference scene's arrangement re-laid for an ultra-wide panel.
// Units are composition units (≈ CSS px at a 1440p header). The sky, hills and village keep the original scale;
// the panel is extended left and right with more streams, stars, spirals, farms and fields.
import { curveFn, smoothPath } from './engine.js';

export const VERSION = 'starry-wide-8';
export const W = 2800;
export const H = 820;

// ------------------------------------------------------------------ sky
export const C0 = { x: 1560, y: 226 };                 // the great spiral
export const COIL_R = 104, COIL_F = 134;               // coil: solid radius, ragged-edge radius
export const RING_R0 = 92, RING_R1 = 170, RING_F = 204;
export const SMALL = [
  { x: 420, y: 160, r: 54, f: 76, k: 0.75, lam: 34 },
  { x: 1000, y: 330, r: 44, f: 64, k: 0.9, lam: 30 },
  { x: 1990, y: 318, r: 46, f: 66, k: 0.85, lam: 31 },
  { x: 2630, y: 372, r: 40, f: 58, k: 0.8, lam: 28 },
];
export const MOON = { x: 2232, y: 150, r: 29, halo: 68 };
export const STARS = [
  { x: 70, y: 96, r: 22 }, { x: 236, y: 300, r: 17 }, { x: 226, y: 92, r: 14 }, { x: 600, y: 98, r: 26 },
  { x: 664, y: 292, r: 20 }, { x: 830, y: 134, r: 17 }, { x: 566, y: 404, r: 14 }, { x: 1140, y: 102, r: 24 },
  { x: 1232, y: 252, r: 18 }, { x: 1182, y: 404, r: 15 }, { x: 1296, y: 132, r: 13 }, { x: 1822, y: 96, r: 16 },
  { x: 1850, y: 224, r: 22 }, { x: 2066, y: 156, r: 19 }, { x: 2112, y: 420, r: 15 }, { x: 2276, y: 330, r: 34 },
  { x: 2522, y: 122, r: 24 }, { x: 2702, y: 100, r: 18 }, { x: 2742, y: 252, r: 22 }, { x: 2486, y: 408, r: 15 },
];
STARS.forEach((s, k) => { s.dir = k % 2 ? 1 : -1; s.R = Math.ceil(s.r * 1.3 + 6); s.F = Math.ceil(s.r * 1.95 + 6); });

// the serpentine "wind": a luminous stream under the left spiral, beneath the great one, curling into the right one
export const WIND = smoothPath([[-30, 232], [80, 230], [190, 248], [300, 286], [400, 334], [500, 372], [620, 400],
  [740, 410], [860, 408], [980, 414], [1100, 430], [1220, 448], [1340, 456], [1460, 458], [1580, 452], [1700, 440],
  [1800, 420], [1880, 392], [1940, 362], [1966, 340]], 8);
export const WIND_W = 21;

// ------------------------------------------------------------------ land
export const ridgeFar = curveFn([[-20, 452], [70, 430], [150, 414], [240, 428], [340, 456], [430, 470], [520, 462],
  [610, 446], [700, 428], [780, 434], [860, 456], [950, 448], [1040, 430], [1140, 436], [1250, 458], [1360, 472],
  [1470, 474], [1570, 466], [1680, 450], [1790, 432], [1880, 424], [1980, 438], [2080, 458], [2180, 466],
  [2280, 452], [2380, 436], [2480, 428], [2580, 440], [2680, 456], [2830, 448]]);
export const ridgeNear = curveFn([[-20, 522], [90, 508], [180, 526], [280, 546], [380, 534], [480, 522], [580, 536],
  [690, 552], [790, 532], [880, 516], [1000, 524], [1120, 540], [1240, 552], [1360, 542], [1480, 530], [1600, 540],
  [1720, 556], [1840, 546], [1960, 530], [2080, 520], [2200, 532], [2320, 548], [2440, 540], [2560, 526],
  [2680, 532], [2830, 540]]);
export const FIELD_Y = (x) => 672 + 4 * Math.sin(x * 0.013 + 0.6) + 3 * Math.sin(x * 0.0041 + 1.7);
export const SKY_BOTTOM = 480;                          // lowest the sky reaches (below the far ridge's lowest point)

// village: z 0 far valley farms · 1 back row · 3 front row. win: [dx, dy, group] (group 0 lit, 1–3 light up, 9 dark)
export const HOUSES = [
  // far valley farms (tiny)
  { z: 0, x: 652, yb: 588, w: 22, h: 11, roof: 8, side: 8, type: 'long', roofC: 'blue', win: [[6, 3, 0]] },
  { z: 0, x: 746, yb: 582, w: 26, h: 12, roof: 9, side: 9, type: 'gable', roofC: 'blue', win: [[6, 4, 0], [15, 4, 9]] },
  { z: 0, x: 840, yb: 592, w: 20, h: 10, roof: 8, side: 7, type: 'long', roofC: 'red', win: [[7, 3, 9]] },
  { z: 0, x: 1382, yb: 596, w: 22, h: 11, roof: 8, side: 8, type: 'gable', roofC: 'blue', win: [[6, 3, 2]] },
  { z: 0, x: 1470, yb: 590, w: 26, h: 12, roof: 9, side: 9, type: 'long', roofC: 'green', win: [[6, 4, 0], [16, 4, 9]] },
  { z: 0, x: 1612, yb: 598, w: 20, h: 10, roof: 8, side: 7, type: 'long', roofC: 'blue', win: [[7, 3, 0]] },
  { z: 0, x: 2526, yb: 594, w: 24, h: 11, roof: 8, side: 8, type: 'gable', roofC: 'red', win: [[7, 3, 0]] },
  // the village at the left, back row
  { z: 1, x: 278, yb: 624, w: 46, h: 24, roof: 18, side: 13, type: 'gable', roofC: 'blue', win: [[9, 8, 1], [28, 8, 0]] },
  { z: 1, x: 348, yb: 620, w: 40, h: 22, roof: 16, side: 12, type: 'long', roofC: 'blue', win: [[8, 7, 9], [25, 7, 1]] },
  { z: 1, x: 532, yb: 628, w: 42, h: 22, roof: 16, side: 12, type: 'long', roofC: 'green', win: [[9, 7, 3], [27, 7, 0]] },
  { z: 1, x: 1760, yb: 628, w: 44, h: 23, roof: 17, side: 12, type: 'gable', roofC: 'blue', win: [[9, 8, 2], [27, 8, 0]] },
  { z: 1, x: 1828, yb: 624, w: 38, h: 21, roof: 15, side: 11, type: 'long', roofC: 'green', win: [[8, 7, 1]] },
  { z: 1, x: 40, yb: 626, w: 44, h: 22, roof: 16, side: 12, type: 'long', roofC: 'red', win: [[9, 7, 0], [26, 7, 2]] },
  // front row
  { z: 3, x: 256, yb: 660, w: 56, h: 30, roof: 20, side: 15, type: 'long', roofC: 'blue', win: [[8, 9, 1], [24, 9, 1], [40, 9, 9]], door: 30 },
  { z: 3, x: 326, yb: 663, w: 62, h: 38, roof: 22, side: 14, type: 'gable', roofC: 'blue', win: [[10, 8, 3], [42, 8, 3], [10, 22, 0], [26, 22, 9]], door: 44 },
  { z: 3, x: 400, yb: 662, w: 40, h: 26, roof: 17, side: 11, type: 'long', roofC: 'red', win: [[8, 8, 2], [24, 8, 9]] },
  { z: 3, x: 532, yb: 664, w: 50, h: 30, roof: 19, side: 13, type: 'gable', roofC: 'blue', win: [[9, 9, 3], [30, 9, 2]], door: 20 },
  { z: 3, x: 940, yb: 665, w: 58, h: 30, roof: 20, side: 14, type: 'long', roofC: 'blue', win: [[9, 9, 0], [26, 9, 9], [42, 9, 0]], door: 33 },
  { z: 3, x: 1014, yb: 662, w: 42, h: 24, roof: 18, side: 12, type: 'gable', roofC: 'green', win: [[9, 8, 9], [25, 8, 0]] },
  { z: 3, x: 1066, yb: 666, w: 36, h: 22, roof: 15, side: 10, type: 'long', roofC: 'red', win: [[8, 7, 0]] },
  { z: 3, x: 1788, yb: 666, w: 54, h: 29, roof: 20, side: 14, type: 'long', roofC: 'blue', win: [[9, 9, 1], [25, 9, 0], [40, 9, 3]], door: 32 },
  { z: 3, x: 1866, yb: 662, w: 46, h: 30, roof: 19, side: 13, type: 'gable', roofC: 'red', win: [[9, 9, 2], [28, 9, 9]], door: 18 },
  { z: 3, x: 2004, yb: 668, w: 50, h: 28, roof: 19, side: 13, type: 'gable', roofC: 'blue', win: [[9, 9, 0], [30, 9, 3]] },
  { z: 3, x: 2080, yb: 664, w: 38, h: 22, roof: 15, side: 11, type: 'long', roofC: 'blue', win: [[8, 7, 2]] },
  { z: 3, x: 2566, yb: 666, w: 48, h: 28, roof: 19, side: 13, type: 'gable', roofC: 'blue', win: [[9, 9, 1], [29, 9, 0]], door: 20 },
  { z: 3, x: 2640, yb: 670, w: 38, h: 22, roof: 15, side: 10, type: 'long', roofC: 'red', win: [[8, 7, 3]] },
];
export const CHURCH = { x: 442, yb: 660, w: 56, h: 32, roof: 20, tx: 492, tw: 24, top: 578, spire: 408,
  win: [[10, 10, 2], [28, 10, 2], [44, 10, 9]] };
export const TREES = [
  { z: 0, x: 702, yb: 610, h: 22, w: 28, kind: 'round' }, { z: 0, x: 800, yb: 600, h: 20, w: 26, kind: 'round' },
  { z: 0, x: 336, yb: 624, h: 74, w: 18, kind: 'poplar' }, { z: 0, x: 518, yb: 628, h: 58, w: 16, kind: 'poplar' },
  { z: 0, x: 1430, yb: 606, h: 20, w: 26, kind: 'round' }, { z: 0, x: 1560, yb: 604, h: 22, w: 30, kind: 'round' },
  { z: 0, x: 1720, yb: 628, h: 62, w: 17, kind: 'poplar' }, { z: 0, x: 2470, yb: 606, h: 22, w: 28, kind: 'round' },
  { z: 2, x: 390, yb: 650, h: 58, w: 16, kind: 'poplar' }, { z: 2, x: 624, yb: 662, h: 70, w: 19, kind: 'poplar' },
  { z: 2, x: 596, yb: 666, h: 40, w: 42, kind: 'round' }, { z: 2, x: 888, yb: 664, h: 40, w: 44, front: true, kind: 'round' },
  { z: 2, x: 924, yb: 658, h: 62, w: 17, front: true, kind: 'poplar' }, { z: 2, x: 1108, yb: 668, h: 30, w: 30, front: true, kind: 'round' },
  { z: 2, x: 720, yb: 672, h: 26, w: 40, kind: 'round' }, { z: 2, x: 800, yb: 674, h: 22, w: 34, kind: 'round' },
  { z: 2, x: 120, yb: 660, h: 66, w: 18, kind: 'poplar' }, { z: 2, x: 190, yb: 668, h: 34, w: 40, kind: 'round' },
  { z: 2, x: 1250, yb: 672, h: 28, w: 42, front: true, kind: 'round' }, { z: 2, x: 1340, yb: 664, h: 64, w: 18, front: true, kind: 'poplar' },
  { z: 2, x: 1690, yb: 670, h: 36, w: 40, kind: 'round' }, { z: 2, x: 1950, yb: 668, h: 66, w: 18, front: true, kind: 'poplar' },
  { z: 2, x: 2150, yb: 672, h: 34, w: 40, front: true, kind: 'round' }, { z: 2, x: 2232, yb: 668, h: 58, w: 16, front: true, kind: 'poplar' },
  { z: 2, x: 2700, yb: 668, h: 62, w: 17, front: true, kind: 'poplar' }, { z: 2, x: 2760, yb: 674, h: 28, w: 38, front: true, kind: 'round' },
];

// the cypress at the right: base, tip, half-width profile (a little taller and fuller than the original)
export const CYP = { bx: 2384, by: 868, top: 30, lean: 12, hw: 60 };
export const CYP_REG = { x0: 2280, y0: 16, w: 210, h: H - 16 };

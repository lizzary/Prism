// Bake every layer of the home-page Starry Night at S px/unit.
// Returns [{ id, kind, ...placement, canvas }]: one static picture plus the small layers that move.
import { Painter, litCanvas } from './engine.js';
import {
  W, H, C0, COIL_R, COIL_F, RING_R0, RING_R1, RING_F, SMALL, MOON, STARS, CYP_REG,
} from './composition.js';
import {
  weaveTiles, paintGround, paintSky, paintHills, paintVillage, paintField, paintCoil, paintRing, paintStar,
  paintFlare, paintMoonHalo, paintCrescent, buildCypress, paintCypress, windowGroup, THIN,
} from './paint.js';


/** @param onProgress optional: receives 0…1 as the stages finish (for a progress indicator; not the picture itself). */
export function bakeStarry(S, onLayer, onProgress) {
  const emit = (layer) => { onLayer(layer); };
  const stage = (v) => onProgress?.(v);

  // ---- the static picture
  const P = new Painter(S, 0, 0, W, H);
  P.thin = THIN;
  paintGround(P, weaveTiles(S)); stage(0.04);
  paintSky(P, (f) => stage(0.04 + 0.38 * f)); stage(0.42);
  paintHills(P); stage(0.5);
  paintVillage(P); stage(0.6);
  paintField(P); stage(0.66);
  emit({ id: 'main', kind: 'main', x: 0, y: 0, w: W, h: H, canvas: litCanvas(P, { relief: 0.022 }) });
  stage(0.74);

  // ---- discs that turn (whole-dash discs with ragged edges, so no disc edge is visible)
  const disc = (rad, paint) => {
    const D = new Painter(S, -rad, -rad, rad * 2, rad * 2);
    D.clear(); paint(D);
    return litCanvas(D, { relief: 0.02 });
  };
  const ringPad = RING_F + 10, coilPad = COIL_F + 10;
  emit({ id: 'ring', kind: 'spin', cx: C0.x, cy: C0.y, half: ringPad, rate: 0.5, canvas: disc(ringPad, (D) => paintRing(D, 'ring', RING_R0, RING_R1, RING_F)) });
  emit({ id: 'coil', kind: 'spin', cx: C0.x, cy: C0.y, half: coilPad, rate: 1, canvas: disc(coilPad, (D) => paintCoil(D, 'coil', COIL_R, COIL_F, 72, 1)) });
  SMALL.forEach((sm, k) => {
    const pad = sm.f + 8;
    emit({ id: `small${k}`, kind: 'spin', cx: sm.x, cy: sm.y, half: pad, rate: -sm.k, canvas: disc(pad, (D) => paintCoil(D, 'small' + k, sm.r, sm.f, sm.lam, -1)) });
  });
  emit({ id: 'moonHalo', kind: 'halo', cx: MOON.x, cy: MOON.y, half: MOON.halo + 8, rate: 0.15, canvas: disc(MOON.halo + 8, (D) => paintMoonHalo(D)) });
  emit({ id: 'crescent', kind: 'moon', cx: MOON.x, cy: MOON.y, half: MOON.r + 6, rate: 0, canvas: disc(MOON.r + 6, (D) => paintCrescent(D)) });
  STARS.forEach((st, k) => {
    emit({ id: `star${k}`, kind: 'star', index: k, cx: st.x, cy: st.y, r: st.r, half: st.R, rate: 0.3 * st.dir, phase: k * 0.7, canvas: disc(st.R, (D) => paintStar(D, st)) });
  });
  STARS.forEach((st, k) => {
    emit({ id: `flare${k}`, kind: 'flare', index: k, cx: st.x, cy: st.y, half: st.F, rate: -0.4 * st.dir, phase: k, canvas: disc(st.F, (D) => paintFlare(D, st)) });
  });

  stage(0.9);
  // ---- village windows that light up, wave by wave
  [1, 2, 3].forEach((g) => {
    const wg = windowGroup(S, g);
    if (wg) emit({ id: `win${g}`, kind: 'window', group: g, x: wg.x0, y: wg.y0, w: wg.w, h: wg.h, canvas: litCanvas(wg.painter, { relief: 0.02 }) });
  });

  stage(0.95);
  // ---- the cypress, painted upright once: the page bends it (idle sway, and a sway when the pointer brushes it)
  const Pc = new Painter(S, CYP_REG.x0, CYP_REG.y0, CYP_REG.w, CYP_REG.h);
  Pc.clear();
  paintCypress(Pc, buildCypress(), 0, 0);
  emit({ id: 'cypress', kind: 'cypress', x: CYP_REG.x0, y: CYP_REG.y0, w: CYP_REG.w, h: CYP_REG.h, canvas: litCanvas(Pc, { relief: 0.022 }) });
}

export const STAGE = { W, H };

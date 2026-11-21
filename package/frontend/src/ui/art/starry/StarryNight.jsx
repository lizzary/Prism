// The home-page Starry Night: a baked impasto picture plus the parts that move.
//   • the spirals turn slowly; moving the pointer across the sky stirs them, scrolling spins them
//   • stars breathe; a star or the moon answers a click with a flare
//   • the cypress sways gently, and once more when the pointer brushes it; village windows light up in waves
// Arrival:
//   • first time: a primed canvas (night tone, linen weave) holds the place, with a progress thread if it takes a
//     while; once every layer is painted the whole picture opens out from the great spiral
//   • coming back finds the finished layers still in memory and draws them before the first paint — no placeholder;
//     after a long time away only a small preview is kept, shown at once and sharpened from the disk cache
import { useLayoutEffect, useRef } from 'react';
import { W, H, C0, STARS, MOON, CYP } from './composition.js';
import s from './StarryNight.module.css';

const ANCHOR_X = 0.72;                 // which part of the panel stays in view when the page is narrow
const BASE_SPIN = 0.045;               // rad/s of the great spiral when nothing touches it
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;
const CYP_H = CYP.by - CYP.top;
/** Is a point (composition units) on the cypress? Mirrors its painted half-width profile. */
const onCypress = (x, y) => {
  const t = (CYP.by - y) / CYP_H;
  if (t < 0.02 || t > 0.98) return false;
  const hw = CYP.hw * (0.5 + 0.5 * smooth(t / 0.2)) * Math.pow(1 - t, 0.72);
  return Math.abs(x - (CYP.bx + CYP.lean * t)) < hw * 1.05 + 4;
};

// ------------------------------------------------------------------ kept between visits (module scope = app session)
const KEEP_MS = 5 * 60 * 1000;      // full layers stay this long after leaving the home page
const PREVIEW_SCALE = 1 / 3;
const kept = { layers: null, S: 0, t0: 0, extra: null, preview: null, timer: 0 };
const closeLayers = (L) => {
  for (const list of [L.spin, L.star, L.flare, L.window]) for (const l of list) l?.bitmap?.close?.();
  for (const l of [L.main, L.halo, L.moon, L.cypress]) l?.bitmap?.close?.();
};
/** A small still of the whole picture (moving parts at rest), for the next arrival after the layers are released. */
function makePreview(L) {
  const cv = new OffscreenCanvas(Math.round(W * PREVIEW_SCALE), Math.round(H * PREVIEW_SCALE));
  const c = cv.getContext('2d');
  c.scale(PREVIEW_SCALE, PREVIEW_SCALE);
  c.drawImage(L.main.bitmap, 0, 0, W, H);
  for (const l of [...L.spin, ...L.star, L.halo, L.moon].filter(Boolean)) c.drawImage(l.bitmap, l.cx - l.half, l.cy - l.half, 2 * l.half, 2 * l.half);
  for (const l of [...L.window, L.cypress].filter(Boolean)) c.drawImage(l.bitmap, l.x, l.y, l.w, l.h);
  return cv.transferToImageBitmap();
}

export function StarryNight({ className, onReady }) {
  const wrap = useRef(null);
  const baseCv = useRef(null);
  const topCv = useRef(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;

  // a layout effect: when the layers are still in memory they are drawn before the browser paints the page
  useLayoutEffect(() => {
    const el = wrap.current, base = baseCv.current, top = topCv.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    clearTimeout(kept.timer);
    const warm = kept.layers;                   // finished layers from the previous visit
    const preview = warm ? null : kept.preview; // or just a small still of them
    kept.layers = null;
    const layers = warm ?? { spin: [], star: [], flare: [], halo: null, moon: null, window: [], cypress: null, main: null };
    const born = new Map();          // window layer → when it starts to light up; missing = lit
    const extra = warm ? kept.extra : new Map();   // spin layer id → { angle, vel }
    let baseFade = null;             // { from: ImageBitmap, t: start } while the finished picture fades over a stand-in
    let holdPreview = !!preview;     // keep showing the preview until every layer has arrived
    const flares = new Map();        // star index → start time
    let moonPulse = -10;
    let kick = { t: -1e9, dir: 1 }, overTree = false;   // the cypress's hover sway
    let view = { w: 1, h: 1, dpr: 1, k: 1, ox: 0, oy: 0 };
    let t0 = warm ? kept.t0 : performance.now(), last = performance.now(), lastInput = -1e9, visible = true, raf = 0, firstFrame = warm ? -1e9 : 0;

    // ---------------------------------------------------------- geometry
    const measure = () => {
      const r = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const k = Math.max(r.width / W, r.height / H);
      view = { w: r.width, h: r.height, dpr, k, ox: (r.width - W * k) * ANCHOR_X, oy: 0 };
      for (const cv of [base, top]) {
        cv.width = Math.max(1, Math.round(r.width * dpr));
        cv.height = Math.max(1, Math.round(r.height * dpr));
      }
      drawBase();
      if (layers.main) frame(performance.now());   // resizing clears the canvases: never leave a frame without the moving parts
    };
    const toUnits = (cx, cy) => {
      const r = el.getBoundingClientRect();
      return [(cx - r.left - view.ox) / view.k, (cy - r.top - view.oy) / view.k];
    };

    // ---------------------------------------------------------- drawing
    const setT = (ctx) => ctx.setTransform(view.dpr * view.k, 0, 0, view.dpr * view.k, view.dpr * view.ox, view.dpr * view.oy);
    const FADE_MS = 900;
    /** The static picture, or the small preview until everything has arrived; cross-fading from one to the other. */
    function drawBase(now = performance.now()) {
      const ctx = base.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, base.width, base.height);
      setT(ctx);
      ctx.imageSmoothingQuality = 'high';
      const under = baseFade?.from ?? (layers.main && !holdPreview ? null : preview);
      if (under) ctx.drawImage(under, 0, 0, W, H);
      if (!layers.main || holdPreview) return;
      const a = baseFade ? smooth((now - baseFade.t) / FADE_MS) : 1;
      ctx.globalAlpha = a;
      ctx.drawImage(layers.main.bitmap, 0, 0, W, H);
      ctx.globalAlpha = 1;
      if (baseFade && a >= 1) { if (baseFade.from !== preview) baseFade.from.close?.(); baseFade = null; }
    }
    const fadeOf = (layer, now, delay = 0, dur = 900) => (born.has(layer) ? smooth((now - born.get(layer) - delay) / dur) : 1);
    const disc = (ctx, l, angle, scale = 1, alpha = 1) => {
      if (alpha <= 0.002) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(l.cx, l.cy);
      ctx.rotate(angle);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.drawImage(l.bitmap, -l.half, -l.half, 2 * l.half, 2 * l.half);
      ctx.restore();
    };

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = reduce ? 0 : (now - t0) / 1000;
      if (baseFade) drawBase(now);
      const ctx = top.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, top.width, top.height);
      setT(ctx);
      ctx.imageSmoothingQuality = 'high';

      // stirred / scrolled extra spin, with friction
      for (const e of extra.values()) { e.angle += e.vel * dt; e.vel *= Math.exp(-dt / 1.3); }
      const great = (extra.get('coil')?.angle ?? 0) + BASE_SPIN * t;

      for (const l of layers.spin) {
        const own = extra.get(l.id)?.angle ?? 0;
        const a = l.id === 'ring' ? great * 0.5 : l.id === 'coil' ? great : BASE_SPIN * l.rate * 1.6 * t + own;
        disc(ctx, l, a, 1, fadeOf(l, now));
      }
      for (const l of layers.flare) {
        const f0 = flares.get(l.index);
        if (f0 == null) continue;
        const u = (now - f0) / 1700;
        if (u > 1) { flares.delete(l.index); continue; }
        const k = Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u * 0.4);
        disc(ctx, l, -great * 0.4 * l.rate + l.phase + u * 1.4, 0.85 + 0.35 * k, 0.92 * k);
      }
      for (const l of layers.star) {
        const st = STARS[l.index];
        const breathe = 0.5 + 0.5 * Math.sin((t / (3 + (l.index % 5) * 0.55)) * Math.PI * 2 + l.phase * 2.3);
        const f0 = flares.get(l.index);
        const pop = f0 == null ? 0 : Math.sin(Math.PI * clamp((now - f0) / 900, 0, 1));
        disc(ctx, l, great * 0.3 * st.dir + l.phase, 1 + 0.035 * breathe + 0.16 * pop, fadeOf(l, now, 260 + l.index * 70, 700));
      }
      if (layers.halo) {
        const p = Math.max(0, 1 - (now - moonPulse) / 1400);
        const throb = Math.sin(Math.PI * Math.min(1, (now - moonPulse) / 700)) * p;
        disc(ctx, layers.halo, great * 0.15, 1 + 0.02 * Math.sin(t * 1.3) + 0.09 * throb, fadeOf(layers.halo, now, 500, 1000));
      }
      if (layers.moon) disc(ctx, layers.moon, 0, 1, fadeOf(layers.moon, now, 500, 1000));
      for (const l of layers.window) {
        const a = fadeOf(l, now, 900 + (l.group - 1) * 650, 500);
        if (a <= 0) continue;
        ctx.globalAlpha = a;
        ctx.drawImage(l.bitmap, l.x, l.y, l.w, l.h);
        ctx.globalAlpha = 1;
      }
      if (layers.cypress) drawCypress(ctx, layers.cypress, t, now);
    }

    /**
     * The cypress is one upright picture, bent on screen: each band of device rows shifts sideways by an amount that
     * grows towards the tip. Bands sit on whole device pixels, so no seams show between them.
     */
    function drawCypress(ctx, l, t, now) {
      const idle = 2.2 * Math.sin((t * TAU) / 9) + 0.8 * Math.sin((t * TAU) / 4.3 + 1);
      const u = (now - kick.t) / 1000;
      const push = u < 5 ? kick.dir * 12 * Math.exp(-u / 0.95) * Math.sin((u * TAU) / 1.6) : 0;
      const amp = reduce ? 0 : idle + push;                       // sideways bend at the tip, in units
      const sc = view.k * view.dpr, bm = l.bitmap, py = bm.height / l.h;
      const dev = (yU) => (yU * view.k + view.oy) * view.dpr;
      const unit = (Y) => (Y / view.dpr - view.oy) / view.k;
      const bend = (yU) => amp * Math.pow(clamp((CYP.by - yU) / CYP_H, 0, 1), 1.8);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const Y0 = Math.floor(dev(l.y)), Y1 = Math.ceil(dev(l.y + l.h)), x0 = l.x * sc + view.ox * view.dpr, wD = l.w * sc;
      // the foot barely moves: draw it in one piece, then the rest in thin bands
      let Y = Y1;
      while (Y > Y0 && Math.abs(bend(unit(Y - 4))) * sc < 0.2) Y -= 4;
      if (Y < Y1) ctx.drawImage(bm, 0, (unit(Y) - l.y) * py, bm.width, (unit(Y1) - unit(Y)) * py, x0, Y, wD, Y1 - Y);
      for (let b = Y0; b < Y; b += 3) {
        const e = Math.min(Y, b + 3), yU = unit(b), yE = unit(e);
        ctx.drawImage(bm, 0, (yU - l.y) * py, bm.width, (yE - yU) * py, x0 + bend((yU + yE) / 2) * sc, b, wD, e - b);
      }
      ctx.restore();
    }

    // ---------------------------------------------------------- loop (only while visible; slower when idle)
    let skip = false;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const idle = now - lastInput > 2500 && now - firstFrame > 4000;
      if (idle) { skip = !skip; if (skip) return; }
      frame(now);
    };
    const start = () => { if (!raf && visible && !reduce && layers.main) { last = performance.now(); raf = requestAnimationFrame(loop); } };
    const stop = () => { cancelAnimationFrame(raf); raf = 0; };

    // ---------------------------------------------------------- layers from the worker
    const r0 = el.getBoundingClientRect();
    const S = clamp(Math.round(Math.max(r0.width / W, r0.height / H) * Math.min(2, window.devicePixelRatio || 1) * 2) / 2, 1, 2);
    // back from another page at the same (or a smaller) size: nothing to load
    const worker = warm && kept.S >= S ? null : new Worker(new URL('./starry.worker.js', import.meta.url), { type: 'module' });
    let layersS = warm ? kept.S : S;   // scale of the layers in memory
    const shown = !!(warm || preview);
    el.dataset.mode = warm ? 'warm' : preview ? 'preview' : 'cold';
    if (shown) { el.dataset.ready = 'true'; readyRef.current?.(); }

    /** First arrival: open the finished picture out from the great spiral; the windows light up after. */
    let revealTimer = 0;
    const reveal = () => {
      el.style.setProperty('--rx', `${((C0.x * view.k + view.ox) / view.w) * 100}%`);
      el.style.setProperty('--ry', `${((C0.y * view.k + view.oy) / view.h) * 100}%`);
      const now = performance.now();
      for (const l of layers.window) born.set(l, now + 600);
      firstFrame = now;
      el.dataset.ready = 'true';
      readyRef.current?.();
      // the mask is only for the opening: drop it afterwards so the animation composites plainly
      revealTimer = setTimeout(() => { el.dataset.revealed = 'true'; }, reduce ? 0 : 2600);
    };

    const swap = (list, l) => { const i = list.findIndex((x) => x.id === l.id); if (i >= 0) { list[i].bitmap.close?.(); list[i] = l; } else list.push(l); };
    if (worker) worker.onmessage = ({ data }) => {
      if (data.type === 'progress') { el.style.setProperty('--progress', data.value); return; }
      if (data.type === 'done') {
        if (holdPreview) {
          // over the preview the moving parts appeared in place (they line up with it); now the full picture fades in
          holdPreview = false; baseFade = { from: preview, t: performance.now() }; drawBase();
        } else if (!shown) reveal();
        return;
      }
      if (data.type !== 'layer') return;
      const l = data.layer;
      const upgrade = !!warm;          // sharper copies of layers already on screen: swap in place
      if (l.kind === 'main') {
        if (upgrade) { layers.main.bitmap.close?.(); layersS = S; }
        layers.main = l;
        drawBase();
        start();
      } else if (l.kind === 'spin') { swap(layers.spin, l); if (!extra.has(l.id)) extra.set(l.id, { angle: 0, vel: 0 }); }
      else if (l.kind === 'star') swap(layers.star, l);
      else if (l.kind === 'flare') swap(layers.flare, l);
      else if (l.kind === 'window') { swap(layers.window, l); if (!shown) born.set(l, Infinity); }   // lit after the reveal
      else {
        const old = layers[l.kind];
        if (old && old !== l) old.bitmap.close?.();
        layers[l.kind] = l;
      }
      if (reduce) frame(performance.now());
    };
    worker?.postMessage({ S });

    // ---------------------------------------------------------- interaction
    let prev = null;
    const onMove = (e) => {
      const [x, y] = toUnits(e.clientX, e.clientY);
      const now = performance.now();
      if (prev && now - prev.t < 120) {
        const dt = Math.max(8, now - prev.t) / 1000, vx = (x - prev.x) / dt, vy = (y - prev.y) / dt;
        for (const l of layers.spin) {
          if (l.id === 'ring') continue;
          const dx = x - l.cx, dy = y - l.cy, r = Math.hypot(dx, dy), reach = l.half * 1.5;
          if (r > reach || r < 4) continue;
          const tangential = (dx * vy - dy * vx) / r;                 // + clockwise on screen
          const e2 = extra.get(l.id);
          e2.vel = clamp(e2.vel + (tangential / Math.max(r, 40)) * 0.05 * (1 - r / reach), -3, 3);
        }
        lastInput = now;
      }
      // brushing past the cypress sets it swaying once, away from the pointer's direction of travel
      const over = onCypress(x, y);
      if (over && !overTree && now - kick.t > 1800 && !reduce) {
        kick = { t: now, dir: prev && x !== prev.x ? Math.sign(x - prev.x) : 1 };
        lastInput = now;
      }
      overTree = over;
      prev = { x, y, t: now };
      const hit = hitTest(x, y);
      el.style.cursor = hit ? 'pointer' : '';
    };
    const hitTest = (x, y) => {
      if (Math.hypot(x - MOON.x, y - MOON.y) < MOON.halo * 0.8) return { moon: true };
      const i = STARS.findIndex((st) => Math.hypot(x - st.x, y - st.y) < st.r * 1.25);
      return i >= 0 ? { star: i } : null;
    };
    const onClick = (e) => {
      if (e.target !== top) return;
      const hit = hitTest(...toUnits(e.clientX, e.clientY));
      if (!hit) return;
      if (hit.moon) moonPulse = performance.now();
      else flares.set(hit.star, performance.now());
      lastInput = performance.now();
    };
    let lastScroll = window.scrollY;
    const onScroll = () => {
      const dy = window.scrollY - lastScroll;
      lastScroll = window.scrollY;
      for (const [id, e2] of extra) e2.vel = clamp(e2.vel + dy * (id === 'coil' ? 0.0016 : 0.0022), -3, 3);
      lastInput = performance.now();
    };

    const io = new IntersectionObserver(([en]) => { visible = en.isIntersecting; if (visible) start(); else stop(); });
    io.observe(el);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener('visibilitychange', onVis);
    const onLeave = () => { overTree = false; prev = null; };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('click', onClick);
    if (!reduce) window.addEventListener('scroll', onScroll, { passive: true });
    measure();

    if (warm) start();

    return () => {
      stop();
      clearTimeout(revealTimer);
      worker?.terminate();
      io.disconnect();
      ro.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('click', onClick);
      window.removeEventListener('scroll', onScroll);
      if (baseFade && baseFade.from !== preview) baseFade.from.close?.();
      if (!layers.main) { closeLayers(layers); return; }      // left before the picture was finished
      // keep the finished picture for the next visit; after a while keep only a small still of it
      kept.preview?.close?.();
      kept.preview = makePreview(layers);
      Object.assign(kept, { layers, S: layersS, t0, extra });
      kept.timer = setTimeout(() => { if (kept.layers) { closeLayers(kept.layers); kept.layers = null; } }, KEEP_MS);
    };
  }, []);

  return (
    <div ref={wrap} className={`${s.wrap} ${className ?? ''}`}>
      <div className={s.primer} aria-hidden="true"><span className={s.thread} /></div>
      <canvas ref={baseCv} className={s.canvas} aria-hidden="true" />
      <canvas ref={topCv} className={s.canvas} aria-hidden="true" />
    </div>
  );
}

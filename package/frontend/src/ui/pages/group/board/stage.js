// The whiteboard's stage: the camera, where the regions are shown, and the clock that moves them. All of it changes
// every frame while the board is panned, zoomed or flown across, or while regions glide to new places — so none of it
// is React state. What must follow it every frame (the drawing's transform, the headings, the minimap's window…)
// subscribes with onFrame() and writes to the DOM itself; React hears of the camera only in steps.
import { clampZoom, easeInOut, flight, frame, toWorld, viewRect, zoomAround } from './camera.js';

const GLIDE_MS = 440;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createStage(initialCam) {
  let cam = { ...initialCam };
  let vp = { w: innerWidth, h: innerHeight };
  let raf = 0;
  let fly = null;                 // a flight under way: { path, t0, ms, done }
  let wheel = null;               // a wheel zoom easing towards its target: { z, sx, sy }
  let lift = null;                // the region being moved by hand: { key, x, y }
  const shown = new Map();        // region key → { from, to, t0 } — where it is shown, gliding from → to
  const subs = new Set();
  const moves = new Set();        // listeners told when the camera itself moved (not when only regions glided)
  let camMoved = false;

  const glideAt = (e, now) => {
    if (!e.t0) return e.to;
    const t = Math.min(1, (now - e.t0) / GLIDE_MS);
    if (t >= 1) { e.t0 = 0; return e.to; }
    const k = easeOut(t), f = e.from, to = e.to;
    return { x: f.x + (to.x - f.x) * k, y: f.y + (to.y - f.y) * k, w: f.w + (to.w - f.w) * k, h: f.h + (to.h - f.h) * k };
  };

  function step(now) {
    raf = 0;
    let again = false;
    if (fly) {
      const t = Math.min(1, (now - fly.t0) / fly.ms);
      cam = fly.path.at(easeInOut(t));
      camMoved = true;
      if (t >= 1) { const done = fly.done; fly = null; done?.(); } else again = true;
    } else if (wheel) {
      const z = cam.z + (wheel.z - cam.z) * 0.32;
      const near = Math.abs(wheel.z - z) / wheel.z < 0.002;
      cam = zoomAround(cam, vp, wheel.sx, wheel.sy, near ? wheel.z : z);
      camMoved = true;
      if (near) wheel = null; else again = true;
    }
    for (const e of shown.values()) if (e.t0) { again = true; break; }
    for (const fn of subs) fn(stage, now);
    if (camMoved) { camMoved = false; for (const fn of moves) fn(cam); }
    if (again) schedule();
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(step); };
  const stop = () => { fly = null; wheel = null; };

  const stage = {
    get camera() { return cam; },
    get viewport() { return vp; },
    /** Where a region is shown now (gliding, or held by the pointer). → { x, y, w, h } | null */
    rect(key) {
      const e = shown.get(key);
      if (!e) return null;
      const r = glideAt(e, performance.now());
      return lift?.key === key ? { ...r, x: lift.x, y: lift.y } : r;
    },
    get lifted() { return lift?.key ?? null; },
    get flying() { return !!fly; },
    view: () => viewRect(cam, vp),
    toWorld: (sx, sy) => toWorld(cam, vp, sx, sy),

    // ---------------------------------------------------------------- following
    /** fn(stage, now) on every frame something moved. → unsubscribe */
    onFrame(fn) { subs.add(fn); schedule(); return () => subs.delete(fn); },
    /** fn(camera) on frames the camera moved. → unsubscribe */
    onMove(fn) { moves.add(fn); return () => moves.delete(fn); },
    redraw: schedule,

    // ---------------------------------------------------------------- moving the camera
    setViewport(w, h) { if (w === vp.w && h === vp.h) return; vp = { w, h }; camMoved = true; schedule(); },
    set(next) { stop(); cam = { ...next, z: clampZoom(next.z) }; camMoved = true; schedule(); },
    panBy(dx, dy) { if (fly) fly = null; if (wheel) { wheel.sx += dx; wheel.sy += dy; } cam = { ...cam, x: cam.x - dx / cam.z, y: cam.y - dy / cam.z }; camMoved = true; schedule(); },
    /** Zoom by a factor round a screen point; `smooth` eases there (a mouse wheel's steps), otherwise at once (a pinch). */
    zoomBy(factor, sx, sy, smooth = false) {
      fly = null;
      if (smooth && !reduced()) {
        const z = clampZoom((wheel?.z ?? cam.z) * factor);
        wheel = { z, sx, sy };
      } else {
        wheel = null;
        cam = zoomAround(cam, vp, sx, sy, cam.z * factor);
        camMoved = true;
      }
      schedule();
    },
    /** Fly to a camera — high over a long way, a glide over a short one. → a promise for when it lands */
    flyTo(target, { instant = false } = {}) {
      const to = { ...target, z: clampZoom(target.z) };
      wheel = null;
      return new Promise((resolve) => {
        if (instant || reduced()) { fly = null; cam = to; camMoved = true; schedule(); resolve(); return; }
        const path = flight(cam, to, vp);
        fly = { path, t0: performance.now(), ms: path.ms, done: resolve };
        schedule();
      });
    },
    /** The camera that frames a board rectangle in the open part of the view. */
    framing: (rect, inset, opts) => frame(rect, vp, inset, opts),

    // ---------------------------------------------------------------- the regions
    /**
     * The regions' places now; each one that moved glides there (`instant`: all are simply there; `follow`: the key of one
     * that is simply there — a region being resized follows the pointer).
     */
    place(regions, { instant = false, follow = null } = {}) {
      const now = performance.now();
      const keys = new Set();
      const glide = !instant && !reduced();
      for (const r of regions) {
        keys.add(r.key);
        const to = { x: r.x, y: r.y, w: r.w, h: r.h };
        const e = shown.get(r.key);
        if (!e || !glide || r.key === follow) { shown.set(r.key, { from: to, to, t0: 0 }); continue; }
        if (e.to.x === to.x && e.to.y === to.y && e.to.w === to.w && e.to.h === to.h) continue;
        // a region let go by the pointer glides on from where it was held
        const from = lift?.key === r.key ? { ...glideAt(e, now), x: lift.x, y: lift.y } : glideAt(e, now);
        shown.set(r.key, { from, to, t0: now });
      }
      for (const k of [...shown.keys()]) if (!keys.has(k)) shown.delete(k);
      schedule();
    },
    /** Hold a region where the pointer has it: { key, x, y }. */
    hold(next) { lift = next; schedule(); },
    /** Let the held region go: it glides from where it was held to `to` (where it lands; left out: back to its place). */
    release(to) {
      if (!lift) return;
      const e = shown.get(lift.key);
      if (e) {
        const cur = glideAt(e, performance.now());
        const target = to ? { ...e.to, x: to.x, y: to.y } : e.to;
        shown.set(lift.key, { from: { ...cur, x: lift.x, y: lift.y }, to: target, t0: reduced() ? 0 : performance.now() });
      }
      lift = null;
      schedule();
    },
    /** Nothing more to draw (the board is going): no frame is left pending. Followers leave by their own unsubscribing. */
    dispose() { cancelAnimationFrame(raf); raf = 0; fly = null; wheel = null; },
  };
  return stage;
}

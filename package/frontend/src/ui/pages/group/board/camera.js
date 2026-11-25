// The whiteboard's camera: the board point at the centre of the view (x, y) and the zoom z (screen px per board px).
// Pure math here; useCamera.js keeps it moving.

export const ZOOM = [0.04, 4];
export const clampZoom = (z) => Math.max(ZOOM[0], Math.min(ZOOM[1], z));

/** vp: the view's size { w, h } in screen px (the board fills the window, under the app's bar). */
export const toWorld = (cam, vp, sx, sy) => [cam.x + (sx - vp.w / 2) / cam.z, cam.y + (sy - vp.h / 2) / cam.z];
export const toScreen = (cam, vp, wx, wy) => [vp.w / 2 + (wx - cam.x) * cam.z, vp.h / 2 + (wy - cam.y) * cam.z];
/** The part of the board in view. */
export const viewRect = (cam, vp) => ({ x: cam.x - vp.w / 2 / cam.z, y: cam.y - vp.h / 2 / cam.z, w: vp.w / cam.z, h: vp.h / cam.z });

/** Zoom to z, keeping the board point under the screen point (sx, sy) where it is. */
export function zoomAround(cam, vp, sx, sy, z) {
  const zz = clampZoom(z);
  const [wx, wy] = toWorld(cam, vp, sx, sy);
  return { x: wx - (sx - vp.w / 2) / zz, y: wy - (sy - vp.h / 2) / zz, z: zz };
}

/**
 * The camera that shows the board rectangle `rect` whole in the part of the view left by the bars and panels over it
 * (`inset`: { top, right, bottom, left } in screen px), no closer than `max`. `pad`: board px kept round it.
 */
export function frame(rect, vp, inset, { max = 1, pad = 0 } = {}) {
  const w = Math.max(60, vp.w - inset.left - inset.right), h = Math.max(60, vp.h - inset.top - inset.bottom);
  const z = clampZoom(Math.min(w / (rect.w + 2 * pad), h / (rect.h + 2 * pad), max));
  const cx = inset.left + w / 2, cy = inset.top + h / 2;
  return { z, x: rect.x + rect.w / 2 - (cx - vp.w / 2) / z, y: rect.y + rect.h / 2 - (cy - vp.h / 2) / z };
}

/** Bring a board rectangle into the open part of the view at the zoom there is, moving no more than needed. */
export function reveal(cam, vp, inset, rect, margin = 40) {
  const z = cam.z;
  const left = cam.x + (inset.left - vp.w / 2) / z, right = cam.x + (vp.w - inset.right - vp.w / 2) / z;
  const top = cam.y + (inset.top - vp.h / 2) / z, bottom = cam.y + (vp.h - inset.bottom - vp.h / 2) / z;
  const m = margin / z;
  let dx = 0, dy = 0;
  if (rect.x - m < left) dx = rect.x - m - left; else if (rect.x + rect.w + m > right) dx = rect.x + rect.w + m - right;
  if (rect.y - m < top) dy = rect.y - m - top; else if (rect.y + rect.h + m > bottom) dy = rect.y + rect.h + m - bottom;
  return { x: cam.x + dx, y: cam.y + dy, z };
}

// ------------------------------------------------------------------ flying from one place to another
// van Wijk & Nuij, "Smooth and efficient zooming and panning" (2003): a long way is flown higher (zoomed out), so the
// eye keeps its bearings; a short one is a plain glide. Cameras as [x, y, w] with w = the board width in view.
const RHO = Math.SQRT2, RHO2 = 2, RHO4 = 4;
const cosh = (x) => ((x = Math.exp(x)) + 1 / x) / 2;
const sinh = (x) => ((x = Math.exp(x)) - 1 / x) / 2;
const tanh = (x) => ((x = Math.exp(2 * x)) - 1) / (x + 1);

/** → { at(t) → camera (t from 0 to 1), ms (a duration that suits the way) } */
export function flight(a, b, vp) {
  const w0 = vp.w / a.z, w1 = vp.w / b.z;
  const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
  let S, at;
  if (d2 < 1e-6) {
    S = Math.log(w1 / w0) / RHO;
    at = (t) => ({ x: a.x + t * dx, y: a.y + t * dy, z: vp.w / (w0 * Math.exp(RHO * t * S)) });
  } else {
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + RHO4 * d2) / (2 * w0 * RHO2 * d1);
    const b1 = (w1 * w1 - w0 * w0 - RHO4 * d2) / (2 * w1 * RHO2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
    S = (r1 - r0) / RHO;
    at = (t) => {
      const s = t * S, c = cosh(r0);
      const u = (w0 / (RHO2 * d1)) * (c * tanh(RHO * s + r0) - sinh(r0));
      return { x: a.x + u * dx, y: a.y + u * dy, z: vp.w / ((w0 * c) / cosh(RHO * s + r0)) };
    };
  }
  const ms = Math.max(360, Math.min(1150, Math.abs(S) * 720));
  return { at, ms: Number.isFinite(ms) ? ms : 400 };
}

/** Eased time for flights: gentle at both ends. */
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

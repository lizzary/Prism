import { CARD } from './scene.js';

/** Hysteresis keeps the swatch, image and detail levels stable near their zoom boundaries. */
export function tierOf(zoom, previous) {
  const px = zoom * CARD;
  if (px >= 58 * (previous === 'near' ? 0.92 : 1.08)) return 'near';
  if (px >= 22 * (previous === 'mid' ? 0.92 : 1.08)) return 'mid';
  return 'far';
}

/** Each selected print has its own repeatable tilt, between -1.5 and +1.5 degrees. */
export function tiltDegrees(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const k = (Math.abs(h) % 6) - 3;
  return (k >= 0 ? k + 1 : k) * 0.5;
}

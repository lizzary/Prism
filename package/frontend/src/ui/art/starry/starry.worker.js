// Paints the home-page Starry Night off the main thread and streams each layer to the page as soon as it is ready,
// with stage progress for the loading indicator. A finished bake is cached (WebP) so the next visit only decodes it.
import { bakeStarry } from './bake.js';
import { VERSION } from './composition.js';
import { loadBake, saveBake } from './cache.js';

const send = (layer, bitmap) => self.postMessage({ type: 'layer', layer: { ...layer, bitmap } }, [bitmap]);

self.onmessage = async ({ data: { S } }) => {
  const key = `${VERSION}@${S}`;
  const hit = await loadBake(key).catch(() => null);
  if (hit?.length) {
    for (const { meta, blob } of hit) send(meta, await createImageBitmap(blob));
    self.postMessage({ type: 'done', cached: true });
    return;
  }

  const keep = [];
  const t0 = performance.now();
  bakeStarry(S, ({ canvas, ...meta }) => {
    const copy = new OffscreenCanvas(canvas.width, canvas.height);
    copy.getContext('2d').drawImage(canvas, 0, 0);
    keep.push({ meta, canvas: copy });
    send(meta, canvas.transferToImageBitmap());
  }, (value) => self.postMessage({ type: 'progress', value }));
  self.postMessage({ type: 'done', cached: false, ms: Math.round(performance.now() - t0) });

  try {
    const entries = [];
    for (const { meta, canvas } of keep) entries.push({ meta, blob: await canvas.convertToBlob({ type: 'image/webp', quality: 0.92 }) });
    await saveBake(key, entries);
  } catch { /* no cache: the next visit paints again */ }
};

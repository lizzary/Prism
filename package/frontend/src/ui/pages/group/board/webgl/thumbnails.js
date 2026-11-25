import { mediaUrl } from '../../../../../bridge/index.js';

// Each resolution has its own lazily allocated texture page. A zoom can continue sampling
// the previous page until sharper pictures arrive. All slots contain centre-cropped squares.
export function createThumbnails(gl, redraw) {
  const side = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
  const pages = new Map();
  const visible = new Map(), budgeted = new Set();
  const loading = new Map();
  const urls = new WeakMap(), failed = new WeakSet();
  const tile = document.createElement('canvas');
  const ctx = tile.getContext('2d');
  let frame = 0, preferred = 64, requested = 64, alive = true, allocationError;

  // When a five-second refresh returns new file objects, validate any cached thumbnail against its new address.
  function source(file) {
    if (!urls.has(file)) urls.set(file, mediaUrl(file, 'medium'));
    return urls.get(file);
  }

  function pageFor(size) {
    if (pages.has(size)) return pages.get(size);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, side, side, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    // WebGL reports allocation failure through the context rather than throwing. Hand it
    // back to the board's normal fallback on the next frame, outside the image load callback.
    if (!texture || gl.getError() !== gl.NO_ERROR) {
      if (texture) gl.deleteTexture(texture);
      allocationError = new Error('Cannot allocate whiteboard thumbnail texture');
      throw allocationError;
    }
    const cols = Math.floor(side / size);
    const page = { texture, cols, capacity: cols ** 2, entries: new Map(), touched: frame };
    pages.set(size, page);
    return page;
  }

  function upload(file, img, src) {
    const size = preferred;
    const page = pageFor(size);
    let slot = page.entries.get(file.id)?.slot ?? page.entries.size;
    let replaced;
    if (slot >= page.capacity) {
      // end() has budgeted one slot for every visible id. At least one resident is now off screen.
      for (const entry of page.entries.values()) {
        if (budgeted.has(entry.file.id)) continue;
        replaced = entry;
        break;
      }
      if (!replaced) return;
      slot = replaced.slot;
    }
    if (tile.width !== size) tile.width = tile.height = size;
    const cut = Math.min(img.naturalWidth, img.naturalHeight);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, (img.naturalWidth - cut) / 2, (img.naturalHeight - cut) / 2, cut, cut, 0, 0, size, size);
    const x = (slot % page.cols) * size, y = Math.floor(slot / page.cols) * size;
    gl.bindTexture(gl.TEXTURE_2D, page.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, gl.RGBA, gl.UNSIGNED_BYTE, tile);
    if (replaced) page.entries.delete(replaced.file.id);
    const wasDrawn = visible.get(file.id)?.entry;
    page.entries.set(file.id, { file, src, page, slot, size, at: wasDrawn ? -Infinity : performance.now(),
      u: (x + .5) / side, v: (y + .5) / side, span: (size - 1) / side });
    page.touched = frame;
  }

  function load(file) {
    const src = source(file);
    if (!src) { failed.add(file); return; }
    const img = new Image();
    loading.set(file.id, img);
    const finish = (ok) => {
      if (!alive) return;
      const current = visible.get(file.id);
      if (ok && current && budgeted.has(file.id) && !(current.entry?.size >= preferred) &&
          source(current.file) === src && !gl.isContextLost()) {
        try { upload(current.file, img, src); }
        catch { failed.add(current.file); tile.width = 0; }
      } else if (!ok) failed.add(file);
      img.onload = img.onerror = null;
      loading.delete(file.id);
      redraw();
    };
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = src;
  }

  return {
    begin(px) {
      if (allocationError) throw allocationError;
      frame++;
      visible.clear();
      requested = Math.min(side, 512, 2 ** Math.ceil(Math.log2(Math.max(32, px))));
    },
    get(file) {
      // Prefer the closest already-sharp level; while waiting, use the largest available preview.
      let best;
      for (const page of pages.values()) {
        const e = page.entries.get(file.id);
        if (!e || (e.file !== file && e.src !== source(file))) continue;
        e.file = file;
        if (!best || (best.size < preferred ? e.size > best.size : e.size >= preferred && e.size < best.size)) best = e;
      }
      if (best) best.page.touched = frame;
      visible.set(file.id, { file, entry: best });
      return best;
    },
    end() {
      // A very wide viewport or a device with small textures still has room for every visible
      // picture. Lower the resolution before issuing requests, so a full atlas cannot cause retries.
      preferred = requested;
      while (preferred > 1 && Math.floor(side / preferred) ** 2 < visible.size) preferred /= 2;
      // Keep recent pages for a pan or a reversed zoom; retire older, unused resolutions.
      for (const [size, page] of pages) {
        if (pages.size <= 2 || frame - page.touched < 4) continue;
        gl.deleteTexture(page.texture);
        pages.delete(size);
      }
      budgeted.clear();
      const capacity = Math.floor(side / preferred) ** 2;
      for (const { file, entry } of visible.values()) {
        // Even the minimum tile can fill on an implementation exposing an unusually small texture.
        if (budgeted.size >= capacity) break;
        budgeted.add(file.id);
        if (loading.size >= 6 || entry?.size >= preferred || loading.has(file.id) || failed.has(file)) continue;
        load(file);
      }
    },
    dispose() {
      alive = false;
      for (const img of loading.values()) { img.onload = img.onerror = null; img.removeAttribute('src'); }
      for (const page of pages.values()) gl.deleteTexture(page.texture);
      pages.clear(); loading.clear(); visible.clear();
      tile.width = tile.height = 0;
    },
  };
}

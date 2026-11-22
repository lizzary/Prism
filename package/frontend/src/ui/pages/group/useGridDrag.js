// Dragging on a group's page: files — one, or the whole selection it belongs to — to a new place, possibly in another
// colour group, and colour groups by their headings to a new order. The page's refresh rests meanwhile (nothing moves
// under the pointer), the page scrolls by itself near its top and bottom, and Escape puts everything back.
// The ghost follows the pointer directly (no re-render per move); the page re-renders only when the target changes.
import { useCallback, useEffect, useRef, useState } from 'react';
import { dropFiles, dropSection } from './layout.js';

const THRESHOLD = 6;   // px the pointer travels before a press becomes a drag
const EDGE = 72;       // px from the top or bottom where the page starts scrolling
const SPEED = 18;      // px per frame at the very edge

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * o: { gridRef, layoutRef, ghostRef, top (px of the page covered by sticky bars), hold () → release,
 *      onDropFiles(ids, target), onDropSection(key, index), sectionOrder: [key], mode }
 * → { drag: { kind: 'files' | 'section', ids, key, target, x, y } | null, beginFiles(e, ids), beginSection(e, key) }
 */
export function useGridDrag(o) {
  const [drag, setDrag] = useState(null);
  const st = useRef(null);
  const opts = useRef(o);
  opts.current = o;

  const end = useCallback((commit) => {
    const s = st.current;
    if (!s) return;
    st.current = null;
    cancelAnimationFrame(s.raf);
    window.removeEventListener('pointermove', s.move);
    window.removeEventListener('pointerup', s.up);
    window.removeEventListener('pointercancel', s.cancel);
    window.removeEventListener('keydown', s.onKey, true);
    document.documentElement.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    s.release?.();
    setDrag(null);
    if (!s.active) return;
    // the click that ends a drag must not open the tile
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (commit && s.target) {
      if (s.kind === 'files') opts.current.onDropFiles(s.ids, s.target);
      else opts.current.onDropSection(s.key, s.target.index);
    }
  }, []);
  useEffect(() => () => end(false), [end]);

  const locate = (s) => {
    const { gridRef, layoutRef, ghostRef, sectionOrder, mode } = opts.current;
    const g = ghostRef.current;
    if (g) g.style.transform = `translate(${s.x}px, ${s.y}px)`;
    const r = gridRef.current?.getBoundingClientRect();
    if (!r) return;
    const x = s.x - r.left, y = s.y - r.top;
    const target = s.kind === 'files' ? dropFiles(layoutRef.current, x, y) : dropSection(layoutRef.current, x, y, s.key, sectionOrder, mode);
    if (same(target, s.target) && s.shown) return;
    s.target = target;
    s.shown = true;
    // where the ghost is now goes along, so a re-render puts it where the pointer is
    setDrag({ kind: s.kind, ids: s.ids, key: s.key, target, x: s.x, y: s.y });
  };

  const begin = (e, payload) => {
    if (e.button !== 0 || st.current || e.target.closest('button, a, input')) return;
    const s = { ...payload, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, raf: 0, target: null, shown: false };
    const tick = () => {
      s.raf = requestAnimationFrame(tick);
      const lo = opts.current.top + EDGE, hi = innerHeight - EDGE;
      let v = 0;
      if (s.y < lo) v = -SPEED * Math.min(1, (lo - s.y) / EDGE);
      else if (s.y > hi) v = SPEED * Math.min(1, (s.y - hi) / EDGE);
      // resting at an edge speeds up (up to 3×), so long pages are quick to cross
      s.edgeAt = v ? (s.edgeAt ?? performance.now()) : null;
      if (!v) return;
      v *= 1 + Math.min(2, (performance.now() - s.edgeAt) / 700);
      window.scrollBy(0, v);
      locate(s);
    };
    s.move = (ev) => {
      s.x = ev.clientX; s.y = ev.clientY;
      if (!s.active) {
        if (Math.hypot(s.x - s.x0, s.y - s.y0) < THRESHOLD) return;
        s.active = true;
        s.release = opts.current.hold();
        document.documentElement.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        window.getSelection?.()?.removeAllRanges();
        s.raf = requestAnimationFrame(tick);
      }
      locate(s);
    };
    s.up = () => end(true);
    s.cancel = () => end(false);
    s.onKey = (ev) => { if (ev.key === 'Escape' && s.active) { ev.stopPropagation(); ev.preventDefault(); end(false); } };
    window.addEventListener('pointermove', s.move);
    window.addEventListener('pointerup', s.up);
    window.addEventListener('pointercancel', s.cancel);
    window.addEventListener('keydown', s.onKey, true);
    st.current = s;
  };

  return {
    drag,
    beginFiles: (e, ids) => begin(e, { kind: 'files', ids }),
    beginSection: (e, key) => begin(e, { kind: 'section', key }),
  };
}

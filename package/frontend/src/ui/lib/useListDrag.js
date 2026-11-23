// Dragging rows of a vertical list to a new place: one row, or several chosen together, in a list that may be filtered
// (the new place is told by the neighbours on show, so it means the same in the whole list). Rows carry
// `data-row="<id>"` (a row with `data-fixed` stays put and is never a neighbour). A line shows where they will land;
// the list scrolls by itself, faster the longer the pointer rests near its top or bottom; Escape puts everything back.
// The ghost follows the pointer directly (no re-render per move); the list re-renders only when the place changes.
import { useCallback, useEffect, useRef, useState } from 'react';

const THRESHOLD = 5;     // px the pointer travels before a press becomes a drag
const EDGE = 44;         // px from the list's top or bottom where it starts scrolling
const SPEED = 14;        // px per frame at the very edge

/**
 * o: { listRef: the scrolling list (position: relative, so a row's offsetTop is inside it), ghostRef: the element that
 *      follows the pointer, onDrop(ids, to) — to: { before: id } | { after: id } }
 * → { drag: { ids, to, line (px from the list's top) } | null, begin(event, ids) }
 */
export function useListDrag({ listRef, ghostRef, onDrop }) {
  const [drag, setDrag] = useState(null);
  const st = useRef(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;

  const end = useCallback((commit) => {
    const s = st.current;
    if (!s) return;
    st.current = null;
    cancelAnimationFrame(s.raf);
    window.removeEventListener('pointermove', s.move);
    window.removeEventListener('pointerup', s.up);
    window.removeEventListener('pointercancel', s.cancel);
    window.removeEventListener('keydown', s.key, true);
    document.documentElement.style.removeProperty('cursor');
    document.body.style.removeProperty('user-select');
    setDrag(null);
    if (!s.active) return;
    // the click that ends a drag must not also press the row
    const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
    window.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
    if (commit && s.to) drop.current?.(s.ids, s.to);
  }, []);
  useEffect(() => () => end(false), [end]);

  /** The place under the pointer: before the first row (not moving) whose middle is below it, else after the last. */
  const locate = (s) => {
    const list = listRef.current;
    if (!list) return;
    const g = ghostRef?.current;
    if (g) g.style.transform = `translate(${s.x}px, ${s.y}px)`;
    const moving = new Set(s.ids);
    const rows = [...list.querySelectorAll('[data-row]')].filter((el) => !el.hasAttribute('data-fixed') && !moving.has(el.dataset.row));
    if (!rows.length) return;
    let to = null, line = 0;
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      if (s.y < r.top + r.height / 2) { to = { before: el.dataset.row }; line = el.offsetTop - 2; break; }
    }
    if (!to) { const last = rows[rows.length - 1]; to = { after: last.dataset.row }; line = last.offsetTop + last.offsetHeight + 2; }
    const sig = JSON.stringify(to);
    if (sig === s.sig) return;
    s.sig = sig;
    s.to = to;
    setDrag({ ids: s.ids, to, line });
  };

  const begin = (e, ids) => {
    if (e.button !== 0 || st.current || !ids.length) return;
    const s = { ids, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false, raf: 0, to: null, sig: '' };
    const tick = () => {
      s.raf = requestAnimationFrame(tick);
      const list = listRef.current;
      if (!list) return;
      const r = list.getBoundingClientRect();
      let v = 0;
      if (s.y < r.top + EDGE) v = -SPEED * Math.min(1, (r.top + EDGE - s.y) / EDGE);
      else if (s.y > r.bottom - EDGE) v = SPEED * Math.min(1, (s.y - r.bottom + EDGE) / EDGE);
      // resting at an edge speeds up (up to 4×): a long list is quick to cross
      s.edgeAt = v ? (s.edgeAt ?? performance.now()) : null;
      if (!v) return;
      v *= 1 + Math.min(3, (performance.now() - s.edgeAt) / 600);
      list.scrollTop += v;
      locate(s);
    };
    s.move = (ev) => {
      s.x = ev.clientX; s.y = ev.clientY;
      if (!s.active) {
        if (Math.hypot(s.x - s.x0, s.y - s.y0) < THRESHOLD) return;
        s.active = true;
        document.documentElement.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        window.getSelection?.()?.removeAllRanges();
        s.raf = requestAnimationFrame(tick);
      }
      locate(s);
    };
    s.up = () => end(true);
    s.cancel = () => end(false);
    s.key = (ev) => { if (ev.key === 'Escape' && s.active) { ev.stopPropagation(); ev.preventDefault(); end(false); } };
    window.addEventListener('pointermove', s.move);
    window.addEventListener('pointerup', s.up);
    window.addEventListener('pointercancel', s.cancel);
    window.addEventListener('keydown', s.key, true);
    st.current = s;
  };

  return { drag, begin };
}

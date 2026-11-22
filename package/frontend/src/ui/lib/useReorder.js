// Pointer-driven reordering for a list or grid of elements that carry `data-reorder-id`.
// The dragged element follows the pointer, an insertion marker shows where it will land, and the scroll area
// (an element, or the page) scrolls by itself while the pointer rests near one of its edges.
import { useCallback, useEffect, useRef, useState } from 'react';

const THRESHOLD = 5;     // px the pointer travels before a press becomes a drag
const EDGE = 56;         // px from a scroll edge where auto-scroll starts
const SPEED = 16;        // px per frame at the very edge

const scrollPos = (el) => (el ? [el.scrollLeft, el.scrollTop] : [window.scrollX, window.scrollY]);

/**
 * @param {object} o
 * @param {React.RefObject<HTMLElement>} o.listRef   container of the items
 * @param {React.RefObject<HTMLElement>} [o.scrollRef] scrolling element (default: the page)
 * @param {'row'|'column'|'grid'} [o.mode]   'row': one horizontal line; 'column': one vertical list; 'grid': rows that wrap
 * @param {'x'|'y'} [o.axis]        direction that auto-scrolls
 * @param {{top?:number,bottom?:number}} [o.inset] parts of the scroll area covered by sticky bars
 * @param {(id: string, index: number, from: DOMRect) => void} o.onDrop index = position among the other items;
 *   from = where the item was let go (to glide it from there into its new place)
 * @returns {{ dragId: string|null, marker: {left:number,top:number,width:number,height:number}|null, handle: (id: string) => object }}
 */
export function useReorder({ listRef, scrollRef, mode = 'grid', axis = 'y', inset, onDrop, disabled }) {
  const [dragId, setDragId] = useState(null);
  const [marker, setMarker] = useState(null);
  const st = useRef(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;

  const items = () => [...(listRef.current?.querySelectorAll('[data-reorder-id]') ?? [])];

  /** Where the pointer would insert the item, and the marker for that gap. */
  const target = (x, y, id) => {
    const others = items().filter((el) => el.dataset.reorderId !== id);
    if (!others.length) return null;
    const rects = others.map((el) => el.getBoundingClientRect());
    let index, ref, after;
    if (mode === 'row') {
      index = rects.filter((r) => r.left + r.width / 2 < x).length;
      after = index === others.length;
      ref = after ? rects[index - 1] : rects[index];
    } else if (mode === 'column') {
      index = rects.filter((r) => r.top + r.height / 2 < y).length;
      after = index === others.length;
      ref = after ? rects[index - 1] : rects[index];
      const top = after ? ref.bottom + 2 : ref.top - 2;
      return { index, marker: { left: ref.left + 4, top: top - 1.5, width: ref.width - 8, height: 3 } };
    } else {
      let best = 0, bestD = Infinity;
      rects.forEach((r, i) => {
        const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
        const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
        const d = dy * 4 + dx;
        if (d < bestD) { bestD = d; best = i; }
      });
      ref = rects[best];
      after = x > ref.left + ref.width / 2;
      index = best + (after ? 1 : 0);
    }
    const gap = 4;
    const left = after ? ref.right + gap / 2 : ref.left - gap / 2;
    return { index, marker: { left: left - 1.5, top: ref.top + 2, width: 3, height: ref.height - 4 } };
  };

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
    const from = s.active ? s.el?.getBoundingClientRect() : null;
    if (s.el) { s.el.style.removeProperty('transform'); s.el.style.removeProperty('z-index'); s.el.style.removeProperty('transition'); s.el.style.removeProperty('pointer-events'); }
    setDragId(null);
    setMarker(null);
    if (s.active) {
      // the click that ends a drag must not open the item
      const swallow = (e) => { e.preventDefault(); e.stopPropagation(); };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      if (commit && s.drop) drop.current?.(s.id, s.drop.index, from);
    }
  }, []);
  useEffect(() => () => end(false), [end]);

  const begin = (e, id) => {
    // fields and buttons inside an item keep their own presses
    if (disabled || e.button !== 0 || st.current || e.target.closest('input, textarea, select, button')) return;
    const el = e.currentTarget;
    const s = { id, el, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, sc0: scrollPos(scrollRef?.current), active: false, drop: null, raf: 0 };
    // A transformed item counts toward its scroller's overflow, so dragging it past the edge would enlarge the
    // scroll area and auto-scroll would chase it forever. Keep it inside the area's extent as it was at the start.
    const sc = scrollRef?.current, doc = document.documentElement;
    const er = el.getBoundingClientRect();
    const [sl, stp] = scrollPos(sc);
    const origin = sc ? sc.getBoundingClientRect() : { left: 0, top: 0 };
    const ax = er.left - origin.left + sl, ay = er.top - origin.top + stp;
    const sw = sc ? sc.scrollWidth : doc.scrollWidth, sh = sc ? sc.scrollHeight : doc.scrollHeight;
    const gx = er.width * 0.02, gy = er.height * 0.02;   // room for the 3% lift
    s.bound = { x: [gx - ax, sw - ax - er.width - gx], y: [gy - ay, sh - ay - er.height - gy] };
    const place = () => {
      const [sx, sy] = scrollPos(scrollRef?.current);
      const clamp = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
      const dx = mode === 'column' ? 0 : clamp(s.x - s.x0 + sx - s.sc0[0], s.bound.x);   // a list item only slides along its list
      const dy = mode === 'row' ? 0 : clamp(s.y - s.y0 + sy - s.sc0[1], s.bound.y);
      el.style.transform = `translate(${dx}px, ${dy}px) scale(${mode === 'column' ? 1.01 : 1.03})`;
      s.drop = target(s.x, s.y, id);
      setMarker(s.drop?.marker ?? null);
    };
    const tick = () => {
      s.raf = requestAnimationFrame(tick);
      const area = scrollRef?.current?.getBoundingClientRect() ?? { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
      const lo = axis === 'x' ? area.left : area.top + (inset?.top ?? 0);
      const hi = axis === 'x' ? area.right : area.bottom - (inset?.bottom ?? 0);
      const p = axis === 'x' ? s.x : s.y;
      let v = 0;
      if (p < lo + EDGE) v = -SPEED * Math.min(1, (lo + EDGE - p) / EDGE);
      else if (p > hi - EDGE) v = SPEED * Math.min(1, (p - hi + EDGE) / EDGE);
      // resting at an edge speeds up (up to 3×), so long rows and pages are quick to cross
      s.edgeT = v ? (s.edgeT ?? performance.now()) : null;
      if (v) v *= 1 + Math.min(2, (performance.now() - s.edgeT) / 700);
      if (v) {
        const sc = scrollRef?.current;
        if (sc) { if (axis === 'x') sc.scrollLeft += v; else sc.scrollTop += v; } else window.scrollBy(0, v);
        place();
      }
    };
    s.move = (ev) => {
      s.x = ev.clientX; s.y = ev.clientY;
      if (!s.active) {
        if (Math.hypot(s.x - s.x0, s.y - s.y0) < THRESHOLD) return;
        s.active = true;
        setDragId(id);
        document.documentElement.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        el.style.transition = 'none';
        el.style.zIndex = '30';
        el.style.pointerEvents = 'none';
        s.raf = requestAnimationFrame(tick);
      }
      place();
    };
    s.up = () => end(true);
    s.cancel = () => end(false);
    s.key = (ev) => { if (ev.key === 'Escape' && s.active) { ev.stopPropagation(); end(false); } };
    window.addEventListener('pointermove', s.move);
    window.addEventListener('pointerup', s.up);
    window.addEventListener('pointercancel', s.cancel);
    window.addEventListener('keydown', s.key, true);
    st.current = s;
  };

  /** Props for one draggable item. */
  const handle = (id) => ({
    'data-reorder-id': id,
    'data-dragging': dragId === id || undefined,
    onPointerDown: (e) => begin(e, id),
    onDragStart: (e) => e.preventDefault(),
  });
  return { dragId, marker, handle };
}

/** Move `id` so it sits at `index` among the other ids. */
export function moveTo(ids, id, index) {
  const rest = ids.filter((x) => x !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
}

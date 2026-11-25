// The whiteboard's pointer and wheel. Against the scene (scene.js hitTest), not against what is drawn — so whatever
// renderer draws the board, it answers the same way.
//   left            on a card: choose it (Ctrl: one more or one less, Shift: a run of them); drag: carry it (or the
//                   chosen ones it belongs to) to another colour group, or out of every colour group
//                   on a heading: drag the colour group somewhere else · elsewhere: a marquee (Shift adds, Ctrl flips)
//   right / middle  drag the board (a right click without moving opens a menu) · Space + left: drag the board
//   wheel           zoom round the pointer (Shift: across) · double-click: open a file, frame a colour group, see it all
// Near the view's edges a carried card, region or marquee moves the board along, faster the longer it rests there.
import { useEffect, useRef } from 'react';
import { hitTest } from './scene.js';

const EDGE = 40;        // px inside the open part of the view's edges (and anywhere beyond them) where carrying moves the board
const SPEED = 15;       // px per frame at the very edge

/**
 * o (read afresh at every event): {
 *   scene(), insets() → { top, right, bottom, left }, canCarry(), canMoveRegion(key),
 *   onHover(hit | null), onClickCard(id, mods), onClickEmpty(mods, hit), onMenu(hit, { x, y }), onDouble(hit, [x, y]),
 *   onMarquee(rect | null, mods), onMarqueeEnd(rect, mods),
 *   onCarryStart(id) → ids | null, onCarry({ ids, x, y (screen), wx, wy }), onCarryEnd({ ids, x, y, wx, wy } | null),
 *   onRegionStart(key), onRegion({ key, x, y } (its top left on the board)), onRegionEnd({ key, x, y } | null),
 *   onPanChange(bool) }
 * → { press(event, hit): a press that something drawn over the board (a heading) starts, busy() }
 */
export function useBoardInput(ref, stage, opts) {
  const o = useRef(opts);
  o.current = opts;
  const st = useRef(null);
  const space = useRef(false);
  const api = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let hoverRaf = 0, lastHover = null;
    const mods = (e) => ({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey });
    const world = (x, y) => stage.toWorld(x, y);
    const cursor = (c) => { el.style.cursor = c ?? ''; };

    const begin = (e, g) => {
      st.current = { ...g, id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, mods: mods(e), raf: 0, edgeAt: null };
      try { el.setPointerCapture(e.pointerId); } catch { /* the press already ended */ }
      if (g.mode === 'pan') { cursor('grabbing'); o.current.onPanChange?.(true); }
    };
    const press = (e, hit) => {
      if (st.current) return;
      el.focus({ preventScroll: true });
      const [wx, wy] = world(e.clientX, e.clientY);
      if (e.button === 1 || (e.button === 0 && space.current)) { e.preventDefault(); begin(e, { mode: 'pan' }); return; }
      const at = hit !== undefined ? hit : hitTest(o.current.scene(), wx, wy);
      if (e.button === 2) { begin(e, { mode: 'press-r', hit: at }); return; }
      if (e.button !== 0) return;
      if (at?.kind === 'card') begin(e, { mode: 'press-card', hit: at, start: [wx, wy] });
      else if (at?.kind === 'head') begin(e, { mode: 'press-head', hit: at, start: [wx, wy], origin: [at.region.x, at.region.y] });
      else begin(e, { mode: 'press-empty', hit: at, start: [wx, wy] });
    };

    // ---------------------------------------------------------------- what a gesture does as the pointer moves
    const track = (g) => {
      const [wx, wy] = world(g.x, g.y);
      if (g.mode === 'marquee') {
        const [x0, y0] = g.start;
        o.current.onMarquee({ x: Math.min(x0, wx), y: Math.min(y0, wy), w: Math.abs(wx - x0), h: Math.abs(wy - y0) }, g.mods);
      } else if (g.mode === 'carry') {
        o.current.onCarry({ ids: g.ids, x: g.x, y: g.y, wx, wy });
      } else if (g.mode === 'region') {
        o.current.onRegion({ key: g.hit.region.key, x: g.origin[0] + wx - g.start[0], y: g.origin[1] + wy - g.start[1] });
      }
    };
    // near the edges of the open part of the view, the board comes along — faster the longer the pointer rests there.
    // A gesture that starts near an edge does not move the board until the pointer has once been clear of the edges
    // (a marquee begun just under the bars must not set the board sliding).
    const edgeLoop = (g) => {
      const tick = () => {
        if (st.current !== g) return;
        g.raf = requestAnimationFrame(tick);
        const r = el.getBoundingClientRect(), ins = o.current.insets();
        const lx = g.x - r.left, ly = g.y - r.top;
        const push = (d) => (d < EDGE ? -SPEED * Math.min(1.6, (EDGE - d) / EDGE) : 0);
        // over the board's own panels (aiming at a row of the index, say) the board holds still
        const over = document.elementFromPoint(g.x, g.y)?.closest?.('[data-board-chrome]');
        let vx = over ? 0 : push(lx - ins.left) - push(r.width - ins.right - lx);
        let vy = over ? 0 : push(ly - ins.top) - push(r.height - ins.bottom - ly);
        if (!g.armed) { if (!vx && !vy) g.armed = true; return; }
        g.edgeAt = vx || vy ? (g.edgeAt ?? performance.now()) : null;
        if (!vx && !vy) return;
        const k = 1 + Math.min(2.5, (performance.now() - g.edgeAt) / 650);
        vx *= k; vy *= k;
        stage.panBy(-vx, -vy);
        track(g);
      };
      g.raf = requestAnimationFrame(tick);
    };
    const start = (g, mode) => {
      g.mode = mode;
      if (mode === 'carry') {
        const ids = o.current.onCarryStart(g.hit.id);
        if (!ids) { g.mode = 'marquee'; return start(g, 'marquee'); }
        g.ids = ids;
        cursor('grabbing');
      }
      if (mode === 'region') { o.current.onRegionStart(g.hit.region.key); cursor('grabbing'); }
      window.getSelection?.()?.removeAllRanges();
      track(g);
      edgeLoop(g);
      return undefined;
    };

    const finish = (g) => {
      st.current = null;
      cancelAnimationFrame(g.raf);
      try { el.releasePointerCapture(g.id); } catch { /* released already */ }
      cursor(space.current ? 'grab' : null);
      if (g.mode === 'pan') o.current.onPanChange?.(false);
    };
    const cancel = () => {
      const g = st.current;
      if (!g) return false;
      finish(g);
      if (g.mode === 'carry') o.current.onCarryEnd(null);
      else if (g.mode === 'region') o.current.onRegionEnd(null);
      else if (g.mode === 'marquee') o.current.onMarquee(null, g.mods);
      return true;
    };

    // ---------------------------------------------------------------- events
    const onDown = (e) => {
      // what is drawn over the board (headings, their buttons) handles its own presses
      if (e.target !== el && e.target.closest('[data-board-own]')) return;
      press(e);
    };
    const onMove = (e) => {
      const g = st.current;
      if (!g) {
        if (hoverRaf) return;
        const x = e.clientX, y = e.clientY, over = e.target;
        hoverRaf = requestAnimationFrame(() => {
          hoverRaf = 0;
          if (st.current) return;
          const heading = over.closest?.('[data-heading]');
          const [wx, wy] = world(x, y);
          const hit = heading ? { kind: 'head', region: o.current.scene().regions.find((r) => r.key === heading.dataset.heading) } : hitTest(o.current.scene(), wx, wy);
          const sig = hit ? `${hit.kind}:${hit.region?.key}:${hit.id ?? ''}` : '';
          if (sig === lastHover) return;
          lastHover = sig;
          o.current.onHover(hit);
        });
        return;
      }
      if (e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      g.x = e.clientX; g.y = e.clientY;
      const far = Math.hypot(g.x - g.x0, g.y - g.y0);
      switch (g.mode) {
        case 'pan': stage.panBy(dx, dy); break;
        case 'press-r': if (far > 3) { g.mode = 'pan'; cursor('grabbing'); o.current.onPanChange?.(true); stage.panBy(g.x - g.x0, g.y - g.y0); } break;
        case 'press-card': if (far > 5) start(g, o.current.canCarry() ? 'carry' : 'marquee'); break;
        case 'press-head': if (far > 4) start(g, o.current.canMoveRegion(g.hit.region.key) ? 'region' : 'marquee'); break;
        case 'press-empty': if (far > 3) start(g, 'marquee'); break;
        default: track(g);
      }
    };
    const onUp = (e) => {
      const g = st.current;
      if (!g || e.pointerId !== g.id) return;
      finish(g);
      const [wx, wy] = world(e.clientX, e.clientY);
      switch (g.mode) {
        case 'press-r': o.current.onMenu(g.hit, { x: e.clientX, y: e.clientY }); break;
        case 'press-card': o.current.onClickCard(g.hit.id, g.mods); break;
        case 'press-empty': o.current.onClickEmpty(g.mods, g.hit); break;
        case 'carry': o.current.onCarryEnd({ ids: g.ids, x: e.clientX, y: e.clientY, wx, wy }); break;
        case 'region': {
          const k = g.hit.region.key;
          o.current.onRegionEnd({ key: k, x: g.origin[0] + wx - g.start[0], y: g.origin[1] + wy - g.start[1] });
          break;
        }
        case 'marquee': {
          const [x0, y0] = g.start;
          o.current.onMarqueeEnd({ x: Math.min(x0, wx), y: Math.min(y0, wy), w: Math.abs(wx - x0), h: Math.abs(wy - y0) }, g.mods);
          break;
        }
        default:
      }
    };
    const onLost = (e) => { if (st.current?.id === e.pointerId) cancel(); };
    const onWheel = (e) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? 400 : 1;
      if (e.shiftKey && !e.ctrlKey) { stage.panBy(-(e.deltaX || e.deltaY) * unit, 0); return; }
      const d = e.deltaY * unit;
      const pinch = e.ctrlKey;
      // a pinch, or a trackpad's fine steps, follow at once; a mouse wheel's notches ease into each other
      const smooth = !pinch && Math.abs(d) >= 40;
      stage.zoomBy(Math.exp(-d * (pinch ? 0.012 : 0.0019)), e.clientX, e.clientY, smooth);
    };
    const onMenu = (e) => e.preventDefault();
    const onDouble = (e) => {
      if (e.target !== el && e.target.closest('[data-board-own]')) return;
      const [wx, wy] = world(e.clientX, e.clientY);
      o.current.onDouble(hitTest(o.current.scene(), wx, wy), [wx, wy]);
    };
    const onLeave = () => { if (st.current) return; lastHover = ''; o.current.onHover(null); };
    const typing = (t) => /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
    const onKey = (e) => {
      if (e.key === 'Escape' && st.current && ['carry', 'region', 'marquee', 'pan'].includes(st.current.mode)) {
        e.preventDefault(); e.stopPropagation(); cancel(); return;
      }
      // Space held: the left button drags the board
      if (e.key === ' ' && !typing(e.target) && !e.repeat && !document.querySelector('[role="dialog"]')) {
        space.current = true;
        if (!st.current) cursor('grab');
        e.preventDefault();
      }
    };
    const onKeyUp = (e) => { if (e.key === ' ') { space.current = false; if (!st.current) cursor(null); } };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onLost);
    el.addEventListener('lostpointercapture', onLost);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('contextmenu', onMenu);
    el.addEventListener('dblclick', onDouble);
    el.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKeyUp);
    api.current = { press, cancel, busy: () => !!st.current && !String(st.current.mode).startsWith('press') };
    return () => {
      cancel();
      cancelAnimationFrame(hoverRaf);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onLost);
      el.removeEventListener('lostpointercapture', onLost);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('contextmenu', onMenu);
      el.removeEventListener('dblclick', onDouble);
      el.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [ref, stage]);

  return {
    /** A press on something drawn over the board (a heading): `hit` says what it is. */
    press: (e, hit) => api.current?.press(e, hit),
    busy: () => api.current?.busy() ?? false,
    cancel: () => api.current?.cancel(),
  };
}

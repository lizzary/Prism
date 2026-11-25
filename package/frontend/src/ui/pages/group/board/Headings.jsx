// Every region's heading — its colour, name, size, how many of its files are chosen — drawn over the board in screen
// pixels, so it is crisp and readable at any zoom (any renderer draws the regions under them). Close up a heading sits
// in its region's top band; further out it becomes a small label pinned inside the region's corner, like a place name
// on a map; while the view is inside a tall region, its heading stays at the top of the view (the eye always knows
// where it is). A heading is the region's handle: drag it to move the colour group, double-click its name to rename
// it, press its dot for another colour, or its menu.
import { memo, useLayoutEffect, useRef } from 'react';
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { Icon } from '../../../icons/Icon.jsx';
import { HEAD, PAD } from './scene.js';
import s from './Board.module.css';

const BAND_ZOOM = 0.62;        // from here in, a heading sits in its region's band
const H = { band: 34, map: 28 };

/**
 * stage, scene · top: where the open part of the view starts (headings stick below it) · look: { hot, target, lit: Set,
 * selected: Map(key → chosen files), renaming } · on: { press(e, hit), hover(key | null), rename(key, name | null),
 * startRename(key), recolor(key, el), menu(key, el) }
 */
export const Headings = memo(function Headings({ stage, scene, top, left = 0, look, on, noneName }) {
  const els = useRef(new Map());
  const topRef = useRef(top);
  topRef.current = top;
  const leftRef = useRef(left);
  leftRef.current = left;

  useLayoutEffect(() => {
    const last = new Map();
    // In three passes, so the page is laid out once a frame at most: where each heading goes and how it looks (writes),
    // how wide the ones that changed want to be (reads), and then their places and widths (writes).
    const paint = (st) => {
      const { camera: c, viewport: vp } = st;
      const band = c.z >= BAND_ZOOM;
      const stickAt = topRef.current;
      const todo = [];
      for (const [key, el] of els.current) {
        const r = st.rect(key);
        if (!r) continue;
        const sx = vp.w / 2 + (r.x - c.x) * c.z, sy = vp.h / 2 + (r.y - c.y) * c.z, sw = r.w * c.z, sh = r.h * c.z;
        const h = band ? H.band : H.map;
        const off = sx > vp.w || sy > vp.h || sx + sw < 0 || sy + sh < 0;
        const forced = el.dataset.forced != null;
        const small = sw < 64 || sh < h + 10;
        let x = sx + (band ? (PAD - 6) * c.z : 7), y = band ? sy + (HEAD * c.z - h) / 2 : sy + 7;
        let stuck = false;
        if (y < stickAt && sy + sh > stickAt + h + 10) { y = Math.min(stickAt, sy + sh - h - 8); stuck = true; }
        const w = Math.max(0, sw - (x - sx) - 8);
        const mode = band && !stuck ? 'band' : 'map';
        const hide = off || (small && !forced);
        const state = `${hide ? 'hide' : ''}|${mode}|${stuck ? 'stuck' : ''}`;
        const prev = last.get(key);
        if (prev?.el !== el || prev.state !== state) {
          el.dataset.mode = mode;
          el.toggleAttribute('data-stuck', stuck);
          el.toggleAttribute('data-off', hide);
        }
        if (off) { last.set(key, { el, state }); continue; }
        todo.push({ key, el, state, mode, x, ty: Math.round(y), sx, sw, mw: Math.round(forced ? Math.max(w, 180) : w), prev });
      }
      // a heading's natural width, measured again only when its words or its look changed
      for (const t of todo) {
        const sig = `${t.mode}|${t.el.textContent}`;
        if (t.el.__natural?.sig === sig) continue;
        t.el.style.maxWidth = 'none';
        t.el.removeAttribute('data-cramped');
        t.el.__natural = { sig, w: 0, dirty: true };
      }
      for (const t of todo) if (t.el.__natural.dirty) { t.el.__natural.w = t.el.scrollWidth; t.el.__natural.dirty = false; }
      const holdAt = leftRef.current + 8;
      for (const t of todo) {
        const { el, prev, ty, mw } = t;
        const cramped = el.__natural.w > mw + 0.5;
        // a region reaching past the view's left edge keeps its heading in sight there, until its own right end
        const width = Math.min(el.__natural.w, mw);
        const tx = Math.round(t.x < holdAt ? Math.max(t.x, Math.min(holdAt, t.sx + t.sw - width - 8)) : t.x);
        if (prev?.el !== el || prev.tx !== tx || prev.ty !== ty || prev.mw !== mw || prev.cramped !== cramped || el.style.maxWidth === 'none') {
          el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
          el.style.maxWidth = `${mw}px`;
          el.toggleAttribute('data-cramped', cramped);
        }
        last.set(t.key, { el, state: t.state, tx, ty, mw, cramped });
      }
    };
    paint(stage);
    return stage.onFrame(paint);
  }, [stage, scene]);

  return (
    <div className={s.headings}>
      {scene.regions.map((r) => (
        <Heading key={r.key} r={r} noneName={noneName} on={on} sel={look.selected.get(r.key) ?? 0} hot={look.hot === r.key} target={look.target === r.key}
          lit={look.lit?.has(r.key) ?? false} found={look.found?.get(r.key) ?? 0} renaming={look.renaming === r.key}
          refEl={(el) => { if (el) els.current.set(r.key, el); else els.current.delete(r.key); }} />
      ))}
    </div>
  );
});

const Heading = memo(function Heading({ r, noneName, on, sel, hot, target, lit, found, renaming, refEl }) {
  const t = useT();
  const fmt = useFormat();
  const name = r.none ? r.name ?? noneName : r.name;
  const editable = !r.none && !r.plain;
  const stop = (e) => e.stopPropagation();
  return (
    <div ref={refEl} className={s.heading} data-heading={r.key} data-board-own="" data-mode="band" data-off=""
      data-none={r.none || undefined} data-hot={hot || undefined} data-target={target || undefined} data-lit={lit || undefined}
      data-forced={hot || target || lit || renaming ? '' : undefined} data-renaming={renaming || undefined}
      style={{ '--c': r.color ?? 'var(--ink-3)' }}
      onPointerDown={(e) => { if (!renaming) on.press(e, { kind: 'head', region: r }); }}
      onPointerEnter={() => on.hover(r.key)} onPointerLeave={() => on.hover(null)}
      onDoubleClick={(e) => { e.stopPropagation(); if (editable) on.startRename(r.key); }}
      onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); on.menu(r.key, { x: e.clientX, y: e.clientY }); }}>
      {editable
        ? <button type="button" className={s.headDot} onPointerDown={stop} onClick={(e) => on.recolor(r.key, e.currentTarget)} aria-label={t('board.region.recolor')} />
        : <i className={s.headDot} data-hollow="" />}
      {renaming ? <RenameField name={r.name} onDone={(v) => on.rename(r.key, v)} />
        : <span className={s.headName}>{name}</span>}
      <span className={`${s.headCount} num`}>{fmt.number(r.n)}</span>
      {/* framed smaller than its files: how many are hidden past the frame (readable at any zoom, unlike the board's own) */}
      {r.hidden > 0 && <span className={`${s.headHidden} num`} title={t('board.region.hidden', { n: fmt.number(r.hidden), count: r.hidden })}><Icon name="eye-off" size={11} stroke={2} />{fmt.number(r.hidden)}</span>}
      {found > 0 && <span className={`${s.headFound} num`}>{fmt.number(found)}</span>}
      {sel > 0 && <span className={`${s.headSel} num`} title={t('group.selection.count', { n: fmt.number(sel), count: sel })}><Icon name="check" size={10} stroke={2.4} />{fmt.number(sel)}</span>}
      <button type="button" className={s.headMore} onPointerDown={stop} onClick={(e) => on.menu(r.key, e.currentTarget)} aria-label={t('common.more')}>
        <Icon name="more" size={15} />
      </button>
    </div>
  );
});

/** A heading's name, being renamed: Enter or leaving it keeps the new name, Escape keeps the old one. */
function RenameField({ name, onDone }) {
  const t = useT();
  const ref = useRef(null);
  const done = useRef(false);
  useLayoutEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const finish = (v) => { if (done.current) return; done.current = true; onDone(v); };
  return (
    <input ref={ref} className={s.headInput} defaultValue={name} maxLength={40} spellCheck={false} aria-label={t('board.region.rename')}
      style={{ '--len': Math.max(4, name.length) }}
      onPointerDown={(e) => e.stopPropagation()}
      onInput={(e) => e.currentTarget.style.setProperty('--len', Math.max(4, e.currentTarget.value.length))}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); finish(e.currentTarget.value); }
        else if (e.key === 'Escape') { e.preventDefault(); finish(null); }
      }}
      onBlur={(e) => finish(e.currentTarget.value)} />
  );
}

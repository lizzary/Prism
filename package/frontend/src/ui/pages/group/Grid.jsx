// The files of a group's page, gathered into their colour groups. Every tile is placed from the computed layout
// (layout.js) and only the ones near the screen exist; a new sort, size or layout lets them glide to their places.
// Files are dragged to a new place (or into another colour group), colour groups are dragged by their headings.
import { memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { browsing, mediaUrl } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Tooltip, Portal } from '../../components/overlay.jsx';
import { layoutPage, sectionSpans, typicalRatio } from './layout.js';
import { useGridDrag } from './useGridDrag.js';
import s from './Grid.module.css';

const { NONE } = browsing;
const BUFFER = 900;               // px of tiles kept beyond the screen, above and below
const BARS = 64 + 58;             // the top bar and the page's toolbar cover this much of the screen
const NEUTRAL = 'var(--ink-3)';

/** The width the grid will have, known before it is measured (so a restored scroll lands right on the first paint). */
function estimateWidth() {
  const vw = document.documentElement.clientWidth;
  return vw - 2 * Math.max(20, Math.min(64, vw * 0.042));
}
function useWidth(ref) {
  const [width, setWidth] = useState(estimateWidth);
  const [resizing, setResizing] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    let last = el.getBoundingClientRect().width, timer = 0;
    setWidth(last);
    const ro = new ResizeObserver(([e]) => {
      if (Math.abs(e.contentRect.width - last) < 0.5) return;
      last = e.contentRect.width;
      setResizing(true);
      setWidth(last);
      clearTimeout(timer);
      timer = setTimeout(() => setResizing(false), 200);
    });
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [ref]);
  return [width, resizing];
}

/**
 * The part of the grid on (or near) the screen, in the grid's own coordinates. Updated in steps, not per pixel.
 * → [viewport, measure] — measure() reads it now (wrapped in flushSync, the tiles there exist at once).
 */
function useViewport(ref, height) {
  const [vp, setVp] = useState({ top: -BUFFER, bottom: innerHeight + BUFFER });
  const measure = useCallback(() => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const top = -r.top, bottom = -r.top + innerHeight;
    setVp((cur) => (Math.abs(cur.top + BUFFER - top) < 160 && Math.abs(cur.bottom - BUFFER - bottom) < 160 ? cur : { top: top - BUFFER, bottom: bottom + BUFFER }));
  }, [ref]);
  useLayoutEffect(() => {
    let raf = 0;
    const on = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; measure(); }); };
    measure();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [measure, height]);
  return [vp, measure];
}

const toggled = (list, key, on) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));

/**
 * arranged: domain/arrange.js; view: page settings; onView(patch).
 * tile: { open(id), toggle(id), range(id), menu(id, anchor | { x, y }) } · selection: Set · focus: { id, at } (bring into view)
 * reveal: { key, at } (a colour group to bring into view) · onSeen(keys): the colour groups on screen, when they change
 * ref: { revealFile(id, { now }) } — see below
 */
export function Grid({ ref, data, arranged, view, onView, selection, arrived, focus, reveal, onSeen, tile, onDropFiles, onDropSection, hold }) {
  const t = useT();
  const grid = useRef(null);
  const ghost = useRef(null);
  const [width, resizing] = useWidth(grid);
  const [hot, setHot] = useState(null);                 // the colour group the pointer is over (all its runs light up)
  const files = useMemo(() => new Map(data.files.map((f) => [f.id, f])), [data.files]);
  const full = useMemo(() => new Map(arranged.sections.map((x) => [x.key, x])), [arranged.sections]);
  // rows are sized for the group's own proportions, so a size level means about as many tiles to a row for any group
  const ratio = useMemo(() => typicalRatio(data.files), [data.files]);
  const opts = { width, level: view.size, ratio, natural: view.natural, mode: view.layout, grouped: arranged.grouped };
  const layout = useMemo(() => layoutPage(arranged.page.sections, opts), [arranged.page.sections, width, ratio, view.size, view.natural, view.layout, arranged.grouped]); // eslint-disable-line react-hooks/exhaustive-deps
  const spans = useMemo(() => sectionSpans(layout), [layout]);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const [vp, measureViewport] = useViewport(grid, layout.height);
  const order = arranged.grouped ? arranged.sections.filter((x) => x.key !== NONE).map((x) => x.key) : [];

  const drag = useGridDrag({
    gridRef: grid, layoutRef, ghostRef: ghost, top: BARS, hold, sectionOrder: order, mode: view.layout,
    onDropFiles, onDropSection,
  });
  const dragging = drag.drag;
  const carried = useMemo(() => new Set(dragging?.kind === 'files' ? dragging.ids : []), [dragging?.kind, dragging?.ids]);

  // keep the picture at the top of the screen in place when the tiles change size or layout
  const anchor = useRef(null);
  const shape = `${view.size}|${view.natural}|${view.layout}`;
  const lastShape = useRef(shape);
  useLayoutEffect(() => {
    if (lastShape.current === shape) return;
    lastShape.current = shape;
    const a = anchor.current;
    const tileNow = a && layout.tiles.find((x) => x.id === a.id);
    if (!tileNow) return;
    const r = grid.current.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top + tileNow.y - a.screen), behavior: 'instant' });
  }, [shape, layout]);
  useEffect(() => {
    const on = () => {
      const r = grid.current?.getBoundingClientRect();
      if (!r) return;
      const line = BARS + 24 - r.top;
      const first = layoutRef.current.tiles.find((x) => x.kind === 'file' && x.y + x.h > line);
      anchor.current = first ? { id: first.id, screen: r.top + first.y } : null;
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  // a file to bring into view (closing the lightbox on it): scrolled to if it is off screen, and lit once
  const [lit, setLit] = useState(null);
  useLayoutEffect(() => {
    if (!focus) return undefined;
    const x = layout.tiles.find((it) => it.id === focus.id);
    if (!x) return undefined;
    const r = grid.current.getBoundingClientRect();
    const top = r.top + x.y, bottom = top + x.h;
    if (top < BARS || bottom > innerHeight) window.scrollTo({ top: Math.max(0, window.scrollY + top - BARS - 40), behavior: focus.smooth ? 'smooth' : 'instant' });
    setLit(focus);
    const timer = setTimeout(() => setLit(null), 1800);
    return () => clearTimeout(timer);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  // the colour groups on screen (under the bars), told to the page only when they change
  const told = useRef('');
  useEffect(() => {
    if (!onSeen) return undefined;
    let raf = 0;
    const read = () => {
      raf = 0;
      const r = grid.current?.getBoundingClientRect();
      if (!r) return;
      const top = BARS - r.top + 8, bottom = innerHeight - r.top - 8;
      const keys = [];
      for (const [k, sp] of spans) if (sp.bottom > top && sp.top < bottom) keys.push(k);
      const sig = keys.join('|');
      if (sig !== told.current) { told.current = sig; onSeen(keys); }
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); window.removeEventListener('resize', on); };
  }, [spans, onSeen]);

  // a colour group chosen in the toolbar: brought up to just under the bars, and lit once
  const [flash, setFlash] = useState(null);
  useLayoutEffect(() => {
    const sp = reveal && spans.get(reveal.key);
    if (!sp) return undefined;
    const r = grid.current.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, window.scrollY + r.top + sp.top - BARS - 14), behavior: 'smooth' });
    setFlash(reveal);
    const timer = setTimeout(() => setFlash(null), 1700);
    return () => clearTimeout(timer);
  }, [reveal]); // eslint-disable-line react-hooks/exhaustive-deps

  // A file's tile brought into full view at once (when it is not already), and where it then is on the screen —
  // from the layout, so it is known even before the tile is drawn. → { left, top, width, height } | null (not here)
  // The lightbox asks this under its dark room: as its files are stepped through (the page quietly follows, so the
  // tiles there are drawn and their pictures loaded by the time it closes), and as it closes, before the picture flies
  // back. `now`: the tiles there are drawn this very moment, already in place (they do not fade in).
  const quietTimer = useRef(0);
  useImperativeHandle(ref, () => ({
    revealFile(id, { now = false } = {}) {
      const x = layoutRef.current.tiles.find((it) => it.id === id);
      const el = grid.current;
      if (!x || !el) return null;
      let r = el.getBoundingClientRect();
      const top = r.top + x.y;
      if (top < BARS || top + x.h > innerHeight) {
        window.scrollTo({ top: Math.max(0, window.scrollY + top - BARS - 40), behavior: 'instant' });
        if (now) {
          el.setAttribute('data-quiet', '');
          flushSync(measureViewport);
          clearTimeout(quietTimer.current);
          quietTimer.current = setTimeout(() => el.removeAttribute('data-quiet'), 700);
        }
        r = el.getBoundingClientRect();
      }
      return { left: r.left + x.x, top: r.top + x.y, width: x.w, height: x.h };
    },
  }), [measureViewport]);
  useEffect(() => () => clearTimeout(quietTimer.current), []);

  // stable handlers: tiles are memoised, they find their file through data-file-id
  const h = useRef({});
  h.current.tile = tile;
  h.current.begin = drag.beginFiles;
  h.current.selection = selection;
  const handlers = useMemo(() => {
    const id = (e) => e.currentTarget.closest('[data-file-id]').dataset.fileId;
    return {
      down: (e) => {
        const f = id(e);
        const sel = h.current.selection;
        h.current.begin(e, sel.has(f) && sel.size > 1 ? [...sel] : [f]);
      },
      click: (e) => {
        const f = id(e);
        if (e.shiftKey) { e.preventDefault(); h.current.tile.range(f); }
        else if (e.ctrlKey || e.metaKey) h.current.tile.toggle(f);
        else h.current.tile.open(f);
      },
      key: (e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') { e.preventDefault(); h.current.tile.open(id(e)); }
        else if (e.key === ' ') { e.preventDefault(); h.current.tile.toggle(id(e)); }
      },
      check: (e) => { e.stopPropagation(); const f = id(e); if (e.shiftKey) h.current.tile.range(f); else h.current.tile.toggle(f); },
      menu: (e) => { e.stopPropagation(); h.current.tile.menu(id(e), e.currentTarget); },
      context: (e) => { e.preventDefault(); h.current.tile.menu(id(e), { x: e.clientX, y: e.clientY }); },
    };
  }, []);

  const quality = view.quality;
  const selecting = selection.size > 0;
  const fresh = arrived.at && Date.now() - arrived.at < 2600 ? new Set(arrived.ids) : null;
  const coverId = data.group.cover?.id;
  const colorOf = (key) => full.get(key)?.color?.color ?? NEUTRAL;
  const nameOf = (key) => (key === NONE ? t('group.colors.noColor') : full.get(key)?.color?.name ?? '');
  const target = dragging?.target;
  const shown = layout.tiles.filter((x) => x.y + x.h > vp.top && x.y < vp.bottom);

  return (
    <div ref={grid} className={s.grid} style={{ height: layout.height }} data-resizing={resizing || undefined} data-dragging={dragging?.kind}
      data-mode={arranged.grouped ? view.layout : 'plain'} onPointerLeave={() => setHot(null)}>
      {layout.boxes.map((b) => (
        <div key={b.key} className={s.box} style={{ '--c': colorOf(b.section), '--i': b.i, transform: `translate(${b.x}px, ${b.y}px)`, width: b.w, height: b.h }}
          data-none={b.section === NONE || undefined} data-open-left={b.open.left || undefined} data-open-right={b.open.right || undefined}
          data-shelf={b.shelf || undefined} data-empty={(b.shelf && b.empty) || undefined}
          data-hot={hot === b.section || undefined} data-target={(target?.section === b.section && dragging?.kind === 'files') || undefined}
          data-flash={(flash?.key === b.section && flash.at) || undefined}
          data-lifted={(dragging?.kind === 'section' && dragging.key === b.section) || undefined}
          onPointerEnter={() => setHot(b.section)}>
          {b.empty && !b.shelf && <span className={s.emptyDrop}><Icon name="drag-drop" size={18} />{t('group.section.dropHere')}</span>}
        </div>
      ))}

      {layout.heads.map((hd) => {
        const sec = full.get(hd.section);
        if (!sec) return null;
        const draggable = hd.section !== NONE && order.length > 1;
        const lifted = dragging?.kind === 'section' && dragging.key === hd.section;
        const onDrag = (e) => drag.beginSection(e, hd.section);
        const onHot = () => setHot(hd.section);
        return hd.kind === 'shelf'
          ? <ShelfTab key={hd.key} hd={hd} sec={sec} name={nameOf(hd.section)} color={colorOf(hd.section)} draggable={draggable} onDrag={onDrag}
              lifted={lifted} onHot={onHot} onUnfold={() => onView({ collapsed: toggled(view.collapsed, hd.section, false) })} />
          : <Heading key={hd.key} hd={hd} sec={sec} name={nameOf(hd.section)} color={colorOf(hd.section)} view={view} onView={onView}
              draggable={draggable} onDrag={onDrag} lifted={lifted} onHot={onHot} />;
      })}

      {shown.map((x) => {
        const f = files.get(x.id);
        return f && (
          <Tile key={x.key} x={x} file={f} quality={quality} selected={selection.has(f.id)} selecting={selecting} carried={carried.has(f.id)}
            cover={coverId === f.id} glow={(fresh?.has(f.id) || lit?.id === f.id) || undefined} h={handlers}
            onHot={arranged.grouped ? setHot : null} />
        );
      })}

      {dragging?.kind === 'files' && target?.marker && (
        <span className={s.marker} style={{ '--c': colorOf(target.section), transform: `translate(${target.marker.x - 1.5}px, ${target.marker.y}px)`, height: target.marker.h }} />
      )}
      {dragging?.kind === 'section' && target?.marker && (
        <span className={s.marker} style={{ '--c': colorOf(dragging.key), transform: `translate(${target.marker.x}px, ${target.marker.y}px)`, width: target.marker.w, height: target.marker.h }} />
      )}
      {dragging && (
        <Portal>
          <div ref={ghost} className={s.ghost} style={{ transform: `translate(${dragging.x}px, ${dragging.y}px)` }} aria-hidden="true">
            {dragging.kind === 'files'
              ? <FileGhost ids={dragging.ids} files={files} target={target} name={target ? nameOf(target.section) : ''} color={target ? colorOf(target.section) : null} grouped={arranged.grouped} />
              : <span className={s.sectionGhost} style={{ '--c': colorOf(dragging.key) }}><i />{nameOf(dragging.key)}</span>}
          </div>
        </Portal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ pieces
/** A picture fading in once decoded; one already seen in this session is simply there. */
const seen = new Set();
function TileImage({ src, className }) {
  const [ready, setReady] = useState(() => seen.has(src));
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (seen.has(src)) { setReady(true); return; }
    setReady(false);
    if (ref.current?.complete && ref.current.naturalWidth) { seen.add(src); setReady(true); }
  }, [src]);
  return (
    <img ref={ref} src={src} alt="" draggable={false} decoding="async" loading="lazy" className={className} data-ready={ready || undefined}
      onLoad={() => { seen.add(src); setReady(true); }} />
  );
}

const Tile = memo(function Tile({ x, file, quality, selected, selecting, carried, cover, glow, h, onHot }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <div className={s.tile} data-file-id={file.id} role="button" tabIndex={0} aria-label={`${file.name}.${file.ext}`} aria-pressed={selected}
      data-selected={selected || undefined} data-selecting={selecting || undefined} data-carried={carried || undefined} data-glow={glow}
      style={{ transform: `translate(${x.x}px, ${x.y}px)`, width: x.w, height: x.h }}
      onPointerDown={h.down} onClick={h.click} onKeyDown={h.key} onContextMenu={h.context} onPointerEnter={onHot ? () => onHot(x.section) : undefined}>
      <div className={s.frame}>
        <TileImage src={mediaUrl(file, quality)} className={s.img} />
        {file.kind === 'video' && <span className={s.video}><Icon name="play" size={10} />{fmt.duration(file.duration)}</span>}
        {cover && <span className={s.coverMark} title={t('group.tile.isCover')}><Icon name="cover" size={13} /></span>}
      </div>
      <button type="button" className={s.check} onClick={h.check} tabIndex={-1} aria-label={t('group.tile.select')}>
        <Icon name="check" size={13} stroke={2.4} />
      </button>
      <button type="button" className={s.more} onClick={h.menu} tabIndex={-1} aria-label={t('group.tile.more')}>
        <Icon name="more" size={16} />
      </button>
    </div>
  );
});

/**
 * A colour group's heading, inside the top of its box (one or two per row) or of its band (flowing, a slimmer one):
 * its colour, name and size; held to a number, how many more it has — pressing that shows all of it, and once shown
 * whole it offers to go back to the number; fold it; drag it to a new place. A run carried on from the row above
 * says so, with the name alone.
 */
function Heading({ hd, sec, name, color, view, onView, draggable, onDrag, lifted, onHot }) {
  const t = useT();
  const fmt = useFormat();
  const slim = hd.kind !== 'head';
  const style = { '--c': color, transform: `translate(${hd.x}px, ${hd.y}px)`, width: hd.w, height: hd.h };
  const common = {
    style, 'data-slim': slim || undefined, 'data-lifted': lifted || undefined, 'data-none': sec.key === NONE || undefined,
    'data-grab': draggable || undefined, onPointerDown: draggable ? onDrag : undefined, onPointerEnter: onHot,
  };
  if (hd.kind === 'cont') {
    return (
      <div className={s.head} data-cont="" {...common}>
        <Tooltip label={t('group.section.continued')}>
          <span className={s.cont}><Icon name="wrap" size={13} className={s.wrapIcon} /><span className={s.name}>{name}</span></span>
        </Tooltip>
      </div>
    );
  }
  const fold = () => onView({ collapsed: toggled(view.collapsed, sec.key, !sec.collapsed) });
  const showAll = () => onView({ expanded: toggled(view.expanded, sec.key, true) });
  const showLess = () => onView({ expanded: toggled(view.expanded, sec.key, false) });
  const held = view.limited && sec.expanded && sec.total > view.limit;   // shown whole although the page holds groups to a number
  const peek = sec.collapsed && !slim ? sec.files.slice(0, 6) : [];
  return (
    <div className={s.head} {...common}>
      {draggable && !slim && <Icon name="grip" size={15} className={s.grip} />}
      <i className={s.dot} />
      <span className={s.name}>{name}</span>
      <span className={`${s.count} num`}>{fmt.number(sec.total)}</span>
      {/* held to a number: how many more, right by the size — pressing it shows them; shown whole, it goes back */}
      {sec.limited && !sec.collapsed && (
        <Tooltip label={t('group.section.showAll', { n: fmt.number(sec.total) })}>
          <button type="button" className={s.moreChip} onClick={showAll} aria-label={t('group.section.showAll', { n: fmt.number(sec.total) })}>
            <span className="num">+{fmt.number(sec.total - view.limit)}</span>
          </button>
        </Tooltip>
      )}
      {held && !sec.collapsed && (
        <Tooltip label={t('group.section.showLess', { n: fmt.number(view.limit) })}>
          <button type="button" className={s.moreChip} data-held="" onClick={showLess} aria-label={t('group.section.showLess', { n: fmt.number(view.limit) })}>
            <Icon name="chevron-up" size={13} stroke={2} /><span className="num">{fmt.number(view.limit)}</span>
          </button>
        </Tooltip>
      )}
      {peek.length > 0 && (
        <span className={s.peek} aria-hidden="true">
          {peek.map((f, k) => <img key={f.id} src={mediaUrl(f, 'low')} alt="" draggable={false} loading="lazy" style={{ '--k': k }} />)}
        </span>
      )}
      <span className={s.headTools}>
        <Tooltip label={sec.collapsed ? t('group.section.unfold') : t('group.section.fold')}>
          <button type="button" className={s.foldBtn} data-folded={sec.collapsed || undefined} onClick={fold} aria-expanded={!sec.collapsed}
            aria-label={sec.collapsed ? t('group.section.unfold') : t('group.section.fold')}>
            <Icon name="chevron-down" size={slim ? 14 : 16} />
          </button>
        </Tooltip>
      </span>
    </div>
  );
}

/**
 * A folded (or empty) colour group in the flowing layout: a tab on the shelf between the open ones, as tall as a heading
 * at any size. Its colour, name and size, and a few of its pictures fanned at its end; pressing it unfolds it, dragging
 * it moves the colour group, and files dropped on it join it (an empty one is drawn as a place to drop them).
 */
function ShelfTab({ hd, sec, name, color, draggable, onDrag, lifted, onHot, onUnfold }) {
  const t = useT();
  const fmt = useFormat();
  const empty = !sec.total;
  // unfolding an empty one would show nothing more: it stays a place to drop files, folded or not
  const folded = sec.collapsed && !empty;
  const peek = sec.files.slice(0, 3);
  const label = folded ? `${name} · ${t('group.section.unfold')}` : t('group.section.dropHere');
  return (
    <Tooltip label={label} delay={600}>
      <div className={s.shelfTab} role={folded ? 'button' : undefined} tabIndex={folded ? 0 : undefined} aria-expanded={folded ? false : undefined}
        aria-label={folded ? label : undefined}
        style={{ '--c': color, '--i': hd.i, transform: `translate(${hd.x}px, ${hd.y}px)`, width: hd.w, height: hd.h }}
        data-none={sec.key === NONE || undefined} data-folded={folded || undefined} data-empty={empty || undefined}
        data-grab={draggable || undefined} data-lifted={lifted || undefined}
        onPointerDown={draggable ? onDrag : undefined} onPointerEnter={onHot} onClick={folded ? onUnfold : undefined}
        onKeyDown={folded ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onUnfold(); } } : undefined}>
        <i className={s.dot} />
        <span className={s.name}>{name}</span>
        <span className={`${s.count} num`}>{fmt.number(sec.total)}</span>
        <span className={s.shelfEnd}>
          {empty
            ? <Icon name="drag-drop" size={16} className={s.shelfDrop} />
            : (
              <span className={s.shelfFan} aria-hidden="true">
                {peek.map((f, k) => <img key={f.id} src={mediaUrl(f, 'low')} alt="" draggable={false} loading="lazy" style={{ '--k': k, '--n': peek.length }} />)}
              </span>
            )}
          {folded && <Icon name="chevron-down" size={14} className={s.shelfChev} />}
        </span>
      </div>
    </Tooltip>
  );
}

/** What is being carried: the pictures stacked (a few of them), how many, and where they would go. */
function FileGhost({ ids, files, target, name, color, grouped }) {
  const pics = ids.slice(0, 3).map((id) => files.get(id)).filter(Boolean);
  return (
    <span className={s.fileGhost}>
      <span className={s.stack}>
        {pics.map((f, k) => <img key={f.id} src={mediaUrl(f, 'low')} alt="" style={{ '--k': k, '--n': pics.length }} />)}
        {ids.length > 1 && <b className={`${s.badge} num`}>{ids.length}</b>}
      </span>
      {grouped && target && (
        <span className={s.whither} style={{ '--c': color }}><i />{name}</span>
      )}
    </span>
  );
}

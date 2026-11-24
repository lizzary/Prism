// The home page's wall of groups. Covers keep their own proportions in justified rows (or all become squares);
// every card is placed from computed geometry, so a new layout, a new order or a filter lets the cards glide to
// their places instead of jumping. Moving across a card glances through the group's covers.
// The wall's bar carries the wall in miniature (GroupStrip), which follows the page and jumps to any group.
import { ViewTransition, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { libraryActions, mediaUrl, useOptimisticView } from '../../../bridge/index.js';
import { useOverlays } from '../../../app/shell.jsx';
import { Link, cameBack, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { justify } from '../../lib/justify.js';
import { coverOnShow } from '../../lib/coverOnShow.js';
import { moveTo, useReorder } from '../../lib/useReorder.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, Segmented } from '../../components/controls.jsx';
import { Portal, Tooltip } from '../../components/overlay.jsx';
import { Empty, EmptyArt } from '../../components/feedback.jsx';
import { GroupStrip } from './GroupStrip.jsx';
import s from './GroupWall.module.css';

const GAP_X = 20;          // between cards in a row
const GAP_Y = 30;          // between rows (under the labels)
const LABEL_H = 50;        // a card's name and meta line
const SQUARE_MIN = 212;    // narrowest square cover
const BAR_H = 64 + 58;     // the top bar and the wall's own bar cover this much of the page
const ADD = '+';
const norm = (x) => (x || '').normalize('NFKC').toLowerCase();
/** The row height to aim for: a few generous covers per row at any width. */
const targetFor = (w) => Math.max(200, Math.min(316, w * 0.205));

/** Where every card goes: { boxes: Map(id → { x, y, w, h }), height } — h is the cover's height. */
function place(ids, ratios, width, natural) {
  const boxes = new Map();
  if (width <= 0) return { boxes, height: 0 };
  if (natural) {
    const rows = justify(ids.map((id) => ({ id, ratio: ratios.get(id) })), { width, target: targetFor(width), gap: GAP_X });
    let y = 0;
    for (const row of rows) {
      let x = 0;
      for (const it of row.items) { boxes.set(it.id, { x, y, w: it.width, h: row.height }); x += it.width + GAP_X; }
      y += row.height + LABEL_H + GAP_Y;
    }
    return { boxes, height: Math.max(0, y - GAP_Y) };
  }
  const cols = Math.max(1, Math.floor((width + GAP_X) / (SQUARE_MIN + GAP_X)));
  const size = (width - GAP_X * (cols - 1)) / cols;
  ids.forEach((id, i) => boxes.set(id, { x: (i % cols) * (size + GAP_X), y: Math.floor(i / cols) * (size + LABEL_H + GAP_Y), w: size, h: size }));
  const rows = Math.ceil(ids.length / cols);
  return { boxes, height: rows * (size + LABEL_H) + (rows - 1) * GAP_Y };
}

/** The wall's width when it was last measured. */
let measuredWidth = 0;
/** The wall's width before it can be measured: its section is centred, at most --maxw wide, inside the gutters. */
function estimateWidth() {
  const page = document.body.clientWidth;             // the page, less the gutter kept for the scrollbar
  const gutter = Math.min(64, Math.max(20, innerWidth * 0.042));
  return Math.max(0, Math.min(page - 2 * gutter, 1520));
}

/**
 * The wall's width; while the window is being resized the cards follow at once instead of gliding. The cards are
 * there from the first render — laid out at the width last measured (coming back) or an estimate (the first visit,
 * put right before it is painted) — so a page change already finds them: coming back from a group's page, its banner
 * has a card to settle into.
 */
function useWallWidth(ref, present) {
  const [width, setWidth] = useState(() => measuredWidth || estimateWidth());
  const [resizing, setResizing] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    let last = width, timer = 0;
    // the wall's own height follows its cards: only a change of width is a resize
    const take = (w) => {
      measuredWidth = w;
      if (Math.abs(w - last) < 0.5) return;
      last = w;
      setResizing(true);
      setWidth(w);
      clearTimeout(timer);
      timer = setTimeout(() => setResizing(false), 200);
    };
    take(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => take(e.contentRect.width));
    ro.observe(el);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [ref, present]); // eslint-disable-line react-hooks/exhaustive-deps
  return [width, resizing];
}

/**
 * Which of the wall's cards are on screen (under the bars), as the range of their places: [first, last] | null.
 * `layout` re-attaches the watch whenever the cards are laid out anew (they exist only once the wall has a width).
 */
function useOnScreen(ref, ids, layout) {
  const [range, setRange] = useState(null);
  const key = ids.join();
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const seen = new Set();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target.dataset.reorderId);
        else seen.delete(e.target.dataset.reorderId);
      }
      const at = ids.flatMap((id, i) => (seen.has(id) ? [i] : []));
      setRange((cur) => {
        const next = at.length ? [at[0], at[at.length - 1]] : null;
        return cur && next && cur[0] === next[0] && cur[1] === next[1] ? cur : next;
      });
    }, { rootMargin: `-${BAR_H}px 0px 0px 0px`, threshold: 0.3 });
    for (const card of el.querySelectorAll('[data-reorder-id]')) io.observe(card);
    return () => io.disconnect();
  }, [ref, key, layout]); // eslint-disable-line react-hooks/exhaustive-deps
  return range;
}

export function GroupWall({ home }) {
  const t = useT();
  const { open } = useOverlays();
  const [view, setView] = useOptimisticView(home.view, libraryActions.saveHomeView);
  const [order, setOrder] = useState(null);     // the order as last arranged here (saved in the background)
  const [query, setQuery] = useState('');
  const [flash, setFlash] = useState(null);     // { id, always }: a group to bring into view and light up once
  const wall = useRef(null);
  const [width, resizing] = useWallWidth(wall, home.groups.length > 0);
  const settle = useRef(null);                  // a card just dropped: glide it from where it was let go
  const quiet = useRef(cameBack()).current;      // coming back is not arriving: no entrance

  const groups = useMemo(() => {
    if (!order) return home.groups;
    const at = new Map(order.map((id, i) => [id, i]));
    return [...home.groups].sort((a, b) => (at.get(a.id) ?? -1) - (at.get(b.id) ?? -1));
  }, [home.groups, order]);
  const q = norm(query.trim());
  const shown = q ? groups.filter((g) => norm(g.name).includes(q)) : groups;
  const ids = [...shown.map((g) => g.id), ...(q ? [] : [ADD])];
  const ratios = useMemo(() => new Map([[ADD, 0.8], ...groups.map((g) => [g.id, g.cover ? g.cover.width / g.cover.height : 1])]), [groups]);
  const layout = useMemo(() => place(ids, ratios, width, view.naturalRatio), [ids.join(), ratios, width, view.naturalRatio]); // eslint-disable-line react-hooks/exhaustive-deps
  const onScreen = useOnScreen(wall, shown.map((g) => g.id), layout);

  const drag = useReorder({
    listRef: wall, mode: 'grid', axis: 'y', inset: { top: BAR_H }, disabled: !!q,
    onDrop: (id, index, from) => {
      const next = moveTo(groups.map((g) => g.id), id, index);
      if (next.join() === groups.map((g) => g.id).join()) return;
      settle.current = { id, from };
      setOrder(next);
      libraryActions.setGroupOrder(next);
    },
  });

  useLayoutEffect(() => {
    const st = settle.current;
    if (!st) return;
    settle.current = null;
    const el = wall.current?.querySelector(`[data-reorder-id="${CSS.escape(st.id)}"]`);
    if (!el || !st.from) return;
    // jump to the new place without the slot's own transition, then glide there from the drop point
    el.style.transition = 'none';
    const to = el.getBoundingClientRect();
    const dx = st.from.left + st.from.width / 2 - (to.left + to.width / 2), dy = st.from.top + st.from.height / 2 - (to.top + to.height / 2);
    el.style.transform = `translate(${dx}px, ${dy}px) scale(${(st.from.width / to.width).toFixed(4)})`;
    el.style.zIndex = '30';
    void el.offsetWidth;
    el.style.transition = 'transform 480ms var(--ease-out)';
    el.style.transform = '';
    // hand the card back to its slot's own transitions afterwards — even if the wall re-renders meanwhile
    // (the saved order comes back from the data layer while the card is still gliding)
    setTimeout(() => { el.style.removeProperty('transition'); el.style.removeProperty('z-index'); }, 520);
  }, [layout]);

  // a group just created, or picked in the strip: bring it into view and let it glow once
  useLayoutEffect(() => {
    if (!flash) return undefined;
    const el = wall.current?.querySelector(`[data-reorder-id="${CSS.escape(flash.id)}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      if (flash.always || r.top < BAR_H || r.bottom > innerHeight) window.scrollTo({ top: r.top + window.scrollY - BAR_H - 28, behavior: 'smooth' });
    }
    const timer = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(timer);
  }, [flash]);

  const newGroup = () => open('groupEditor', { onCreated: (g) => setFlash({ id: g.id }) });

  if (!home.groups.length) {
    return (
      <section className={s.section}>
        <div ref={wall} />
        <Empty title={t('home.emptyTitle')} action={<Button variant="primary" icon="gallery-plus" data-overlay="groupEditor" onClick={newGroup}>{t('home.newGroup')}</Button>}>{t('home.emptyBody')}</Empty>
      </section>
    );
  }

  return (
    <section className={s.section}>
      <div className={s.bar}>
        <h2 className={s.title}>{t('home.groups')}<span className={`${s.count} num`}>{q ? `${shown.length}/${groups.length}` : groups.length}</span></h2>
        <GroupStrip groups={shown} range={onScreen} onJump={(id) => setFlash({ id, always: true })} quiet={quiet} />
        <label className={s.find}>
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('home.findGroup')} spellCheck={false} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}><Icon name="close" size={12} /></button>}
        </label>
        <Segmented size="sm" iconOnly label={t('home.ratio')} value={view.naturalRatio ? 'natural' : 'square'}
          onChange={(v) => setView({ naturalRatio: v === 'natural' })}
          options={[{ value: 'natural', icon: 'ratio-natural', label: t('home.ratioNatural') }, { value: 'square', icon: 'ratio-square', label: t('home.ratioSquare') }]} />
        <span className={s.sep} />
        <Button variant="ghost" size="sm" icon="gallery-plus" className={s.newBtn} data-overlay="groupEditor" onClick={newGroup}>{t('home.newGroup')}</Button>
      </div>

      <div ref={wall} className={s.wall} style={{ height: layout.height }} data-resizing={resizing || undefined} data-quiet={quiet || undefined}>
        {shown.map((g, i) => {
          const box = layout.boxes.get(g.id);
          return box && (
            <GroupCard key={g.id} group={g} box={box} index={i} eager={i < 10} flash={flash?.id === g.id} drag={drag.handle(g.id)}
              onEdit={() => open('groupEditor', { group: g })} />
          );
        })}
        {layout.boxes.has(ADD) && <AddTile box={layout.boxes.get(ADD)} index={shown.length} onClick={newGroup} />}
      </div>
      {q && !shown.length && <Empty compact title={t('home.noMatch', { q: query.trim() })} />}
      {drag.marker && <Portal><span className={s.marker} style={drag.marker} /></Portal>}
    </section>
  );
}

const slotStyle = (box, index) => ({ left: box.x, top: box.y, width: box.w, '--h': `${box.h}px`, '--i': Math.min(index, 14) });

function GroupCard({ group, box, index, eager, flash, drag, onEdit }) {
  const t = useT();
  const fmt = useFormat();
  const to = paths.group(group.id);
  return (
    <div className={s.slot} style={slotStyle(box, index)} data-flash={flash || undefined} {...drag}>
      <div className={s.card}>
        <Link to={to} className={s.coverLink} draggable={false} aria-label={group.name}>
          <Cover group={group} eager={eager} />
        </Link>
        <IconButton icon="edit" size="sm" tone="art" label={t('home.editGroup')} className={s.edit} data-overlay="groupEditor" onClick={onEdit} placement="top" />
        <div className={s.label}>
          <Link to={to} className={s.name} draggable={false} tabIndex={-1}>{group.name}</Link>
          <div className={s.meta}>
            <span className="num">{group.fileCount ? t('home.files', { n: group.fileCount }) : t('home.emptyGroup')}</span>
            {group.fileCount > 0 && <span className={s.when}>{t('home.updated', { date: fmt.relative(group.updatedAt) })}</span>}
            {group.palette && <Palette palette={group.palette} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The group's covers, the main one in front: moving across the card from left to right glances through them, in
 * the order they were chosen (their pictures load on the pointer's first visit). Opening the group, the picture on
 * show grows into the banner of its page, which opens on it; coming back, the banner's picture settles here, and a
 * moment later the card turns back to its main cover.
 */
function Cover({ group, eager }) {
  const covers = group.covers;
  const n = covers.length;
  // back from the group's page while it showed another of its covers: that one lands here first
  const [landed] = useState(() => Math.max(0, covers.findIndex((c) => c.id === coverOnShow.of(group.id))));
  const [at, setAt] = useState(landed);
  const [armed, setArmed] = useState(landed > 0);
  const [settling, setSettling] = useState(false);
  const over = useRef(false);
  const loaded = useRef(new Set());
  const shown = Math.min(at, Math.max(0, n - 1));
  const show = (k) => { setAt(k); coverOnShow.set(group.id, k > 0 ? covers[k].id : null); };
  const showRef = useRef(show);
  showRef.current = show;
  useEffect(() => {
    if (!landed) return undefined;
    // once it has landed (and unless the pointer is on it), the card slowly turns back to its main cover
    const timer = setTimeout(() => { if (!over.current) { setSettling(true); showRef.current(0); } }, 1200);
    return () => clearTimeout(timer);
  }, [landed]);
  if (!n) return <div className={`${s.cover} ${s.coverEmpty}`}><EmptyArt size={96} /></div>;
  const skim = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const k = Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n)));
    if (k !== shown) show(k);
  };
  return (
    <div className={s.cover} data-skimming={shown > 0 || undefined}
      onPointerEnter={(e) => { over.current = true; setSettling(false); if (e.pointerType === 'mouse' && n > 1) setArmed(true); }}
      onPointerMove={armed ? skim : undefined}
      onPointerLeave={() => { over.current = false; show(0); }}
      // a picture still on its way in is not on show (the main cover is): the page opens on what the card shows
      onClick={() => { if (shown > 0 && !loaded.current.has(covers[shown].id)) coverOnShow.set(group.id, null); }}>
      {/* the covers as one picture: whichever is on show is the one that grows into the page's banner (and, coming
          back, lands here above the arriving page: .landing, base.css) */}
      <ViewTransition name={`group-art-${group.id}`} share="morph landing" default="none">
        <div className={s.frames} data-settling={settling || undefined}>
          <CoverImage src={mediaUrl(covers[0], 'original')} eager={eager} />
          {armed && covers.slice(1).map((f, k) => (
            <img key={f.id} src={mediaUrl(f, 'original')} alt="" draggable={false} loading="lazy" className={s.frame} data-on={shown === k + 1}
              // the one landing from the banner is already decoded: drawn at once, so it is there when it lands
              decoding={landed === k + 1 ? 'sync' : 'async'} onLoad={() => loaded.current.add(f.id)} />
          ))}
        </div>
      </ViewTransition>
      {armed && covers[shown]?.kind === 'video' && <span className={s.videoMark}><Icon name="play" size={12} /></span>}
      {armed && n > 1 && (
        <span className={s.ticks} aria-hidden="true">
          {covers.map((f, k) => <i key={f.id} data-on={shown === k} />)}
        </span>
      )}
    </div>
  );
}

/** The cover at full quality, fading in once decoded (and at once if it was already seen). */
const seen = new Set();
function CoverImage({ src, eager }) {
  const [ready, setReady] = useState(() => seen.has(src));
  const ref = useRef(null);
  useLayoutEffect(() => { if (ref.current?.complete && ref.current.naturalWidth) { seen.add(src); setReady(true); } }, [src]);
  return (
    <img ref={ref} src={src} alt="" draggable={false} decoding="async" loading={eager ? 'eager' : 'lazy'}
      className={s.coverImg} data-ready={ready || undefined} onLoad={() => { seen.add(src); setReady(true); }} />
  );
}

/** The colour groups the group is organised by, as a row of small paint dots. */
function Palette({ palette }) {
  const label = `${palette.name} · ${palette.colors.map((c) => c.name).join(' / ')}`;
  return (
    <Tooltip label={label}>
      <span className={s.palette} tabIndex={-1} aria-label={label}>
        {palette.colors.slice(0, 6).map((c, k) => <i key={k} style={{ background: c.color, '--k': k }} />)}
      </span>
    </Tooltip>
  );
}

function AddTile({ box, index, onClick }) {
  const t = useT();
  return (
    <div className={s.slot} style={slotStyle(box, index)}>
      <button type="button" className={`${s.card} ${s.add}`} data-overlay="groupEditor" onClick={onClick}>
        <span className={s.addFrame}>
          <span className={s.addPlus}><Icon name="plus" size={22} /></span>
          <span>{t('home.newGroup')}</span>
        </span>
      </button>
    </div>
  );
}

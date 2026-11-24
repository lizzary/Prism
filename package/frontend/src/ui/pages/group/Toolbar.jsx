// The group page's toolbar, sticking under the top bar and spanning the page. On the left, everything about colour
// groups: their list beside the files, which configuration gathers the files, their layout, a number per colour group,
// fold all — then the colour groups themselves as a strip that follows the page (the ones on screen sit in a soft
// window) and jumps to any of them.
// On the right, how the files look (sort, size, proportions, quality and files per page) and what to do (refresh,
// whiteboard, upload).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { browsing } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, Segmented, Select, Stepper } from '../../components/controls.jsx';
import { Popover, Tooltip } from '../../components/overlay.jsx';
import { LEVELS } from './layout.js';
import s from './Toolbar.module.css';

const { NONE } = browsing;

export function Toolbar({ data, arranged, view, setView, clock, arrived, onRefresh, onUpload, onWhiteboard, onEditColors, onUseConfig, stuck, seen, onJump, outline, onOutline }) {
  const t = useT();
  const grouped = arranged.grouped;
  const keys = arranged.sections.map((x) => x.key);
  const anyOpen = keys.some((k) => !view.collapsed.includes(k));
  return (
    <div className={s.bar} data-stuck={stuck || undefined}>
      <div className={s.cluster}>
        {grouped && <ListToggle open={outline} colors={arranged.sections.filter((x) => x.color).slice(0, 3).map((x) => x.color.color)} onToggle={onOutline} />}
        <Palette data={data} onUse={onUseConfig} onEdit={onEditColors} />
        {grouped && (
          <>
            <Segmented size="sm" iconOnly label={t('group.layout.label')} value={view.layout} onChange={(v) => setView({ layout: v })}
              options={[
                { value: 'single', icon: 'cols-1', label: t('group.layout.single') },
                { value: 'double', icon: 'cols-2', label: t('group.layout.double') },
                { value: 'mixed', icon: 'layout-mixed', label: t('group.layout.mixed') },
              ]} />
            <LimitSwitch view={view} setView={setView} />
            <IconButton size="sm" icon={anyOpen ? 'fold-all' : 'unfold-all'} label={anyOpen ? t('group.collapseAll') : t('group.expandAll')}
              onClick={() => setView({ collapsed: anyOpen ? keys : [] })} />
          </>
        )}
      </div>

      <div className={s.middle}>
        {/* with the outline open beside the files, the strip would only repeat it */}
        {grouped && !outline && arranged.sections.length > 0 && <Strip sections={arranged.sections} seen={seen} onJump={onJump} />}
      </div>

      <div className={`${s.cluster} ${s.look}`}>
        <Sort view={view} setView={setView} />
        <SizeSlider value={view.size} onChange={(size) => setView({ size })} />
        <Segmented size="sm" iconOnly label={t('group.ratio.label')} value={view.natural ? 'natural' : 'square'} onChange={(v) => setView({ natural: v === 'natural' })}
          options={[{ value: 'natural', icon: 'ratio-natural', label: t('group.ratio.natural') }, { value: 'square', icon: 'ratio-square', label: t('group.ratio.square') }]} />
        <Display view={view} setView={setView} />
      </div>

      <div className={`${s.cluster} ${s.actions}`}>
        <Refresh clock={clock} arrived={arrived} onRefresh={onRefresh} />
        <Button variant="ghost" size="sm" icon="whiteboard" className={s.labelled} onClick={onWhiteboard}>{t('group.whiteboard')}</Button>
        <Button variant="primary" size="sm" icon="upload" className={s.labelled} onClick={onUpload}>{t('group.upload')}</Button>
      </div>
    </div>
  );
}

// the 'list' icon's bullets and lines (as in Icon.jsx), drawn here so the bullets can take the colour groups' colours
const LIST_ROWS = [[6.5, 9.5], [12, 9.5], [17.5, 6.5]];   // each row: y, length of its line

/**
 * The colour groups as a list beside the files: named, first in the bar — right above where the list opens (its key,
 * G, waits in the list's find field). The icon's bullets are the first colour groups' own colours; its lines write
 * themselves out again as the pointer comes.
 */
function ListToggle({ open, colors, onToggle }) {
  const t = useT();
  const label = open ? t('group.outline.close') : t('group.outline.open');
  return (
    <Tooltip label={label} delay={500}>
      <button type="button" className={s.list} aria-pressed={open} aria-label={label} aria-keyshortcuts="G" onClick={onToggle}>
        <svg viewBox="0 0 24 24" width="17" height="17" className={s.listIcon} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          {LIST_ROWS.map(([y, len], k) => (
            <g key={y} style={{ '--k': k }}>
              <circle cx="5.2" cy={y} r="1.9" fill={colors[k] ?? 'currentColor'} stroke="none" />
              <path d={`M9.6 ${y}h${len}`} pathLength="1" />
            </g>
          ))}
        </svg>
        <span className={s.listLabel}>{t('group.outline.button')}</span>
      </button>
    </Tooltip>
  );
}

/** Which configuration gathers the files: its colours as dots and its name; switch to another, or edit them. */
function Palette({ data, onUse, onEdit }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const cur = data.configs.find((c) => c.id === data.activeConfigId);
  const choose = (id) => { setOpen(false); if (id !== data.activeConfigId) onUse(id); };
  return (
    <>
      <button ref={ref} type="button" className={s.palette} data-none={!cur || undefined} aria-expanded={open} onClick={() => (data.configs.length ? setOpen((o) => !o) : onEdit())}>
        {cur ? (
          <span className={s.dots} aria-hidden="true">
            {cur.groups.slice(0, 5).map((c, k) => <i key={c.id} style={{ background: c.color, '--k': k }} />)}
          </span>
        ) : <Icon name="swatches" size={16} />}
        <span className={s.paletteName}>{cur ? cur.name : t('group.colors.entry')}</span>
        {data.configs.length > 0 && <Icon name="chevron-down" size={14} className={s.chev} />}
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-start" label={t('group.colors.configs')} className={s.pop}>
        <div className={s.popHead}>{t('group.colors.configs')}</div>
        <ul className={s.configs} role="listbox">
          {data.configs.map((c) => (
            <li key={c.id} role="option" aria-selected={c.id === data.activeConfigId} className={s.config} onClick={() => choose(c.id)}>
              <span className={s.configDots}>{c.groups.slice(0, 8).map((x) => <i key={x.id} style={{ background: x.color }} />)}{!c.groups.length && <i className={s.hollow} />}</span>
              <span className={s.configName}>{c.name}</span>
              {c.id === data.activeConfigId && <Icon name="check" size={15} className={s.configOn} />}
            </li>
          ))}
          {data.activeConfigId && (
            <li role="option" aria-selected={false} className={`${s.config} ${s.off}`} onClick={() => choose(null)}>
              <span className={s.configDots}><i className={s.hollow} /></span>
              <span className={s.configName}>{t('group.colors.none')}</span>
            </li>
          )}
        </ul>
        <button type="button" className={s.popAction} onClick={() => { setOpen(false); onEdit(); }}><Icon name="swatches" size={15} />{t('group.colors.edit')}</button>
      </Popover>
    </>
  );
}

/**
 * All of every colour group, or a number of each — one press either way, and the number is right there to type or
 * step. (Each colour group held to a number can still be shown whole from its heading.)
 */
function LimitSwitch({ view, setView }) {
  const t = useT();
  const on = view.limited;
  const set = (patch) => setView({ ...patch, expanded: [] });
  return (
    <Tooltip label={t('group.limit.label')} delay={700}>
      <div className={s.limit} data-on={on || undefined} role="group" aria-label={t('group.limit.label')}>
        <button type="button" className={s.limitAll} aria-pressed={!on} onClick={() => on && set({ limited: false })}>{t('group.limit.all')}</button>
        {/* pressing anywhere on the number's side turns the limit on; − + and typing then change it */}
        <div className={s.limitSome} onPointerDownCapture={() => { if (!on) set({ limited: true }); }}>
          <Stepper size="xs" value={view.limit} min={1} max={999} onChange={(n) => set({ limited: true, limit: n })}
            label={t('group.limit.label')} decLabel={t('group.limit.fewer')} incLabel={t('group.limit.more')} />
          <span className={s.limitUnit}>{t('group.limit.each')}</span>
        </div>
      </div>
    </Tooltip>
  );
}

/**
 * The colour groups in order, each with its colour, name and size. The ones on screen sit in a soft window that
 * glides along as the page scrolls; pressing one brings it into view. Short of room the names step back (dots and
 * sizes, the name on hover); shorter still, the strip scrolls.
 */
function Strip({ sections, seen, onJump }) {
  const t = useT();
  const fmt = useFormat();
  const box = useRef(null);
  const track = useRef(null);
  const [win, setWin] = useState(null);
  const [overflow, setOverflow] = useState(false);
  const [compact, setCompact] = useState(false);
  const [cramped, setCramped] = useState(false);
  const lit = new Set(seen);
  const names = sections.map((x) => `${x.key}:${x.color?.name}:${x.total}`).join('|');
  const sig = `${seen.join('|')}#${names}:${sections.map((x) => x.collapsed).join()}#${compact}`;
  // names or not: the strip is measured both ways on the spot (the look put back at once), before anything is painted
  useLayoutEffect(() => {
    const el = box.current, tr = track.current;
    const widthAs = (small) => {
      const was = el.hasAttribute('data-compact');
      el.toggleAttribute('data-compact', small);
      const w = tr.offsetWidth;
      el.toggleAttribute('data-compact', was);
      return w;
    };
    const fit = () => {
      const room = el.clientWidth;
      const named = widthAs(false);
      const small = named > room - 8;
      const w = small ? widthAs(true) : named;
      setCompact(small);
      setOverflow(w > room + 1);
      // too little room even for a few dots: the strip steps aside (it keeps its place, so it can come back)
      setCramped(room < Math.min(w, 132));
    };
    fit();
    // the room changes with the page; the strip itself once its fonts arrive
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    ro.observe(tr);
    return () => ro.disconnect();
  }, [names]);
  useLayoutEffect(() => {
    const el = box.current, tr = track.current;
    if (!el || !tr) return;
    const on = [...tr.querySelectorAll('[data-key]')].filter((c) => lit.has(c.dataset.key));
    if (!on.length) { setWin(null); return; }
    const a = on[0], b = on[on.length - 1];
    const next = { x: a.offsetLeft - 3, w: b.offsetLeft + b.offsetWidth - a.offsetLeft + 6 };
    setWin(next);
    // when the strip is longer than its room, keep the window in sight (its start, when it is longer still)
    if (el.scrollWidth > el.clientWidth && (next.x < el.scrollLeft || next.x + next.w > el.scrollLeft + el.clientWidth)) {
      const left = next.w > el.clientWidth - 16 ? next.x - 8 : next.x + next.w / 2 - el.clientWidth / 2;
      el.scrollTo({ left, behavior: 'smooth' });
    }
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  // a mouse wheel over the strip scrolls it sideways
  useEffect(() => {
    const el = box.current;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  return (
    <nav ref={box} className={s.strip} data-overflow={overflow || undefined} data-compact={compact || undefined} data-cramped={cramped || undefined}
      aria-label={t('group.strip.label')} aria-hidden={cramped || undefined}>
      <div ref={track} className={s.stripTrack}>
        <span className={s.stripWin} data-on={win ? '' : undefined} style={win ? { transform: `translateX(${win.x}px)`, width: win.w } : undefined} />
        {sections.map((sec) => {
          const name = sec.key === NONE ? t('group.colors.noColor') : sec.color?.name ?? '';
          return (
            <Tooltip key={sec.key} label={name} delay={200} disabled={!compact}>
              <button type="button" data-key={sec.key} className={s.chip} data-in={lit.has(sec.key) || undefined} data-none={sec.key === NONE || undefined}
                data-folded={sec.collapsed || undefined} style={{ '--c': sec.color?.color ?? 'var(--ink-3)' }} onClick={() => onJump(sec.key)}
                aria-label={t('group.strip.jump', { name })}>
                <i className={s.chipDot} />
                <span className={s.chipName}>{name}</span>
                <span className={`${s.chipCount} num`}>{fmt.number(sec.total)}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}

function Sort({ view, setView }) {
  const t = useT();
  const custom = view.sort === 'custom';
  return (
    <span className={s.sort}>
      <Select size="sm" icon="sort" value={view.sort} label={t('group.sort.label')} onChange={(v) => setView({ sort: v })}
        options={browsing.SORTS.map((v) => ({ value: v, label: t(`group.sort.${v}`) }))} />
      {!custom && (
        <IconButton size="sm" icon={view.dir === 'asc' ? 'sort-asc' : 'sort-desc'} label={view.dir === 'asc' ? t('group.sort.asc') : t('group.sort.desc')}
          onClick={() => setView({ dir: view.dir === 'asc' ? 'desc' : 'asc' })} />
      )}
    </span>
  );
}

/** Five sizes on a short track: smaller tiles fit more to a row (ten at the smallest, two at the largest). */
function SizeSlider({ value, onChange }) {
  const t = useT();
  const levels = browsing.SIZE_LEVELS;
  const lo = levels[0], hi = levels[levels.length - 1];
  return (
    <span className={s.size}>
      <button type="button" className={s.sizeEnd} onClick={() => onChange(Math.max(lo, value - 1))} disabled={value <= lo} aria-label={t('group.size.smaller')}><Icon name="size-small" size={15} /></button>
      <span className={s.track} style={{ '--p': (value - lo) / (hi - lo) }}>
        {levels.map((l) => <i key={l} data-on={l <= value || undefined} />)}
        <input type="range" min={lo} max={hi} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={t('group.size.label')}
          aria-valuetext={t('group.size.perRow', { n: LEVELS[value]?.cols ?? 6 })} />
        <b className={s.knob} />
      </span>
      <button type="button" className={s.sizeEnd} onClick={() => onChange(Math.min(hi, value + 1))} disabled={value >= hi} aria-label={t('group.size.larger')}><Icon name="size-large" size={15} /></button>
    </span>
  );
}

/** What is asked of the device: picture quality, and how many files make a page. */
function Display({ view, setView }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <IconButton ref={ref} size="sm" icon="sliders" label={t('group.view.label')} active={open} onClick={() => setOpen((o) => !o)} />
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" label={t('group.view.label')} className={s.pop}>
        <div className={s.display}>
          <div className={s.field}>
            <span className={s.fieldLabel}>{t('group.view.quality')}</span>
            <Segmented size="sm" value={view.quality} onChange={(v) => setView({ quality: v })} label={t('group.view.quality')}
              options={browsing.QUALITY_LEVELS.map((v) => ({ value: v, label: t(`group.view.q.${v}`) }))} />
          </div>
          <div className={s.field}>
            <span className={s.fieldLabel}>{t('group.view.pageSize')}</span>
            <Segmented size="sm" value={view.pageSize} onChange={(v) => setView({ pageSize: v })} label={t('group.view.pageSize')}
              options={browsing.PAGE_SIZES.map((v) => ({ value: v, label: v ? String(v) : t('group.view.all') }))} />
          </div>
        </div>
      </Popover>
    </>
  );
}

// the refresh icon's two arcs and their arrowheads (as in Icon.jsx), drawn here so the arcs can fill in
const ARCS = ['M19.4 9.2A7.6 7.6 0 0 0 5.3 8.1', 'M4.6 14.8a7.6 7.6 0 0 0 14.1 1.1'];
const HEADS = ['M19.6 4.6v4.8h-4.8', 'M4.4 19.4v-4.8h4.8'];

/**
 * The page looks for changes every few seconds. The refresh icon's own arcs fill in, tail to arrowhead, as the next
 * look comes near, and fade as it happens; pressing it looks at once (the arrows turn). It holds still while a drag is
 * under way or the window is in the background. Files that just arrived are counted beside it for a moment.
 */
function Refresh({ clock, arrived, onRefresh }) {
  const t = useT();
  const fmt = useFormat();
  const [turn, setTurn] = useState(0);
  const elapsed = clock.interval - clock.left;
  const recent = !!arrived.at && Date.now() - arrived.at < 4000;
  const state = clock.busy ? 'busy' : clock.counting ? 'counting' : 'resting';
  const tip = clock.busy ? t('group.refresh.checking') : clock.resting ? t('group.refresh.resting') : t('group.refresh.tip', { s: clock.interval / 1000 });
  return (
    <span className={s.refreshWrap}>
      {recent && <span key={arrived.at} className={`${s.arrived} num`}>{t('group.refresh.arrived', { n: fmt.number(arrived.ids.length) })}</span>}
      <Tooltip label={tip}>
        <button type="button" className={s.refresh} data-state={state} aria-label={t('group.refresh.now')} onClick={() => { setTurn((n) => n + 1); onRefresh(); }}>
          <svg key={turn} viewBox="0 0 24 24" width="18" height="18" className={s.refreshIcon} data-turn={turn ? '' : undefined}
            fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {ARCS.map((d) => <path key={d} d={d} className={s.arcTrack} />)}
            <g key={clock.busy ? 'busy' : clock.cycle} className={s.arcFill} style={{ '--dur': `${clock.interval}ms`, '--delay': `-${elapsed}ms` }}>
              {ARCS.map((d) => <path key={d} d={d} pathLength="1" />)}
            </g>
            {HEADS.map((d) => <path key={d} d={d} className={s.arrowHead} />)}
          </svg>
        </button>
      </Tooltip>
    </span>
  );
}

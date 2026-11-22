// The group page's toolbar, sticking under the top bar. Three clusters, from the quietest to the loudest:
// how files are gathered (colour groups: which configuration, their layout, a number per colour group, fold all),
// how they look (sort, size, proportions, quality and files per page), and what to do (refresh, whiteboard, upload).
import { useRef, useState } from 'react';
import { browsing } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, Segmented, Select, Switch } from '../../components/controls.jsx';
import { Popover, Tooltip } from '../../components/overlay.jsx';
import s from './Toolbar.module.css';

const { NONE } = browsing;
const LIMITS = [3, 5, 10, 20, 50];

export function Toolbar({ data, arranged, view, setView, clock, arrived, onRefresh, onUpload, onWhiteboard, onEditColors, onUseConfig, stuck }) {
  const t = useT();
  const grouped = arranged.grouped;
  const keys = arranged.sections.map((x) => x.key);
  const anyOpen = keys.some((k) => !view.collapsed.includes(k));
  return (
    <div className={s.bar} data-stuck={stuck || undefined}>
      <div className={s.cluster}>
        <Palette data={data} onUse={onUseConfig} onEdit={onEditColors} />
        {grouped && (
          <>
            <Segmented size="sm" iconOnly label={t('group.layout.label')} value={view.layout} onChange={(v) => setView({ layout: v })}
              options={[
                { value: 'single', icon: 'cols-1', label: t('group.layout.single') },
                { value: 'double', icon: 'cols-2', label: t('group.layout.double') },
                { value: 'mixed', icon: 'layout-mixed', label: t('group.layout.mixed') },
              ]} />
            <Limit view={view} setView={setView} />
            <IconButton size="sm" icon={anyOpen ? 'fold-all' : 'unfold-all'} label={anyOpen ? t('group.collapseAll') : t('group.expandAll')}
              onClick={() => setView({ collapsed: anyOpen ? keys : [] })} />
          </>
        )}
      </div>

      <div className={s.cluster}>
        <Sort view={view} setView={setView} />
        <SizeSlider value={view.size} onChange={(size) => setView({ size })} />
        <Segmented size="sm" iconOnly label={t('group.ratio.label')} value={view.natural ? 'natural' : 'square'} onChange={(v) => setView({ natural: v === 'natural' })}
          options={[{ value: 'natural', icon: 'ratio-natural', label: t('group.ratio.natural') }, { value: 'square', icon: 'ratio-square', label: t('group.ratio.square') }]} />
        <Display view={view} setView={setView} />
      </div>

      <div className={`${s.cluster} ${s.actions}`}>
        <RefreshRing clock={clock} arrived={arrived} onRefresh={onRefresh} />
        <Button variant="ghost" size="sm" icon="whiteboard" className={s.labelled} onClick={onWhiteboard}>{t('group.whiteboard')}</Button>
        <Button variant="primary" size="sm" icon="upload" className={s.labelled} onClick={onUpload}>{t('group.upload')}</Button>
      </div>
    </div>
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

/** All of every colour group, or a number of each (each one can still be shown whole from its heading). */
function Limit({ view, setView }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const set = (n) => setView({ limited: true, limit: Math.max(1, Math.min(999, n)), expanded: [] });
  return (
    <>
      <Tooltip label={t('group.limit.label')}>
        <button ref={ref} type="button" className={s.pill} data-on={view.limited || undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Icon name="limit" size={16} />
          <span className="num">{view.limited ? t('group.limit.some', { n: view.limit }) : t('group.limit.all')}</span>
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-start" label={t('group.limit.label')} className={s.pop}>
        <div className={s.limitBody}>
          <label className={s.switchRow}>
            <span>{t('group.limit.toggle')}</span>
            <Switch size="sm" checked={view.limited} onChange={(on) => setView({ limited: on, expanded: [] })} label={t('group.limit.toggle')} />
          </label>
          <div className={s.stepper} data-off={!view.limited || undefined}>
            <button type="button" onClick={() => set(view.limit - 1)} disabled={!view.limited || view.limit <= 1} aria-label="−"><Icon name="minus" size={15} /></button>
            <input className="num" type="number" min={1} max={999} value={view.limit} disabled={!view.limited}
              onChange={(e) => { const n = parseInt(e.target.value, 10); if (n > 0) set(n); }} aria-label={t('group.limit.label')} />
            <button type="button" onClick={() => set(view.limit + 1)} disabled={!view.limited || view.limit >= 999} aria-label="+"><Icon name="plus" size={15} /></button>
            <span className={s.unit}>{t('group.limit.each')}</span>
          </div>
          <div className={s.presets}>
            {LIMITS.map((n) => <button key={n} type="button" className="num" data-on={(view.limited && view.limit === n) || undefined} onClick={() => set(n)}>{n}</button>)}
          </div>
        </div>
      </Popover>
    </>
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

/** Five sizes on a short track: smaller tiles fit more to a row. */
function SizeSlider({ value, onChange }) {
  const t = useT();
  const levels = browsing.SIZE_LEVELS;
  const lo = levels[0], hi = levels[levels.length - 1];
  return (
    <span className={s.size}>
      <button type="button" className={s.sizeEnd} onClick={() => onChange(Math.max(lo, value - 1))} disabled={value <= lo} aria-label={t('group.size.smaller')}><Icon name="size-small" size={15} /></button>
      <span className={s.track} style={{ '--p': (value - lo) / (hi - lo) }}>
        {levels.map((l) => <i key={l} data-on={l <= value || undefined} />)}
        <input type="range" min={lo} max={hi} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={t('group.size.label')} />
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

/**
 * The page looks for changes every few seconds: a ring fills up until the next look, and pressing it looks now.
 * It rests (holds still) while a drag is under way or the window is in the background.
 */
function RefreshRing({ clock, arrived, onRefresh }) {
  const t = useT();
  const fmt = useFormat();
  const R = 8.5, C = 2 * Math.PI * R;
  const elapsed = clock.interval - clock.left;
  const recent = !!arrived.at && Date.now() - arrived.at < 4000;
  const tip = clock.busy ? t('group.refresh.checking') : clock.resting ? t('group.refresh.resting') : t('group.refresh.tip', { s: clock.interval / 1000 });
  return (
    <span className={s.refreshWrap}>
      {recent && <span key={arrived.at} className={`${s.arrived} num`}>{t('group.refresh.arrived', { n: fmt.number(arrived.ids.length) })}</span>}
      <Tooltip label={tip}>
        <button type="button" className={s.refresh} data-busy={clock.busy || undefined} data-resting={(!clock.counting && !clock.busy) || undefined} onClick={onRefresh} aria-label={t('group.refresh.now')}>
          <svg viewBox="0 0 22 22" width="22" height="22" aria-hidden="true">
            <circle cx="11" cy="11" r={R} className={s.ringTrack} />
            <circle key={clock.busy ? 'busy' : clock.cycle} cx="11" cy="11" r={R} className={s.ringArc} transform="rotate(-90 11 11)"
              style={{ strokeDasharray: C, '--c': C, animationDuration: `${clock.interval}ms`, animationDelay: `-${elapsed}ms` }} />
          </svg>
          <Icon name="refresh" size={11} className={s.glyph} stroke={2} />
        </button>
      </Tooltip>
    </span>
  );
}

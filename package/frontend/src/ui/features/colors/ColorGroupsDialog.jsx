// A group's colour groups: its configurations on the left (each a different way of sorting the same files), the
// chosen one's colour groups on the right — named, coloured, put in order, added and removed. A bar across the top
// splits the group's files by colour group, the way a prism splits light, and follows every change. Saving keeps
// every configuration and puts the chosen one to use on the page.
// Made for many colour groups too: a find field narrows the list (dragging still works among what is on show), Alt ↑ ↓
// moves the colour group being named a step (Alt Shift ↑ ↓: to the very top or bottom), and Sort orders them all.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { colorOrder, groupActions, useColorConfigs } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { nextSwatch } from '../../lib/swatches.js';
import { useListDrag } from '../../lib/useListDrag.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton } from '../../components/controls.jsx';
import { Menu } from '../../components/menu.jsx';
import { Dialog, Portal, Tooltip } from '../../components/overlay.jsx';
import { Spinner, toast } from '../../components/feedback.jsx';
import { SwatchPopover } from './Swatches.jsx';
import s from './ColorGroupsDialog.module.css';

let seq = 0;
const fresh = () => `new:${++seq}`;

/** focus: a colour group to open at (from the page's colour group list) — in view, its name ready to change. */
export default function ColorGroupsDialog({ open, onClose, groupId, nonce, focus }) {
  const t = useT();
  const fmt = useFormat();
  const { data } = useColorConfigs(open ? groupId : null);
  const [configs, setConfigs] = useState(null);
  const [current, setCurrent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hot, setHot] = useState(null);
  const [query, setQuery] = useState('');
  const [sorting, setSorting] = useState(false);
  const [focusRow, setFocusRow] = useState(null);     // a row whose name takes the cursor once drawn (one just added)
  const [arrived, setArrived] = useState(null);       // the colour group the editor was opened at: it glints once
  const list = useRef(null);
  const ghost = useRef(null);
  const sortBtn = useRef(null);
  const inited = useRef(null);

  // every opening starts from what is saved — at the colour group it was opened for, if any
  useEffect(() => {
    if (!open || !data || inited.current === nonce) return;
    inited.current = nonce;
    const use = data.activeConfigId ?? data.configs[0]?.id ?? null;
    setConfigs(structuredClone(data.configs));
    setCurrent(use);
    setSaving(false);
    setQuery('');
    const at = focus && data.configs.find((c) => c.id === use)?.groups.some((x) => x.id === focus) ? focus : null;
    setFocusRow(at);
    setArrived(at);
  }, [open, data, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!arrived) return undefined;
    const id = setTimeout(() => setArrived(null), 1600);
    return () => clearTimeout(id);
  }, [arrived]);
  useEffect(() => { if (!open) { inited.current = null; setArrived(null); } }, [open]);

  const cfg = configs?.find((c) => c.id === current) ?? null;
  const edit = (fn) => setConfigs((cs) => cs.map((c) => (c.id === current ? fn(c) : c)));
  const setColor = (id, patch) => edit((c) => ({ ...c, groups: c.groups.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const addConfig = () => {
    const id = fresh();
    setConfigs((cs) => [...cs, { id, name: t('colorGroups.defaultConfig', { n: cs.length + 1 }), groups: [] }]);
    setCurrent(id);
  };
  const removeConfig = () => {
    const rest = configs.filter((c) => c.id !== current);
    setConfigs(rest);
    setCurrent(rest[0]?.id ?? null);
  };
  const addColor = () => {
    // a new one is named next: whatever the list was narrowed to, it shows, with the cursor in its name
    const id = fresh();
    setQuery('');
    edit((c) => ({ ...c, groups: [...c.groups, { id, name: t('colorGroups.newName', { n: c.groups.length + 1 }), color: nextSwatch(c.groups.map((x) => x.color)) }] }));
    setFocusRow(id);
  };
  useLayoutEffect(() => {
    if (!focusRow) return;
    const row = list.current?.querySelector(`[data-row="${CSS.escape(focusRow)}"]`);
    const input = row?.querySelector('input');
    if (input) {
      // the one the editor was opened at sits in the middle of the list, among its neighbours; one just added, at the end
      if (focusRow === arrived) list.current.scrollTop = row.offsetTop - list.current.clientHeight / 2 + row.offsetHeight / 2;
      else input.scrollIntoView({ block: 'nearest' });
      input.focus();
      input.select();
    }
    setFocusRow(null);
  }, [focusRow]); // eslint-disable-line react-hooks/exhaustive-deps
  /** The colour groups in a new order (ids). */
  const reorder = (ids) => edit((c) => ({ ...c, groups: ids.map((x) => c.groups.find((g) => g.id === x)) }));
  const order = cfg?.groups.map((x) => x.id) ?? [];
  const q = query.trim();
  const shownGroups = cfg ? (q ? cfg.groups.filter((x) => colorOrder.findInName(x.name, q).length > 0) : cfg.groups) : [];
  const shownIds = shownGroups.map((x) => x.id);
  const drag = useListDrag({ listRef: list, ghostRef: ghost, onDrop: (ids, to) => reorder(colorOrder.moveTogether(order, ids, to)) });
  // Alt ↑ ↓ while naming one: a step past the next one on show; with Shift, to the very top or bottom
  const moveKey = (e, id) => {
    if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const up = e.key === 'ArrowUp';
    reorder(e.shiftKey ? colorOrder.moveTogether(order, [id], up ? 'top' : 'bottom') : colorOrder.stepTogether(order, [id], up ? -1 : 1, shownIds));
    requestAnimationFrame(() => list.current?.querySelector(`[data-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest' }));
  };

  const save = async () => {
    setSaving(true);
    await groupActions.saveColorConfigs(groupId, { configs, activeConfigId: cfg ? current : null });
    setSaving(false);
    toast(t('colorGroups.saved'), { tone: 'ok', icon: 'swatches' });
    onClose();
  };

  const counts = data?.counts ?? {};
  const total = data?.total ?? 0;
  const inUse = data?.activeConfigId;
  const applying = cfg ? current !== inUse : !!inUse;

  return (
    <Dialog open={open} onClose={onClose} size="xl" title={t('colorGroups.title')}
      footer={<>
        <span className={s.footNote}>{cfg ? (applying ? t('colorGroups.willUse', { name: cfg.name }) : t('colorGroups.inUseNote')) : t('colorGroups.noneNote')}</span>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" icon="check" loading={saving} disabled={!configs} onClick={save}>{applying ? t('colorGroups.saveUse') : t('common.save')}</Button>
      </>}>
      {!configs ? <div className={s.wait}><Spinner size={20} /></div> : (
        <div className={s.layout}>
          <nav className={s.configs} aria-label={t('colorGroups.configs')}>
            <div className={s.colHead}>{t('colorGroups.configs')}</div>
            <ul>
              {configs.map((c) => (
                <li key={c.id}>
                  <button type="button" className={s.config} data-on={c.id === current || undefined} onClick={() => setCurrent(c.id)}>
                    <span className={s.configDots}>{c.groups.slice(0, 6).map((x) => <i key={x.id} style={{ background: x.color }} />)}{!c.groups.length && <i className={s.hollow} />}</span>
                    <span className={s.configName}>{c.name}</span>
                    {c.id === inUse && <span className={s.inUse}>{t('colorGroups.inUse')}</span>}
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className={s.addConfig} onClick={addConfig}><Icon name="plus" size={15} />{t('colorGroups.newConfig')}</button>
          </nav>

          <section className={s.editor}>
            {!cfg ? (
              <div className={s.blank}>
                <Prism colors={[]} />
                <p>{t('colorGroups.noneBody')}</p>
                <Button variant="primary" icon="plus" onClick={addConfig}>{t('colorGroups.newConfig')}</Button>
              </div>
            ) : (
              <>
                <div className={s.configBar}>
                  <input className={s.configInput} value={cfg.name} maxLength={40} onChange={(e) => edit((c) => ({ ...c, name: e.target.value }))} aria-label={t('colorGroups.configName')} spellCheck={false} />
                  <IconButton icon="trash" size="sm" label={t('colorGroups.deleteConfig')} onClick={removeConfig} className={s.danger} />
                </div>
                <Spectrum groups={cfg.groups} counts={counts} total={total} hot={hot} />
                {!cfg.groups.length && <p className={s.empty}>{t('colorGroups.emptyBody')}</p>}
                {cfg.groups.length > 1 && (
                  <div className={s.findBar}>
                    <label className={s.find}>
                      <Icon name="search" size={15} className={s.findIcon} />
                      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('group.outline.find')} spellCheck={false} autoComplete="off"
                        onKeyDown={(e) => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }} />
                      {query && <button type="button" className={s.clear} onClick={() => setQuery('')} aria-label={t('common.clear')}><Icon name="close" size={13} /></button>}
                    </label>
                    <span className={`${s.findCount} num`}>
                      {q ? t('group.outline.found', { n: fmt.number(shownGroups.length), total: fmt.number(cfg.groups.length) }) : t('group.outline.total', { n: fmt.number(cfg.groups.length), count: cfg.groups.length })}
                    </span>
                    <button ref={sortBtn} type="button" className={s.sortBtn} aria-expanded={sorting} onClick={() => setSorting((o) => !o)}>
                      <Icon name="sort" size={14} />{t('group.outline.sort')}
                    </button>
                  </div>
                )}
                <ul ref={list} className={s.rows} data-dragging={drag.drag ? '' : undefined}>
                  {shownGroups.map((x, i) => (
                    <li key={x.id} data-row={x.id} className={s.row} style={{ '--c': x.color, '--i': Math.min(i, 10) }} data-moving={drag.drag?.ids.includes(x.id) || undefined}
                      data-arrived={arrived === x.id || undefined} onPointerEnter={() => setHot(x.id)} onPointerLeave={() => setHot(null)}>
                      <Tooltip label={t('colorGroups.moveHint')} delay={700}>
                        <span className={s.grip} onPointerDown={(e) => drag.begin(e, [x.id])}><Icon name="grip" size={15} /></span>
                      </Tooltip>
                      <SwatchPicker color={x.color} onPick={(color) => setColor(x.id, { color })} />
                      {/* (opened at this one: the dialog's own first focus lands here too, not on the dialog) */}
                      <input className={s.nameInput} value={x.name} maxLength={40} onChange={(e) => setColor(x.id, { name: e.target.value })} aria-label={t('colorGroups.name')} spellCheck={false}
                        onKeyDown={(e) => moveKey(e, x.id)} data-autofocus={arrived === x.id ? '' : undefined} />
                      <span className={`${s.rowCount} num`}>{t('colorGroups.files', { n: fmt.number(counts[x.id] ?? 0), count: counts[x.id] ?? 0 })}</span>
                      <Tooltip label={counts[x.id] ? t('colorGroups.removeLeaving', { n: fmt.number(counts[x.id]), count: counts[x.id] }) : t('colorGroups.remove')}>
                        <button type="button" className={s.remove} aria-label={t('colorGroups.remove')} onClick={() => edit((c) => ({ ...c, groups: c.groups.filter((g) => g.id !== x.id) }))}>
                          <Icon name="close" size={14} />
                        </button>
                      </Tooltip>
                    </li>
                  ))}
                  {q && !shownGroups.length && <li className={s.nothing}>{t('group.outline.nothing', { q })}</li>}
                  {drag.drag && <span className={s.line} style={{ transform: `translateY(${drag.drag.line - 1}px)` }} aria-hidden="true" />}
                </ul>
                <Menu open={sorting} onClose={() => setSorting(false)} anchor={sortBtn} label={t('group.outline.sort')} placement="bottom-end"
                  items={colorOrder.COLOR_SORTS.map((by) => ({
                    key: by, label: t(`group.outline.sorts.${by}`), icon: by === 'color' ? 'palette' : by.endsWith('desc') || by === 'count' ? 'sort-desc' : 'sort-asc',
                    onSelect: () => reorder(colorOrder.sortColorGroups(cfg.groups, by, counts)),
                  }))} />
                <button type="button" className={s.addColor} onClick={addColor}>
                  <span className={s.addDot} style={{ '--c': nextSwatch(cfg.groups.map((x) => x.color)) }}><Icon name="plus" size={12} stroke={2} /></span>
                  {t('colorGroups.add')}
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {drag.drag && cfg && (
        <Portal>
          <div ref={ghost} className={s.ghost} aria-hidden="true">
            {(() => { const g = cfg.groups.find((x) => x.id === drag.drag.ids[0]); return g && <span className={s.ghostChip} style={{ '--c': g.color }}><i />{g.name}</span>; })()}
          </div>
        </Portal>
      )}
    </Dialog>
  );
}

/**
 * The group's files split by colour group, side by side like the colours out of a prism; the files in none are the
 * pale rest. The colour group the pointer is on stands out.
 */
function Spectrum({ groups, counts, total, hot }) {
  const t = useT();
  const fmt = useFormat();
  const parts = groups.map((x) => ({ id: x.id, color: x.color, n: counts[x.id] ?? 0, name: x.name }));
  const used = parts.reduce((n, p) => n + p.n, 0);
  const rest = Math.max(0, total - used);
  return (
    <div className={s.spectrum}>
      <Prism colors={groups.map((x) => x.color)} />
      <div className={s.bar} data-hot={hot || undefined}>
        {parts.map((p) => (
          <Tooltip key={p.id} label={`${p.name} · ${t('colorGroups.files', { n: fmt.number(p.n), count: p.n })}`} delay={200}>
            <i style={{ flexGrow: Math.max(p.n, total * 0.012), background: p.color }} data-hot={hot === p.id || undefined} tabIndex={-1} />
          </Tooltip>
        ))}
        {rest > 0 && <i className={s.rest} style={{ flexGrow: rest }} />}
      </div>
      <span className={`${s.total} num`}>{t('colorGroups.split', { n: fmt.number(used), total: fmt.number(total) })}</span>
    </div>
  );
}

/** The project's prism, its rays taking the colour groups' colours. */
function Prism({ colors }) {
  const rays = colors.length ? colors.slice(0, 6) : ['var(--ink-4)'];
  const n = rays.length;
  return (
    <svg className={s.prism} viewBox="0 0 64 40" aria-hidden="true">
      <path d="M1 25.5 17 19.5" stroke="var(--star)" strokeWidth="1.6" strokeLinecap="round" />
      {rays.map((c, k) => {
        const a = (k - (n - 1) / 2) * (n > 1 ? 26 / (n - 1) : 0);
        const y = 20 + a;
        return <path key={k} d={`M33 ${(18.4 + (k / Math.max(1, n - 1)) * 3.2).toFixed(1)} 63 ${y.toFixed(1)}`} stroke={c} strokeWidth="2.4" strokeLinecap="round" opacity=".85" style={{ '--k': k }} className={s.ray} />;
      })}
      <path d="M27 6 39 32H15Z" fill="var(--bg-raised)" stroke="var(--ink-2)" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** The colour of one colour group: a palette of soft paints, or any colour. */
function SwatchPicker({ color, onPick }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      <button ref={ref} type="button" className={s.swatch} style={{ '--c': color }} aria-label={t('colorGroups.color')} aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      <SwatchPopover open={open} anchor={ref} color={color} onPick={onPick} onClose={() => setOpen(false)} />
    </>
  );
}

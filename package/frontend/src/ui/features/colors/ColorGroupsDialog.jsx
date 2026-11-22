// A group's colour groups: its configurations on the left (each a different way of sorting the same files), the
// chosen one's colour groups on the right — named, coloured, put in order, added and removed. A bar across the top
// splits the group's files by colour group, the way a prism splits light, and follows every change. Saving keeps
// every configuration and puts the chosen one to use on the page.
import { useEffect, useRef, useState } from 'react';
import { groupActions, useColorConfigs } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { SWATCHES, nextSwatch } from '../../lib/swatches.js';
import { moveTo, useReorder } from '../../lib/useReorder.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton } from '../../components/controls.jsx';
import { Dialog, Popover, Portal, Tooltip } from '../../components/overlay.jsx';
import { Spinner, toast } from '../../components/feedback.jsx';
import s from './ColorGroupsDialog.module.css';

let seq = 0;
const fresh = () => `new:${++seq}`;

export default function ColorGroupsDialog({ open, onClose, groupId, nonce }) {
  const t = useT();
  const fmt = useFormat();
  const { data } = useColorConfigs(open ? groupId : null);
  const [configs, setConfigs] = useState(null);
  const [current, setCurrent] = useState(null);
  const [saving, setSaving] = useState(false);
  const [hot, setHot] = useState(null);
  const list = useRef(null);
  const inited = useRef(null);

  // every opening starts from what is saved
  useEffect(() => {
    if (!open || !data || inited.current === nonce) return;
    inited.current = nonce;
    setConfigs(structuredClone(data.configs));
    setCurrent(data.activeConfigId ?? data.configs[0]?.id ?? null);
    setSaving(false);
  }, [open, data, nonce]);
  useEffect(() => { if (!open) inited.current = null; }, [open]);

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
  const addColor = () => edit((c) => ({ ...c, groups: [...c.groups, { id: fresh(), name: t('colorGroups.newName', { n: c.groups.length + 1 }), color: nextSwatch(c.groups.map((x) => x.color)) }] }));
  const drag = useReorder({
    listRef: list, scrollRef: list, mode: 'column', axis: 'y',
    onDrop: (id, index) => edit((c) => {
      const order = moveTo(c.groups.map((x) => x.id), id, index);
      return { ...c, groups: order.map((x) => c.groups.find((g) => g.id === x)) };
    }),
  });

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
                <ul ref={list} className={s.rows}>
                  {cfg.groups.map((x, i) => (
                    <li key={x.id} className={s.row} style={{ '--c': x.color, '--i': Math.min(i, 10) }} {...drag.handle(x.id)} onPointerEnter={() => setHot(x.id)} onPointerLeave={() => setHot(null)}>
                      <span className={s.grip}><Icon name="grip" size={15} /></span>
                      <SwatchPicker color={x.color} onPick={(color) => setColor(x.id, { color })} />
                      <input className={s.nameInput} value={x.name} maxLength={40} onChange={(e) => setColor(x.id, { name: e.target.value })} aria-label={t('colorGroups.name')} spellCheck={false} />
                      <span className={`${s.rowCount} num`}>{t('colorGroups.files', { n: fmt.number(counts[x.id] ?? 0), count: counts[x.id] ?? 0 })}</span>
                      <Tooltip label={counts[x.id] ? t('colorGroups.removeLeaving', { n: fmt.number(counts[x.id]), count: counts[x.id] }) : t('colorGroups.remove')}>
                        <button type="button" className={s.remove} aria-label={t('colorGroups.remove')} onClick={() => edit((c) => ({ ...c, groups: c.groups.filter((g) => g.id !== x.id) }))}>
                          <Icon name="close" size={14} />
                        </button>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
                <button type="button" className={s.addColor} onClick={addColor}>
                  <span className={s.addDot} style={{ '--c': nextSwatch(cfg.groups.map((x) => x.color)) }}><Icon name="plus" size={12} stroke={2} /></span>
                  {t('colorGroups.add')}
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {drag.marker && <Portal><span className={s.marker} style={drag.marker} /></Portal>}
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
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-start" label={t('colorGroups.color')}>
        <div className={s.palette}>
          {SWATCHES.map((c) => (
            <button key={c} type="button" className={s.paint} style={{ '--c': c }} data-on={c === color.toLowerCase() || undefined} aria-label={c} onClick={() => { onPick(c); setOpen(false); }} />
          ))}
          <label className={`${s.paint} ${s.custom}`} style={{ '--c': SWATCHES.includes(color.toLowerCase()) ? 'transparent' : color }} title={t('colorGroups.custom')}>
            <Icon name="palette" size={14} />
            <input type="color" value={color} onChange={(e) => onPick(e.target.value)} aria-label={t('colorGroups.custom')} />
          </label>
        </div>
      </Popover>
    </>
  );
}

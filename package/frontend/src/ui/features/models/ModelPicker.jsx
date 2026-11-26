// The models that build a file's index — a tagging model, an image index model — chosen the way a value is chosen
// from a list: one quiet field per kind shows the model in use (and a download under way), however many models the
// backend offers; pressing it opens the catalog — the downloaded ones (the one in use first; press one to use it),
// then those available to download — searchable once it grows long. Downloading again deletes the model first, so it
// asks once; using another says so, with a way back. Settings and the index page (its Models tab, and the model names
// on its night sky) all show these same controls.
import { useEffect, useMemo, useRef, useState } from 'react';
import { modelActions, settingsActions, useModels, useSettings } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, Switch } from '../../components/controls.jsx';
import { Dialog, Popover, Tooltip } from '../../components/overlay.jsx';
import { ProgressBar, ProgressRing, toast } from '../../components/feedback.jsx';
import { Block } from '../settings/Block.jsx';
import { KIND_ICON, KIND_RAY } from '../indexing/kinds.js';
import s from './ModelPicker.module.css';

const FIND_FROM = 7;
const norm = (x) => (x || '').normalize('NFKC').toLowerCase();
const percent = (p) => (p && !p.queued && p.total ? Math.floor((p.processed / p.total) * 100) : null);

/** A kind's models, in one row: its name and use, and — where a switch would sit — the field holding the model in use. */
export function ModelPicker({ kind }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const field = useRef(null);
  return (
    <Block icon={KIND_ICON[kind]} title={t(`models.kind.${kind}`)} desc={t(`models.desc.${kind}`)}
      control={<>
        <ModelField ref={field} kind={kind} open={open} onToggle={() => setOpen((o) => !o)} />
        <ModelCatalog kind={kind} open={open} onClose={() => setOpen(false)} anchor={field} placement="bottom-end" />
      </>} />
  );
}

/** The model in use (or a call to choose one), compact as a select — and a download under way, along its bottom edge. */
function ModelField({ kind, open, onToggle, ref }) {
  const t = useT();
  const { list } = useModels();
  const mine = list.filter((m) => m.kind === kind);
  const inUse = mine.find((m) => m.inUse);
  const busy = mine.find((m) => m.state === 'downloading');
  const pct = percent(busy?.progress);
  const name = inUse ? inUse.name : t('models.choose');
  return (
    <button ref={ref} type="button" className={s.field} style={{ '--ray': KIND_RAY[kind] }} data-none={!inUse || undefined}
      aria-haspopup="dialog" aria-expanded={open} onClick={onToggle} title={inUse?.name}>
      <span className={s.fieldDot} aria-hidden="true" />
      <span className={s.fieldName}>{name}</span>
      {busy && <span className={`${s.fieldPct} num`} title={t('models.downloadingNow', { name: busy.name, p: pct ?? 0 })}>{pct ?? 0}%</span>}
      <Icon name="chevron-down" size={14} className={s.chev} />
      {busy && <ProgressBar value={busy.progress?.processed ?? 0} max={busy.progress?.total || 1} indeterminate={pct == null} className={s.fieldBar} />}
    </button>
  );
}

/**
 * The catalog of a kind's models, in a popover anchored to `anchor`: downloaded (the one in use first) and available.
 * Also opened from the model names on the index page's night sky.
 */
export function ModelCatalog({ kind, open, onClose, anchor, placement = 'bottom-start' }) {
  const t = useT();
  const { list } = useModels();
  const [query, setQuery] = useState('');
  const [confirm, setConfirm] = useState(null);
  useEffect(() => { if (open) setQuery(''); }, [open]);
  const mine = useMemo(() => list.filter((m) => m.kind === kind), [list, kind]);
  const q = norm(query.trim());
  const shown = q ? mine.filter((m) => norm(m.name).includes(q)) : mine;
  // downloaded (the one in use first; one being downloaded is on its way here) · available to download
  const have = shown.filter((m) => m.state === 'ready').sort((a, b) => b.inUse - a.inUse);
  const can = shown.filter((m) => m.state === 'missing' || m.state === 'downloading');
  return (
    <>
      <Popover open={open} onClose={onClose} anchor={anchor} placement={placement} offset={8} label={t(`models.kinds.${kind}`)} className={s.catalog} trapFocus>
        <div className={s.catHead} style={{ '--ray': KIND_RAY[kind] }}>
          <span className={s.catMark}><Icon name={KIND_ICON[kind]} size={15} /></span>
          <span className={s.catTitle}>{t(`models.kinds.${kind}`)}</span>
          <span className={`${s.catCount} num`}>{mine.length}</span>
        </div>
        {mine.length >= FIND_FROM && (
          <label className={s.find}>
            <Icon name="search" size={14} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('models.find')} spellCheck={false} data-autofocus="" />
          </label>
        )}
        <div className={s.catList} style={{ '--ray': KIND_RAY[kind] }}>
          {have.length > 0 && <Section title={t('models.section.downloaded')} rows={have} onUsed={onClose} onRedownload={(m) => { onClose(); setConfirm(m); }} />}
          {can.length > 0 && <Section title={t('models.section.available')} rows={can} />}
          {!shown.length && <p className={s.none}>{t('models.noMatch')}</p>}
        </div>
      </Popover>
      <RedownloadDialog model={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function Section({ title, rows, onUsed, onRedownload }) {
  return (
    <section className={s.section}>
      <h5 className={s.sectionTitle}>{title}</h5>
      <ul>{rows.map((m, i) => <CatalogRow key={m.id} m={m} i={i} onUsed={onUsed} onRedownload={() => onRedownload?.(m)} />)}</ul>
    </section>
  );
}

/**
 * One model: a dot in its kind's colour says where it stands (full: in use, ring: downloaded, dashed: to download, a
 * ring filling: on its way). A downloaded one is used by pressing it; one to download has its own button.
 */
function CatalogRow({ m, i, onUsed, onRedownload }) {
  const t = useT();
  const fmt = useFormat();
  const state = m.inUse ? 'inUse' : m.state;
  const p = m.progress;
  const pct = percent(p);
  const use = async () => {
    const res = await modelActions.use(m.id);
    if (!res.ok) return;
    onUsed?.();
    toast(t(`models.switched.${m.kind}`, { name: m.name }), {
      tone: 'ok', icon: KIND_ICON[m.kind],
      action: res.previous ? { label: t('common.undo'), onClick: () => modelActions.use(res.previous) } : undefined,
    });
  };
  const download = async () => {
    const res = await modelActions.download(m.id);
    if (res.ok) toast(t('models.started', { name: m.name }), { icon: 'download' });
  };
  const main = (
    <>
      <span className={s.dot} data-state={state} aria-hidden="true">
        {state === 'downloading' && <ProgressRing value={pct != null ? pct / 100 : 0.08} size={16} stroke={2} />}
      </span>
      <span className={s.rowName} title={m.name}>{m.name}</span>
      <span className={`${s.rowSize} num`}>{fmt.bytes(m.size)}</span>
    </>
  );
  return (
    <li className={s.row} data-state={state} style={{ '--i': i }}>
      {state === 'ready' ? (
        <button type="button" className={s.rowMain} onClick={use} aria-label={`${t('models.use')} ${m.name}`}>
          {main}
          <span className={s.rowState}>
            <span className={s.pill} data-state="ready">{t('models.state.ready')}</span>
            <span className={s.useHint}>{t('models.use')}<Icon name="arrow-right" size={12} /></span>
          </span>
        </button>
      ) : (
        <div className={s.rowMain} aria-current={state === 'inUse' || undefined}>
          {main}
          <span className={s.rowState}>
            {state === 'inUse' && <span className={s.pill} data-state="inUse"><i />{t('models.state.inUse')}</span>}
            {state === 'downloading' && <span className={`${s.pct} num`}>{p?.queued ? t('models.waiting') : p?.stage === 'connecting' ? t('models.connecting') : `${pct ?? 0}%`}</span>}
            {state === 'missing' && <Button size="sm" variant="ghost" icon="download" className={s.get} onClick={download}>{t('models.download')}</Button>}
          </span>
        </div>
      )}
      <span className={s.rowEnd}>
        {(state === 'inUse' || state === 'ready') && (
          <Tooltip label={t('models.redownload')} placement="left">
            <button type="button" className={s.again} onClick={onRedownload} aria-label={`${t('models.redownload')} · ${m.name}`}><Icon name="refresh" size={14} /></button>
          </Tooltip>
        )}
        {state === 'downloading' && <IconButton icon="close" size="sm" label={t('models.cancel')} onClick={() => modelActions.cancel(m.taskId)} />}
      </span>
    </li>
  );
}

/** Downloading again deletes the files first — the kind can't be built until it is back — so it asks once. */
function RedownloadDialog({ model, onClose }) {
  const t = useT();
  const fmt = useFormat();
  const [shown, setShown] = useState(model);
  const [busy, setBusy] = useState(false);
  if (model && model !== shown) setShown(model);
  const go = async () => {
    setBusy(true);
    const res = await modelActions.redownload(shown.id);
    setBusy(false);
    onClose();
    if (res.ok) toast(t('models.started', { name: shown.name }), { icon: 'download' });
  };
  return (
    <Dialog open={!!model} onClose={onClose} size="sm" title={t('models.redownloadTitle')}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" icon="refresh" loading={busy} onClick={go} data-autofocus>{t('models.redownloadConfirm')}</Button>
      </>}>
      {shown && <p className={s.confirm}>{t(`models.redownloadBody.${shown.kind}`, { name: shown.name, size: fmt.bytes(shown.size) })}</p>}
    </Dialog>
  );
}

/** GPU acceleration: the models run on the graphics card when they can (the card found is named). */
export function GpuSetting() {
  const t = useT();
  const models = useModels();
  const { gpu } = useSettings();
  return (
    <Block icon="gpu" title={t('settings.gpu')} desc={t('settings.gpuDesc')} control={<Switch checked={gpu} label={t('settings.gpu')} onChange={(on) => settingsActions.update({ gpu: on })} />}>
      <span className={s.device} data-on={gpu} data-none={!models.gpu || undefined}>
        <i />{models.gpu?.name ?? t('settings.gpuNone')}
      </span>
    </Block>
  );
}

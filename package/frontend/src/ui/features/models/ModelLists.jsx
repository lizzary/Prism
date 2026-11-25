// The models that build a file's index — tagging models and image index models — as the backend lists them: each
// in use, downloaded, being downloaded or not there yet. Settings and the index page show these same lists.
// Downloading a model again deletes it first, so it asks once; using another model says so, with a way back.
import { useState } from 'react';
import { modelActions, settingsActions, useModels, useSettings } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, Switch } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import { ProgressBar, toast } from '../../components/feedback.jsx';
import { Block } from '../settings/Block.jsx';
import { KIND_ICON, KIND_RAY } from '../indexing/kinds.js';
import s from './ModelLists.module.css';

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

/** One kind's models. `onRedownload` is handled here (with its question) unless given. */
export function ModelList({ kind, className }) {
  const t = useT();
  const models = useModels();
  const [confirm, setConfirm] = useState(null);
  const list = models.list.filter((m) => m.kind === kind);
  const inUse = list.find((m) => m.inUse);
  return (
    <section className={`${s.list} ${className ?? ''}`} style={{ '--ray': KIND_RAY[kind] }} data-none={!inUse || undefined}>
      <header className={s.head}>
        <span className={s.mark}><Icon name={KIND_ICON[kind]} size={17} /></span>
        <div className={s.headText}>
          <h4 className={s.title}>{t(`models.kinds.${kind}`)}</h4>
          <p className={s.desc}>{t(`models.desc.${kind}`)}</p>
        </div>
      </header>
      <ul className={s.rows}>
        {list.map((m, i) => <ModelRow key={m.id} m={m} i={i} onRedownload={() => setConfirm(m)} />)}
      </ul>
      <RedownloadDialog model={confirm} onClose={() => setConfirm(null)} />
    </section>
  );
}

function ModelRow({ m, i, onRedownload }) {
  const t = useT();
  const fmt = useFormat();
  const p = m.progress;
  const state = m.inUse ? 'inUse' : m.state;
  const download = async () => {
    const res = await modelActions.download(m.id);
    if (res.ok) toast(t('models.started', { name: m.name }), { icon: 'download' });
  };
  const use = async () => {
    const res = await modelActions.use(m.id);
    if (!res.ok) return;
    toast(t(`models.switched.${m.kind}`, { name: m.name }), {
      tone: 'ok', icon: KIND_ICON[m.kind],
      action: res.previous ? { label: t('common.undo'), onClick: () => modelActions.use(res.previous) } : undefined,
    });
  };
  const status = !p ? null : p.queued ? t('models.waiting') : p.stage === 'connecting' ? t('models.connecting')
    : `${t('models.progress', { done: fmt.bytes(p.processed), total: fmt.bytes(p.total) })} · ${Math.floor((p.processed / p.total) * 100)}%`;
  return (
    <li className={s.row} data-state={state} style={{ '--i': i }}>
      <span className={s.chip}><Icon name="chip" size={18} /></span>
      <div className={s.text}>
        <div className={s.name}>
          <span className={s.nameText} title={m.name}>{m.name}</span>
          {m.state !== 'downloading' && <span className={s.pill} data-state={state} key={state}><i />{t(`models.state.${state}`)}</span>}
        </div>
        <span className={`${s.meta} num`}>{status ?? fmt.bytes(m.size)}</span>
      </div>
      {p && <ProgressBar value={p.processed} max={p.total || 1} indeterminate={p.queued || p.stage === 'connecting'} className={s.bar} />}
      <div className={s.actions}>
        {m.state === 'missing' && <Button size="sm" icon="download" onClick={download}>{t('models.download')}</Button>}
        {m.state === 'ready' && !m.inUse && <Button size="sm" icon="check" onClick={use}>{t('models.use')}</Button>}
        {m.state === 'ready' && <Button variant="ghost" size="sm" icon="refresh" className={s.again} onClick={onRedownload}>{t('models.redownload')}</Button>}
        {m.state === 'downloading' && <IconButton icon="close" size="sm" label={t('models.cancel')} onClick={() => modelActions.cancel(m.taskId)} />}
      </div>
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

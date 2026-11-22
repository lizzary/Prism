// Models: the tagging models the backend offers (downloaded, in use, or being downloaded), and GPU acceleration.
import { useState } from 'react';
import { modelActions, settingsActions, useModels, useSettings } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, Switch } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import { ProgressBar, toast } from '../../components/feedback.jsx';
import { Block } from './Block.jsx';
import s from './SettingsDialog.module.css';

export function ModelSettings() {
  const t = useT();
  const models = useModels();
  const { gpu } = useSettings();
  const [confirm, setConfirm] = useState(null);
  return (
    <>
      <section className={s.block}>
        <h4 className={s.listTitle}><Icon name="tag" size={16} />{t('models.title')}</h4>
        <ul className={s.models}>
          {models.list.map((m) => <ModelRow key={m.id} m={m} onRedownload={() => setConfirm(m)} />)}
        </ul>
      </section>
      <Block icon="gpu" title={t('settings.gpu')} desc={t('settings.gpuDesc')} control={<Switch checked={gpu} label={t('settings.gpu')} onChange={(on) => settingsActions.update({ gpu: on })} />}>
        <span className={s.device} data-on={gpu} data-none={!models.gpu || undefined}>
          <i />{models.gpu?.name ?? t('settings.gpuNone')}
        </span>
      </Block>
      <RedownloadDialog model={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function ModelRow({ m, onRedownload }) {
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
    if (res.ok) toast(t('models.switched', { name: m.name }), { tone: 'ok', icon: 'chip' });
  };
  const status = !p ? null : p.queued ? t('models.waiting') : p.stage === 'connecting' ? t('models.connecting')
    : `${t('models.progress', { done: fmt.bytes(p.processed), total: fmt.bytes(p.total) })} · ${Math.floor((p.processed / p.total) * 100)}%`;
  return (
    <li className={s.model} data-state={state}>
      <span className={s.modelMark}><Icon name="chip" size={19} /></span>
      <div className={s.modelText}>
        <div className={s.modelName}>
          {m.name}
          {m.state !== 'downloading' && <span className={s.modelPill} data-state={state} key={state}><i />{t(`models.state.${state}`)}</span>}
        </div>
        <span className={`${s.modelMeta} num`}>{status ?? fmt.bytes(m.size)}</span>
      </div>
      {p && <ProgressBar value={p.processed} max={p.total || 1} indeterminate={p.queued || p.stage === 'connecting'} className={s.modelBar} />}
      <div className={s.modelActions}>
        {m.state === 'missing' && <Button size="sm" icon="download" onClick={download}>{t('models.download')}</Button>}
        {m.state === 'ready' && !m.inUse && <Button size="sm" icon="check" onClick={use}>{t('models.use')}</Button>}
        {m.state === 'ready' && <Button variant="ghost" size="sm" icon="refresh" className={s.redownload} onClick={onRedownload}>{t('models.redownload')}</Button>}
        {m.state === 'downloading' && <IconButton icon="close" size="sm" label={t('models.cancel')} onClick={() => modelActions.cancel(m.taskId)} />}
      </div>
    </li>
  );
}

/** Downloading again deletes the files first — tags can't be made until it is back — so it asks once. */
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
      {shown && <p className={s.confirmText}>{t('models.redownloadBody', { name: shown.name, size: fmt.bytes(shown.size) })}</p>}
    </Dialog>
  );
}

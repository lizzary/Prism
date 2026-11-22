import { useEffect, useMemo, useRef, useState } from 'react';
import { backupActions, mediaUrl, useGroupList } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, Checkbox, Field, TextInput } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import { ProgressBar, Spinner } from '../../components/feedback.jsx';
import { GroupSelector } from '../../components/GroupSelector.jsx';
import { FolderPicker } from '../folders/FolderPicker.jsx';
import { snapshotTitle } from './Timeline.jsx';
import s from './BackupSheet.module.css';

const BACKUP_DIR = 'D:\\Prism\\backup';

/** A tiny framed collage of a snapshot, for dialogs and lists. */
export function Thumb({ snap, size = 'md' }) {
  return (
    <span className={`${s.thumbCard} ${s[`thumb_${size}`]}`}>
      <span className={s.collage} data-n={Math.min(4, snap.previews.length)}>
        {snap.previews.slice(0, 4).map((ref) => <img key={ref.id} src={mediaUrl(ref, 'low')} alt="" draggable={false} loading="lazy" />)}
      </span>
    </span>
  );
}

// ------------------------------------------------------------------ create
/**
 * Name the snapshot and choose whose changes it saves. Groups with unsaved changes come first and start chosen;
 * the count below follows the choice (page settings belong to the whole gallery and always go in). A removed group
 * is still offered, so its removal can be saved.
 */
export function CreateDialog({ open, onClose, pending, onCreate }) {
  const t = useT();
  const fmt = useFormat();
  const { data: groupList } = useGroupList();
  const [name, setName] = useState('');
  const [ids, setIds] = useState([]);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const changes = useMemo(() => new Map((pending?.groups ?? []).map((g) => [g.id, g.changes])), [pending]);
  const changed = [...changes.keys()];
  useEffect(() => { if (open) { setName(''); setIds(changed); setTried(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const all = [...(groupList ?? []), ...(pending?.groups ?? []).filter((g) => g.removed)];
    return [...all.filter((g) => changes.has(g.id)), ...all.filter((g) => !changes.has(g.id))];
  }, [groupList, pending, changes]);
  const total = ids.reduce((n, id) => n + (changes.get(id) ?? 0), 0) + (ids.length ? pending?.shared ?? 0 : 0);
  const problem = !ids.length ? t('backup.needGroups') : !total ? t('backup.nothingForGroups') : null;
  const submit = async () => {
    setTried(true);
    if (problem) return;
    setBusy(true);
    await onCreate(name, ids);
    setBusy(false);
    onClose();
  };
  return (
    <Dialog open={open} onClose={onClose} size="lg" title={t('backup.create')}
      footer={<>
        <span className={`${s.willSave} num`} data-problem={tried && !!problem}>
          {tried && problem ? <><Icon name="alert" size={14} />{problem}</> : <><i />{t('backup.willSave', { n: fmt.number(total) })}</>}
        </span>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" icon="snapshot" loading={busy} disabled={tried && !!problem} onClick={submit}>{t('backup.create')}</Button>
      </>}>
      <div className={s.dialogBody}>
        <Field label={t('backup.name')}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('backup.namePlaceholder')} maxLength={80} data-autofocus
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        </Field>
        <Field label={t('backup.groups')} aside={(
          <span className={s.miniActions}>
            <button type="button" disabled={!changed.length} onClick={() => { setIds(changed); setTried(false); }}>
              {t('backup.onlyChanged')} <span className="num">{changed.length}</span>
            </button>
          </span>
        )}>
          <div className={s.groupBox}>
            <GroupSelector groups={groups} value={ids} className={s.groupPicker}
              onChange={(next) => { setIds(next); setTried(false); }}
              meta={(g) => (changes.get(g.id)
                ? <span className={s.groupChanges}>{t('backup.groupChanges', { n: fmt.number(changes.get(g.id)) })}</span>
                : <span className={s.groupQuiet}>{t('backup.noChanges')}</span>)} />
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

// ------------------------------------------------------------------ load
export function LoadDialog({ snap, pending, onClose, onLoaded }) {
  const t = useT();
  const fmt = useFormat();
  const [saveFirst, setSaveFirst] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(snap);
  useEffect(() => { if (snap) { setShown(snap); setSaveFirst(false); setLoading(false); } }, [snap]);
  const load = async () => {
    setLoading(true);
    const res = await backupActions.load(shown.id, { saveFirst });
    setLoading(false);
    if (res.ok) onLoaded(shown);
  };
  return (
    <Dialog open={!!snap} onClose={loading ? () => {} : onClose} dismissible={!loading} size="md" title={t('backup.loadTitle')}
      footer={<>
        <Button variant="ghost" disabled={loading} onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" icon="history" loading={loading} onClick={load} data-autofocus>{t('backup.loadAction')}</Button>
      </>}>
      {shown && (
        <div className={s.dialogBody}>
          <div className={s.snapCard}>
            <Thumb snap={shown} size="lg" />
            <div className={s.snapCardText}>
              <div className={s.snapCardTitle}>{snapshotTitle(t, fmt, shown)}</div>
              <div className={`${s.snapCardMeta} num`}>{fmt.dateTime(shown.createdAt)}</div>
              <div className={`${s.snapCardMeta} num`}>{t('backup.contains', { groups: fmt.number(shown.totals.groups), files: fmt.number(shown.totals.files) })}</div>
            </div>
          </div>
          {loading ? (
            <div className={s.loadingBox}>
              <span><Spinner size={15} />{t('backup.loading')}</span>
              <ProgressBar indeterminate />
            </div>
          ) : (
            <>
              <div className={s.warn}>
                <Icon name="alert" size={18} />
                <div>
                  <p className={s.warnTitle}>{t('backup.loadWarn')}</p>
                  <p className={`${s.warnBody} num`}>{pending > 0 ? t('backup.loadPending', { n: fmt.number(pending) }) : t('backup.loadClean')}</p>
                </div>
              </div>
              {pending > 0 && <Checkbox checked={saveFirst} onChange={setSaveFirst} label={t('backup.saveFirst')} className={s.saveFirst} />}
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ delete
export function DeleteDialog({ snap, onClose, onConfirm }) {
  const t = useT();
  const fmt = useFormat();
  const [shown, setShown] = useState(snap);
  useEffect(() => { if (snap) setShown(snap); }, [snap]);
  return (
    <Dialog open={!!snap} onClose={onClose} size="sm" title={t('backup.deleteTitle')}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="danger" icon="trash" onClick={() => onConfirm(shown)} data-autofocus>{t('backup.delete')}</Button>
      </>}>
      {shown && (
        <div className={s.deleteBody}>
          <Thumb snap={shown} />
          <p>{t('backup.deleteBody', { name: snapshotTitle(t, fmt, shown) })}</p>
        </div>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ export
export function ExportDialog({ open, onClose, snapshots, initial, onStarted }) {
  const t = useT();
  const fmt = useFormat();
  const [ids, setIds] = useState([]);
  const [dir, setDir] = useState(BACKUP_DIR);
  const [browsing, setBrowsing] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setIds(initial ? [initial] : snapshots.map((x) => x.id)); setBusy(false); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id, on) => setIds((cur) => (on ? [...cur, id] : cur.filter((x) => x !== id)));
  const start = async () => {
    setBusy(true);
    const res = await backupActions.exportTo({ ids, dir });
    setBusy(false);
    if (res.ok) { onStarted(ids.length); onClose(); }
  };
  const all = ids.length === snapshots.length;
  return (
    <Dialog open={open} onClose={onClose} size="md" title={t('backup.export')}
      footer={<>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" icon="export" loading={busy} disabled={!ids.length || !dir.trim()} onClick={start}>{t('backup.exportStart', { n: ids.length })}</Button>
      </>}>
      <div className={s.dialogBody}>
        <Field label={t('backup.exportPick')} aside={(
          <span className={s.miniActions}>
            <button type="button" disabled={all} onClick={() => setIds(snapshots.map((x) => x.id))}>{t('common.selectAll')}</button>
            <button type="button" disabled={!ids.length} onClick={() => setIds([])}>{t('common.selectNone')}</button>
          </span>
        )}>
          <ul className={s.pickList}>
            {[...snapshots].reverse().map((snap) => (
              <li key={snap.id}>
                <Checkbox className={s.pickRow} checked={ids.includes(snap.id)} onChange={(on) => toggle(snap.id, on)}
                  label={(
                    <span className={s.pickItem}>
                      <Thumb snap={snap} size="sm" />
                      <span className={s.pickText}>
                        <span className={s.pickTitle}>{snapshotTitle(t, fmt, snap)}</span>
                        <span className={`${s.pickMeta} num`}>{fmt.dateTime(snap.createdAt)}</span>
                      </span>
                    </span>
                  )} />
              </li>
            ))}
          </ul>
        </Field>
        <Field label={t('backup.exportTo')}>
          <div className={s.dirRow}>
            <TextInput icon="folder" value={dir} onChange={(e) => setDir(e.target.value)} spellCheck={false} className={s.dirInput} />
            <Button icon="folder-open" onClick={() => setBrowsing(true)}>{t('export.chooseDir')}</Button>
          </div>
        </Field>
      </div>
      <FolderPicker open={browsing} onClose={() => setBrowsing(false)} onPick={setDir} initialPath={dir} kind="export" />
    </Dialog>
  );
}

// ------------------------------------------------------------------ import
/** Choose an archive first (the folder picker opens straight away), then see what it holds before importing. */
export function ImportFlow({ open, onClose, onStarted }) {
  const t = useT();
  const fmt = useFormat();
  const [picking, setPicking] = useState(false);
  const [info, setInfo] = useState(null);
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  const last = useRef(BACKUP_DIR);
  const picked = useRef(false);
  useEffect(() => { if (open) { setInfo(null); setBad(false); setPicking(true); picked.current = false; } }, [open]);
  const pick = async (path) => {
    picked.current = true;
    last.current = path.slice(0, path.lastIndexOf('\\')) || BACKUP_DIR;
    const res = await backupActions.inspect(path);
    if (res.ok) { setInfo(res); setBad(false); } else { setInfo(null); setBad(true); }
  };
  const fresh = info?.snapshots.filter((x) => !x.present) ?? [];
  const start = async () => {
    setBusy(true);
    const res = await backupActions.importFrom(info.path);
    setBusy(false);
    if (res.ok) { onStarted(); onClose(); }
  };
  return (
    <>
      <FolderPicker open={open && picking} onClose={() => { setPicking(false); if (!picked.current) onClose(); }} onPick={pick} initialPath={last.current} kind="archive" accept={['prsnap']} />
      <Dialog open={open && !picking && (!!info || bad)} onClose={onClose} size="md" title={t('backup.import')}
        footer={<>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="import" loading={busy} disabled={!fresh.length} onClick={start}>
            {fresh.length ? t('backup.importStart', { n: fresh.length }) : t('backup.import')}
          </Button>
        </>}>
        <div className={s.dialogBody}>
          <div className={s.archive}>
            <span className={s.archiveIcon}><Icon name="snapshot" size={20} /></span>
            <div className={s.archiveText}>
              <div className={s.archiveName}>{info?.name ?? '—'}</div>
              {info && <div className={`${s.archiveMeta} num`}>{fmt.dateSmart(info.modifiedAt)} · {fmt.bytes(info.size)} · {t('backup.importContains', { n: info.snapshots.length })}</div>}
              {bad && <div className={s.archiveBad}><Icon name="alert" size={14} />{t('backup.notArchive')}</div>}
            </div>
            <Button size="sm" variant="ghost" onClick={() => setPicking(true)}>{t('backup.importChange')}</Button>
          </div>
          {info && (
            <ul className={s.importList}>
              {info.snapshots.map((x) => (
                <li key={x.id} data-present={x.present}>
                  <Icon name={x.present ? 'check' : 'snapshot'} size={15} />
                  <span className={s.importName}>{x.name || t('backup.untitled', { date: fmt.dateSmart(x.createdAt) })}</span>
                  <span className={`${s.importDate} num`}>{fmt.dateTime(x.createdAt)}</span>
                  {x.present && <span className={s.importPresent}>{t('backup.importPresent')}</span>}
                </li>
              ))}
            </ul>
          )}
          {info && !fresh.length && <p className={s.importNone}>{t('backup.importNone')}</p>}
        </div>
      </Dialog>
    </>
  );
}

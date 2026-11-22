import { useEffect, useRef, useState } from 'react';
import { backupActions, useBackup, useBackupChanges, useTasks } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton } from '../../components/controls.jsx';
import { Sheet, Tooltip } from '../../components/overlay.jsx';
import { Spinner, toast } from '../../components/feedback.jsx';
import { Timeline, snapshotTitle } from './Timeline.jsx';
import { Changes } from './Changes.jsx';
import { CreateDialog, DeleteDialog, ExportDialog, ImportFlow, LoadDialog } from './BackupDialogs.jsx';
import s from './BackupSheet.module.css';

/** Data backup: the snapshot timeline, what changed, and taking, loading, exporting and importing snapshots. */
export default function BackupSheet({ open, onClose, nonce }) {
  const t = useT();
  const fmt = useFormat();
  const { data } = useBackup();
  const tasks = useTasks();
  const [selected, setSelected] = useState('now');
  const [dialog, setDialog] = useState(null);         // { kind: 'load' | 'delete' | 'export' | 'import', snap? }
  const [naming, setNaming] = useState(false);
  const [leaving, setLeaving] = useState(null);
  const [fresh, setFresh] = useState(() => new Set());
  const known = useRef(null);
  const watching = useRef(null);

  useEffect(() => { if (open) { setSelected('now'); setDialog(null); known.current = null; } }, [open, nonce]);

  // cards that were not on the timeline a moment ago (just created or imported) come out of "now"
  useEffect(() => {
    if (!data) return undefined;
    const ids = data.snapshots.map((x) => x.id);
    const before = known.current;
    known.current = new Set(ids);
    if (!before) return undefined;
    const added = ids.filter((id) => !before.has(id));
    if (!added.length) return undefined;
    setFresh(new Set(added));
    const id = setTimeout(() => setFresh(new Set()), 1600);
    return () => clearTimeout(id);
  }, [data]);

  // the snapshot being written; once its task ends it stays full until the timeline shows the finished snapshot
  const running = tasks.find((x) => x.type === 'snapshot' && (x.state === 'running' || x.state === 'queued'));
  const settling = !running && data?.busy ? tasks.find((x) => x.id === data.busy) : null;
  const developing = running ?? (settling ? { ...settling, processed: settling.total } : null);
  // say so when the snapshot being written is finished
  useEffect(() => {
    if (developing) { watching.current = developing.id; return; }
    const done = watching.current && tasks.find((x) => x.id === watching.current);
    if (done && done.state === 'done') { toast(t('backup.created'), { tone: 'ok', icon: 'snapshot' }); watching.current = null; }
  }, [developing, tasks, t]);

  const snaps = data?.snapshots ?? [];
  const snap = snaps.find((x) => x.id === selected) ?? null;
  useEffect(() => { if (data && selected !== 'now' && !snap && !leaving) setSelected('now'); }, [data, snap, selected, leaving]);
  const { data: changes, loading: changesLoading } = useBackupChanges(open && data ? (selected === 'now' ? 'working' : selected) : null);
  const head = snaps.find((x) => x.id === data?.head) ?? null;
  const pending = data?.pending.total ?? 0;
  const busy = !!data?.busy || !!developing;

  const create = async (name, groupIds) => {
    const res = await backupActions.create(name, groupIds);
    if (!res.ok && res.error === 'nothing') toast(t('backup.nothingForGroups'), { tone: 'warn' });
  };
  const remove = async (target) => {
    setDialog(null);
    setLeaving(target.id);
    await new Promise((r) => setTimeout(r, 460));
    const res = await backupActions.remove(target.id);
    setLeaving(null);
    if (!res.ok) return;
    setSelected('now');
    toast(t('backup.deleted'), { tone: 'ok', icon: 'trash', action: { label: t('common.undo'), onClick: () => backupActions.restore(target.id) } });
  };

  const index = snap ? snaps.indexOf(snap) : -1;
  return (
    <Sheet open={open} onClose={onClose} label={t('backup.title')}>
      <div className={s.sheet}>
        <header className={s.head}>
          <span className={s.mark}><Icon name="snapshot" size={19} /></span>
          <h2 className={s.title}>{t('backup.title')}</h2>
          <Button variant="ghost" size="sm" icon="import" onClick={() => setDialog({ kind: 'import' })}>{t('backup.import')}</Button>
          <Button variant="ghost" size="sm" icon="export" disabled={!snaps.length} onClick={() => setDialog({ kind: 'export' })}>{t('backup.export')}</Button>
          <span className={s.headSep} />
          <IconButton icon="close" label={t('common.close')} onClick={onClose} />
        </header>

        <div className={s.wall}>
          {data ? (
            <Timeline snapshots={snaps} head={data.head} pending={pending} selected={selected} onSelect={setSelected}
              developing={developing} fresh={fresh} leaving={leaving} />
          ) : <div className={s.wallWait}><Spinner size={20} /></div>}
          {data && !snaps.length && !developing && (
            <div className={s.firstTime}>
              <h3>{t('backup.emptyTitle')}</h3>
              <p>{t('backup.emptyBody')}</p>
            </div>
          )}
        </div>

        <div className={s.detail}>
          <aside className={s.about} key={selected}>
            {selected === 'now' || !snap ? (
              <>
                <span className={s.kicker}>{developing ? t('backup.creating') : t('backup.current')}</span>
                <h3 className={`${s.aboutTitle} num`}>{pending ? t('backup.changesN', { n: fmt.number(pending) }) : t('backup.allSaved')}</h3>
                {head && <p className={s.aboutMeta}>{t('backup.comparedTo', { name: snapshotTitle(t, fmt, head) })}</p>}
                {data && <p className={`${s.aboutMeta} num`}>{t('backup.contains', { groups: fmt.number(data.current.groups), files: fmt.number(data.current.files) })}</p>}
              </>
            ) : (
              <>
                <span className={`${s.kicker} num`}>
                  {fmt.dateTime(snap.createdAt)}
                  {snap.source === 'imported' && <i className={s.importTag}>{t('backup.imported')}</i>}
                </span>
                <h3 className={s.aboutTitle}>{snapshotTitle(t, fmt, snap)}</h3>
                <p className={`${s.aboutMeta} num`}>{t('backup.contains', { groups: fmt.number(snap.totals.groups), files: fmt.number(snap.totals.files) })}</p>
                <p className={s.aboutSub}>{index > 0 ? t('backup.sincePrev') : t('backup.first')}</p>
                {snap.id === data.head && <p className={s.headNote}><span className={s.headDot} />{t('backup.basedOn')}</p>}
                <div className={s.aboutActions}>
                  <Button icon="history" disabled={busy} onClick={() => setDialog({ kind: 'load', snap })}>{t('backup.load')}</Button>
                  <Button variant="ghost" icon="export" onClick={() => setDialog({ kind: 'export', snap })}>{t('backup.exportOne')}</Button>
                  {snap.id === data.head ? (
                    <Tooltip label={t('backup.cantDeleteCurrent')}>
                      <span className={s.disabledWrap} tabIndex={0}><Button variant="ghost" icon="trash" disabled>{t('backup.delete')}</Button></span>
                    </Tooltip>
                  ) : (
                    <Button variant="ghost" icon="trash" className={s.deleteBtn} onClick={() => setDialog({ kind: 'delete', snap })}>{t('backup.delete')}</Button>
                  )}
                </div>
              </>
            )}
          </aside>
          <Changes data={changes} loading={changesLoading}
            baseName={selected === 'now' ? (head ? snapshotTitle(t, fmt, head) : null) : (index > 0 ? snapshotTitle(t, fmt, snaps[index - 1]) : null)}
            onNavigate={onClose} />
        </div>

        <footer className={s.foot}>
          <span className={s.storage}>
            <Icon name="database" size={16} />
            <span className="num">{data ? t('backup.storage', { size: fmt.bytes(data.storage) }) : ' '}</span>
            {data && <span className={`${s.count} num`}>{t('backup.count', { n: snaps.length })}</span>}
          </span>
          <span className={s.dbPath} title={data?.dbPath}>{data?.dbPath}</span>
          <Button variant="primary" icon="snapshot" loading={busy} disabled={!data || busy || !pending} onClick={() => setNaming(true)}>
            {busy ? t('backup.creating') : t('backup.create')}
          </Button>
        </footer>
      </div>

      <CreateDialog open={naming} onClose={() => setNaming(false)} pending={data?.pending} onCreate={create} />
      <LoadDialog snap={dialog?.kind === 'load' ? dialog.snap : null} pending={pending} onClose={() => setDialog(null)}
        onLoaded={(x) => { setDialog(null); setSelected(x.id); toast(t('backup.loaded', { name: snapshotTitle(t, fmt, x) }), { tone: 'ok', icon: 'history' }); }} />
      <DeleteDialog snap={dialog?.kind === 'delete' ? dialog.snap : null} onClose={() => setDialog(null)} onConfirm={remove} />
      <ExportDialog open={dialog?.kind === 'export'} initial={dialog?.snap?.id} snapshots={snaps} onClose={() => setDialog(null)}
        onStarted={(n) => toast(t('backup.exportStarted', { n }), { tone: 'ok', icon: 'export' })} />
      <ImportFlow open={dialog?.kind === 'import'} onClose={() => setDialog(null)} onStarted={() => toast(t('backup.importStarted'), { tone: 'ok', icon: 'import' })} />
    </Sheet>
  );
}

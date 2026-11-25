import { useTasks, taskActions } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton } from '../../components/controls.jsx';
import { ProgressBar, toast } from '../../components/feedback.jsx';
import s from './TasksPanel.module.css';

export const TYPE_ICON = {
  import: 'import', upload: 'upload', index: 'reindex', reindex: 'reindex', export: 'export', 'model-download': 'chip', download: 'download',
  snapshot: 'snapshot', 'snapshot-export': 'export', 'snapshot-import': 'import',
};
const WAITING = new Set(['preparing', 'connecting', 'scanning', 'reading']);

export function useTaskText() {
  const t = useT();
  const fmt = useFormat();
  const amount = (task, n) => (task.unit === 'bytes' ? fmt.bytes(n) : fmt.number(n));
  return {
    scope: (task) => {
      if (task.group) return task.group.name;
      const [first, ...rest] = task.groups ?? [];
      if (first) return rest.length ? t('tasks.scopeMany', { name: first.name, n: rest.length + 1, more: rest.length }) : first.name;
      return task.label ?? '';
    },
    progress: (task) => `${amount(task, task.processed)} / ${amount(task, task.total)}`,
    /** A re-index runs its kinds one after another: which one, of how many. */
    step: (task) => (task.kinds?.length > 1 ? `${task.kinds.indexOf(task.stage) + 1}/${task.kinds.length}` : null),
    kinds: (task) => task.kinds?.map((k) => t(`tasks.kinds.${k}`)).join(' · ') ?? null,
    result: (task) => {
      const r = task.result;
      if (!r) return '';
      if (task.type === 'export') return t('tasks.result.export', { files: fmt.number(r.files), size: fmt.bytes(r.bytes) });
      if (task.type === 'model-download') return t('tasks.result.model-download', { size: fmt.bytes(r.bytes) });
      if (task.type === 'snapshot') return t('tasks.result.snapshot', { changes: fmt.number(r.changes) });
      if (task.type === 'snapshot-export') return t('tasks.result.snapshot-export', { count: fmt.number(r.count), file: r.file.slice(r.file.lastIndexOf('\\') + 1) });
      if (task.type === 'snapshot-import') return t('tasks.result.snapshot-import', { added: fmt.number(r.added) }) + (r.skipped ? t('tasks.result.importSkipped', { skipped: fmt.number(r.skipped) }) : '');
      return t(`tasks.result.${task.type}`, { files: fmt.number(r.files) });
    },
    error: (task) => t(`tasks.errors.${task.error?.code}`),
  };
}

export function TasksPanel() {
  const t = useT();
  const fmt = useFormat();
  const tasks = useTasks();
  const text = useTaskText();
  const running = tasks.filter((x) => x.state === 'running');
  const queued = tasks.filter((x) => x.state === 'queued');
  const history = tasks.filter((x) => ['done', 'failed', 'canceled'].includes(x.state)).sort((a, b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''));

  const clear = async () => { await taskActions.clearHistory(); toast(t('tasks.cleared'), { tone: 'ok' }); };

  const row = (task, i) => (
    <li key={task.id} className={s.task} data-state={task.state}>
      <span className={s.typeIcon}><Icon name={TYPE_ICON[task.type]} size={17} /></span>
      <div className={s.body}>
        <div className={s.line}>
          <span className={s.type}>{t(`tasks.types.${task.type}`)}</span>
          <span className={s.scope}>{text.scope(task)}</span>
        </div>
        {task.state === 'running' && (
          <>
            <div className={s.meta}>
              <span className={s.stage}>
                {t(`tasks.stages.${task.stage}`)}
                {text.step(task) && <span className={`${s.step} num`}>{text.step(task)}</span>}
              </span>
              {task.total > 0 && !WAITING.has(task.stage) && <span className="num">{text.progress(task)}</span>}
            </div>
            <ProgressBar value={task.processed} max={task.total || 1} indeterminate={WAITING.has(task.stage)} className={s.bar} />
          </>
        )}
        {task.state === 'queued' && <div className={s.meta}><span>{text.kinds(task) ?? t('tasks.stages.queued')}</span><span>{t('tasks.positions', { n: i + 1 })}</span></div>}
        {task.state === 'done' && <div className={s.meta}><span className={s.result}>{text.result(task)}</span><span className={s.time}>{fmt.relative(task.finishedAt)}</span></div>}
        {task.state === 'failed' && <div className={s.meta}><span className={s.error}><Icon name="alert" size={13} />{task.error ? text.error(task) : t('tasks.stages.failed')}</span><span className={s.time}>{fmt.relative(task.finishedAt)}</span></div>}
        {task.state === 'canceled' && <div className={s.meta}><span>{t('tasks.stages.canceled')}</span><span className={s.time}>{fmt.relative(task.finishedAt)}</span></div>}
      </div>
      {(task.state === 'running' || task.state === 'queued') && (
        <IconButton icon="close" size="sm" label={t('tasks.cancel')} className={s.cancel} onClick={() => taskActions.cancel(task.id)} />
      )}
    </li>
  );

  return (
    <div className={s.panel}>
      <header className={s.head}>
        <h3 className={s.title}>{t('tasks.title')}</h3>
        <Button variant="ghost" size="sm" icon="trash" disabled={!history.length} onClick={clear}>{t('tasks.clearHistory')}</Button>
      </header>
      <div className={s.scroll}>
        {!tasks.length && <div className={s.empty}><Icon name="check-circle" size={22} />{t('tasks.empty')}</div>}
        {running.length > 0 && <section><h4 className={s.section}>{t('tasks.running')}</h4><ul>{running.map(row)}</ul></section>}
        {queued.length > 0 && <section><h4 className={s.section}>{t('tasks.queued')}</h4><ul>{queued.map(row)}</ul></section>}
        {history.length > 0 && <section><h4 className={s.section}>{t('tasks.history')}</h4><ul>{history.map(row)}</ul></section>}
      </div>
    </div>
  );
}

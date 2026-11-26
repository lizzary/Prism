// The index page: every file's index — its tags, its image index and its metadata — at a glance and file by file;
// indexing what waits, or whatever is chosen; indexing by itself (as files are uploaded, by rules); and the models that
// do the work. Its night sky holds the Prism mark, whose three rays are the three kinds of index (PrismBand).
// Opened from the top bar, a group's page (`groupId`), Settings, the reminders, and the re-index choice (`tab`).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { indexActions, reminderActions, taskActions, useIndexOverview, useReminder } from '../../../bridge/index.js';
import { useLang, useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton } from '../../components/controls.jsx';
import { Sheet } from '../../components/overlay.jsx';
import { toast } from '../../components/feedback.jsx';
import { GpuSetting, ModelPicker } from '../models/ModelPicker.jsx';
import { PrismBand } from './PrismBand.jsx';
import { IndexFiles } from './IndexFiles.jsx';
import { AutoIndexing } from './AutoIndexing.jsx';
import s from './IndexSheet.module.css';

const TABS = ['files', 'auto', 'models'];

export default function IndexSheet({ open, onClose, onLeave, nonce, handoff, tab: startTab, groupId: startGroup }) {
  const t = useT();
  const fmt = useFormat();
  const overview = useIndexOverview();
  const [tab, setTab] = useState(startTab ?? 'files');
  const [groupId, setGroupId] = useState(startGroup ?? null);
  const [focus, setFocus] = useState(null);           // { kind, state }: the part of a ray pressed
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTab(startTab ?? 'files');
    setGroupId(startGroup ?? null);
    setFocus(null);
  }, [open, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  // here, a reminder has done its work
  const reminder = useReminder();
  useEffect(() => { if (open && reminder) reminderActions.dismiss(reminder.id); }, [open, reminder?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const indexWaiting = async () => {
    setStarting(true);
    const r = await indexActions.indexWaiting();
    setStarting(false);
    if (r.ok) toast(t('index.started', { n: fmt.number(r.files), count: r.files }), { tone: 'ok', icon: 'reindex' });
  };
  const focusOn = (f) => { setFocus(f); setTab('files'); };

  return (
    <Sheet open={open} onClose={onClose} label={t('index.title')} className={s.frame} handoff={handoff}>
      <div className={s.sheet}>
        <div className={`${s.night} theme-night`}>
          <header className={s.head}>
            <span className={s.mark}><Icon name="reindex" size={18} /></span>
            <h2 className={s.title}>{t('index.title')}</h2>
            <Tabs value={tab} onChange={setTab} />
            <IconButton icon="close" tone="art" label={t('common.close')} onClick={onClose} />
          </header>
          <PrismBand overview={overview} focus={tab === 'files' ? focus : null} onFocus={focusOn}
            onIndexWaiting={indexWaiting} onCancel={(id) => taskActions.cancel(id)} starting={starting} />
        </div>
        <div className={s.body}>
          {/* the files stay as they are (what is chosen, what is looked for) while another tab is open */}
          <div className={s.pane} hidden={tab !== 'files'}>
            <IndexFiles overview={overview} groupId={groupId} onGroup={(id) => { setGroupId(id); }} focus={focus} onFocus={setFocus}
              onLeave={onLeave} onModels={() => setTab('models')} />
          </div>
          {tab === 'auto' && <div className={s.pane} key="auto"><AutoIndexing overview={overview} /></div>}
          {tab === 'models' && (
            <div className={s.pane} key="models">
              <div className={s.models}>
                <div className={s.modelCols}>
                  <div><ModelPicker kind="tagging" /></div>
                  <div><ModelPicker kind="embedding" /></div>
                </div>
                <div className={s.gpu}><GpuSetting /></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** The page's three parts, on the night sky; a line of starlight under the one open. */
function Tabs({ value, onChange }) {
  const t = useT();
  const lang = useLang();
  const box = useRef(null);
  const [ind, setInd] = useState(null);
  useLayoutEffect(() => {
    const el = box.current?.querySelector('[aria-selected="true"]');
    if (el) setInd({ x: el.offsetLeft + 12, w: el.offsetWidth - 24 });
  }, [value, lang]);
  const onKey = (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = TABS[(TABS.indexOf(value) + d + TABS.length) % TABS.length];
    onChange(next);
    box.current?.querySelector(`[data-tab="${next}"]`)?.focus();
  };
  return (
    <div ref={box} className={s.tabs} role="tablist" aria-label={t('index.title')} onKeyDown={onKey}>
      {TABS.map((id) => (
        <button key={id} type="button" role="tab" data-tab={id} aria-selected={value === id} tabIndex={value === id ? 0 : -1} className={s.tab} onClick={() => onChange(id)}>
          {t(`index.tabs.${id}`)}
        </button>
      ))}
      {ind && <span className={s.tabLine} style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />}
    </div>
  );
}

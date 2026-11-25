// A reminder of automatic indexing: a small card hanging under the top bar's Index — right where the index page is —
// saying what waits, with the way to index it now or to look first; or not to be reminded again. It never interrupts:
// it waits while a file is being looked at (the lightbox, a slideshow) or a dialog is open, and it is done with as soon
// as the index page opens.
import { useEffect, useRef, useState } from 'react';
import { indexActions, reminderActions, settingsActions, useReminder, useSettings } from '../../../bridge/index.js';
import { useOverlayStack, useOverlays } from '../../../app/shell.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton } from '../../components/controls.jsx';
import { Portal, useAnchored, usePresence } from '../../components/overlay.jsx';
import { toast } from '../../components/feedback.jsx';
import s from './Reminder.module.css';

/** Something is in front of the page: a modal layer, or a file in the lightbox (the reminder waits). */
function useHeldBack() {
  const read = () => { const r = document.documentElement; return r.hasAttribute('data-modal') || r.hasAttribute('data-lightbox'); };
  const [held, setHeld] = useState(read);
  useEffect(() => {
    const mo = new MutationObserver(() => setHeld(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-modal', 'data-lightbox'] });
    return () => mo.disconnect();
  }, []);
  return held;
}

/** A length of time as words: hours, or days from two days on. */
export function spanText(t, hours) {
  return hours < 48 ? t('index.span.hours', { n: Math.max(1, Math.round(hours)), count: Math.round(hours) }) : t('index.span.days', { n: Math.round(hours / 24), count: Math.round(hours / 24) });
}

export function IndexReminder({ anchor }) {
  const t = useT();
  const fmt = useFormat();
  const reminder = useReminder();
  const stack = useOverlayStack();
  const { open } = useOverlays();
  const { indexing } = useSettings();
  const settings = useRef(indexing);
  settings.current = indexing;
  const held = useHeldBack();
  const indexOpen = !!stack.index?.open;
  // what a leaving card keeps showing
  const [shown, setShown] = useState(reminder);
  if (reminder && reminder !== shown) setShown(reminder);
  const { mounted, state } = usePresence(!!reminder && !held && !indexOpen, 300);
  const ref = useRef(null);
  useAnchored(anchor, ref, { placement: 'bottom-end', offset: 12, active: mounted });
  if (!mounted || !shown) return null;

  const r = shown;
  const n = r.waiting;
  const done = (opts) => reminderActions.dismiss(r.id, opts);
  const indexNow = async () => {
    done();
    const res = await indexActions.indexWaiting();
    if (res.ok) toast(t('index.started', { n: fmt.number(res.files), count: res.files }), { tone: 'ok', icon: 'reindex' });
  };
  const view = () => { done(); open('index'); };
  const mute = async () => {
    const res = await done({ mute: true });
    toast(t('index.reminder.muted'), {
      icon: 'bell-off', duration: 6000,
      action: {
        label: t('common.undo'),
        onClick: () => {
          const cur = settings.current;
          settingsActions.update({ indexing: { ...cur, auto: { ...cur.auto, backlog: { ...cur.auto.backlog, remind: res.was.backlog }, age: { ...cur.auto.age, remind: res.was.age } } } });
        },
      },
    });
  };
  const title = r.started ? t('index.reminder.started', { n: fmt.number(r.started), count: r.started })
    : r.rule === 'age' ? t('index.reminder.age', { span: r.hours != null ? spanText(t, r.hours) : '…' })
      : t('index.reminder.backlog', { n: fmt.number(n), count: n });
  const sub = r.rule === 'age' && !r.started ? t('index.reminder.ageSub', { n: fmt.number(n), count: n }) : null;
  return (
    <Portal>
      <div ref={ref} className={s.card} data-state={state} role="status" aria-live="polite" aria-label={t('index.reminder.label')}>
        <span className={s.notch} aria-hidden="true" />
        <span className={s.icon} data-busy={!!r.started || undefined}><Icon name={r.started ? 'reindex' : 'bell'} size={18} /></span>
        <div className={s.body}>
          <p className={`${s.title} num`}>{title}</p>
          {sub && <p className={`${s.sub} num`}>{sub}</p>}
          <div className={s.actions}>
            {!r.started && <Button variant="primary" size="sm" icon="reindex" onClick={indexNow}>{t('index.reminder.indexNow')}</Button>}
            <Button variant={r.started ? 'secondary' : 'ghost'} size="sm" onClick={view} data-overlay="index">{t('index.reminder.view')}</Button>
            <button type="button" className={s.mute} onClick={mute}>{t('index.reminder.mute')}</button>
          </div>
        </div>
        <IconButton icon="close" size="sm" label={t('index.reminder.later')} className={s.close} onClick={() => done()} />
      </div>
    </Portal>
  );
}

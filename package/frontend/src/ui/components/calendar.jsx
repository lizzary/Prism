import { useMemo, useRef, useState } from 'react';
import { useLang, useT } from '../../i18n/index.jsx';
import { dayKey, useFormat } from '../lib/format.js';
import { Icon } from '../icons/Icon.jsx';
import { Popover } from './overlay.jsx';
import s from './calendar.module.css';

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const parseDay = (k) => (k ? new Date(`${k}T00:00`) : null);

/**
 * A month view.
 *   mode 'single': value = 'YYYY-MM-DD'
 *   mode 'range' : value = { from, to } — the first click picks a day, the second extends it to a range
 *   marks        : { 'YYYY-MM-DD': count } drawn as small dots (activity)
 *   minDay, maxDay: the first and last days that can be picked
 *   onRangeDone  : (range mode) hears the range once its second day is picked
 */
export function Calendar({ mode = 'single', value, onChange, onRangeDone, marks, month: monthProp, onMonthChange, minDay, maxDay }) {
  const lang = useLang();
  const t = useT();
  const fmt = useFormat();
  const initial = parseDay(mode === 'range' ? value?.to ?? value?.from : value) ?? new Date();
  const [monthState, setMonthState] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const month = monthProp ?? monthState;
  const setMonth = (m) => { setMonthState(m); onMonthChange?.(m); };
  const [anchor, setAnchor] = useState(null);       // first click of a range in progress
  const [hover, setHover] = useState(null);
  const today = dayKey(new Date());

  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(lang === 'zh-CN' ? 'zh-CN' : 'en', { weekday: 'narrow' });
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)));   // Monday first
  }, [lang]);

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const lead = (first.getDay() + 6) % 7;
    return Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - lead + i));
  }, [month]);

  let from = null, to = null;
  if (mode === 'range') {
    if (anchor) { const h = hover ?? anchor; [from, to] = anchor <= h ? [anchor, h] : [h, anchor]; }
    else if (value?.from) { from = value.from; to = value.to ?? value.from; }
  } else if (value) { from = to = value; }

  const outside = (k) => (!!maxDay && k > maxDay) || (!!minDay && k < minDay);
  const pick = (k) => {
    if (outside(k)) return;
    if (mode === 'single') { onChange(k); return; }
    if (!anchor) { setAnchor(k); onChange({ from: k, to: k }); return; }
    const [a, b] = anchor <= k ? [anchor, k] : [k, anchor];
    setAnchor(null); setHover(null);
    onChange({ from: a, to: b });
    onRangeDone?.({ from: a, to: b });
  };

  const maxMark = marks ? Math.max(1, ...Object.values(marks)) : 1;
  return (
    <div className={s.cal} onPointerLeave={() => setHover(null)}>
      <div className={s.head}>
        <button type="button" className={s.nav} onClick={() => setMonth(addMonths(month, -1))} aria-label={t('common.prev')}><Icon name="chevron-left" size={16} /></button>
        <span className={s.month}>{fmt.month(month)}</span>
        <button type="button" className={s.nav} onClick={() => setMonth(addMonths(month, 1))} aria-label={t('common.next')}><Icon name="chevron-right" size={16} /></button>
      </div>
      <div className={s.grid} role="grid">
        {weekdays.map((w, i) => <span key={i} className={s.wd}>{w}</span>)}
        {days.map((d) => {
          const k = dayKey(d);
          const out = d.getMonth() !== month.getMonth();
          const inRange = from && k >= from && k <= to;
          const n = marks?.[k] ?? 0;
          return (
            <button key={k} type="button" role="gridcell" aria-selected={!!inRange}
              className={s.day} data-out={out} data-today={k === today} data-range={inRange ? (from === to ? 'single' : k === from ? 'start' : k === to ? 'end' : 'mid') : undefined}
              disabled={outside(k)}
              onClick={() => pick(k)} onPointerEnter={() => setHover(k)}>
              <span className={`${s.num} num`}>{d.getDate()}</span>
              {n > 0 && <span className={s.mark} style={{ opacity: 0.35 + 0.65 * (n / maxMark) }} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A date as a button that opens a calendar. value: ISO date or date-time; onChange receives 'YYYY-MM-DD'. */
export function DateField({ value, onChange, label, className }) {
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const day = value?.slice(0, 10);
  return (
    <>
      <button ref={ref} type="button" className={`${s.field} ${className ?? ''}`} onClick={() => setOpen((o) => !o)} aria-label={label}>
        <Icon name="calendar" size={15} />
        <span>{fmt.date(day)}</span>
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-start" label={label}>
        <div style={{ padding: 12 }}>
          <Calendar mode="single" value={day} onChange={(k) => { onChange(k); setOpen(false); }} />
        </div>
      </Popover>
    </>
  );
}

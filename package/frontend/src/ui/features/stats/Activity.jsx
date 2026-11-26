// The activity part, under its year of stars: how many files the gallery has held day by day (with what came in and
// what went out beneath, and the snapshots along the way); every day's time in Prism, files added and files opened —
// small charts sharing one time line, so pointing at a day reads it in all of them; and one day up close: its figures,
// and the very files that were added that day.
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl, statsRules, useActivity, useActivityDay } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Segmented } from '../../components/controls.jsx';
import { Popover } from '../../components/overlay.jsx';
import { Calendar } from '../../components/calendar.jsx';
import { Spinner } from '../../components/feedback.jsx';
import { GroupCover } from '../../components/GroupSelector.jsx';
import { METRIC_COLOR, useStatsFormat } from './look.js';
import { niceScale, monthTicks, weekTicks } from './chartScale.js';
import s from './Activity.module.css';

const { movingAverage, metricOf, addDays, daysBetween, usedOn } = statsRules.rules;
const PAD_L = 52, PAD_R = 10;
const GB = 1024 ** 3;

export const Activity = memo(function Activity({ range, onRange, day, onDay, hover, onHover, leave }) {
  const t = useT();
  const f = useStatsFormat();
  const { data } = useActivity();
  const [unit, setUnit] = useState('files');
  const box = useRef(null);
  const [w, setW] = useState(760);
  useLayoutEffect(() => {
    if (!box.current) return undefined;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps
  const ranges = useMemo(() => Object.keys(statsRules.RANGES).map((k) => ({ value: k, label: t(`stats.ranges.${k}`) })), [t]);
  const units = useMemo(() => [{ value: 'files', label: t('stats.totals.files') }, { value: 'size', label: t('stats.totals.size') }], [t]);

  // a preset (the last N days, or all of them) or days chosen by hand ({ from, to }, kept within the record)
  const custom = typeof range === 'object' && range !== null;
  const days = useMemo(() => {
    if (!data) return [];
    if (custom) {
      const picked = data.days.filter((d) => d.day >= range.from && d.day <= range.to);
      return picked.length ? picked : data.days.slice(-1);
    }
    const n = statsRules.RANGES[range];
    return Number.isFinite(n) ? data.days.slice(-n) : data.days;
  }, [data, range, custom]);
  const chosen = day ?? data?.today ?? null;
  if (!data) return <div className={s.wait}><Spinner size={20} /></div>;

  const plotW = Math.max(120, w - PAD_L - PAD_R);
  const step = plotW / Math.max(1, days.length);
  const xOf = (i) => PAD_L + (i + 0.5) * step;
  const indexAt = (clientX) => {
    const r = box.current.getBoundingClientRect();
    return Math.max(0, Math.min(days.length - 1, Math.floor((clientX - r.left - PAD_L) / step)));
  };
  const at = (d) => (d ? days.findIndex((x) => x.day === d) : -1);
  const hi = at(hover), sel = at(chosen);
  const ticks = days.length <= 45 ? weekTicks(days) : monthTicks(days);
  const onKey = (e) => {
    const d = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = addDays(chosen, d);
    if (next <= data.today && next >= data.first) onDay(next === data.today ? null : next);
  };

  return (
    <div className={s.activity}>
      <header className={s.bar}>
        <Segmented size="sm" value={custom ? null : range} onChange={onRange} options={ranges} label={t('stats.tabs.activity')} />
        <RangeButton custom={custom} from={days[0]?.day} to={days.at(-1)?.day} first={data.first} today={data.today} records={data.days} onRange={onRange} />
      </header>
      <div className={s.grid}>
        <div className={s.charts}>
          <div ref={box} className={s.plots} tabIndex={0} aria-label={t('stats.daily')}
            onPointerMove={(e) => { const i = indexAt(e.clientX); if (days[i].day !== hover) onHover(days[i].day); }}
            onPointerLeave={() => onHover(null)} onKeyDown={onKey}
            onClick={(e) => { const d = days[indexAt(e.clientX)].day; onDay(d === data.today ? null : d); }}>
            <Totals days={days} unit={unit} onUnit={setUnit} units={units} w={w} xOf={xOf} step={step} hi={hi} sel={sel}
              snapshots={data.snapshots} range={custom ? 'custom' : range} first={data.first} />
            <div className={s.dailyHead}><h3>{t('stats.daily')}</h3><span className={s.avgKey}><i />{t('stats.average')}</span></div>
            {statsRules.METRICS.map((m) => (
              <Daily key={m} metric={m} days={days} w={w} xOf={xOf} step={step} hi={hi} sel={sel} />
            ))}
            <Axis ticks={ticks} xOf={xOf} w={w} />
            {hi >= 0 && <span className={s.when} style={{ left: Math.min(w - 70, Math.max(PAD_L, xOf(hi))) }}>{f.dayMonth(days[hi].day)}</span>}
          </div>
        </div>
        <DayCard day={chosen} today={data.today} onDay={onDay} leave={leave} />
      </div>
    </div>
  );
});

/**
 * The days shown, as a quiet button beside the presets: it opens a calendar to choose any first and last day of the
 * record (the days spent in Prism are dotted). Lit while a range chosen by hand is shown.
 */
function RangeButton({ custom, from, to, first, today, records, onRange }) {
  const t = useT();
  const f = useStatsFormat();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  // a dot on every day with Prism, as bright as it was long
  const marks = useMemo(() => {
    const out = {};
    for (const r of records) if (usedOn(r)) out[r.day] = Math.round(r.seconds / 60);
    return out;
  }, [records]);
  const n = from && to ? daysBetween(from, to) + 1 : 0;
  return (
    <>
      <button ref={ref} type="button" className={s.rangeBtn} data-on={custom || undefined} aria-expanded={open} aria-label={t('stats.ranges.custom')}
        onClick={() => setOpen((o) => !o)}>
        <Icon name="calendar" size={14} />
        <span className="num">{f.dateSmart(from)} – {f.dateSmart(to)}</span>
        {custom && <span className={`${s.rangeDays} num`}>{t('stats.rangeDays', { n: f.number(n), count: n })}</span>}
        <Icon name="chevron-down" size={13} className={s.rangeChev} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-start" trapFocus={false} label={t('stats.ranges.custom')}>
        <div className={s.rangePop}>
          <Calendar mode="range" value={{ from, to }} marks={marks} minDay={first} maxDay={today} onChange={() => {}}
            onRangeDone={(r) => { onRange({ from: r.from, to: r.to }); setOpen(false); }} />
          <p className={s.rangeHint}><Icon name="calendar" size={13} />{t('stats.rangeHint')}</p>
        </div>
      </Popover>
    </>
  );
}

/** The vertical hairline of the day pointed at, and the band of the day chosen — the same in every chart. */
function Marks({ xOf, step, hi, sel, h }) {
  return (
    <>
      {sel >= 0 && <rect x={xOf(sel) - Math.min(9, Math.max(1.5, step / 2))} y={0} width={Math.min(18, Math.max(3, step))} height={h} className={s.selBand} />}
      {hi >= 0 && <line x1={xOf(hi)} x2={xOf(hi)} y1={0} y2={h} className={s.cross} />}
    </>
  );
}

/** How many files the gallery held (or how much they took), day by day; beneath, what came in and what went out. */
const Totals = memo(function Totals({ days, unit, onUnit, units, w, xOf, step, hi, sel, snapshots, range, first }) {
  const t = useT();
  const f = useStatsFormat();
  const H = 148, CH = 50, TOP = 10;
  const val = (r) => (unit === 'files' ? r.files : r.bytes / GB);
  const { lo, hi: top, ticks } = useMemo(() => {
    const vals = days.map(val);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const pad = (mx - mn) * 0.18 || Math.max(1, mx * 0.05);
    return niceScale(Math.max(0, mn - pad), Math.max(mx + pad * 0.4, unit === 'files' ? 4 : 0), 3, { whole: unit === 'files' });
  }, [days, unit]); // eslint-disable-line react-hooks/exhaustive-deps
  const y = (v) => TOP + (1 - (v - lo) / Math.max(1e-9, top - lo)) * (H - TOP - 6);
  const line = useMemo(() => days.map((r, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${y(val(r)).toFixed(1)}`).join(''), [days, unit, w, lo, top]); // eslint-disable-line react-hooks/exhaustive-deps
  const area = `${line}L${xOf(days.length - 1).toFixed(1)} ${H}L${xOf(0).toFixed(1)} ${H}Z`;
  // what came in (up) and what went out (down), each day
  const flow = useMemo(() => {
    const mx = Math.max(1, ...days.map((r) => Math.max(r.added, r.removed)));
    const mid = 30, up = 28, down = 18, bw = Math.max(1, step - (step > 4 ? 1.5 : 0));
    let a = '', r = '';
    days.forEach((d, i) => {
      const x = (xOf(i) - bw / 2).toFixed(1);
      if (d.added) { const h = Math.max(1, (d.added / mx) * up); a += `M${x} ${(mid - h).toFixed(1)}h${bw.toFixed(1)}v${h.toFixed(1)}h${(-bw).toFixed(1)}Z`; }
      if (d.removed) { const h = Math.max(1, (d.removed / mx) * down); r += `M${x} ${mid + 1}h${bw.toFixed(1)}v${h.toFixed(1)}h${(-bw).toFixed(1)}Z`; }
    });
    return { a, r, mid };
  }, [days, w, step]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = days.at(-1), firstDay = days[0];
  const delta = unit === 'files' ? last.files - firstDay.files : last.bytes - firstDay.bytes;
  const deltaText = unit === 'files' ? f.number(Math.abs(delta)) : f.bytes(Math.abs(delta));
  const sign = delta > 0 ? '+' : '−';
  const between = { from: f.dateSmart(firstDay.day), to: f.dateSmart(last.day) };
  const rangeText = range === 'custom' ? '' : t(`stats.ranges.${range}`);
  const change = range === 'custom' ? (delta ? t('stats.totals.between', { sign, n: deltaText, ...between }) : t('stats.totals.sameBetween', between))
    : !delta ? t('stats.totals.same', { range: rangeText })
      : range === 'all' ? t('stats.totals.since', { sign, n: deltaText, date: f.dateSmart(first) })
        : t('stats.totals.change', { sign, n: deltaText, range: rangeText });
  const shown = hi >= 0 ? days[hi] : last;
  const marks = snapshots.map((x) => ({ ...x, i: days.findIndex((d) => d.day === x.at.slice(0, 10)) })).filter((x) => x.i >= 0);
  return (
    <section className={s.totals}>
      <div className={s.chartHead}>
        <h3>{t('stats.totals.title')}</h3>
        <span className={s.headValue}>
          <strong className="num">{unit === 'files' ? f.number(shown.files) : f.bytes(shown.bytes)}</strong>
          {hi >= 0 ? <span>{f.dayMonth(shown.day)}</span> : <span data-dir={delta > 0 ? 'up' : delta < 0 ? 'down' : undefined}>{change}</span>}
        </span>
        <Segmented size="sm" value={unit} onChange={onUnit} options={units} label={t('stats.totals.title')} className={s.unit} />
      </div>
      <svg width={w} height={H} className={s.svg} aria-hidden="true">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={w - PAD_R} y1={y(v)} y2={y(v)} className={s.rule} />
            <text x={PAD_L - 8} y={y(v) + 4} className={s.tick} textAnchor="end">{unit === 'files' ? f.compact(v) : f.bytes(v * GB)}</text>
          </g>
        ))}
        <path d={area} className={s.wash} />
        <path d={line} className={s.line} />
        <Marks xOf={xOf} step={step} hi={hi} sel={sel} h={H} />
        {hi >= 0 && <circle cx={xOf(hi)} cy={y(val(days[hi]))} r={4} className={s.dot} />}
        {hi < 0 && <circle cx={xOf(days.length - 1)} cy={y(val(last))} r={4} className={s.dot} />}
      </svg>
      <div className={s.flowHead}>
        <span><i style={{ background: METRIC_COLOR.added }} />{t('stats.metric.added')}</span>
        <span><i style={{ background: METRIC_COLOR.removed }} />{t('stats.metric.removed')}</span>
        {hi >= 0 && <span className={`${s.flowNow} num`}>+{f.number(days[hi].added)}{days[hi].removed > 0 && ` · −${f.number(days[hi].removed)}`}</span>}
      </div>
      <svg width={w} height={CH} className={s.svg} aria-hidden="true">
        <line x1={PAD_L} x2={w - PAD_R} y1={flow.mid + 0.5} y2={flow.mid + 0.5} className={s.axisLine} />
        <path d={flow.a} fill={METRIC_COLOR.added} />
        <path d={flow.r} fill={METRIC_COLOR.removed} />
        <Marks xOf={xOf} step={step} hi={hi} sel={sel} h={CH} />
        {marks.map((m) => (
          <g key={m.id} className={s.snap} transform={`translate(${xOf(m.i)} ${flow.mid + 0.5})`}>
            <title>{`${t('stats.snapshot')} · ${m.name ?? t('backup.untitled', { date: f.date(m.at) })} · ${f.dateTime(m.at)}`}</title>
            <path d="M0 -4.5L4.5 0L0 4.5L-4.5 0Z" />
          </g>
        ))}
      </svg>
    </section>
  );
});

/** One of every day's figures: a faint bar a day, and its seven-day average as a line. */
const Daily = memo(function Daily({ metric, days, w, xOf, step, hi, sel }) {
  const t = useT();
  const f = useStatsFormat();
  const H = 64, TOP = 6;
  const vals = useMemo(() => days.map((r) => metricOf(r, metric)), [days, metric]);
  const avg = useMemo(() => movingAverage(vals, 7), [vals]);
  const { hi: top, ticks } = useMemo(() => niceScale(0, Math.max(4, ...vals) * 1.02, 2, { whole: true }), [vals]);
  const y = (v) => TOP + (1 - v / top) * (H - TOP);
  const bars = useMemo(() => {
    const bw = Math.max(1, step - (step > 4 ? 1.5 : 0));
    let d = '';
    vals.forEach((v, i) => { if (v) { const yy = y(v); d += `M${(xOf(i) - bw / 2).toFixed(1)} ${H}V${yy.toFixed(1)}h${bw.toFixed(1)}V${H}Z`; } });
    return d;
  }, [vals, w, step, top]); // eslint-disable-line react-hooks/exhaustive-deps
  const line = useMemo(() => avg.map((v, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)} ${y(v).toFixed(1)}`).join(''), [avg, w, top]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = vals.reduce((a, b) => a + b, 0);
  const show = (v) => (metric === 'time' ? f.duration(v) : f.number(Math.round(v)));
  return (
    <section className={s.daily} style={{ '--c': METRIC_COLOR[metric] }}>
      <div className={s.dailyLabel}>
        <span className={s.key} />
        <span className={s.dailyName}>{t(`stats.perDay.${metric}`)}</span>
        <span className={`${s.dailyValue} num`}>
          {hi >= 0 ? <><strong>{show(vals[hi])}</strong><em>{t('stats.average')} {show(avg[hi])}</em></>
            : <><strong>{show(total / Math.max(1, vals.length))}</strong><em>{t('stats.average')}</em></>}
        </span>
      </div>
      <svg width={w} height={H} className={s.svg} aria-hidden="true">
        {ticks.slice(1).map((v) => (
          <g key={v}>
            <line x1={PAD_L} x2={w - PAD_R} y1={y(v)} y2={y(v)} className={s.rule} />
            <text x={PAD_L - 8} y={y(v) + 4} className={s.tick} textAnchor="end">{metric === 'time' ? f.compact(v) : f.compact(v)}</text>
          </g>
        ))}
        <line x1={PAD_L} x2={w - PAD_R} y1={H - 0.5} y2={H - 0.5} className={s.axisLine} />
        <path d={bars} className={s.bars} />
        <path d={line} className={s.avg} />
        <Marks xOf={xOf} step={step} hi={hi} sel={sel} h={H} />
        {hi >= 0 && <circle cx={xOf(hi)} cy={y(avg[hi])} r={4} className={s.dot} />}
      </svg>
    </section>
  );
});

/** The shared time line under the charts. */
function Axis({ ticks, xOf, w }) {
  const f = useStatsFormat();
  return (
    <svg width={w} height={26} className={s.svg} aria-hidden="true">
      {ticks.map((k) => (
        <g key={k.day}>
          <line x1={xOf(k.i)} x2={xOf(k.i)} y1={0} y2={5} className={s.axisLine} />
          <text x={xOf(k.i)} y={18} className={s.tick} textAnchor="middle">{k.kind === 'week' ? f.dayMonth(k.day) : f.month(k.day)}{k.year ? ` ${f.year(k.day)}` : ''}</text>
        </g>
      ))}
    </svg>
  );
}

/** One day up close: its figures, the gallery at its end, the files added that day (each opens), the snapshots taken. */
const DayCard = memo(function DayCard({ day, today, onDay, leave }) {
  const t = useT();
  const f = useStatsFormat();
  const { data } = useActivityDay(day);
  const d = data?.day === day ? data : null;
  const rec = d?.record;
  return (
    <aside className={s.day} key={day}>
      <div className={s.dayHead}>
        <span className={s.dayWeek}>{f.weekday(day)}{day === today && <em>{t('stats.today')}</em>}</span>
        <h3 className={s.dayDate}>{f.date(day)}</h3>
        {day !== today && <button type="button" className={s.toToday} onClick={() => onDay(null)}>{t('stats.today')}<Icon name="arrow-right" size={13} /></button>}
      </div>
      {!d ? <div className={s.wait}><Spinner size={18} /></div> : (
        <>
          <dl className={s.dayFigs}>
            {['time', 'opened', 'added', 'removed'].map((m) => (
              <div key={m} className={s.dayFig} style={{ '--c': METRIC_COLOR[m] }}>
                <dt><i />{t(`stats.metric.${m}`)}</dt>
                <dd className="num">{m === 'time' ? f.duration(metricOf(rec, 'time')) : f.number(rec[m])}</dd>
              </div>
            ))}
          </dl>
          <p className={s.dayTotal}>
            <Icon name="gallery" size={14} />{t('stats.totals.title')} · <span className="num">{f.number(rec.files)}</span> · <span className="num">{f.bytes(rec.bytes)}</span>
          </p>
          <div className={s.added}>
            <h4>{t('stats.day.added')}</h4>
            {!d.groups.length ? <p className={s.nothing}>{t('stats.day.none')}</p> : d.groups.map((g) => (
              <div key={g.id} className={s.addedGroup}>
                <button type="button" className={s.addedHead} onClick={() => leave.group(g.id)}>
                  <GroupCover group={g} className={s.addedCover} />
                  <span className={s.addedName}>{g.name}</span>
                  <span className={`${s.addedCount} num`}>{t('stats.files', { n: f.number(g.count), count: g.count })}</span>
                  <Icon name="arrow-up-right" size={13} className={s.addedGo} />
                </button>
                <div className={s.thumbs}>
                  {g.files.map((x) => (
                    <button key={x.id} type="button" className={s.thumb} onClick={() => leave.file({ ...x, groupId: g.id })} aria-label={`${x.name}.${x.ext}`}>
                      <img src={mediaUrl(x, 'low')} alt="" loading="lazy" decoding="async" draggable={false} />
                      {x.kind === 'video' && <Icon name="play" size={9} className={s.thumbPlay} />}
                    </button>
                  ))}
                  {g.count > g.files.length && <span className={`${s.thumbMore} num`}>+{f.number(g.count - g.files.length)}</span>}
                </div>
              </div>
            ))}
            {rec.added > d.kept && d.kept > 0 && <p className={s.nothing}>{t('stats.day.gone', { n: f.number(rec.added - d.kept), count: rec.added - d.kept })}</p>}
          </div>
          {d.snapshots.length > 0 && (
            <div className={s.added}>
              <h4>{t('stats.day.snapshots')}</h4>
              {d.snapshots.map((x) => (
                <p key={x.id} className={s.snapLine}><Icon name="snapshot" size={14} />{x.name ?? t('backup.untitled', { date: f.date(x.at) })}<span className="num">{f.time(x.at)}</span></p>
              ))}
            </div>
          )}
        </>
      )}
    </aside>
  );
});

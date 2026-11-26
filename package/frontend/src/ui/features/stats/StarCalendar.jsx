// The activity part's night sky: the past year, a star for every day — a week to a column, Monday at the top — as
// large and bright as that day was busy (time in Prism, files added or files opened). A quiet day is a faint speck, the
// brightest nights sparkle. Pointing at a star tells that day; choosing one brings it up close below. Changing what is
// measured sweeps across the year from its first week to this one.
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { statsRules, useActivity } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Segmented } from '../../components/controls.jsx';
import { useStatsFormat } from './look.js';
import s from './StarCalendar.module.css';

const { addDays, weekdayOf, metricOf, usedOn } = statsRules.rules;
const H = 176;
const WEEKS = 53;
const LEFT = 58, TOP = 32, SIDE = 250;

/** The year in columns: each column a week, Monday first; the last one holds today. → { days: [{ day, col, row }], start } */
function yearGrid(today) {
  const start = addDays(today, -weekdayOf(today) - (WEEKS - 1) * 7);
  const days = [];
  for (let i = 0; ; i++) {
    const day = addDays(start, i);
    if (day > today) break;
    days.push({ day, col: Math.floor(i / 7), row: i % 7 });
  }
  return { days, start };
}

export function StarCalendar({ metric, onMetric, day, onDay, hover, onHover }) {
  const t = useT();
  const f = useStatsFormat();
  const { data } = useActivity();
  const box = useRef(null);
  const [w, setW] = useState(1180);
  const [focus, setFocus] = useState(null);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const cell = Math.max(10, Math.min(17, Math.floor((w - LEFT - SIDE - 44) / WEEKS)));
  const today = data?.today ?? null;
  const byDay = useMemo(() => new Map((data?.days ?? []).map((r) => [r.day, r])), [data]);
  const grid = useMemo(() => (today ? yearGrid(today) : { days: [], start: null }), [today]);
  const options = useMemo(() => statsRules.METRICS.map((m) => ({ value: m, label: t(`stats.metricShort.${m}`) })), [t]);

  // each day's value, and whether it is in the record at all (the stars are drawn again only when these change —
  // a refresh that only moves today's minutes redraws the year once, not on every pointer move)
  const values = useMemo(() => grid.days.map((g) => (byDay.has(g.day) ? metricOf(byDay.get(g.day), metric) : -1)), [grid, byDay, metric]);
  const sig = values.join(',');
  // the scale: the busiest days (not the one extraordinary day) are the brightest stars
  const stars = useMemo(() => {
    const vals = values.filter((v) => v > 0).sort((a, b) => a - b);
    const top = vals.length ? vals[Math.min(vals.length - 1, Math.floor(vals.length * 0.95))] : 1;
    const bright = vals.at(-3) ?? Infinity;
    return <Stars days={grid.days} values={values} top={Math.max(1, top)} bright={bright} cell={cell} />;
  }, [sig, cell, grid]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = (g) => ({ cx: LEFT + g.col * cell + cell / 2, cy: TOP + g.row * cell + cell / 2 });
  const shownDay = hover ?? focus;
  const pickAt = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const col = Math.floor((e.clientX - r.left) / cell), row = Math.floor((e.clientY - r.top) / cell);
    if (col < 0 || row < 0 || row > 6 || col >= WEEKS) return null;
    return grid.days[col * 7 + row]?.day ?? null;
  };
  const onKey = (e) => {
    const step = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 }[e.key];
    const cur = focus ?? day ?? today;
    if (step && cur) {
      e.preventDefault();
      const next = addDays(cur, step);
      if (next <= today && next >= grid.start) { setFocus(next); onHover(null); }
    } else if ((e.key === 'Enter' || e.key === ' ') && focus) { e.preventDefault(); onDay(focus === today ? null : focus); }
  };

  const months = useMemo(() => {
    const out = [];
    let last = -9;
    for (const g of grid.days) {
      if (g.row !== 0) continue;
      const first = g.day.slice(0, 7) !== addDays(g.day, -7).slice(0, 7);
      if (first && g.col - last >= 3) { out.push({ col: g.col, day: g.day, year: g.day.slice(5, 7) === '01' || !out.length }); last = g.col; }
    }
    return out;
  }, [grid]);

  return (
    <div ref={box} className={s.band} style={{ height: H }}>
      {months.map((m) => (
        <span key={m.day} className={s.month} style={{ left: LEFT + m.col * cell, top: 12 }}>{f.month(m.day)}{m.year && <em>{f.year(m.day)}</em>}</span>
      ))}
      {[0, 2, 4].map((row) => grid.days[row] && (
        <span key={row} className={s.weekday} style={{ top: TOP + row * cell + cell / 2 - 8, width: LEFT - 14 }}>{f.weekdayShort(grid.days[row].day)}</span>
      ))}
      {stars}
      <svg className={s.marks} width={w} height={H} aria-hidden="true">
        {today && grid.days.length > 0 && <Ring g={grid.days.at(-1)} at={at} cell={cell} kind="today" />}
        {day && grid.days.find((g) => g.day === day) && <Ring g={grid.days.find((g) => g.day === day)} at={at} cell={cell} kind="chosen" />}
        {shownDay && shownDay !== day && grid.days.find((g) => g.day === shownDay) && <Ring g={grid.days.find((g) => g.day === shownDay)} at={at} cell={cell} kind="hover" />}
      </svg>
      <div className={s.hit} tabIndex={0} aria-label={t('stats.year')} style={{ left: LEFT, top: TOP, width: WEEKS * cell, height: 7 * cell }}
        onPointerMove={(e) => { const d = pickAt(e); if (d !== hover) onHover(d); }} onPointerLeave={() => onHover(null)}
        onClick={(e) => { const d = pickAt(e); if (d) { onDay(d === today ? null : d); setFocus(null); } }}
        onKeyDown={onKey} onBlur={() => setFocus(null)} />
      <span className={s.scale} style={{ left: LEFT + WEEKS * cell - 128, top: TOP + 7 * cell + 3 }} aria-hidden="true">
        {t('stats.less')}<i data-k="0" /><i data-k="1" /><i data-k="2" /><i data-k="3" />{t('stats.more')}
      </span>

      <div className={s.side} style={{ width: SIDE - 24 }} aria-live="polite">
        <Segmented size="sm" value={metric} onChange={onMetric} options={options} label={t('stats.tabs.activity')} className={s.metric} />
        {data && (shownDay ? <DayLine day={shownDay} rec={byDay.get(shownDay)} metric={metric} today={today} first={data.first} />
          : <YearLine days={grid.days.map((g) => byDay.get(g.day)).filter(Boolean)} streak={data.streak} />)}
      </div>
    </div>
  );
}

/** The year's stars (drawn again only when the numbers or the measure change). */
const Stars = memo(function Stars({ days, values, top, bright, cell }) {
  const R = cell * 0.36;
  return (
    <svg className={s.stars} width={LEFT + WEEKS * cell} height={TOP + 7 * cell + 2} aria-hidden="true">
      <defs>
        <radialGradient id="st-halo"><stop offset="0" stopColor="#f1d35a" stopOpacity=".55" /><stop offset="1" stopColor="#f1d35a" stopOpacity="0" /></radialGradient>
      </defs>
      {days.map((g, i) => {
        const v = values[i];
        const u = v > 0 ? Math.min(1, Math.sqrt(v / top)) : 0;
        const cx = LEFT + g.col * cell + cell / 2, cy = TOP + g.row * cell + cell / 2;
        const k = u ? (0.22 + 0.78 * u) : 0.16;
        const style = { '--c': g.col, transform: `scale(${k.toFixed(3)})`, opacity: u ? (0.42 + 0.58 * u).toFixed(3) : 0.26 };
        return (
          <g key={g.day} className={s.day} style={{ '--c': g.col }}>
            {u > 0.62 && <circle cx={cx} cy={cy} r={R * 2.3} fill="url(#st-halo)" className={s.halo} style={{ '--c': g.col, opacity: ((u - 0.62) * 1.9).toFixed(3) }} />}
            <circle cx={cx} cy={cy} r={R} className={s.star} data-lit={u > 0 || undefined} data-warm={u > 0.74 || undefined} style={style} />
            {v >= bright && u > 0 && (
              <path className={s.sparkle} style={{ '--c': g.col }}
                d={`M${cx} ${cy - R * 2}L${cx + R * 0.28} ${cy - R * 0.28}L${cx + R * 2} ${cy}L${cx + R * 0.28} ${cy + R * 0.28}L${cx} ${cy + R * 2}L${cx - R * 0.28} ${cy + R * 0.28}L${cx - R * 2} ${cy}L${cx - R * 0.28} ${cy - R * 0.28}Z`} />
            )}
            {v < 0 && <circle cx={cx} cy={cy} r={1} className={s.void} />}
          </g>
        );
      })}
    </svg>
  );
});

function Ring({ g, at, cell, kind }) {
  const { cx, cy } = at(g);
  return <circle cx={cx} cy={cy} r={cell * 0.36 + 3} className={s.ring} data-kind={kind} />;
}

/** The year at a glance: the days with Prism, the time in it, the run of days now and the longest. */
function YearLine({ days, streak }) {
  const t = useT();
  const f = useStatsFormat();
  const used = days.filter(usedOn).length;
  const minutes = days.reduce((n, r) => n + r.seconds, 0) / 60;
  return (
    <div className={s.summary} key="year">
      <span className={s.kicker}>{t('stats.year')}</span>
      <span className={s.big}>{f.number(used)}<span>{t('stats.daysUsedLabel', { count: used })}</span></span>
      <span className={s.line}>{t('stats.inPrism', { time: f.duration(minutes) })}</span>
      <span className={s.line}>
        <i className={s.flame} data-on={streak.current > 0 || undefined} />
        {t('stats.streak', { n: f.number(streak.current), count: streak.current })}
        <span className={s.dim}> · {t('stats.longest', { n: f.number(streak.longest) })}</span>
      </span>
    </div>
  );
}

/** One day, as pointed at: what was measured that day first, then the rest. */
function DayLine({ day, rec, metric, today, first }) {
  const t = useT();
  const f = useStatsFormat();
  const value = (m) => (m === 'time' ? f.duration(metricOf(rec, 'time')) : f.number(metricOf(rec, m)));
  return (
    <div className={s.summary} key="day">
      <span className={s.kicker}>{f.weekday(day)} · {f.dayMonth(day)}{day === today && <em>{t('stats.today')}</em>}</span>
      {day < first ? <span className={s.line}>{t('stats.beforeRecord')}</span> : (
        <>
          <span className={s.big}>{value(metric)}<span>{metric === 'time' ? t('stats.metric.time') : t(`stats.metric.${metric}`)}</span></span>
          <span className={s.line}>
            {statsRules.METRICS.filter((m) => m !== metric).map((m) => `${t(`stats.metricShort.${m}`)} ${value(m)}`).join(' · ')}
          </span>
        </>
      )}
    </div>
  );
}

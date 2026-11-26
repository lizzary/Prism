// How the statistics page draws its data: the colours of its series (each checked as a set against the surface it sits
// on — the night sky of the head, and the paper of the page in light and dark — for lightness, chroma, separation
// under colour-blindness and contrast), and the words for its numbers.
import { useMemo } from 'react';
import { useLang, useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';

/**
 * The parts of a database folder, on the night sky (validated as an adjacent set in this order): files in the gold of
 * the starlight, previews teal, the database cobalt and the image index rose (the colours their kinds of index wear on
 * the index page), the backup history lavender.
 */
export const PART_COLOR = { files: '#bd9628', previews: '#3eb29d', database: '#6a93e3', index: '#df7d6e', snapshots: '#9d8bd8' };

/** File types on paper, through CSS variables (StatsSheet.module.css holds both themes); the rest are grey. */
export const TYPE_COLOR = {
  png: 'var(--st-png)', jpg: 'var(--st-jpg)', webp: 'var(--st-webp)', gif: 'var(--st-gif)', mp4: 'var(--st-mp4)', webm: 'var(--st-webm)', other: 'var(--st-other)',
};
/** The activity's series on paper: time gold, added cobalt, opened rose — and, where files go, removed terracotta. */
export const METRIC_COLOR = { time: 'var(--st-time)', added: 'var(--st-added)', opened: 'var(--st-opened)', removed: 'var(--st-removed)' };

/** A size bucket's edge, in whole units: 256 KB, 1 MB, 16 MB. */
const edge = (n) => (n >= 1024 * 1024 ? [Math.round(n / 1024 / 1024), 'MB'] : [Math.round(n / 1024), 'KB']);

/** Locale formatters the page needs beyond the app's own: shares, durations, compact counts, weekdays and short dates. */
export function useStatsFormat() {
  const t = useT();
  const lang = useLang();
  const fmt = useFormat();
  return useMemo(() => {
    const loc = lang === 'zh-CN' ? 'zh-CN' : 'en';
    const pct0 = new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 0 });
    const pct1 = new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: 1 });
    const compact = new Intl.NumberFormat(loc, { notation: 'compact', maximumFractionDigits: 1 });
    const weekday = new Intl.DateTimeFormat(loc, { weekday: 'long' });
    const weekdayShort = new Intl.DateTimeFormat(loc, { weekday: 'short' });
    const dayMonth = new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric' });
    const monthShort = new Intl.DateTimeFormat(loc, { month: 'short' });
    const full = new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    const at = (day) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12); };
    return {
      ...fmt,
      /** A share of a whole: never "0%" for something that is there, one decimal below 10%. */
      pct: (part, whole) => {
        if (!whole || !part) return pct0.format(0);
        const x = part / whole;
        if (x < 0.001) return `<${pct1.format(0.001)}`;
        return x < 0.1 ? pct1.format(x) : pct0.format(x);
      },
      compact: (n) => (Math.abs(n) < 10_000 ? fmt.number(n) : compact.format(n)),
      /** Minutes as "1 h 12 min". */
      duration: (minutes) => {
        const m = Math.round(minutes);
        if (m < 60) return t('stats.duration.m', { m });
        const h = Math.floor(m / 60), r = m % 60;
        return r ? t('stats.duration.hm', { h: fmt.number(h), m: r }) : t('stats.duration.h', { h: fmt.number(h) });
      },
      weekday: (day) => weekday.format(at(day)),
      weekdayShort: (day) => weekdayShort.format(at(day)),
      dayMonth: (day) => dayMonth.format(at(day)),
      month: (day) => monthShort.format(at(day)),
      year: (day) => day.slice(0, 4),
      fullDay: (day) => full.format(at(day)),
      /** A size bucket's range, short: "< 256 KB", "256 KB – 1 MB", "1 – 4 MB", "≥ 64 MB". */
      bucket: (b) => {
        const [a, ua] = edge(b.min), [z, uz] = edge(b.max ?? 0);
        if (!b.min) return t('stats.bucket.under', { b: `${z} ${uz}` });
        if (b.max == null) return t('stats.bucket.over', { a: `${a} ${ua}` });
        return ua === uz ? t('stats.bucket.between', { a, b: `${z} ${uz}` }) : t('stats.bucket.between', { a: `${a} ${ua}`, b: `${z} ${uz}` });
      },
      typeName: (type) => (type === 'other' ? t('stats.type.other') : type.toUpperCase()),
    };
  }, [t, lang, fmt]);
}

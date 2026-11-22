// Locale-aware presentation of dates, sizes and numbers.
import { useMemo } from 'react';
import { useI18n } from '../../i18n/index.jsx';

const parse = (iso) => (iso ? new Date(iso.length <= 10 ? `${iso}T00:00` : iso) : null);
const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function makeFormat(lang, t) {
  const loc = lang === 'zh-CN' ? 'zh-CN' : 'en';
  const dLong = new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long', day: 'numeric' });
  const dShort = new Intl.DateTimeFormat(loc, { month: 'short', day: 'numeric' });
  const dMonth = new Intl.DateTimeFormat(loc, { year: 'numeric', month: 'long' });
  const dTime = new Intl.DateTimeFormat(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  const dNum = new Intl.DateTimeFormat(loc, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const num = new Intl.NumberFormat(loc);
  const rel = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
  const thisYear = new Date().getFullYear();
  return {
    date: (iso) => (iso ? dLong.format(parse(iso)) : ''),
    /** Short when it is this year. */
    dateSmart: (iso) => { const d = parse(iso); return d ? (d.getFullYear() === thisYear ? dShort.format(d) : dLong.format(d)) : ''; },
    month: (d) => dMonth.format(d),
    time: (iso) => (iso ? dTime.format(parse(iso)) : ''),
    dateNum: (iso) => (iso ? dNum.format(parse(iso)) : ''),
    dateTime: (iso) => (iso ? `${dLong.format(parse(iso))} ${dTime.format(parse(iso))}` : ''),
    relative: (iso) => {
      const d = parse(iso);
      if (!d) return '';
      const s = (d.getTime() - Date.now()) / 1000, a = Math.abs(s);
      if (a < 45) return t('time.justNow');
      if (a < 3600) return rel.format(Math.round(s / 60), 'minute');
      if (a < 86400) return rel.format(Math.round(s / 3600), 'hour');
      if (a < 86400 * 7) return rel.format(Math.round(s / 86400), 'day');
      return d.getFullYear() === thisYear ? dShort.format(d) : dLong.format(d);
    },
    bytes: (n) => {
      if (!n) return '0 B';
      let i = 0, v = n;
      while (v >= 1024 && i < UNITS.length - 1) { v /= 1024; i++; }
      return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${UNITS[i]}`;
    },
    number: (n) => num.format(n),
    duration: (sec) => {
      if (!Number.isFinite(sec)) return '0:00';
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return `${m}:${String(s).padStart(2, '0')}`;
    },
  };
}

export function useFormat() {
  const { lang, t } = useI18n();
  return useMemo(() => makeFormat(lang, t), [lang, t]);
}

/** Local calendar day "YYYY-MM-DD". */
export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

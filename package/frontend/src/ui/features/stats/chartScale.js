// Scales for the statistics page's charts (pure): rounded axis steps, and where the time line is marked.
import { statsRules } from '../../../bridge/index.js';

const { weekdayOf } = statsRules.rules;

/** An axis from about `min` to `max` in round steps (1, 2, 2.5 or 5 × a power of ten; whole steps for counts). → { lo, hi, ticks } */
export function niceScale(min, max, count = 3, { whole = false } = {}) {
  let a = min, b = max;
  if (!(b > a)) b = a + 1;
  const raw = (b - a) / Math.max(1, count);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  let step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  if (whole) step = step < 1 ? 1 : step === 2.5 ? 2 : step;
  const lo = Math.floor(a / step) * step, hi = Math.ceil(b / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v / step) * step);
  return { lo, hi, ticks };
}

/** The first of each month in the days shown (every third month over a long range; January names its year). */
export function monthTicks(days) {
  const firsts = [];
  days.forEach((d, i) => { if (d.day.endsWith('-01')) firsts.push({ i, day: d.day, kind: 'month', year: d.day.slice(5, 7) === '01' }); });
  if (firsts.length <= 13) return firsts;
  return firsts.filter((k) => ['01', '04', '07', '10'].includes(k.day.slice(5, 7)));
}

/** Each Monday in the days shown. */
export function weekTicks(days) {
  const out = [];
  days.forEach((d, i) => { if (weekdayOf(d.day) === 0) out.push({ i, day: d.day, kind: 'week' }); });
  return out;
}

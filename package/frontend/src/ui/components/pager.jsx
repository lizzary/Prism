import { Icon } from '../icons/Icon.jsx';
import s from './pager.module.css';

const cx = (...a) => a.filter(Boolean).join(' ');

/** Page numbers with gaps: 1 … 4 5 [6] 7 8 … 20 */
function pages(cur, n) {
  if (n <= 7) return Array.from({ length: n }, (_, i) => i + 1);
  const out = [1];
  const a = Math.max(2, cur - 1), b = Math.min(n - 1, cur + 1);
  if (a > 2) out.push('…a');
  for (let i = a; i <= b; i++) out.push(i);
  if (b < n - 1) out.push('…b');
  out.push(n);
  return out;
}

/** labels: { nav, prev, next } */
export function Pagination({ page, pageCount, onChange, labels, className }) {
  if (pageCount <= 1) return null;
  return (
    <nav className={cx(s.pager, className)} aria-label={labels.nav}>
      <button type="button" className={s.arrow} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={labels.prev}>
        <Icon name="chevron-left" size={17} />
      </button>
      {pages(page, pageCount).map((p) => (typeof p === 'string'
        ? <span key={p} className={s.gap}>…</span>
        : <button key={p} type="button" className={cx(s.page, 'num', p === page && s.on)} aria-current={p === page ? 'page' : undefined} onClick={() => onChange(p)}>{p}</button>))}
      <button type="button" className={s.arrow} disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label={labels.next}>
        <Icon name="chevron-right" size={17} />
      </button>
    </nav>
  );
}

/** The quiet one: ‹ 2 / 7 › */
export function CompactPager({ page, pageCount, onChange, labels, className }) {
  if (pageCount <= 1) return null;
  return (
    <nav className={cx(s.compact, className)} aria-label={labels.nav}>
      <button type="button" className={s.small} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={labels.prev}><Icon name="chevron-left" size={15} /></button>
      <span className={cx(s.where, 'num')}><b>{page}</b> / {pageCount}</span>
      <button type="button" className={s.small} disabled={page >= pageCount} onClick={() => onChange(page + 1)} aria-label={labels.next}><Icon name="chevron-right" size={15} /></button>
    </nav>
  );
}

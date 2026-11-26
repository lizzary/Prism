// A list's own tools, quiet until reached for: a magnifier that opens into a find field (Escape clears it, then closes
// it), and one or two columns. They sit at the end of the list's heading, in the faintest ink, and only come forward
// when the pointer is over the list or one of them is in use — the page already has a great deal to look at.
import { useRef, useState } from 'react';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Tooltip } from '../../components/overlay.jsx';
import s from './ListTools.module.css';

const norm = (x) => String(x ?? '').normalize('NFKC').toLowerCase();
/** The words of a query, each to be found somewhere in a name. */
export const wordsOf = (query) => norm(query).split(/\s+/).filter(Boolean);
/** Does a name hold every word? */
export const holds = (name, words) => { const n = norm(name); return words.every((w) => n.includes(w)); };

export function ListTools({ query, onQuery, placeholder, cols, onCols }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const input = useRef(null);
  const shown = open || !!query;
  const reach = () => { setOpen(true); requestAnimationFrame(() => input.current?.focus()); };
  return (
    <div className={s.tools} data-active={shown || undefined}>
      <div className={s.find} data-open={shown || undefined}>
        <Tooltip label={placeholder} disabled={shown}>
          <button type="button" className={s.findIcon} tabIndex={shown ? -1 : 0} aria-label={placeholder} onClick={reach}>
            <Icon name="search" size={14} />
          </button>
        </Tooltip>
        <input ref={input} className={s.findInput} value={query} placeholder={placeholder} spellCheck={false} aria-label={placeholder}
          tabIndex={shown ? 0 : -1} onChange={(e) => onQuery(e.target.value)} onBlur={() => { if (!query) setOpen(false); }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            e.stopPropagation();                    // (the sheet stays open)
            if (query) onQuery('');
            else { setOpen(false); input.current?.blur(); }
          }} />
        {query && (
          <button type="button" className={s.findClear} aria-label={t('common.clear')} onClick={() => { onQuery(''); input.current?.focus(); }}>
            <Icon name="close" size={11} />
          </button>
        )}
      </div>
      <div className={s.cols} role="radiogroup" aria-label={t('stats.layout.label')}>
        {[1, 2].map((n) => (
          <Tooltip key={n} label={t(n === 1 ? 'stats.layout.one' : 'stats.layout.two')}>
            <button type="button" role="radio" aria-checked={cols === n} aria-label={t(n === 1 ? 'stats.layout.one' : 'stats.layout.two')}
              className={s.col} onClick={() => onCols(n)}>
              <Icon name={n === 1 ? 'rows' : 'rows-2'} size={15} />
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

/** A name with the words looked for marked in it. */
export function Found({ text, words }) {
  if (!words?.length || !text) return text ?? null;
  const lower = text.toLowerCase();
  // (marked on the name as written; a name whose width-folded form differs is shown unmarked)
  if (lower.length !== norm(text).length) return text;
  const hits = [];
  for (const w of words) for (let i = lower.indexOf(w); i >= 0; i = lower.indexOf(w, i + 1)) hits.push([i, i + w.length]);
  if (!hits.length) return text;
  hits.sort((a, b) => a[0] - b[0]);
  const merged = [hits[0]];
  for (const [a, b] of hits.slice(1)) { const last = merged.at(-1); if (a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]); }
  const out = [];
  let at = 0;
  merged.forEach(([a, b], k) => {
    if (a > at) out.push(text.slice(at, a));
    out.push(<mark key={k} className={s.mark}>{text.slice(a, b)}</mark>);
    at = b;
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}

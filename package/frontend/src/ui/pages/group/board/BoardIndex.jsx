// The colour groups beside the board — for finding one among many. Every colour group in order (the files in none
// last), its colour, name and size, and how many of its files are chosen; the ones in view are marked with a starlit
// edge (on the board they lie anywhere, so in the list they are rarely together), and the list keeps the first of them
// in sight as the board moves. Pointing at one lights its region (and its place on the map); pressing it flies there. While
// cards are carried every row takes them: drop on a row and they join that colour group, wherever it is on the board.
// A search on the board narrows the list to the colour groups it found, by name or by their files.
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { Icon } from '../../../icons/Icon.jsx';
import { IconButton } from '../../../components/controls.jsx';
import s from './Board.module.css';

const EDGE = 40, SPEED = 12;

/**
 * regions: the scene's · inView: Set of keys · hot, target: keys · carrying: cards are being carried · selected: Map(key →
 * chosen files) · found: { colors: Set, files: Map(key → found files) } | null · on…: hover(key | null), jump(key),
 * close(), menu(key, { x, y })
 */
export function BoardIndex({ regions, inView, hot, target, carrying, selected, found, noneName, onHover, onJump, onClose, onMenu }) {
  const t = useT();
  const fmt = useFormat();
  const list = useRef(null);
  const busy = useRef(false);
  const rows = found ? regions.filter((r) => found.colors.has(r.key) || found.files.get(r.key)) : regions;
  const colorCount = regions.filter((r) => !r.none).length;

  // the list follows the board: the first colour group in view is kept in sight (unless the list is being looked
  // through, or something is carried over it); with every one in view there is nothing to follow
  const sig = `${[...inView].join('|')}#${rows.map((r) => r.key).join('|')}`;
  const allIn = rows.length > 0 && rows.every((r) => inView.has(r.key));
  useLayoutEffect(() => {
    const el = list.current;
    if (!el || busy.current || carrying || allIn) return;
    const first = [...el.querySelectorAll('[data-drop]')].find((r) => inView.has(r.dataset.drop));
    if (!first) return;
    if (first.offsetTop < el.scrollTop + 6 || first.offsetTop + first.offsetHeight > el.scrollTop + el.clientHeight - 6) {
      el.scrollTo({ top: first.offsetTop - el.clientHeight / 3, behavior: 'smooth' });
    }
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  // carrying cards over the list: it scrolls by itself near its ends, so any row can be reached
  useEffect(() => {
    if (!carrying) return undefined;
    let y = -1, raf = 0;
    const onMove = (e) => {
      const r = list.current?.getBoundingClientRect();
      y = r && e.clientX >= r.left && e.clientX <= r.right ? e.clientY : -1;
    };
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const el = list.current;
      if (!el || y < 0) return;
      const r = el.getBoundingClientRect();
      if (y < r.top + EDGE) el.scrollTop -= SPEED * Math.min(1, (r.top + EDGE - y) / EDGE);
      else if (y > r.bottom - EDGE) el.scrollTop += SPEED * Math.min(1, (y - r.bottom + EDGE) / EDGE);
    };
    document.addEventListener('pointermove', onMove, true);
    raf = requestAnimationFrame(tick);
    return () => { document.removeEventListener('pointermove', onMove, true); cancelAnimationFrame(raf); };
  }, [carrying]);

  return (
    <aside className={s.index} data-board-chrome="" data-carrying={carrying || undefined} aria-label={t('board.index.title')}
      onPointerEnter={() => { busy.current = true; }} onPointerLeave={() => { busy.current = false; onHover(null); }}>
      <header className={s.indexHead}>
        <span className={s.indexTitle}>{t('board.index.title')}</span>
        <span className={`${s.indexTotal} num`}>
          {found ? t('group.outline.found', { n: fmt.number(rows.length), total: fmt.number(regions.length) }) : t('group.outline.total', { n: fmt.number(colorCount), count: colorCount })}
        </span>
        <IconButton size="sm" icon="close" label={t('board.index.close')} onClick={onClose} />
      </header>
      <div ref={list} className={s.indexList} role="listbox" aria-label={t('board.index.title')}>
        {rows.map((r) => {
          const n = selected.get(r.key) ?? 0;
          const f = found?.files.get(r.key) ?? 0;
          return (
            <div key={r.key} data-drop={r.key} role="option" aria-selected={false} className={s.indexRow} style={{ '--c': r.color ?? 'var(--ink-3)' }}
              data-none={r.none || undefined} data-in={(!allIn && inView.has(r.key)) || undefined} data-hot={hot === r.key || undefined} data-target={target === r.key || undefined}
              data-named={found?.colors.has(r.key) || undefined}
              onPointerEnter={() => onHover(r.key)} onClick={() => onJump(r.key)}
              onContextMenu={(e) => { e.preventDefault(); onMenu(r.key, { x: e.clientX, y: e.clientY }); }}>
              <i className={s.indexDot} />
              <span className={s.indexName}>{r.none ? r.name ?? noneName : r.name}</span>
              {f > 0 && <span className={`${s.indexFound} num`}><Icon name="search" size={10} stroke={2.2} />{fmt.number(f)}</span>}
              {n > 0 && <span className={`${s.indexSel} num`}><Icon name="check" size={10} stroke={2.6} />{fmt.number(n)}</span>}
              <span className={`${s.indexCount} num`}>{fmt.number(r.n)}</span>
              {carrying && <Icon name="drag-drop" size={14} className={s.indexDrop} />}
            </div>
          );
        })}
        {found && !rows.length && <p className={s.indexNothing}>{t('board.findNone')}</p>}
      </div>
    </aside>
  );
}

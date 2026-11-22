// The snapshot timeline: oldest on the left, one card per snapshot standing on a time axis, ending in "now" —
// the database folder as it is, not yet saved. The stretch of axis from the snapshot the library is based on to
// "now" is lit: that is what a new snapshot would save.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { mediaUrl } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Tooltip } from '../../components/overlay.jsx';
import s from './Timeline.module.css';

const SLOT = 176;            // px per snapshot on the axis

export function snapshotTitle(t, fmt, snap) {
  return snap.name || t('backup.untitled', { date: fmt.dateSmart(snap.createdAt) });
}

export function Timeline({ snapshots, head, pending, selected, onSelect, developing, fresh, leaving }) {
  const t = useT();
  const fmt = useFormat();
  const scroller = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const headIndex = snapshots.findIndex((x) => x.id === head);

  const measure = () => {
    const el = scroller.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  // open at "now", the right end
  useLayoutEffect(() => {
    const el = scroller.current;
    el.scrollLeft = el.scrollWidth;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => { measure(); }, [snapshots.length]);
  // the vertical wheel moves along the axis
  useEffect(() => {
    const el = scroller.current;
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  // keep the chosen card in view (scrolling the axis only, never the sheet around it)
  useEffect(() => {
    const el = scroller.current, f = el?.querySelector('[data-on="true"]');
    if (!f) return;
    const left = f.offsetLeft, right = left + f.offsetWidth, m = 48;
    if (left < el.scrollLeft + m) el.scrollTo({ left: left - m, behavior: 'smooth' });
    else if (right > el.scrollLeft + el.clientWidth - m) el.scrollTo({ left: right - el.clientWidth + m, behavior: 'smooth' });
  }, [selected, snapshots.length]);
  const nudge = (d) => scroller.current.scrollBy({ left: d * scroller.current.clientWidth * 0.7, behavior: 'smooth' });

  let lastMonth = '';
  const lit = headIndex >= 0 ? headIndex : -0.5;     // no snapshot yet: the whole axis up to now is unsaved

  return (
    <div className={s.wrap} data-left={edges.left} data-right={edges.right}>
      {edges.left && <button type="button" className={`${s.edge} ${s.edgeL}`} onClick={() => nudge(-1)} aria-label={t('common.prev')}><Icon name="chevron-left" size={16} /></button>}
      <div ref={scroller} className={s.scroll} onScroll={measure}>
        <div className={s.track} style={{ '--slot': `${SLOT}px` }} role="listbox" aria-label={t('backup.title')}>
          <span className={s.axis} aria-hidden="true" />
          <span className={s.lit} aria-hidden="true" data-pending={pending > 0}
            style={{ left: `calc(var(--pad) + ${lit + 0.5} * var(--slot))`, width: `calc(${snapshots.length - lit} * var(--slot))` }} />
          {snapshots.map((snap, i) => {
            const month = snap.createdAt.slice(0, 7);
            const showMonth = month !== lastMonth;
            lastMonth = month;
            return (
              <Entry key={snap.id} snap={snap} order={snapshots.length - i} on={selected === snap.id} head={snap.id === head}
                month={showMonth ? fmt.month(new Date(`${snap.createdAt.slice(0, 10)}T00:00`)) : null}
                fresh={fresh.has(snap.id)} leaving={leaving === snap.id} onSelect={() => onSelect(snap.id)} />
            );
          })}
          <Now on={selected === 'now'} pending={pending} developing={developing} onSelect={() => onSelect('now')} />
        </div>
      </div>
      {edges.right && <button type="button" className={`${s.edge} ${s.edgeR}`} onClick={() => nudge(1)} aria-label={t('common.next')}><Icon name="chevron-right" size={16} /></button>}
    </div>
  );
}

function Delta({ changes }) {
  const fmt = useFormat();
  const parts = [['added', '+'], ['modified', '~'], ['deleted', '−']].filter(([k]) => changes[k] > 0);
  if (!parts.length) return null;
  return (
    <span className={`${s.delta} num`}>
      {parts.map(([k, sign]) => <span key={k} data-change={k}>{sign}{fmt.number(changes[k])}</span>)}
    </span>
  );
}

function Entry({ snap, order, on, head, month, fresh, leaving, onSelect }) {
  const t = useT();
  const fmt = useFormat();
  const title = snapshotTitle(t, fmt, snap);
  const node = <span className={s.node} data-head={head} />;
  return (
    <button type="button" role="option" aria-selected={on} className={s.entry} data-on={on} data-fresh={fresh} data-leaving={leaving}
      style={{ '--i': order }} onClick={onSelect} aria-label={`${title} · ${fmt.dateTime(snap.createdAt)}`}>
      <span className={s.card}>
        <span className={s.strip} data-n={Math.min(3, snap.previews.length)}>
          {snap.previews.slice(0, 3).map((ref) => <img key={ref.id} src={mediaUrl(ref, 'low')} alt="" draggable={false} loading="lazy" />)}
        </span>
        <span className={s.when}><span className="num">{fmt.dateSmart(snap.createdAt)}</span><span className="num">{fmt.time(snap.createdAt)}</span></span>
        <span className={s.name}>{snap.name || '\u00a0'}</span>
        <span className={s.meta}>
          <Delta changes={snap.changes} />
          {snap.source === 'imported' && <i className={s.tag}>{t('backup.imported')}</i>}
        </span>
      </span>
      <span className={s.stem} aria-hidden="true" />
      {head ? <Tooltip label={t('backup.basedOn')}>{node}</Tooltip> : node}
      {month && <span className={s.month}>{month}</span>}
    </button>
  );
}

/** "Now": the folder as it is. While a snapshot is written, its card fills up. */
function Now({ on, pending, developing, onSelect }) {
  const t = useT();
  const fmt = useFormat();
  const p = developing ? (developing.total ? developing.processed / developing.total : 0) : 0;
  return (
    <button type="button" role="option" aria-selected={on} className={`${s.entry} ${s.now}`} data-on={on} data-pending={pending > 0}
      data-developing={!!developing} style={{ '--i': 0, '--p': p }} onClick={onSelect}>
      <span className={s.card}>
        {developing ? (
          <span className={s.nowBody}>
            <span className={s.nowLabel}>{t('backup.creating')}</span>
            <span className={`${s.nowFigure} num`}>{Math.round(p * 100)}%</span>
            <span className={s.bar}><i /></span>
          </span>
        ) : (
          <span className={s.nowBody}>
            <span className={s.nowLabel}>{t('backup.now')}</span>
            <span className={`${s.nowFigure} num`} data-clean={!pending}>
              {pending > 0 ? t('backup.changesN', { n: fmt.number(pending) }) : <><Icon name="check" size={15} />{t('backup.allSaved')}</>}
            </span>
          </span>
        )}
      </span>
      <span className={s.stem} aria-hidden="true" />
      <span className={s.node} />
    </button>
  );
}

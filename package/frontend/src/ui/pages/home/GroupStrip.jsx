// The wall in miniature, in the wall's bar: one small cover per group, in the wall's order. The groups now on
// screen sit inside a soft window that slides along as the page scrolls; choosing a cover brings its group into view.
import { useLayoutEffect, useRef, useState } from 'react';
import { mediaUrl } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Tooltip } from '../../components/overlay.jsx';
import s from './GroupStrip.module.css';

const GAP = 4;
const MIN = 12, MAX = 26;     // a cover's size: as large as the bar allows, never a speck

export function GroupStrip({ groups, range, onJump }) {
  const t = useT();
  const box = useRef(null);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    const fit = () => setSize(Math.max(MIN, Math.min(MAX, Math.floor((el.clientWidth + GAP) / Math.max(1, groups.length)) - GAP)));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [groups.length]);

  const step = size + GAP;
  // when the strip is longer than the bar, keep the window in sight
  useLayoutEffect(() => {
    const el = box.current;
    if (!range || el.scrollWidth <= el.clientWidth) return;
    const a = range[0] * step, b = (range[1] + 1) * step;
    if (a < el.scrollLeft || b > el.scrollLeft + el.clientWidth) el.scrollTo({ left: (a + b) / 2 - el.clientWidth / 2, behavior: 'smooth' });
  }, [range, step]);

  const inView = (i) => !range || (i >= range[0] && i <= range[1]);
  return (
    <div ref={box} className={s.strip} style={{ '--s': `${size}px`, '--gap': `${GAP}px` }} data-ready={size > 0 || undefined} aria-hidden="true"
      onWheel={(e) => { const el = box.current; if (el.scrollWidth > el.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { el.scrollLeft += e.deltaY; e.preventDefault(); } }}>
      <div className={s.track}>
        <span className={s.window} data-on={!!range || undefined}
          style={range ? { transform: `translateX(${range[0] * step - 4}px)`, width: (range[1] - range[0] + 1) * step - GAP + 8 } : undefined} />
        {groups.map((g, i) => (
          <Tooltip key={g.id} label={`${g.name} · ${t('home.files', { n: g.fileCount })}`} delay={150}>
            <button type="button" tabIndex={-1} className={s.thumb} data-in={inView(i) || undefined} style={{ '--i': Math.min(i, 30) }} onClick={() => onJump(g.id)}>
              {g.cover ? <img src={mediaUrl(g.cover, 'low')} alt="" draggable={false} decoding="async" /> : <i className={s.blank} />}
            </button>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}

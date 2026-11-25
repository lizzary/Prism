// The colours a colour group can take: twelve soft paints, or any colour. The colour-group editor and the whiteboard
// (a region's dot) pick with the same palette.
import { useMemo } from 'react';
import { useT } from '../../../i18n/index.jsx';
import { SWATCHES } from '../../lib/swatches.js';
import { Icon } from '../../icons/Icon.jsx';
import { Popover } from '../../components/overlay.jsx';
import s from './Swatches.module.css';

/** The palette itself. onPick(colour, { done }): done — a paint was pressed (the colour wheel keeps it open while it turns). */
export function Swatches({ color, onPick }) {
  const t = useT();
  const low = (color ?? '').toLowerCase();
  return (
    <div className={s.palette}>
      {SWATCHES.map((c) => (
        <button key={c} type="button" className={s.paint} style={{ '--c': c }} data-on={c === low || undefined} aria-label={c} onClick={() => onPick(c, { done: true })} />
      ))}
      <label className={`${s.paint} ${s.custom}`} style={{ '--c': SWATCHES.includes(low) ? 'transparent' : color }} title={t('colorGroups.custom')}>
        <Icon name="palette" size={14} />
        <input type="color" value={color} onChange={(e) => onPick(e.target.value, { done: false })} aria-label={t('colorGroups.custom')} />
      </label>
    </div>
  );
}

/** The palette in a popover, next to an element (`anchor`) or at a point (`at`: { x, y }). */
export function SwatchPopover({ open, anchor, at, color, onPick, onClose }) {
  const t = useT();
  const point = useMemo(() => (at ? { getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0) } : null), [at?.x, at?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Popover open={open} onClose={onClose} anchor={anchor ?? point} placement="bottom-start" label={t('colorGroups.color')}>
      <Swatches color={color} onPick={(c, { done }) => { onPick(c); if (done) onClose(); }} />
    </Popover>
  );
}

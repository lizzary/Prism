import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../icons/Icon.jsx';
import { Popover } from './overlay.jsx';
import s from './menu.module.css';

/**
 * A short list of actions in a popover, anchored to an element (a "more" button) or to a point (a context menu at
 * the pointer). items: [{ key, label, icon | swatch (a colour; 'none' for a hollow ring), onSelect, danger, disabled, hint, checked } | '-' (a divider)]
 */
export function Menu({ open, onClose, anchor, at, items, label, placement = 'bottom-start', className }) {
  const [hi, setHi] = useState(-1);
  const point = useMemo(() => (at ? { getBoundingClientRect: () => new DOMRect(at.x, at.y, 0, 0) } : null), [at?.x, at?.y]); // eslint-disable-line react-hooks/exhaustive-deps
  const live = items.map((it, i) => (it !== '-' && !it.disabled ? i : -1)).filter((i) => i >= 0);
  useEffect(() => { if (open) setHi(-1); }, [open]);

  const choose = (it) => { onClose(); it.onSelect?.(); };
  const onKey = (e) => {
    const k = live.indexOf(hi);
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi(live[(k + 1) % live.length]); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(live[(k - 1 + live.length) % live.length]); }
    else if (e.key === 'Enter' && hi >= 0) { e.preventDefault(); choose(items[hi]); }
  };

  return (
    <Popover open={open} onClose={onClose} anchor={anchor ?? point} placement={placement} offset={at ? 2 : 6} label={label} className={`${s.menu} ${className ?? ''}`}>
      <ul role="menu" aria-label={label} className={s.list} tabIndex={-1} data-autofocus onKeyDown={onKey}>
        {items.map((it, i) => (it === '-'
          ? <li key={`-${i}`} role="separator" className={s.sep} />
          : (
            <li key={it.key} role="menuitem" aria-disabled={it.disabled || undefined} className={s.item} data-danger={it.danger || undefined} data-hi={hi === i || undefined}
              onPointerEnter={() => !it.disabled && setHi(i)} onPointerLeave={() => setHi(-1)} onClick={() => !it.disabled && choose(it)}>
              {it.swatch ? <i className={s.swatch} data-none={it.swatch === 'none' || undefined} style={{ background: it.swatch === 'none' ? undefined : it.swatch }} />
                : it.icon && <Icon name={it.icon} size={16} className={s.icon} />}
              <span className={s.label}>{it.label}</span>
              {it.hint && <span className={s.hint}>{it.hint}</span>}
              {it.checked && <Icon name="check" size={15} className={s.checked} />}
            </li>
          )))}
      </ul>
    </Popover>
  );
}

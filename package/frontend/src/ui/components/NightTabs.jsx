// The parts of a sheet whose head is a night sky (the index page, statistics): words on the night, a line of starlight
// under the one open that slides to the next. ← → move between them.
import { useLayoutEffect, useRef, useState } from 'react';
import { useLang } from '../../i18n/index.jsx';
import s from './NightTabs.module.css';

/** tabs: [{ id, label }] */
export function NightTabs({ tabs, value, onChange, label, className }) {
  const lang = useLang();
  const box = useRef(null);
  const [ind, setInd] = useState(null);
  useLayoutEffect(() => {
    const el = box.current?.querySelector('[aria-selected="true"]');
    if (el) setInd({ x: el.offsetLeft + 12, w: el.offsetWidth - 24 });
  }, [value, lang]);
  const ids = tabs.map((x) => x.id);
  const onKey = (e) => {
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (!d) return;
    e.preventDefault();
    const next = ids[(ids.indexOf(value) + d + ids.length) % ids.length];
    onChange(next);
    box.current?.querySelector(`[data-tab="${next}"]`)?.focus();
  };
  return (
    <div ref={box} className={`${s.tabs} ${className ?? ''}`} role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((x) => (
        <button key={x.id} type="button" role="tab" data-tab={x.id} aria-selected={value === x.id} tabIndex={value === x.id ? 0 : -1} className={s.tab}
          onClick={() => onChange(x.id)}>
          {x.label}
        </button>
      ))}
      {ind && <span className={s.line} style={{ transform: `translateX(${ind.x}px)`, width: ind.w }} />}
    </div>
  );
}

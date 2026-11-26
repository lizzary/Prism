import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon.jsx';
import { Popover, Tooltip } from './overlay.jsx';
import { Spinner } from './feedback.jsx';
import s from './controls.module.css';

const cx = (...a) => a.filter(Boolean).join(' ');

export function Button({ variant = 'secondary', size = 'md', tone, icon, iconRight, loading, children, className, ref, type = 'button', ...rest }) {
  return (
    <button ref={ref} type={type} className={cx(s.btn, s[variant], s[size], tone === 'art' && s.onArt, loading && s.loading, className)} aria-busy={loading || undefined} {...rest}>
      {loading ? <Spinner size={size === 'sm' ? 13 : 15} /> : icon && <Icon name={icon} size={size === 'sm' ? 15 : size === 'lg' ? 19 : 17} />}
      {children != null && <span className={s.label}>{children}</span>}
      {iconRight && <Icon name={iconRight} size={size === 'sm' ? 14 : 16} className={s.iconRight} />}
    </button>
  );
}

export function IconButton({ icon, label, size = 'md', tone, active, badge, className, tip = true, children, ref, placement, ...rest }) {
  const btn = (
    <button ref={ref} type="button" aria-label={label} aria-pressed={active ?? undefined} className={cx(s.iconBtn, s[`ib_${size}`], tone === 'art' && s.ibArt, active && s.ibActive, className)} {...rest}>
      {children ?? <Icon name={icon} size={size === 'sm' ? 17 : size === 'lg' ? 21 : 19} />}
      {badge != null && badge !== 0 && <span className={s.badge}>{badge}</span>}
    </button>
  );
  return tip ? <Tooltip label={label} placement={placement}>{btn}</Tooltip> : btn;
}

export function Checkbox({ checked, indeterminate, onChange, label, disabled, className, size = 17, ...rest }) {
  const state = indeterminate ? 'mixed' : checked ? 'on' : 'off';
  return (
    <label className={cx(s.check, disabled && s.disabled, className)} data-state={state}>
      <input type="checkbox" className="sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange?.(e.target.checked, e)} ref={(el) => { if (el) el.indeterminate = !!indeterminate; }} {...rest} />
      <span className={s.box} style={{ width: size, height: size }} aria-hidden="true">
        <svg viewBox="0 0 16 16"><path className={s.tick} d="m3.6 8.4 2.9 2.8 5.9-6.2" /><path className={s.dash} d="M4.2 8h7.6" /></svg>
      </span>
      {label != null && <span className={s.checkLabel}>{label}</span>}
    </label>
  );
}

/** An on/off switch. The knob stretches while pressed and settles with a small overshoot. */
export function Switch({ checked, onChange, label, disabled, size = 'md', className, ref, ...rest }) {
  return (
    <button ref={ref} type="button" role="switch" aria-checked={!!checked} aria-label={label} disabled={disabled}
      className={cx(s.switch, s[`sw_${size}`], checked && s.swOn, className)} onClick={() => onChange?.(!checked)} {...rest}>
      <span className={s.swKnob} />
    </button>
  );
}

/** The look of a checkbox without its input, for rows that handle selection themselves. */
export function Tick({ state = 'off', size = 17 }) {
  return (
    <span className={s.check} data-state={state} aria-hidden="true">
      <span className={s.box} style={{ width: size, height: size }}>
        <svg viewBox="0 0 16 16"><path className={s.tick} d="m3.6 8.4 2.9 2.8 5.9-6.2" /><path className={s.dash} d="M4.2 8h7.6" /></svg>
      </span>
    </span>
  );
}

/**
 * Segmented choice with a sliding indicator. options: [{ value, label, icon, disabled, tip }]
 * `tip` explains an option on hover (a disabled one too, which is why it is then wrapped).
 */
export function Segmented({ value, onChange, options, size = 'md', className, label, iconOnly }) {
  const wrap = useRef(null);
  const [ind, setInd] = useState(null);
  // (a value that is none of the options — a custom range beside its presets — leaves nothing marked)
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector('[data-selected="true"]');
    setInd(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, [value, options]);
  return (
    <div ref={wrap} className={cx(s.seg, s[`seg_${size}`], className)} role="radiogroup" aria-label={label}>
      {ind && <span className={s.segInd} style={{ transform: `translateX(${ind.left}px)`, width: ind.width }} />}
      {options.map((o) => {
        const btn = (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={iconOnly ? o.label : undefined}
            data-selected={o.value === value} disabled={o.disabled} className={s.segOpt} onClick={() => onChange(o.value)}>
            {o.icon && <Icon name={o.icon} size={16} />}
            {!iconOnly && <span>{o.label}</span>}
          </button>
        );
        const tip = iconOnly ? o.label : o.tip;
        if (!tip) return btn;
        return <Tooltip key={o.value} label={tip}>{o.disabled ? <span className={s.segTip}>{btn}</span> : btn}</Tooltip>;
      })}
    </div>
  );
}

export function Field({ label, hint, error, children, className, htmlFor, aside }) {
  return (
    <div className={cx(s.field, className)}>
      {(label || aside) && (
        <div className={s.fieldHead}>
          {label && <label className={s.fieldLabel} htmlFor={htmlFor}>{label}</label>}
          {aside}
        </div>
      )}
      {children}
      {error ? <div className={s.fieldError} role="alert">{error}</div> : hint ? <div className={s.fieldHint}>{hint}</div> : null}
    </div>
  );
}

export function TextInput({ className, invalid, icon, ref, ...rest }) {
  return (
    <div className={cx(s.inputWrap, invalid && s.invalid, className)}>
      {icon && <Icon name={icon} size={16} className={s.inputIcon} />}
      <input ref={ref} className={cx(s.input, icon && s.withIcon)} {...rest} />
    </div>
  );
}

export function TextArea({ className, invalid, autoGrow = true, ref, ...rest }) {
  const local = useRef(null);
  const el = ref ?? local;
  useLayoutEffect(() => {
    if (!autoGrow || !el.current) return;
    el.current.style.height = 'auto';
    el.current.style.height = `${el.current.scrollHeight + 2}px`;
  }, [rest.value, autoGrow, el]);
  return <textarea ref={el} className={cx(s.input, s.textarea, invalid && s.invalid, className)} {...rest} />;
}

/** A select built on a popover listbox. options: [{ value, label, icon }] */
export function Select({ value, onChange, options, label, className, placeholder, size = 'md', icon }) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const anchor = useRef(null);
  const listId = useId();
  const cur = options.find((o) => o.value === value);
  useEffect(() => { if (open) setHi(Math.max(0, options.findIndex((o) => o.value === value))); }, [open, options, value]);
  const choose = (o) => { onChange(o.value); setOpen(false); anchor.current?.focus(); };
  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(options.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(options[hi]); }
  };
  return (
    <>
      <button ref={anchor} type="button" className={cx(s.select, s[`sel_${size}`], open && s.selOpen, className)} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-label={label}
        onClick={() => setOpen((o) => !o)} onKeyDown={onKey}>
        {(icon || cur?.icon) && <Icon name={icon || cur.icon} size={15} className={s.selIcon} />}
        <span className={s.selValue}>{cur?.label ?? placeholder}</span>
        <Icon name="chevron-down" size={15} className={s.selChevron} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} placement="bottom-start" offset={6} matchWidth trapFocus={false} label={label}>
        <ul id={listId} role="listbox" className={s.listbox} onKeyDown={onKey}>
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value} data-hi={i === hi} className={s.option}
              onPointerEnter={() => setHi(i)} onClick={() => choose(o)}>
              {o.icon && <Icon name={o.icon} size={16} />}
              <span>{o.label}</span>
              {o.value === value && <Icon name="check" size={15} className={s.optCheck} />}
            </li>
          ))}
        </ul>
      </Popover>
    </>
  );
}

/**
 * A whole number to type or to step: − value +. Holding − or + keeps stepping; while typing, ↑ ↓ step (Shift: by 10)
 * and so does the wheel; Enter or leaving the field takes what was typed (`onEnter(n)` hears Enter), Escape drops it.
 * size: 'xs' (inside a toolbar control) | 'md'. `inputProps` go to the field (data-autofocus, aria…).
 */
export function Stepper({ value, onChange, min = 1, max = 999, label, decLabel, incLabel, size = 'md', className, onEnter, inputProps }) {
  const [draft, setDraft] = useState(null);
  const field = useRef(null);
  const live = useRef({});
  const hold = useRef(0);
  const clamp = (n) => Math.max(min, Math.min(max, n));
  const typed = (text) => { const n = parseInt(text ?? '', 10); return Number.isFinite(n) ? clamp(n) : null; };
  live.current = { value, draft, onChange, dropped: live.current.dropped };
  const commit = () => {
    const { draft: d, dropped } = live.current;
    live.current.dropped = false;
    if (d == null) return value;
    setDraft(null);
    const n = dropped ? null : typed(d);
    if (n != null && n !== value) onChange(n);
    return n ?? value;
  };
  const step = (d) => {
    const from = typed(live.current.draft) ?? live.current.value;
    const n = clamp(from + d);
    const wasTyping = live.current.draft != null;
    setDraft(null);
    live.current.draft = null;
    live.current.value = n;
    if (n !== from || wasTyping) live.current.onChange(n);
  };
  const stop = () => { clearTimeout(hold.current); hold.current = 0; };
  useEffect(() => stop, []);
  // held down: one step at once, then a steady run after a moment
  const press = (d) => (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    step(d);
    const run = (wait) => { hold.current = setTimeout(() => { step(d); run(70); }, wait); };
    run(420);
    window.addEventListener('pointerup', stop, { once: true });
    window.addEventListener('pointercancel', stop, { once: true });
  };
  // the wheel steps only while the field is being edited, so scrolling past it never changes it
  useEffect(() => {
    const el = field.current;
    const onWheel = (e) => {
      if (document.activeElement !== el || !e.deltaY) return;
      e.preventDefault();
      step(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const digits = String(max).length;
  const iconSize = size === 'xs' ? 13 : 16;
  return (
    <span className={cx(s.stepper, s[`st_${size}`], className)}>
      <button type="button" className={s.stepBtn} tabIndex={-1} aria-label={decLabel ?? '−'} disabled={value <= min}
        onPointerDown={press(-1)} onPointerLeave={stop} onClick={(e) => { if (e.detail === 0) step(-1); }}>
        <Icon name="minus" size={iconSize} stroke={1.9} />
      </button>
      <input ref={field} className={cx(s.stepValue, 'num')} type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
        value={draft ?? String(value)} maxLength={digits} aria-label={label} style={{ '--digits': digits }}
        onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
        onFocus={(e) => e.target.select()}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); const n = commit(); onEnter?.(n); }
          else if (e.key === 'Escape') { live.current.dropped = true; setDraft(null); }
          else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1)); }
        }}
        {...inputProps} />
      <button type="button" className={s.stepBtn} tabIndex={-1} aria-label={incLabel ?? '+'} disabled={value >= max}
        onPointerDown={press(1)} onPointerLeave={stop} onClick={(e) => { if (e.detail === 0) step(1); }}>
        <Icon name="plus" size={iconSize} stroke={1.9} />
      </button>
    </span>
  );
}

/** A toggle chip (search domains, file types). */
export function Chip({ selected, onClick, children, icon, count, disabled, className, color, ref, ...rest }) {
  return (
    <button ref={ref} type="button" aria-pressed={!!selected} disabled={disabled} className={cx(s.chip, selected && s.chipOn, className)} onClick={onClick}
      style={color ? { '--chip-dot': color } : undefined} {...rest}>
      {color && <span className={s.chipDot} />}
      {icon && <Icon name={icon} size={14} />}
      <span>{children}</span>
      {count != null && <span className={cx(s.chipCount, 'num')}>{count}</span>}
    </button>
  );
}

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

/** Segmented choice with a sliding indicator. options: [{ value, label, icon }] */
export function Segmented({ value, onChange, options, size = 'md', className, label, iconOnly }) {
  const wrap = useRef(null);
  const [ind, setInd] = useState(null);
  useLayoutEffect(() => {
    const el = wrap.current?.querySelector('[data-selected="true"]');
    if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
  }, [value, options]);
  return (
    <div ref={wrap} className={cx(s.seg, s[`seg_${size}`], className)} role="radiogroup" aria-label={label}>
      {ind && <span className={s.segInd} style={{ transform: `translateX(${ind.left}px)`, width: ind.width }} />}
      {options.map((o) => {
        const btn = (
          <button key={o.value} type="button" role="radio" aria-checked={o.value === value} aria-label={iconOnly ? o.label : undefined}
            data-selected={o.value === value} className={s.segOpt} onClick={() => onChange(o.value)}>
            {o.icon && <Icon name={o.icon} size={16} />}
            {!iconOnly && <span>{o.label}</span>}
          </button>
        );
        return iconOnly ? <Tooltip key={o.value} label={o.label}>{btn}</Tooltip> : btn;
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

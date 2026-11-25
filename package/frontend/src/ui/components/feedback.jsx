import { useEffect, useSyncExternalStore } from 'react';
import { Icon } from '../icons/Icon.jsx';
import { Portal } from './overlay.jsx';
import s from './feedback.module.css';

export function Spinner({ size = 16, className }) {
  return (
    <svg className={`${s.spinner} ${className ?? ''}`} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="2" />
      <circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="14 40" />
    </svg>
  );
}

export function ProgressBar({ value, max = 1, tone = 'star', className, indeterminate }) {
  const p = indeterminate ? null : Math.max(0, Math.min(1, value / (max || 1)));
  return (
    <div className={`${s.bar} ${s[`tone_${tone}`]} ${indeterminate ? s.indeterminate : ''} ${className ?? ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={indeterminate ? undefined : value}>
      <div className={s.fill} style={p == null ? undefined : { transform: `scaleX(${p})` }} />
    </div>
  );
}

export function ProgressRing({ value, size = 34, stroke = 2, className, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <span className={`${s.ring} ${className ?? ''}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".16" strokeWidth={stroke} />
        <circle className={s.ringArc} cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--star)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      {children && <span className={s.ringIn}>{children}</span>}
    </span>
  );
}

export const Skeleton = ({ className, style }) => <div className={`${s.skeleton} ${className ?? ''}`} style={style} aria-hidden="true" />;

/** A small vignette: an empty frame on the wall under a crescent moon. */
export function EmptyArt({ size = 132 }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 132 95" fill="none" aria-hidden="true" className={s.emptyArt}>
      <path d="M96 10.5a8.5 8.5 0 1 0 6.9 13.4 6.9 6.9 0 1 1-6.9-13.4Z" fill="var(--star)" opacity=".85" />
      <circle cx="30" cy="16" r="1.4" fill="var(--ink-4)" /><circle cx="114" cy="40" r="1.1" fill="var(--ink-4)" /><circle cx="18" cy="44" r="1" fill="var(--ink-4)" />
      <path d="M66 22 52 34M66 22l14 12" stroke="var(--ink-4)" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="66" cy="21" r="2" fill="var(--ink-3)" />
      <rect x="40" y="34" width="52" height="40" rx="2.5" stroke="var(--ink-3)" strokeWidth="1.6" />
      <rect x="46.5" y="40.5" width="39" height="27" rx="1" stroke="var(--line-2)" strokeWidth="1.2" strokeDasharray="2.4 2.6" />
      <path d="M20 86h92" stroke="var(--line-2)" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function Empty({ title, children, action, compact }) {
  return (
    <div className={`${s.empty} ${compact ? s.emptyCompact : ''}`}>
      <EmptyArt size={compact ? 104 : 132} />
      <div className={s.emptyTitle}>{title}</div>
      {children && <div className={s.emptyBody}>{children}</div>}
      {action && <div className={s.emptyAction}>{action}</div>}
    </div>
  );
}

// ------------------------------------------------------------------ toasts
/**
 * A bar along the bottom of the screen (the page's selection bar, the whiteboard's dock) lifts the toasts above it
 * while it is up, so a note never lands on the buttons it is about.
 */
const lifts = [];
const applyLift = () => document.documentElement.style.setProperty('--toast-lift', `${Math.max(0, ...lifts)}px`);
export function useToastLift(on, px = 72) {
  useEffect(() => {
    if (!on) return undefined;
    lifts.push(px);
    applyLift();
    return () => { lifts.splice(lifts.indexOf(px), 1); applyLift(); };
  }, [on, px]);
}

let toasts = [];
let seq = 0;
const subs = new Set();
const publish = () => { for (const fn of subs) fn(); };
export function toast(message, { tone = 'info', icon, action, duration = 3800 } = {}) {
  const id = ++seq;
  toasts = [...toasts, { id, message, tone, icon, action, state: 'in' }];
  publish();
  setTimeout(() => dismiss(id), duration);
  return id;
}
function dismiss(id) {
  toasts = toasts.map((t) => (t.id === id ? { ...t, state: 'out' } : t));
  publish();
  setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); publish(); }, 260);
}
const TONE_ICON = { info: 'info', ok: 'check-circle', warn: 'alert', error: 'x-circle' };

export function Toaster() {
  const list = useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, () => toasts);
  return (
    <Portal>
      <div className={s.toasts} aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`${s.toast} ${s[`toast_${t.tone}`]}`} data-state={t.state}>
            <Icon name={t.icon ?? TONE_ICON[t.tone]} size={18} className={s.toastIcon} />
            <span className={s.toastMsg}>{t.message}</span>
            {t.action && <button type="button" className={s.toastAction} onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </Portal>
  );
}

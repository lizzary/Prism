import { createPortal } from 'react-dom';
import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { Icon } from '../icons/Icon.jsx';
import { pageCover } from '../lib/pageCover.js';
import s from './overlay.module.css';

export const Portal = ({ children }) => createPortal(children, document.body);

/**
 * Keep something mounted while it animates out. state: 'enter' → 'open' → 'exit' → unmounted.
 * Something that mounts already open (an overlay opened for the first time) still comes in from its 'enter' look.
 */
export function usePresence(open, ms = 240) {
  const [state, setState] = useState(open ? 'enter' : 'closed');
  useEffect(() => {
    if (open) {
      setState((cur) => (cur === 'open' ? cur : 'enter'));
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setState('open')); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setState((cur) => (cur === 'closed' ? cur : 'exit'));
    const t = setTimeout(() => setState('closed'), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return { mounted: state !== 'closed', state };
}

// ------------------------------------------------------------------ scroll lock & focus
/** A modal layer: the page under it stops scrolling, and its moving art rests (see pageCover). */
let locks = 0;
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined;
    if (locks++ === 0) document.documentElement.style.overflow = 'hidden';
    const leave = pageCover.enter();
    return () => { leave(); if (--locks === 0) document.documentElement.style.overflow = ''; };
  }, [active]);
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"]),[contenteditable="true"]';
function useFocusTrap(ref, active, initial) {
  useEffect(() => {
    if (!active) return undefined;
    const prev = document.activeElement;
    const el = ref.current;
    const first = () => (initial?.current ?? el?.querySelector('[data-autofocus]') ?? el);
    const id = requestAnimationFrame(() => first()?.focus({ preventScroll: true }));
    const onKey = (e) => {
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const a = items[0], b = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); b.focus(); }
      else if (!e.shiftKey && document.activeElement === b) { e.preventDefault(); a.focus(); }
    };
    el?.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(id); el?.removeEventListener('keydown', onKey); if (prev?.focus) prev.focus({ preventScroll: true }); };
  }, [active, ref, initial]);
}

// Escape closes the topmost layer only.
const stack = [];
function useEscape(active, onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return undefined;
    const token = {};
    stack.push(token);
    const onKey = (e) => { if (e.key === 'Escape' && stack[stack.length - 1] === token) { e.stopPropagation(); ref.current?.(); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); stack.splice(stack.indexOf(token), 1); };
  }, [active]);
}

// ------------------------------------------------------------------ anchored floating elements
/** Position `floating` next to `anchor` (fixed), flipping when there is no room. */
export function useAnchored(anchor, floating, { placement = 'bottom-start', offset = 8, active, matchWidth = false }) {
  const place = useCallback(() => {
    const a = anchor?.current ?? anchor, f = floating.current;
    if (!a || !f || !a.getBoundingClientRect) return;
    const r = a.getBoundingClientRect(), vw = innerWidth, vh = innerHeight, pad = 10;
    if (matchWidth) f.style.minWidth = `${r.width}px`;
    const fw = f.offsetWidth, fh = f.offsetHeight;
    const [side, align = 'center'] = placement.split('-');
    let top, left;
    if (side === 'bottom' || side === 'top') {
      const below = r.bottom + offset, above = r.top - offset - fh;
      top = side === 'bottom' ? (below + fh > vh - pad && above > pad ? above : below) : (above < pad && below + fh < vh - pad ? below : above);
      left = align === 'start' ? r.left : align === 'end' ? r.right - fw : r.left + r.width / 2 - fw / 2;
      f.dataset.side = top < r.top ? 'top' : 'bottom';
    } else {
      left = side === 'right' ? r.right + offset : r.left - offset - fw;
      top = r.top + r.height / 2 - fh / 2;
      f.dataset.side = side;
    }
    left = Math.max(pad, Math.min(left, vw - fw - pad));
    top = Math.max(pad, Math.min(top, vh - fh - pad));
    f.style.left = `${Math.round(left)}px`;
    f.style.top = `${Math.round(top)}px`;
    f.style.setProperty('--origin-x', `${Math.round(r.left + r.width / 2 - left)}px`);
  }, [anchor, floating, placement, offset, matchWidth]);
  useLayoutEffect(() => {
    if (!active) return undefined;
    place();
    const ro = new ResizeObserver(place);
    if (floating.current) ro.observe(floating.current);
    addEventListener('resize', place);
    addEventListener('scroll', place, true);
    return () => { ro.disconnect(); removeEventListener('resize', place); removeEventListener('scroll', place, true); };
  }, [active, place, floating]);
  return place;
}

/**
 * A floating panel anchored to an element. Closes on outside press and Escape.
 * anchor: a ref (or element) the panel attaches to.
 */
export function Popover({ open, onClose, anchor, placement = 'bottom-end', offset = 10, className, children, matchWidth, label, trapFocus = true, keepAnchorClicks = true }) {
  const ref = useRef(null);
  const { mounted, state } = usePresence(open, 200);
  useAnchored(anchor, ref, { placement, offset, active: mounted, matchWidth });
  useEscape(open, onClose);
  useFocusTrap(ref, open && trapFocus);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const a = anchor?.current ?? anchor;
      if (ref.current?.contains(e.target)) return;
      if (keepAnchorClicks && a?.contains?.(e.target)) return;
      if (e.target.closest?.('[data-layer-keep]')) return;
      onClose?.();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open, onClose, anchor, keepAnchorClicks]);
  if (!mounted) return null;
  return (
    <Portal>
      <div ref={ref} className={`${s.popover} ${className ?? ''}`} data-state={state} role="dialog" aria-label={label}>
        {children}
      </div>
    </Portal>
  );
}

/**
 * A centred dialog over a soft scrim. `bare` hands the whole surface to the children (for dialogs with their own
 * layout); give those a `label`.
 */
export function Dialog({ open, onClose, title, label, children, footer, size = 'md', className, scrimClassName, initialFocus, dismissible = true, bare }) {
  const t = useT();
  const ref = useRef(null);
  const titleId = useId();
  const { mounted, state } = usePresence(open, 260);
  useScrollLock(mounted);
  useEscape(open && dismissible, onClose);
  useFocusTrap(ref, open, initialFocus);
  if (!mounted) return null;
  return (
    <Portal>
      <div className={s.layer} data-state={state}>
        <div className={`${s.scrim} ${scrimClassName ?? ''}`} onPointerDown={dismissible ? onClose : undefined} />
        <div ref={ref} className={`${s.dialog} ${s[`size_${size}`]} ${className ?? ''}`} role="dialog" aria-modal="true"
          aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : label} tabIndex={-1}>
          {bare ? children : (
            <>
              {title != null && (
                <header className={s.dialogHead}>
                  <h2 id={titleId} className={s.dialogTitle}>{title}</h2>
                  <button type="button" className={s.close} onClick={onClose} aria-label={t('common.close')}><Icon name="close" size={18} /></button>
                </header>
              )}
              <div className={s.dialogBody}>{children}</div>
              {footer && <footer className={s.dialogFoot}>{footer}</footer>}
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

/** A full-height working surface that rises over the page (export, sync). */
export function Sheet({ open, onClose, children, label, className }) {
  const ref = useRef(null);
  const { mounted, state } = usePresence(open, 420);
  useScrollLock(mounted);
  useEscape(open, onClose);
  useFocusTrap(ref, open);
  if (!mounted) return null;
  return (
    <Portal>
      <div className={s.layer} data-state={state}>
        <div className={`${s.scrim} ${s.sheetScrim}`} onPointerDown={onClose} />
        <div ref={ref} className={`${s.sheet} ${className ?? ''}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
          {children}
        </div>
      </div>
    </Portal>
  );
}

/** Hover / focus label. Wraps a single element (which must forward refs and DOM handlers). */
export function Tooltip({ label, children, placement = 'bottom', delay = 420, disabled }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const tip = useRef(null);
  const timer = useRef(0);
  const id = useId();
  const { mounted, state } = usePresence(open && !disabled && !!label, 140);
  useAnchored(anchor, tip, { placement: `${placement}-center`, offset: 8, active: mounted });
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(true), delay); };
  const hide = () => { clearTimeout(timer.current); setOpen(false); };
  // keep the child's own ref working alongside ours
  const childRef = children.props.ref;
  const setRef = useCallback((el) => {
    anchor.current = el;
    if (typeof childRef === 'function') childRef(el);
    else if (childRef) childRef.current = el;
  }, [childRef]);
  const child = cloneElement(children, {
    ref: setRef,
    'aria-describedby': mounted ? id : undefined,
    onPointerEnter: (e) => { children.props.onPointerEnter?.(e); if (e.pointerType === 'mouse') show(); },
    onPointerLeave: (e) => { children.props.onPointerLeave?.(e); hide(); },
    onPointerDown: (e) => { children.props.onPointerDown?.(e); hide(); },
    onFocus: (e) => { children.props.onFocus?.(e); if (e.target.matches(':focus-visible')) show(); },
    onBlur: (e) => { children.props.onBlur?.(e); hide(); },
  });
  return (
    <>
      {child}
      {mounted && <Portal><div ref={tip} id={id} role="tooltip" className={s.tooltip} data-state={state}>{label}</div></Portal>}
    </>
  );
}

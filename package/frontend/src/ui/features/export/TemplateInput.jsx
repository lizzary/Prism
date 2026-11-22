// The file-name template editor.
// Text is typed freely (characters a file name cannot hold are refused); keys are atomic chips placed at the caret.
// A chip goes away with one Backspace / Delete, or with Enter once selected. "/" and "\" start a new folder —
// except in a `pathless` template, which names a file and nothing more (and offers only data keys).
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { exportActions } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Popover } from '../../components/overlay.jsx';
import s from './TemplateInput.module.css';

const isSep = (c) => c === '/' || c === '\\';
const toAtoms = (tokens) => tokens.flatMap((tk) => (tk.type === 'text' ? [...tk.text].map((c) => ({ t: 'c', c })) : [{ t: 'k', key: tk }]));
function toTokens(atoms) {
  const out = [];
  for (const a of atoms) {
    if (a.t === 'k') out.push(a.key);
    else if (out.length && out[out.length - 1].type === 'text') out[out.length - 1] = { type: 'text', text: out[out.length - 1].text + a.c };
    else out.push({ type: 'text', text: a.c });
  }
  return out;
}

/** Label of a key token from the catalog (a quiet placeholder until the catalog is in). */
export function keyLabel(catalog, tk) {
  if (!catalog) return '…';
  for (const g of tk.kind === 'agg' ? catalog.agg : catalog.data) {
    const k = g.keys.find((x) => x.id === tk.id);
    if (k) return k.label;
  }
  return tk.id;
}

export function TemplateInput({ value, onChange, catalog, prefix, suffix, invalid, pathless = false, label }) {
  const t = useT();
  const atoms = useMemo(() => toAtoms(value), [value]);
  const [sel, setSel] = useState({ a: atoms.length, f: atoms.length });
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [compose, setCompose] = useState('');
  const [shake, setShake] = useState(0);
  const [refused, setRefused] = useState(false);
  const field = useRef(null);
  const line = useRef(null);
  const caret = useRef(null);
  const ta = useRef(null);
  const composing = useRef(false);
  const history = useRef({ past: [], future: [], at: 0 });
  const dragFrom = useRef(null);

  const lo = Math.min(sel.a, sel.f), hi = Math.max(sel.a, sel.f);

  // ---------------------------------------------------------------- edits
  const commit = useCallback((next, caretAt, coalesce = false) => {
    const h = history.current, now = Date.now();
    if (!(coalesce && now - h.at < 700)) { h.past.push({ atoms, sel }); if (h.past.length > 100) h.past.shift(); }
    h.at = now;
    h.future = [];
    onChange(toTokens(next));
    setSel({ a: caretAt, f: caretAt });
  }, [atoms, sel, onChange]);

  const insert = (newAtoms, coalesce) => commit([...atoms.slice(0, lo), ...newAtoms, ...atoms.slice(hi)], lo + newAtoms.length, coalesce);
  const insertText = (raw) => {
    const clean = raw.replace(/[\r\n\t]+/g, ' ');
    const { text, removed } = exportActions.filterText(clean, { pathless });
    if (removed) { setShake((x) => x + 1); setRefused(true); }
    if (text) insert([...text].map((c) => ({ t: 'c', c })), true);
  };
  const insertKey = (tk) => { insert([{ t: 'k', key: tk }]); ta.current?.focus(); };
  const removeRange = (a, b) => commit([...atoms.slice(0, a), ...atoms.slice(b)], a);
  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push({ atoms, sel });
    onChange(toTokens(prev.atoms)); setSel(prev.sel);
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push({ atoms, sel });
    onChange(toTokens(next.atoms)); setSel(next.sel);
  };
  useEffect(() => { if (!refused) return undefined; const id = setTimeout(() => setRefused(false), 2600); return () => clearTimeout(id); }, [refused, shake]);
  // keep the caret inside the value when it changes from outside
  useEffect(() => { setSel((cur) => ({ a: Math.min(cur.a, atoms.length), f: Math.min(cur.f, atoms.length) })); }, [atoms.length]);

  // ---------------------------------------------------------------- keyboard
  const onKeyDown = (e) => {
    if (composing.current || e.nativeEvent.isComposing) return;
    const mod = e.ctrlKey || e.metaKey;
    const move = (to, extend) => setSel((cur) => ({ a: extend ? cur.a : to, f: to }));
    switch (e.key) {
      case 'Backspace':
        e.preventDefault();
        if (hi > lo) removeRange(lo, hi); else if (lo > 0) removeRange(mod ? 0 : lo - 1, lo);
        break;
      case 'Delete':
        e.preventDefault();
        if (hi > lo) removeRange(lo, hi); else if (lo < atoms.length) removeRange(lo, lo + 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (hi - lo === 1 && atoms[lo]?.t === 'k') removeRange(lo, hi);
        break;
      case 'ArrowLeft': e.preventDefault(); move(e.shiftKey ? Math.max(0, sel.f - 1) : hi > lo ? lo : Math.max(0, lo - 1), e.shiftKey); break;
      case 'ArrowRight': e.preventDefault(); move(e.shiftKey ? Math.min(atoms.length, sel.f + 1) : hi > lo ? hi : Math.min(atoms.length, hi + 1), e.shiftKey); break;
      case 'Home': case 'ArrowUp': e.preventDefault(); move(0, e.shiftKey); break;
      case 'End': case 'ArrowDown': e.preventDefault(); move(atoms.length, e.shiftKey); break;
      case 'Escape': if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); } break;
      default:
        if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); setSel({ a: 0, f: atoms.length }); }
        else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
        else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    }
  };
  const plain = (a, b) => atoms.slice(a, b).map((x) => (x.t === 'c' ? x.c : `{${keyLabel(catalog, x.key)}}`)).join('');

  // ---------------------------------------------------------------- pointer → caret
  const indexAt = (x, y) => {
    const els = [...line.current.querySelectorAll('[data-i]')];
    if (!els.length) return 0;
    let best = null;
    for (const el of els) {
      const r = el.getBoundingClientRect();
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const score = dy * 1000 + dx;
      if (!best || score < best.score) best = { score, i: +el.dataset.i, r };
    }
    return x > best.r.left + best.r.width / 2 ? best.i + 1 : best.i;
  };
  const onPointerDown = (e) => {
    if (e.button !== 0) return;
    if (e.target.closest('[data-remove]')) return;
    e.preventDefault();
    ta.current.focus();
    setOpen(true);
    const chip = e.target.closest('[data-chip]');
    if (chip) { const i = +chip.dataset.i; setSel({ a: i, f: i + 1 }); return; }
    const i = indexAt(e.clientX, e.clientY);
    setSel((cur) => ({ a: e.shiftKey ? cur.a : i, f: i }));
    dragFrom.current = e.shiftKey ? sel.a : i;
    field.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => { if (dragFrom.current != null && e.buttons) setSel({ a: dragFrom.current, f: indexAt(e.clientX, e.clientY) }); };
  const onPointerUp = () => { dragFrom.current = null; };
  const onDoubleClick = (e) => {
    const i = indexAt(e.clientX, e.clientY);
    let a = Math.min(i, atoms.length - 1), b = a + 1;
    if (atoms[a]?.t !== 'c' || isSep(atoms[a].c)) return;
    while (a > 0 && atoms[a - 1].t === 'c' && !isSep(atoms[a - 1].c)) a--;
    while (b < atoms.length && atoms[b].t === 'c' && !isSep(atoms[b].c)) b++;
    setSel({ a, f: b });
  };

  // ---------------------------------------------------------------- caret placement
  useLayoutEffect(() => {
    const ln = line.current, cr = caret.current;
    if (!ln || !cr) return;
    // the caret is centred on the atom it stands beside (text or chip), so it always sits on the text line
    const base = ln.getBoundingClientRect();
    const CARET = 20, LINE = 32;
    let x = 0, mid = LINE / 2;
    const at = (el, right) => { const r = el.getBoundingClientRect(); x = (right ? r.right : r.left) - base.left; mid = r.top + r.height / 2 - base.top; };
    const comp = ln.querySelector('[data-compose]');
    if (comp) at(comp, true);
    else if (sel.f < atoms.length) at(ln.querySelector(`[data-i="${sel.f}"]`), false);
    else if (atoms.length) at(ln.querySelector(`[data-i="${atoms.length - 1}"]`), true);
    cr.style.transform = `translate(${Math.round(x)}px, ${Math.round(mid - CARET / 2)}px)`;
    ta.current.style.transform = `translate(${Math.round(x)}px, ${Math.round(mid - LINE / 2)}px)`;
  });

  const remove = (i) => removeRange(i, i + 1);
  return (
    <div className={s.wrap}>
      <div
        ref={field}
        className={`${s.field} ${focused ? s.focused : ''} ${invalid ? s.invalid : ''}`}
        data-shake={shake ? (shake % 2 ? 'a' : 'b') : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {prefix && <span className={s.prefix}><Icon name="folder" size={15} />{prefix}<span className={s.prefixSep}>\</span></span>}
        <div ref={line} className={s.line}>
          {atoms.map((a, i) => {
            const on = i >= lo && i < hi;
            if (a.t === 'c') return <span key={i} data-i={i} className={`${s.ch} ${isSep(a.c) ? s.sep : ''} ${on ? s.selCh : ''}`}>{a.c === ' ' ? ' ' : a.c}</span>;
            return (
              <span key={i} data-i={i} data-chip="" className={`${s.chip} ${a.key.kind === 'agg' ? s.agg : s.data} ${on ? s.chipOn : ''}`}>
                <Icon name={a.key.kind === 'agg' ? 'layers' : 'hash'} size={12} />
                {keyLabel(catalog, a.key)}
                <button type="button" data-remove="" tabIndex={-1} className={s.chipX} aria-label={t('common.remove')} onPointerDown={(e) => { e.preventDefault(); remove(i); }}>
                  <Icon name="close" size={11} stroke={2} />
                </button>
              </span>
            );
          })}
          {compose && <span data-compose="" className={s.compose}>{compose}</span>}
          <span ref={caret} className={s.caret} data-visible={focused && hi === lo} key={`${sel.f}-${atoms.length}`} />
          <textarea
            ref={ta}
            className={s.ta}
            rows={1}
            spellCheck={false}
            autoComplete="off"
            aria-label={label ?? t('export.fileName')}
            onFocus={() => { setFocused(true); setOpen(true); }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            onInput={(e) => { if (composing.current) return; const v = e.currentTarget.value; e.currentTarget.value = ''; if (v) insertText(v); }}
            onCompositionStart={() => { composing.current = true; }}
            onCompositionUpdate={(e) => setCompose(e.data)}
            onCompositionEnd={(e) => { composing.current = false; setCompose(''); e.currentTarget.value = ''; if (e.data) insertText(e.data); }}
            onPaste={(e) => { e.preventDefault(); insertText(e.clipboardData.getData('text')); }}
            onCopy={(e) => { if (hi > lo) { e.preventDefault(); e.clipboardData.setData('text/plain', plain(lo, hi)); } }}
            onCut={(e) => { if (hi > lo) { e.preventDefault(); e.clipboardData.setData('text/plain', plain(lo, hi)); removeRange(lo, hi); } }}
          />
        </div>
        {suffix && <span className={s.suffix}>{suffix}</span>}
      </div>
      {refused && <div className={s.refused} role="status"><Icon name="alert" size={14} />{t(pathless ? 'export.illegalName' : 'export.illegal')}</div>}
      <Popover open={open} onClose={() => setOpen(false)} anchor={field} placement="bottom-start" offset={8} trapFocus={false} label={label ?? t('export.fileName')}
        className={`${s.pop} ${pathless ? s.popSingle : ''}`}>
        <KeyPicker catalog={catalog} onPick={insertKey} dataOnly={pathless} />
      </Popover>
    </div>
  );
}

/** Grouping keys on the left, data keys on the right (data keys only for a file name). Clicking never takes focus from the editor. */
function KeyPicker({ catalog, onPick, dataOnly }) {
  const t = useT();
  if (!catalog) return <div className={s.picker} />;
  const keep = (e) => e.preventDefault();
  const column = (kind) => (
    <div className={s.col}>
      <div className={s.colHead}><Icon name={kind === 'agg' ? 'layers' : 'hash'} size={15} />{t(kind === 'agg' ? 'export.aggKeys' : 'export.dataKeys')}</div>
      {catalog[kind].map((g) => (
        <div key={g.id} className={s.group}>
          <div className={s.groupName}>{g.label}</div>
          <div className={s.keys}>
            {g.keys.map((k) => (
              <button key={k.id} type="button" className={`${s.key} ${kind === 'agg' ? s.agg : s.data}`} onPointerDown={keep}
                onClick={() => onPick({ type: 'key', kind, id: k.id })}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div className={`${s.picker} ${dataOnly ? s.pickerSingle : ''}`} onPointerDown={keep}>
      {!dataOnly && column('agg')}
      {column('data')}
    </div>
  );
}

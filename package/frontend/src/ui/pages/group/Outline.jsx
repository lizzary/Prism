// The colour groups of a group's page as a list beside its files — for when there are many of them.
// Finding: type (G puts the cursor here), ↑ ↓ and Enter, or press a row — the page goes there. The ones on screen sit
// in a soft window that follows the page as it scrolls.
// Ordering: drag rows to a new place — several at once, chosen with Ctrl or Shift; Alt ↑ ↓ moves them a step (past
// the next one on show), Alt Shift ↑ ↓ to the very top or bottom; chosen ones go to the top or bottom in one press;
// or sort them all by name, size or colour. A change is the page's at once (and the bigger ones can be undone).
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { browsing, colorOrder } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { useListDrag } from '../../lib/useListDrag.js';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton } from '../../components/controls.jsx';
import { Menu } from '../../components/menu.jsx';
import { Portal, Tooltip } from '../../components/overlay.jsx';
import s from './Outline.module.css';

const { NONE } = browsing;
const toggled = (list, key, on) => (on ? [...new Set([...list, key])] : list.filter((k) => k !== key));

/**
 * sections: the page's sections (domain/arrange.js `sections`); seen: the colour groups on screen; view / setView:
 * folding; onJump(key): bring it into view; onOrder(order: [colour group id], note?: a toast to show with Undo);
 * onClose(); focusAt: a moment to put the cursor in the find field.
 */
export function Outline({ sections, seen, view, setView, onJump, onOrder, onClose, focusAt }) {
  const t = useT();
  const fmt = useFormat();
  const uid = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(null);             // the row the keyboard is on
  const [chosen, setChosen] = useState(() => new Set());   // rows chosen together (Ctrl / Shift)
  const [moved, setMoved] = useState(null);               // the rows that just moved: { ids, at } — they glint once
  const [sorting, setSorting] = useState(false);
  const [win, setWin] = useState(null);                   // the window behind the rows on screen: { top, height }
  const field = useRef(null);
  const list = useRef(null);
  const ghost = useRef(null);
  const sortBtn = useRef(null);
  const anchor = useRef(null);                            // where a Shift range starts
  const busy = useRef(false);                             // the pointer is over the list: it holds still meanwhile

  const groups = useMemo(() => sections.filter((x) => x.key !== NONE).map((x) => ({
    id: x.key, name: x.color?.name ?? '', color: x.color?.color ?? 'var(--ink-3)', count: x.total, folded: x.collapsed,
  })), [sections]);
  const none = sections.find((x) => x.key === NONE) ?? null;
  const order = useMemo(() => groups.map((g) => g.id), [groups]);
  const q = query.trim();
  const shown = useMemo(() => (q ? groups.filter((g) => colorOrder.findInName(g.name, q).length > 0) : groups), [groups, q]);
  const shownIds = useMemo(() => shown.map((g) => g.id), [shown]);
  const noneName = t('group.colors.noColor');
  const noneShown = !!none && (!q || colorOrder.findInName(noneName, q).length > 0);
  const lit = new Set(seen);

  // chosen rows that are gone (deleted, another configuration) are let go
  useEffect(() => {
    setChosen((cur) => { const kept = [...cur].filter((x) => order.includes(x)); return kept.length === cur.size ? cur : new Set(kept); });
  }, [order]);
  useEffect(() => { if (focusAt) { field.current?.focus(); field.current?.select(); } }, [focusAt]);
  useEffect(() => {
    if (!moved) return undefined;
    const id = setTimeout(() => setMoved(null), 1400);
    return () => clearTimeout(id);
  }, [moved]);

  /** A new order for the page; the rows that moved glint where they landed. */
  const place = (ids, next, note) => {
    if (next.join() === order.join()) return;
    onOrder(next, note);
    if (ids) setMoved({ ids: new Set(ids), at: Date.now() });
  };
  const chosenInOrder = () => order.filter((x) => chosen.has(x));
  const movingFor = (id) => (chosen.has(id) ? chosenInOrder() : [id]);

  const drag = useListDrag({ listRef: list, ghostRef: ghost, onDrop: (ids, to) => place(ids, colorOrder.moveTogether(order, ids, to)) });
  const moving = new Set(drag.drag?.ids ?? []);

  // ------------------------------------------------------------------ pressing a row
  const press = (e, id) => {
    if (e.metaKey || e.ctrlKey) {
      setChosen((cur) => { const n = new Set(cur); if (n.has(id)) n.delete(id); else n.add(id); return n; });
      anchor.current = id;
      return;
    }
    if (e.shiftKey) {
      const from = anchor.current && shownIds.includes(anchor.current) ? anchor.current : id;
      const i = shownIds.indexOf(from), j = shownIds.indexOf(id);
      setChosen((cur) => new Set([...cur, ...shownIds.slice(Math.min(i, j), Math.max(i, j) + 1)]));
      anchor.current = id;
      return;
    }
    anchor.current = id;
    setChosen(new Set());
    setActive(id);
    onJump(id);
  };
  const fold = (id, solo) => {
    const all = sections.map((x) => x.key);
    if (solo) setView({ collapsed: all.filter((k) => k !== id) });
    else setView({ collapsed: toggled(view.collapsed, id, !view.collapsed.includes(id)) });
  };

  // ------------------------------------------------------------------ keys, in the find field
  const onKey = (e) => {
    const pool = shownIds;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const id = active && pool.includes(active) ? active : chosen.size ? chosenInOrder()[0] : null;
      if (!id) return;
      const ids = movingFor(id);
      const up = e.key === 'ArrowUp';
      if (e.shiftKey) place(ids, colorOrder.moveTogether(order, ids, up ? 'top' : 'bottom'), t(up ? 'group.outline.movedTop' : 'group.outline.movedBottom', { n: fmt.number(ids.length), count: ids.length }));
      else place(ids, colorOrder.stepTogether(order, ids, up ? -1 : 1, pool));
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!pool.length) return;
      const i = pool.indexOf(active);
      const k = i < 0 ? (e.key === 'ArrowDown' ? 0 : pool.length - 1) : Math.max(0, Math.min(pool.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
      setActive(pool[k]);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const id = active && pool.includes(active) ? active : pool[0] ?? (noneShown ? NONE : null);
      if (id) { setActive(id); onJump(id); }
      return;
    }
    if (e.key === ' ' && (e.ctrlKey || e.metaKey) && active) {
      e.preventDefault();
      setChosen((cur) => { const n = new Set(cur); if (n.has(active)) n.delete(active); else n.add(active); return n; });
      return;
    }
    if (e.key === 'Escape') {
      if (query) { e.preventDefault(); e.stopPropagation(); setQuery(''); return; }
      if (chosen.size) { e.preventDefault(); e.stopPropagation(); setChosen(new Set()); return; }
      field.current?.blur();
    }
  };
  // the row the keyboard is on stays in sight
  useLayoutEffect(() => {
    if (!active) return;
    list.current?.querySelector(`[data-row="${CSS.escape(active)}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // ------------------------------------------------------------------ the window over the rows on screen, following the page
  const seenSig = seen.join('|');
  const shownSig = `${shownIds.join('|')}#${noneShown}`;
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const rows = [...el.querySelectorAll('[data-row]')].filter((r) => lit.has(r.dataset.row));
    if (!rows.length) { setWin(null); return; }
    const a = rows[0], b = rows[rows.length - 1];
    const w = { top: a.offsetTop - 2, height: b.offsetTop + b.offsetHeight - a.offsetTop + 4 };
    setWin(w);
    // the list follows the page — unless it is being looked through, searched or dragged in
    if (busy.current || q || drag.drag) return;
    if (w.top < el.scrollTop + 6 || w.top + w.height > el.scrollTop + el.clientHeight - 6) {
      el.scrollTo({ top: w.height > el.clientHeight - 24 ? w.top - 10 : w.top + w.height / 2 - el.clientHeight / 2, behavior: 'smooth' });
    }
  }, [seenSig, shownSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ sorting all of them
  const sortItems = colorOrder.COLOR_SORTS.map((by) => ({
    key: by, label: t(`group.outline.sorts.${by}`), icon: by === 'color' ? 'palette' : by.endsWith('desc') || by === 'count' ? 'sort-desc' : 'sort-asc',
    onSelect: () => place(null, colorOrder.sortColorGroups(groups, by, Object.fromEntries(groups.map((g) => [g.id, g.count]))), t('group.outline.sorted', { how: t(`group.outline.sorts.${by}`) })),
  }));

  const n = chosen.size;
  const rowId = (id) => `${uid}-${id}`;
  const first = drag.drag ? groups.find((g) => g.id === drag.drag.ids[0]) : null;

  return (
    <aside className={s.outline} aria-label={t('group.outline.title')}>
      <div className={s.head}>
        <label className={s.find}>
          <Icon name="search" size={15} className={s.findIcon} />
          <input ref={field} value={query} onChange={(e) => { setQuery(e.target.value); setActive(null); }} onKeyDown={onKey}
            placeholder={t('group.outline.find')} spellCheck={false} autoComplete="off" aria-keyshortcuts="G"
            role="combobox" aria-expanded="true" aria-controls={`${uid}-list`} aria-activedescendant={active ? rowId(active) : undefined} />
          {/* G brings the cursor here from anywhere on the page: shown while the field is empty, focused or not, so a
              list opened from the toolbar shows its key at once */}
          {query
            ? <button type="button" className={s.clear} onClick={() => { setQuery(''); field.current?.focus(); }} aria-label={t('common.clear')}><Icon name="close" size={13} /></button>
            : <kbd className={s.kbd} aria-hidden="true">G</kbd>}
        </label>
        <IconButton size="sm" icon="close" label={t('group.outline.close')} onClick={onClose} />
      </div>
      <div className={s.sub}>
        <span className={`${s.total} num`}>
          {q ? t('group.outline.found', { n: fmt.number(shown.length), total: fmt.number(groups.length) }) : t('group.outline.total', { n: fmt.number(groups.length), count: groups.length })}
        </span>
        <button ref={sortBtn} type="button" className={s.sortBtn} aria-expanded={sorting} onClick={() => setSorting((o) => !o)} disabled={groups.length < 2}>
          <Icon name="sort" size={14} />{t('group.outline.sort')}
        </button>
      </div>

      <div ref={list} id={`${uid}-list`} className={s.list} role="listbox" aria-multiselectable="true" aria-label={t('group.outline.title')}
        data-dragging={drag.drag ? '' : undefined} onPointerEnter={() => { busy.current = true; }} onPointerLeave={() => { busy.current = false; }}>
        <span className={s.win} data-on={win ? '' : undefined} style={win ? { transform: `translateY(${win.top}px)`, height: win.height } : undefined} aria-hidden="true" />
        {shown.map((g) => (
          <div key={g.id} id={rowId(g.id)} data-row={g.id} role="option" aria-selected={chosen.has(g.id)} className={s.row} style={{ '--c': g.color }}
            data-active={active === g.id || undefined} data-chosen={chosen.has(g.id) || undefined} data-in={lit.has(g.id) || undefined}
            data-folded={g.folded || undefined} data-moving={moving.has(g.id) || undefined} data-moved={(moved?.ids.has(g.id) && moved.at) || undefined}
            onPointerDown={(e) => { if (!e.target.closest('button')) drag.begin(e, movingFor(g.id)); }} onClick={(e) => press(e, g.id)}>
            <Icon name="grip" size={13} className={s.grip} />
            <i className={s.dot} />
            <span className={s.name}><Marked text={g.name} query={q} /></span>
            <span className={`${s.count} num`}>{fmt.number(g.count)}</span>
            <FoldButton folded={g.folded} onFold={(solo) => fold(g.id, solo)} />
          </div>
        ))}
        {noneShown && (
          <div id={rowId(NONE)} data-row={NONE} data-fixed="" role="option" aria-selected={false} className={`${s.row} ${s.noneRow}`}
            data-active={active === NONE || undefined} data-in={lit.has(NONE) || undefined} data-folded={none.collapsed || undefined}
            onClick={() => { setActive(NONE); onJump(NONE); }}>
            <i className={s.dot} />
            <span className={s.name}><Marked text={noneName} query={q} /></span>
            <span className={`${s.count} num`}>{fmt.number(none.total)}</span>
            <FoldButton folded={none.collapsed} onFold={(solo) => fold(NONE, solo)} />
          </div>
        )}
        {q && !shown.length && !noneShown && <p className={s.nothing}>{t('group.outline.nothing', { q })}</p>}
        {drag.drag && <span className={s.line} style={{ transform: `translateY(${drag.drag.line - 1}px)` }} aria-hidden="true" />}
      </div>

      {n > 0 && (
        <div className={s.chosenBar}>
          <span className={`${s.chosenCount} num`}>{t('group.outline.chosen', { n: fmt.number(n), count: n })}</span>
          <IconButton size="sm" icon="to-top" label={t('group.outline.toTop')}
            onClick={() => { const ids = chosenInOrder(); place(ids, colorOrder.moveTogether(order, ids, 'top'), t('group.outline.movedTop', { n: fmt.number(ids.length), count: ids.length })); }} />
          <IconButton size="sm" icon="to-bottom" label={t('group.outline.toBottom')}
            onClick={() => { const ids = chosenInOrder(); place(ids, colorOrder.moveTogether(order, ids, 'bottom'), t('group.outline.movedBottom', { n: fmt.number(ids.length), count: ids.length })); }} />
          <IconButton size="sm" icon="eye" label={t('group.outline.only')}
            onClick={() => setView({ collapsed: sections.map((x) => x.key).filter((k) => !chosen.has(k)) })} />
          <IconButton size="sm" icon="close" label={t('group.outline.letGo')} onClick={() => setChosen(new Set())} />
        </div>
      )}

      <Menu open={sorting} onClose={() => setSorting(false)} anchor={sortBtn} items={sortItems} label={t('group.outline.sort')} placement="bottom-end" />
      {drag.drag && first && (
        <Portal>
          <div ref={ghost} className={s.ghost} aria-hidden="true">
            <span className={s.ghostChip} style={{ '--c': first.color }}>
              <i />{first.name}
              {drag.drag.ids.length > 1 && <b className="num">+{drag.drag.ids.length - 1}</b>}
            </span>
          </div>
        </Portal>
      )}
    </aside>
  );
}

/** A name with the words being looked for picked out. */
function Marked({ text, query }) {
  const found = query ? colorOrder.findInName(text, query) : [];
  if (!found.length) return text;
  const parts = [];
  let at = 0;
  for (const [a, b] of found) {
    if (a < at) continue;
    if (a > at) parts.push(text.slice(at, a));
    parts.push(<mark key={a}>{text.slice(a, b)}</mark>);
    at = b;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

/** Fold or unfold one colour group on the page; with Alt, it alone stays open (every other one folds). */
function FoldButton({ folded, onFold }) {
  const t = useT();
  const label = folded ? t('group.section.unfold') : t('group.section.fold');
  return (
    <Tooltip label={`${label} · ${t('group.outline.soloHint')}`} delay={500}>
      <button type="button" className={s.fold} data-folded={folded || undefined} aria-label={label} aria-pressed={!folded}
        onClick={(e) => { e.stopPropagation(); onFold(e.altKey); }}>
        <Icon name="chevron-down" size={14} />
      </button>
    </Tooltip>
  );
}

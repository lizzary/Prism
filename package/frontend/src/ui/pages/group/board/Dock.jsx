// The chosen cards' dock, risen from the bottom of the whiteboard: what can be done to all of them at once, none of it
// asking twice (each can be undone from its note).
//   Tags      every tag the chosen files carry, on how many of them (a fine line fills as more do); add one to all of
//             them (files that have it already are left as they are), or take one away from all that have it; pointing
//             at a tag lights the cards that carry it
//   Note      one note for all of them, in place of theirs
//   Move to   another colour group (found by name), out of every colour group, or a new colour group with them
//   and download, re-index (what to build again), delete
import { useEffect, useMemo, useRef, useState } from 'react';
import { colorOrder, mediaUrl, useFilesSummary, useTagIndex } from '../../../../bridge/index.js';
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { Icon } from '../../../icons/Icon.jsx';
import { Button, IconButton, TextArea } from '../../../components/controls.jsx';
import { Popover, Tooltip, usePresence } from '../../../components/overlay.jsx';
import { Spinner, useToastLift } from '../../../components/feedback.jsx';
import { useReindexKinds } from '../dialogs.jsx';
import s from './Dock.module.css';

const norm = (x) => (x || '').normalize('NFKC').toLowerCase().replace(/[\s_]+/g, ' ').trim();

export function Dock({ ids, files, sections, grouped, noneName, onClear, onTagHover, onTags, onNote, onMove, onNewColor, onDownload, onReindex, onDelete, onSelectOnly }) {
  const t = useT();
  const fmt = useFormat();
  const open = ids.length > 0;
  const { mounted, state } = usePresence(open, 260);
  useToastLift(open);
  const last = useRef(ids);
  if (open) last.current = ids;
  const shown = last.current;
  const [panel, setPanel] = useState(null);
  // (set at once on closing, before the panel has gone: a row the pointer is still over must not light the board again)
  const tagsOpen = useRef(false);
  tagsOpen.current = panel === 'tags' && open;
  const lightTag = (list) => { if (tagsOpen.current || !list) onTagHover(list); };
  const refs = { tags: useRef(null), note: useRef(null), move: useRef(null), reindex: useRef(null) };
  useEffect(() => { if (!open) setPanel(null); }, [open]);
  useEffect(() => { if (panel !== 'tags') onTagHover(null); }, [panel]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mounted) return null;
  const toggle = (p) => setPanel((cur) => (cur === p ? null : p));
  const close = () => { tagsOpen.current = false; onTagHover(null); setPanel(null); };
  const peek = shown.slice(-3).map((x) => files.get(x)).filter(Boolean);
  const n = shown.length;

  const button = (key, icon, label, onClick, extra = {}) => (
    <button ref={refs[key]} type="button" className={`${s.action} ${extra.danger ? s.danger : ''}`} aria-expanded={refs[key] ? panel === key : undefined}
      data-on={panel === key || undefined} onClick={onClick ?? (() => toggle(key))}>
      <Icon name={icon} size={17} /><span>{label}</span>
    </button>
  );
  return (
    <div className={s.dock} data-state={state} data-board-chrome="" role="toolbar" aria-label={t('group.selection.count', { n: fmt.number(n), count: n })}>
      <span className={s.peek} aria-hidden="true">
        {peek.map((f, k) => <img key={f.id} src={mediaUrl(f, 'low')} alt="" draggable={false} style={{ '--k': k, '--n': peek.length }} />)}
      </span>
      <span key={n} className={`${s.count} num`}>{t('group.selection.count', { n: fmt.number(n), count: n })}</span>
      <span className={s.sep} />
      {button('tags', 'tag', t('board.dock.tags'))}
      {button('note', 'text', t('board.dock.note'))}
      {grouped && button('move', 'swatches', t('board.dock.move'))}
      <span className={s.sep} />
      {button('download', 'download', t('group.tile.download'), () => { close(); onDownload(); })}
      {button('reindex', 'reindex', t('group.tile.reindex'))}
      {button('delete', 'trash', t('group.tile.delete'), () => { close(); onDelete(); }, { danger: true })}
      <span className={s.sep} />
      <IconButton icon="close" size="sm" label={`${t('group.selection.clear')} · Esc`} className={s.close} onClick={onClear} placement="top" />

      <Popover open={panel === 'tags'} onClose={close} anchor={refs.tags} placement="top-start" offset={12} label={t('board.dock.tags')} className={s.pop}>
        <TagsPanel ids={shown} onHover={lightTag} onAdd={(label) => onTags({ add: [label] }, label)} onRemove={(x) => onTags({ remove: [x.key] }, x.label)} onSelectOnly={(list) => { close(); onSelectOnly(list); }} />
      </Popover>
      <Popover open={panel === 'note'} onClose={close} anchor={refs.note} placement="top-start" offset={12} label={t('board.dock.note')} className={s.pop}>
        <NotePanel ids={shown} onSave={(note) => { close(); onNote(note); }} />
      </Popover>
      <Popover open={panel === 'move'} onClose={close} anchor={refs.move} placement="top-start" offset={12} label={t('board.dock.move')} className={s.pop}>
        <MovePanel regions={sections} noneName={noneName} onMove={(key) => { close(); onMove(key); }} onNewColor={onNewColor && (() => { close(); onNewColor(); })} />
      </Popover>
      <Popover open={panel === 'reindex'} onClose={close} anchor={refs.reindex} placement="top-end" offset={12} label={t('group.tile.reindex')} className={s.pop}>
        <ReindexPanel open={panel === 'reindex'} n={n} onStart={(kinds) => { close(); onReindex(kinds); }} onLeave={close} />
      </Popover>
    </div>
  );
}

// ------------------------------------------------------------------ tags
function TagsPanel({ ids, onHover, onAdd, onRemove, onSelectOnly }) {
  const t = useT();
  const fmt = useFormat();
  const { data } = useFilesSummary(ids);
  const { data: index } = useTagIndex();
  const [text, setText] = useState('');
  const [hi, setHi] = useState(-1);
  const total = ids.length;
  const tags = useMemo(() => data?.tags ?? [], [data]);
  const q = norm(text);
  const shown = q ? tags.filter((x) => norm(x.label).includes(q)) : tags;
  const onAll = new Set(tags.filter((x) => x.count === total).map((x) => norm(x.label)));
  // other tags of the gallery to add, as it is typed (none the chosen files all carry already)
  const suggestions = !q ? [] : (index?.tags ?? [])
    .filter((x) => !onAll.has(norm(x.label)) && norm(x.label).includes(q))
    .sort((a, b) => (norm(b.label).startsWith(q) - norm(a.label).startsWith(q)) || b.count - a.count)
    .slice(0, 5);
  const add = (label) => { const v = label.trim().slice(0, 60); if (!v) return; setText(''); setHi(-1); onAdd(v); };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(hi >= 0 && suggestions[hi] ? suggestions[hi].label : text); }
    else if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setHi((h) => (h + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setHi((h) => (h <= 0 ? suggestions.length - 1 : h - 1)); }
  };
  return (
    <div className={s.tags}>
      <header className={s.head}>
        <span className={s.title}>{t('board.tags.title', { n: fmt.number(total), count: total })}</span>
        {data && <span className={`${s.sub} num`}>{fmt.number(tags.length)}</span>}
      </header>
      <div className={s.adder}>
        <div className={s.field}>
          <Icon name="tag" size={14} />
          <input value={text} onChange={(e) => { setText(e.target.value); setHi(-1); }} onKeyDown={onKey} placeholder={t('board.tags.add')} maxLength={60} spellCheck={false} data-autofocus="" />
          {text && <kbd className={s.enter}>Enter</kbd>}
        </div>
        {suggestions.length > 0 && (
          <ul className={s.suggest} role="listbox">
            {suggestions.map((x, i) => (
              <li key={x.key} role="option" aria-selected={i === hi} data-hi={i === hi || undefined} onPointerDown={(e) => { e.preventDefault(); add(x.label); }}>
                <Icon name="plus" size={12} /><span>{x.label}</span><span className="num">{fmt.number(x.count)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className={s.tagList} onPointerLeave={() => onHover(null)}>
        {!data ? <div className={s.wait}><Spinner size={16} /></div>
          : !shown.length ? <p className={s.none}>{q ? t('board.tags.noMatch') : t('board.tags.none')}</p>
            : shown.map((x) => (
              <div key={x.key} className={s.tag} data-source={x.source} style={{ '--p': x.count / total }} onPointerEnter={() => onHover(x.ids)}>
                {x.source !== 'model' && <Icon name="edit" size={11} className={s.pen} />}
                <span className={s.tagName}>{x.label}</span>
                <span className={`${s.tagOn} num`}>{x.count === total ? t('board.tags.all') : `${fmt.number(x.count)}/${fmt.number(total)}`}</span>
                <span className={s.tagTools}>
                  {x.count < total && (
                    <Tooltip label={t('board.tags.onlyThese', { n: fmt.number(x.count), count: x.count })} placement="top">
                      <button type="button" className={s.tagBtn} onClick={() => onSelectOnly(x.ids)} aria-label={t('board.tags.onlyThese', { n: x.count, count: x.count })}><Icon name="check-square" size={13} /></button>
                    </Tooltip>
                  )}
                  {x.count < total && (
                    <Tooltip label={t('board.tags.addAll')} placement="top">
                      <button type="button" className={s.tagBtn} onClick={() => onAdd(x.label)} aria-label={t('board.tags.addAll')}><Icon name="plus" size={13} /></button>
                    </Tooltip>
                  )}
                  <Tooltip label={t('board.tags.removeAll', { n: fmt.number(x.count), count: x.count })} placement="top">
                    <button type="button" className={`${s.tagBtn} ${s.tagRemove}`} onClick={() => onRemove(x)} aria-label={t('board.tags.removeAll', { n: x.count, count: x.count })}><Icon name="close" size={12} stroke={2} /></button>
                  </Tooltip>
                </span>
              </div>
            ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ note
function NotePanel({ ids, onSave }) {
  const t = useT();
  const fmt = useFormat();
  const { data } = useFilesSummary(ids);
  const [text, setText] = useState(null);
  useEffect(() => { if (data && text == null) setText(data.notes.common ?? ''); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = ids.length;
  const notes = data?.notes;
  const state = !notes ? null
    : notes.distinct > 1 ? t('board.note.differ', { n: fmt.number(notes.distinct) })
      : notes.written && notes.written < total ? t('board.note.some', { n: fmt.number(notes.written), total: fmt.number(total) }) : null;
  const value = text ?? '';
  const clearing = !value.trim() && !!notes?.written;
  const save = () => { if (value.trim() || clearing) onSave(value.trim()); };
  return (
    <div className={s.note}>
      <header className={s.head}><span className={s.title}>{t('board.note.title', { n: fmt.number(total), count: total })}</span></header>
      {!data ? <div className={s.wait}><Spinner size={16} /></div> : (
        <>
          <TextArea value={value} onChange={(e) => setText(e.target.value)} placeholder={t('details.notePlaceholder')} maxLength={4000} className={s.noteInput} data-autofocus=""
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); } }} />
          <footer className={s.foot}>
            <span className={s.state}>{state}</span>
            <Button variant={clearing ? 'secondary' : 'primary'} size="sm" icon={clearing ? 'close' : 'check'} disabled={!value.trim() && !clearing} onClick={save}>
              {clearing ? t('board.note.clear', { n: fmt.number(notes.written), count: notes.written }) : t('board.note.save', { n: fmt.number(total), count: total })}
            </Button>
          </footer>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ move to
function MovePanel({ regions, noneName, onMove, onNewColor }) {
  const t = useT();
  const fmt = useFormat();
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0);
  const list = useRef(null);
  const q = query.trim();
  const name = (r) => (r.none ? noneName : r.name);
  const rows = regions.filter((r) => !q || colorOrder.findInName(name(r), q).length);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { list.current?.querySelector('[data-hi]')?.scrollIntoView({ block: 'nearest' }); }, [hi]);
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(rows.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter' && rows[hi]) { e.preventDefault(); onMove(rows[hi].key); }
  };
  return (
    <div className={s.move}>
      <div className={s.field}>
        <Icon name="search" size={14} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey} placeholder={t('group.outline.find')} spellCheck={false} data-autofocus="" />
      </div>
      {onNewColor && !q && (
        <button type="button" className={s.newColor} onClick={onNewColor}><span className={s.newDot}><Icon name="plus" size={11} stroke={2.2} /></span>{t('board.newFrom')}</button>
      )}
      <ul ref={list} className={s.moveList} role="listbox">
        {rows.map((r, i) => (
          <li key={r.key} role="option" aria-selected={i === hi} data-hi={i === hi || undefined} data-none={r.none || undefined} style={{ '--c': r.color ?? 'var(--ink-3)' }}
            onPointerEnter={() => setHi(i)} onClick={() => onMove(r.key)}>
            <i />
            <span className={s.moveName}>{name(r)}</span>
            <span className={`${s.moveCount} num`}>{fmt.number(r.n)}</span>
          </li>
        ))}
        {!rows.length && <li className={s.none}>{t('group.outline.nothing', { q })}</li>}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ re-index
function ReindexPanel({ open, n, onStart, onLeave }) {
  const t = useT();
  const fmt = useFormat();
  const { kinds, view } = useReindexKinds(open, onLeave);
  return (
    <div className={s.reindex}>
      <header className={s.head}><span className={s.title}>{t('group.reindex.title', { n: fmt.number(n), count: n })}</span></header>
      {view}
      <footer className={s.foot}>
        <span />
        <Button variant="primary" size="sm" icon="reindex" disabled={!kinds.length} onClick={() => onStart(kinds)}>{t('group.reindex.start')}</Button>
      </footer>
    </div>
  );
}

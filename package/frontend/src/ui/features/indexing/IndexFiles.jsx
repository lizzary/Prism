// The index page's files. On the left the gallery's groups — each with its three rays in miniature (how far its tags,
// image index and metadata are) and what waits in it; on the right its files with their index, kind by kind, those
// that need indexing first of all. Choose files — a click; Shift for a run; a group, or all of them shown — and index
// them. Thousands of files: only the rows in sight are drawn.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { indexActions, mediaUrl, useIndexFiles, useIndexNeeds } from '../../../bridge/index.js';
import { navigate, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton, Segmented, Tick } from '../../components/controls.jsx';
import { Tooltip, usePresence } from '../../components/overlay.jsx';
import { Empty, Spinner, toast } from '../../components/feedback.jsx';
import { GroupCover } from '../../components/GroupSelector.jsx';
import { Reindex } from '../../pages/group/dialogs.jsx';
import { KIND_RAY } from './kinds.js';
import s from './IndexFiles.module.css';

const KINDS = ['tagging', 'embedding', 'metadata'];
const ROW = 44;
const norm = (x) => (x || '').normalize('NFKC').toLowerCase();
/** A callback that never changes, calling whatever was passed last (memoized rows keep working with it). */
function useStable(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}

export function IndexFiles({ overview, groupId, onGroup, focus, onFocus, onLeave, onModels }) {
  const t = useT();
  const fmt = useFormat();
  const [show, setShow] = useState(() => (overview.needs > 0 ? 'needs' : 'all'));
  const [text, setText] = useState('');
  const [selection, setSelection] = useState(() => new Set());
  const [asking, setAsking] = useState(false);
  const { data } = useIndexFiles({ groupId: groupId ?? null, show, kind: focus?.kind ?? null, state: focus?.state ?? null, text });
  const rows = useMemo(() => data?.rows ?? [], [data]);
  // every row seen, so the chosen ones can still be shown (and counted) when another filter hides them
  const seen = useRef(new Map());
  for (const r of rows) seen.current.set(r.id, r);
  // (what the list's headings show of each group — kept while names and covers stay the same)
  const groupSig = overview.groups.map((g) => `${g.id}:${g.name}:${g.cover?.id}`).join('|');
  const groups = useMemo(() => new Map(overview.groups.map((g) => [g.id, { id: g.id, name: g.name, cover: g.cover }])), [groupSig]); // eslint-disable-line react-hooks/exhaustive-deps
  const scope = groupId ? groups.get(groupId) : null;

  // what is drawn: the files, under a heading per group when every group is shown
  const items = useMemo(() => {
    if (groupId) return rows.map((r) => ({ type: 'file', row: r }));
    const out = [];
    let head = null;
    for (const r of rows) {
      if (r.groupId !== head?.id) { head = { type: 'group', id: r.groupId, ids: [] }; out.push(head); }
      head.ids.push(r.id);
      out.push({ type: 'file', row: r });
    }
    return out;
  }, [rows, groupId]);
  const shownIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // ------------------------------------------------------------------ choosing
  const anchor = useRef(null);
  const toggleMany = (ids, on) => setSelection((cur) => { const n = new Set(cur); for (const id of ids) (on ? n.add(id) : n.delete(id)); return n; });
  const clickRow = (e, id) => {
    if (e.shiftKey && anchor.current && shownIds.includes(anchor.current)) {
      const i = shownIds.indexOf(anchor.current), j = shownIds.indexOf(id);
      toggleMany(shownIds.slice(Math.min(i, j), Math.max(i, j) + 1), true);
      return;
    }
    anchor.current = id;
    toggleMany([id], !selection.has(id));
  };
  // the list and its rows only draw again when what they show changes: they reach the current handlers through these
  const onRow = useStable(clickRow);
  const onOpenRow = useStable((r) => { onLeave(); navigate(paths.file(r.groupId, r.id)); });
  const onGroupTick = useStable((g, on) => toggleMany(g.ids, on));
  const onGroupPick = useStable(onGroup);
  const showOptions = useMemo(() => [{ value: 'needs', label: t('index.show.needs') }, { value: 'all', label: t('index.show.all') }], [t]);
  const allShown = shownIds.length > 0 && shownIds.every((id) => selection.has(id));
  const someShown = shownIds.some((id) => selection.has(id));
  const clear = () => setSelection(new Set());
  const onAll = useStable(() => toggleMany(shownIds, !(shownIds.length > 0 && shownIds.every((id) => selection.has(id)))));
  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) { e.preventDefault(); toggleMany(shownIds, true); }
    else if (e.key === 'Escape' && selection.size) { e.stopPropagation(); clear(); }
  };

  // ------------------------------------------------------------------ indexing the chosen files
  const ids = useMemo(() => [...selection], [selection]);
  const needs = useIndexNeeds(asking ? ids : null);
  const start = async (kinds) => {
    const r = await indexActions.reindex(ids, kinds);
    setAsking(false);
    if (!r.ok) { if (r.error) toast(t(`tasks.errors.${r.error}`), { tone: 'warn' }); return; }
    toast(t('index.started', { n: fmt.number(ids.length), count: ids.length }), { tone: 'ok', icon: 'reindex' });
    clear();
  };

  const filtered = !!focus || !!text.trim();
  return (
    <div className={s.files} onKeyDown={onKey}>
      <Groups overview={overview} groupId={groupId} onGroup={onGroupPick} />
      <section className={s.main}>
        <header className={s.bar}>
          <div className={s.scope}>
            {scope ? <GroupCover group={scope} className={s.scopeCover} /> : <span className={s.scopeAll}><Icon name="gallery" size={16} /></span>}
            <span className={s.scopeName}>{scope?.name ?? t('index.allGroups')}</span>
            <span className={`${s.scopeCount} num`}>{data ? t('index.files', { n: fmt.number(rows.length), count: rows.length }) : ''}</span>
          </div>
          {focus ? (
            <button type="button" className={s.focus} style={{ '--c': KIND_RAY[focus.kind] }} onClick={() => onFocus(null)}>
              <i />{t(`index.kinds.${focus.kind}`)} · {t(`index.states.${focus.state}`)}
              <Icon name="close" size={13} />
            </button>
          ) : (
            <Segmented size="sm" value={show} onChange={setShow} label={t('index.title')} options={showOptions} />
          )}
          <label className={s.find}>
            <Icon name="search" size={14} />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('index.findFile')} spellCheck={false} />
            {text && <button type="button" onClick={() => setText('')} aria-label={t('common.clear')}><Icon name="close" size={11} /></button>}
          </label>
        </header>
        {!data ? <div className={s.wait}><Spinner size={20} /></div>
          : !overview.total ? <div className={s.empty}><Empty compact title={t('index.emptyTitle')}>{t('index.emptyBody')}</Empty></div>
            : !rows.length ? (
              <div className={s.empty}>
                {filtered || show === 'all' ? (
                  <Empty compact title={t('index.nothingFound')} action={filtered ? <button type="button" className={s.reset} onClick={() => { onFocus(null); setText(''); }}>{t('index.clearFocus')}</button> : null} />
                ) : (
                  <div className={s.calm}><span className={s.calmMark}><Icon name="check" size={20} stroke={2} /></span>{t('index.nothingNeeds')}</div>
                )}
              </div>
            ) : (
              <List items={items} groups={groups} selection={selection} allShown={allShown} someShown={someShown} onAll={onAll}
                onGroupTick={onGroupTick} onGroup={onGroupPick} onRow={onRow} onOpen={onOpenRow}
                resetKey={`${groupId}|${show}|${focus?.kind}|${focus?.state}|${text.trim()}`} />
            )}
        <Dock ids={ids} rows={seen.current} allShown={allShown} shown={shownIds.length} onSelectShown={() => toggleMany(shownIds, true)} onClear={clear} onIndex={() => setAsking(true)} />
      </section>
      <Reindex open={asking} count={ids.length} needs={needs} mode="index" onModels={() => { setAsking(false); onModels(); }}
        onCancel={() => setAsking(false)} onConfirm={start} />
    </div>
  );
}

// ------------------------------------------------------------------ the groups
function Groups({ overview, groupId, onGroup }) {
  const t = useT();
  const [q, setQ] = useState('');
  const pick = useRef(onGroup);
  pick.current = onGroup;
  const choose = useCallback((id) => pick.current(id), []);
  const list = useRef(null);
  const shown = q.trim() ? overview.groups.filter((g) => norm(g.name).includes(norm(q.trim()))) : overview.groups;
  // opened at a group: it is in sight
  useLayoutEffect(() => { list.current?.querySelector('[data-on="true"]')?.scrollIntoView({ block: 'nearest' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const all = { total: overview.total, waiting: overview.waiting, needs: overview.needs, kinds: overview.kinds };
  return (
    <aside className={s.groups}>
      {overview.groups.length > 8 && (
        <label className={s.groupFind}>
          <Icon name="search" size={14} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('index.findGroup')} spellCheck={false} />
        </label>
      )}
      <ul ref={list} className={s.groupList}>
        {!q.trim() && (
          <li>
            <GroupRow id={null} on={!groupId} name={t('index.allGroups')} g={all} kinds={overview.kinds} onPick={choose} icon />
          </li>
        )}
        {shown.map((g, i) => (
          <li key={g.id} style={{ '--i': Math.min(i, 20) }}>
            <GroupRow id={g.id} on={groupId === g.id} name={g.name} g={g} cover={g.cover} kinds={overview.kinds} onPick={choose} />
          </li>
        ))}
        {!shown.length && <li className={s.groupNone}>{t('picker.none')}</li>}
      </ul>
    </aside>
  );
}

/**
 * A group: its cover, its name, its three rays in miniature (each as long as that kind is up to date — the index
 * page's sky, small) and what waits in it.
 */
const KIND_DONE = (g, kinds) => KINDS.map((k) => `${kinds[k].available ? 1 : 0}:${g.kinds[k].done}`).join();
const GroupRow = memo(function GroupRow({ id, on, name, g, cover, icon, kinds, onPick }) {
  const t = useT();
  const fmt = useFormat();
  const state = g.waiting > 0 ? 'waiting' : g.needs > 0 ? 'busy' : g.total ? 'clean' : 'empty';
  return (
    <button type="button" className={s.group} data-on={on} data-state={state} onClick={() => onPick(id)}>
      {icon ? <span className={s.groupAll}><Icon name="gallery" size={16} /></span> : <GroupCover group={{ cover }} className={s.groupCover} />}
      <span className={s.groupName} title={name}>{name}</span>
      {g.total > 0 && (
        <span className={s.rays} aria-hidden="true">
          {KINDS.map((k) => {
            const p = kinds[k].available ? (g.kinds[k].done ?? 0) / g.total : 0;
            return <i key={k} style={{ '--p': p, '--c': KIND_RAY[k] }} data-off={!kinds[k].available || undefined} />;
          })}
        </span>
      )}
      <span className={s.groupState}>
        {state === 'waiting' && <span className={`${s.groupWaiting} num`}>{fmt.number(g.waiting)}</span>}
        {state === 'busy' && <span className={s.groupBusy} title={t('index.indexing')} />}
        {state === 'clean' && <Icon name="check" size={14} className={s.groupClean} />}
      </span>
    </button>
  );
}, (a, b) => a.on === b.on && a.name === b.name && a.cover?.id === b.cover?.id && a.g.total === b.g.total && a.g.waiting === b.g.waiting
  && a.g.needs === b.g.needs && KIND_DONE(a.g, a.kinds) === KIND_DONE(b.g, b.kinds) && a.onPick === b.onPick);

// ------------------------------------------------------------------ the list
const List = memo(function List({ items, groups, selection, allShown, someShown, onAll, onGroupTick, onGroup, onRow, onOpen, resetKey }) {
  const t = useT();
  const box = useRef(null);
  const [view, setView] = useState({ top: 0, h: 600, gutter: 0 });
  useLayoutEffect(() => {
    const el = box.current;
    let raf = 0;
    const read = () => { raf = 0; setView({ top: el.scrollTop, h: el.clientHeight, gutter: el.offsetWidth - el.clientWidth }); };
    read();
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', onScroll); ro.disconnect(); cancelAnimationFrame(raf); };
  }, []);
  // another filter starts at the top (files leaving as they are indexed keep the place)
  const lastKey = useRef(resetKey);
  useEffect(() => { if (lastKey.current !== resetKey) box.current?.scrollTo({ top: 0 }); lastKey.current = resetKey; }, [resetKey]);
  const from = Math.max(0, Math.floor(view.top / ROW) - 6);
  const to = Math.min(items.length, Math.ceil((view.top + view.h) / ROW) + 6);
  return (
    <div className={s.table}>
      <div className={s.head} style={{ paddingRight: view.gutter }}>
        <button type="button" className={s.tickCell} onClick={onAll} aria-label={t('common.selectAll')}>
          <Tick state={allShown ? 'on' : someShown ? 'mixed' : 'off'} size={15} />
        </button>
        <span className={s.headFile}>{t('index.col.file')}</span>
        {KINDS.map((k) => (
          <span key={k} className={s.headKind} style={{ '--c': KIND_RAY[k] }}><i />{t(`index.kinds.${k}`)}</span>
        ))}
        <span className={s.headWhen}>{t('index.col.indexed')}</span>
        <span />
      </div>
      <div ref={box} className={s.scroll} tabIndex={-1}>
        <div className={s.canvas} style={{ height: items.length * ROW }}>
          {items.slice(from, to).map((it, k) => {
            const y = (from + k) * ROW;
            if (it.type === 'group') {
              const g = groups.get(it.id);
              const on = it.ids.filter((id) => selection.has(id)).length;
              return (
                <div key={`g:${it.id}`} className={s.slot} style={{ transform: `translateY(${y}px)` }}>
                  <div className={s.groupHead}>
                    <button type="button" className={s.tickCell} onClick={() => onGroupTick(it, on < it.ids.length)} aria-label={t('common.selectAll')}>
                      <Tick state={on === it.ids.length ? 'on' : on ? 'mixed' : 'off'} size={15} />
                    </button>
                    {g && <GroupCover group={g} className={s.headCover} />}
                    <button type="button" className={s.headName} onClick={() => onGroup(it.id)}>{g?.name ?? ''}</button>
                    <span className={`${s.headCount} num`}>{t('index.files', { n: it.ids.length, count: it.ids.length })}</span>
                  </div>
                </div>
              );
            }
            return (
              <div key={it.row.id} className={s.slot} style={{ transform: `translateY(${y}px)` }}>
                <FileRow row={it.row} on={selection.has(it.row.id)} onClick={onRow} onOpen={onOpen} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

const sameRow = (a, b) => a === b || (a.id === b.id && a.at === b.at && a.name === b.name && a.ext === b.ext
  && a.states.tagging === b.states.tagging && a.states.embedding === b.states.embedding && a.states.metadata === b.states.metadata);
const FileRow = memo(function FileRow({ row, on, onClick, onOpen }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <div className={s.row} data-on={on || undefined} role="checkbox" aria-checked={on} tabIndex={0}
      onClick={(e) => onClick(e, row.id)} onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onClick(e, row.id); } }}>
      <span className={s.tickCell}><Tick state={on ? 'on' : 'off'} size={15} /></span>
      <span className={s.thumb}>
        <img src={mediaUrl(row, 'low')} alt="" loading="lazy" decoding="async" draggable={false} />
        {row.kind === 'video' && <Icon name="play" size={9} className={s.play} />}
      </span>
      <span className={s.name} title={`${row.name}.${row.ext}`}>{row.name}<span className={s.ext}>.{row.ext}</span></span>
      {KINDS.map((k) => (
        <span key={k} className={s.cell}>
          <Tooltip label={`${t(`index.kinds.${k}`)} · ${t(`index.states.${row.states[k]}`)}`} delay={260}>
            <span className={s.markWrap}><StateMark kind={k} state={row.states[k]} /></span>
          </Tooltip>
        </span>
      ))}
      <span className={`${s.when} num`}>{row.at ? fmt.relative(row.at) : t('index.never')}</span>
      <span className={s.openCell}>
        <IconButton icon="arrow-up-right" size="sm" label={t('index.open')} className={s.open} onClick={(e) => { e.stopPropagation(); onOpen(row); }} />
      </span>
    </div>
  );
}, (a, b) => a.on === b.on && a.onClick === b.onClick && a.onOpen === b.onOpen && sameRow(a.row, b.row));

/**
 * A file's index of one kind, at a glance — the kind's colour, its state in the shape: a full dot (up to date), half a
 * dot (outdated), a dashed ring (not indexed), a cross (couldn't be read), a turning arc (being built), a dash (no model).
 */
export function StateMark({ kind, state }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" className={s.mark} data-state={state} style={{ '--c': KIND_RAY[kind] }} aria-hidden="true">
      {state === 'done' && <circle cx="8" cy="8" r="4.5" className={s.fill} />}
      {state === 'stale' && <><circle cx="8" cy="8" r="4.1" className={s.ring} /><path d="M8 3.9a4.1 4.1 0 0 0 0 8.2Z" className={s.fill} /></>}
      {state === 'missing' && <circle cx="8" cy="8" r="4.1" className={s.dashed} />}
      {state === 'failed' && <><circle cx="8" cy="8" r="4.6" className={s.failRing} /><path d="m6.3 6.3 3.4 3.4M9.7 6.3l-3.4 3.4" className={s.cross} /></>}
      {state === 'queued' && <><circle cx="8" cy="8" r="4.1" className={s.ringFaint} /><path d="M8 3.9a4.1 4.1 0 0 1 4.1 4.1" className={s.arc} /></>}
      {state === 'off' && <path d="M5.8 8h4.4" className={s.dash} />}
    </svg>
  );
}

// ------------------------------------------------------------------ what can be done to the chosen files
function Dock({ ids, rows, allShown, shown, onSelectShown, onClear, onIndex }) {
  const t = useT();
  const fmt = useFormat();
  const open = ids.length > 0;
  const { mounted, state } = usePresence(open, 260);
  const last = useRef(ids);
  if (open) last.current = ids;
  if (!mounted) return null;
  const n = last.current.length;
  const peek = last.current.slice(-3).map((id) => rows.get(id)).filter(Boolean);
  return (
    <div className={s.dock} data-state={state} role="toolbar" aria-label={t('index.selected', { n, count: n })}>
      <span className={s.peek} aria-hidden="true">
        {peek.map((r, k) => <img key={r.id} src={mediaUrl(r, 'low')} alt="" draggable={false} style={{ '--k': k, '--n': peek.length }} />)}
      </span>
      <span key={n} className={`${s.count} num`}>{t('index.selected', { n: fmt.number(n), count: n })}</span>
      {!allShown && shown > 0 && <button type="button" className={s.quiet} onClick={onSelectShown}>{t('index.selectShown', { n: fmt.number(shown), count: shown })}</button>}
      <span className={s.sep} />
      <button type="button" className={s.action} onClick={onIndex}><Icon name="reindex" size={17} /><span>{t('index.indexSelected', { n: fmt.number(n), count: n })}</span></button>
      <span className={s.sep} />
      <IconButton icon="close" size="sm" label={`${t('index.clear')} · Esc`} className={s.close} onClick={onClear} placement="top" />
    </div>
  );
}


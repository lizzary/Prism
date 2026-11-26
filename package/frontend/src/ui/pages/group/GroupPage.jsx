// A group's page: its cover as a banner that dissolves into the page, then its files gathered into colour groups —
// sorted, sized and laid out as the page's settings say — under a toolbar that sticks below the top bar. The page
// looks for changes every few seconds. Opening a file shows it in the lightbox, over the page.
import { ViewTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  browsing, coverRules, fileActions, groupActions, holdGroupPage, mediaUrl, refreshGroupPage, useGroupPage, useIndexNeeds, useIndexWaiting, useOptimisticView, useTasks,
} from '../../../bridge/index.js';
import { useOverlays, usePageMeta } from '../../../app/shell.jsx';
import { cameBack, closeBoard, closeFile, navigate, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { saveFile } from '../../lib/download.js';
import { pageCover } from '../../lib/pageCover.js';
import { moveTo } from '../../lib/useReorder.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton } from '../../components/controls.jsx';
import { Empty, ProgressBar, toast } from '../../components/feedback.jsx';
import { Menu } from '../../components/menu.jsx';
import { Tooltip } from '../../components/overlay.jsx';
import { CompactPager, Pagination } from '../../components/pager.jsx';
import { NotFound } from '../../layout/PageStates.jsx';
import { TYPE_ICON, useTaskText } from '../../features/tasks/TasksPanel.jsx';
import { Toolbar } from './Toolbar.jsx';
import { Grid } from './Grid.jsx';
import { SelectionBar } from './SelectionBar.jsx';
import { DropUpload } from './DropUpload.jsx';
import { DeleteFiles, MoveFiles, Reindex } from './dialogs.jsx';
import { Lightbox } from './lightbox/Lightbox.jsx';
import { Outline } from './Outline.jsx';
import { Board } from './board/Board.jsx';
import { colorArrival } from '../../lib/arrival.js';
import { coverOnShow } from '../../lib/coverOnShow.js';
import s from './GroupPage.module.css';

const { NONE } = browsing;
/** The page of files each group was left on; back / forward reopens it (a fresh visit starts at page 1). */
const lastPage = new Map();
/** Settings that change which files land on which page: the page starts again from the first. */
const REPAGE = ['sort', 'dir', 'pageSize', 'limited', 'limit'];
const typing = (el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;

export function GroupPage({ id, fileId, board = false }) {
  const t = useT();
  const { data, clock, arrived } = useGroupPage(id);
  const banner = useRef(null);
  const [artHeight, setArtHeight] = useState(360);
  useLayoutEffect(() => {
    if (!banner.current) return undefined;
    const ro = new ResizeObserver(([e]) => setArtHeight(e.contentRect.height));
    ro.observe(banner.current);
    return () => ro.disconnect();
  }, [data.group?.id]);
  const group = data.group;
  // the page uses the whole width (the files want all the room they can get); the top bar spans it with them.
  // Over the whiteboard the bar is glass over the board, and its crumbs lead back to the files.
  usePageMeta(!group ? { scope: 'group', groupId: id, overArt: false, artHeight: 0, wide: true }
    : board ? { scope: 'group', groupId: id, overArt: false, artHeight: 0, wide: true, crumbs: [{ label: group.name, to: paths.group(id) }, { label: t('board.title') }] }
      : { scope: 'group', groupId: id, overArt: !!group.cover, artHeight, wide: true, crumbs: [{ label: group.name }] });
  if (!group) return <NotFound title={t('group.notFound')} />;
  return <GroupView key={id} id={id} fileId={fileId} board={board} data={data} clock={clock} arrived={arrived} bannerRef={banner} />;
}

function GroupView({ id, fileId, board, data, clock, arrived, bannerRef }) {
  const t = useT();
  const fmt = useFormat();
  const { open } = useOverlays();
  const group = data.group;
  const save = useCallback((v) => groupActions.saveView(id, v), [id]);
  const [view, setStoredView] = useOptimisticView(data.view, save);
  const [page, setPageState] = useState(() => {
    if (!cameBack()) lastPage.delete(id);
    return lastPage.get(id) ?? 1;
  });
  const setPage = (p) => { lastPage.set(id, p); setPageState(p); };
  const setView = (patch) => {
    setStoredView(patch);
    if (REPAGE.some((k) => k in patch && patch[k] !== view[k])) setPage(1);
  };
  const arranged = useMemo(() => browsing.arrange(data, view, page), [data, view, page]);
  const byId = useMemo(() => new Map(data.files.map((f) => [f.id, f])), [data.files]);
  const keyOf = useMemo(() => {
    const m = new Map();
    for (const sec of arranged.sections) for (const f of sec.files) m.set(f.id, sec.key);
    return (fid) => m.get(fid) ?? NONE;
  }, [arranged.sections]);
  const sectionInfo = (key) => {
    const sec = arranged.sections.find((x) => x.key === key);
    return key === NONE || !sec?.color ? { name: t('group.colors.noColor'), color: 'var(--ink-3)', none: true } : { name: sec.color.name, color: sec.color.color };
  };

  // ------------------------------------------------------------------ the covers: the banner shows one of them
  // It opens on the cover the card on the home page was showing (the one that just grew into it), else the main one;
  // the ticks beside the name look at the others (peek) and keep one. Whatever it shows goes back to the card.
  const covers = group.covers;
  const [kept, setKept] = useState(() => coverOnShow.of(id) ?? covers[0]?.id ?? null);
  const [peek, setPeek] = useState(null);
  const shownCover = covers.find((c) => c.id === peek) ?? covers.find((c) => c.id === kept) ?? covers[0] ?? null;
  const mainCover = covers[0]?.id ?? null;
  useEffect(() => { coverOnShow.set(id, shownCover && shownCover.id !== mainCover ? shownCover.id : null); }, [id, shownCover?.id, mainCover]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ choosing files
  const [selection, setSelection] = useState(() => new Set());
  const anchor = useRef(null);
  const pageIds = useMemo(() => arranged.page.sections.flatMap((x) => x.files.map((f) => f.id)), [arranged.page.sections]);

  // ------------------------------------------------------------------ the lightbox's order: what the page shows
  // The lightbox and its slideshow walk exactly the files on show here, in the page's order — nothing from a folded
  // colour group, past a colour group's limit or on another page — so the page decides what plays, and in what order.
  const shownFiles = useMemo(() => arranged.page.sections.flatMap((x) => x.files), [arranged.page.sections]);
  const lightboxFiles = useMemo(() => {
    // over the whiteboard every file is on show: the lightbox walks the board, colour group by colour group
    if (board) return arranged.sequence;
    if (!fileId || shownFiles.some((f) => f.id === fileId)) return shownFiles;
    // a file opened from elsewhere (the home page's last viewed, a random one) that the page does not show: it is
    // looked at in its place in the group's order, among the files on show; stepping away from it leaves it behind
    const at = arranged.sequence.findIndex((f) => f.id === fileId);
    if (at < 0) return shownFiles;
    const before = new Set(arranged.sequence.slice(0, at).map((f) => f.id));
    const k = shownFiles.filter((f) => before.has(f.id)).length;
    return [...shownFiles.slice(0, k), arranged.sequence[at], ...shownFiles.slice(k)];
  }, [shownFiles, fileId, arranged.sequence, board]);
  // A file open as the page arrives came with it (from another page, or a link straight to it): the page change brings
  // its lightbox in. Once that one closes, files open over the page as usual.
  const [withPage, setWithPage] = useState(!!fileId);
  if (withPage && !fileId) setWithPage(false);

  // ------------------------------------------------------------------ the whiteboard, over the page
  // It stays on until it has gone (its cards fly back to their tiles), also when Back took the address away first.
  // One that came with the page (a link straight to it, a reload) is simply there.
  const boardRef = useRef(null);
  const [boardOn, setBoardOn] = useState(board);
  const boardWithPage = useRef(board);
  const boardFrom = useRef([]);
  if (board && !boardOn) setBoardOn(true);
  const boardExited = useCallback(() => {
    boardFrom.current = [];
    boardWithPage.current = false;
    setBoardOn(false);
  }, []);
  // opened from elsewhere on another page of this one: the page turns to it, so it is among the files on show
  useLayoutEffect(() => {
    if (!fileId || shownFiles.some((f) => f.id === fileId)) return;
    const p = browsing.pageOf(arranged, view, fileId);
    if (p && p !== arranged.page.index) setPage(p);
  }, [fileId]); // eslint-disable-line react-hooks/exhaustive-deps
  // files that leave the group leave the selection too
  useEffect(() => {
    setSelection((cur) => {
      const kept = [...cur].filter((x) => byId.has(x));
      return kept.length === cur.size ? cur : new Set(kept);
    });
  }, [byId]);
  const toggle = (fid) => {
    anchor.current = fid;
    setSelection((cur) => { const n = new Set(cur); if (n.has(fid)) n.delete(fid); else n.add(fid); return n; });
  };
  const range = (fid) => {
    const from = anchor.current && pageIds.includes(anchor.current) ? anchor.current : fid;
    const i = pageIds.indexOf(from), j = pageIds.indexOf(fid);
    setSelection((cur) => new Set([...cur, ...pageIds.slice(Math.min(i, j), Math.max(i, j) + 1)]));
    anchor.current = fid;
  };
  const clear = () => setSelection(new Set());
  const selectPage = () => setSelection((cur) => new Set([...cur, ...pageIds]));

  // ------------------------------------------------------------------ doing things to files
  const [ask, setAsk] = useState(null);               // { kind: 'delete' | 'reindex' | 'move', … }
  const asked = useRef(null);
  if (ask) asked.current = ask;                       // what a closing dialog keeps showing
  const [menu, setMenu] = useState(null);             // { id, anchor | at }
  const [focus, setFocus] = useState(null);           // a file to bring into view: { id, at }
  const grid = useRef(null);                          // the grid's own ways in (revealFile)
  const [seen, setSeen] = useState([]);               // the colour groups on screen (the toolbar's strip follows them)
  const [reveal, setReveal] = useState(null);         // a colour group to bring into view: { key, at }
  const picker = useRef(null);

  const openFile = (fid) => navigate(board ? paths.boardFile(id, fid) : paths.file(id, fid));
  const download = async (ids) => {
    const r = await fileActions.download(ids);
    if (!r.ok) return;
    if (r.file) { saveFile(r.file.url, r.file.name); toast(t('group.saving', { name: r.file.name }), { icon: 'download' }); }
    else toast(t('group.packing', { n: fmt.number(r.count), count: r.count }), { icon: 'download' });
  };
  const remove = async (ids) => {
    const one = ids.length === 1 ? byId.get(ids[0]) : null;
    await groupActions.remove(id, ids);
    setSelection((cur) => new Set([...cur].filter((x) => !ids.includes(x))));
    toast(one ? t('group.deletedName', { name: `${one.name}.${one.ext}` }) : t('group.deleted', { n: fmt.number(ids.length), count: ids.length }),
      { icon: 'trash', action: { label: t('common.undo'), onClick: () => groupActions.restore(ids).then(() => toast(t('group.restored'), { tone: 'ok' })) } });
  };
  const editGroup = (props) => open('groupEditor', { group, onDeleted: () => navigate(paths.home()), ...props });
  /** A picture made the main cover, added to the covers or taken out of them; each can be undone. → done */
  const covering = {
    run(edit, fid, note) {
      const before = group.coverAuto ? null : covers.map((c) => c.id);
      const r = groupActions[edit](id, fid);
      if (r.full) {
        // (over the lightbox a dialog would open behind it: there the note only says why)
        toast(t('group.cover.full', { n: coverRules.MAX }), { tone: 'warn', icon: 'cover', action: fileId ? undefined : { label: t('group.covers.edit'), onClick: () => editGroup({ focus: 'covers' }) } });
        return false;
      }
      if (!r.ok) return false;
      toast(note, { tone: 'ok', icon: 'cover', action: { label: t('common.undo'), onClick: () => groupActions.setCovers(id, before) } });
      return true;
    },
    main(fid) {
      const done = covering.run('mainCover', fid, t('group.cover.main'));
      if (done) { setKept(fid); setPeek(null); }          // the banner turns to the new main cover
      return done;
    },
    add: (fid) => covering.run('addCover', fid, t('group.cover.added', { n: Math.min(covers.length + 1, coverRules.MAX), max: coverRules.MAX })),
    remove: (fid) => covering.run('removeCover', fid, t('group.cover.removed')),
  };
  const reindex = async (ids, kinds) => {
    const r = await fileActions.reindex(ids, kinds);
    if (r.ok) toast(t('group.reindex.started', { n: fmt.number(ids.length), count: ids.length }), { icon: 'reindex' });
    else if (r.error) toast(t(`tasks.errors.${r.error}`), { tone: 'warn' });
    setAsk(null);
  };
  const upload = async (list) => {
    const r = await groupActions.upload(id, list);
    if (r.accepted) toast(t('group.uploading', { n: fmt.number(r.accepted), count: r.accepted, name: group.name }), { icon: 'upload' });
    if (r.skipped) toast(t('group.drop.skipped', { n: fmt.number(r.skipped), count: r.skipped }), { tone: 'warn' });
  };

  const menuItems = (fid) => {
    const f = byId.get(fid);
    if (!f) return [];
    const many = selection.has(fid) && selection.size > 1;
    const ids = many ? [...selection] : [fid];
    const n = { n: fmt.number(ids.length), count: ids.length };
    const coverAt = covers.findIndex((c) => c.id === fid);
    const items = many ? [] : [
      { key: 'open', label: t('group.tile.open'), icon: 'expand', onSelect: () => openFile(fid) },
      { key: 'select', label: selection.has(fid) ? t('group.tile.deselect') : t('group.tile.select'), icon: 'check-square', onSelect: () => toggle(fid) },
      ...(f.kind === 'image' ? [
        ...(coverAt !== 0 ? [{ key: 'main', label: t('group.tile.mainCover'), icon: 'cover', onSelect: () => covering.main(fid) }] : []),
        coverAt < 0
          ? { key: 'add', label: t('group.tile.addCover'), icon: 'cover-add', onSelect: () => covering.add(fid) }
          : { key: 'remove', label: t('group.tile.removeCover'), icon: 'cover-remove', onSelect: () => covering.remove(fid) },
      ] : []),
      '-',
    ];
    return [
      ...items,
      { key: 'download', label: many ? t('group.tile.downloadN', n) : t('group.tile.download'), icon: 'download', onSelect: () => download(ids) },
      { key: 'reindex', label: many ? t('group.tile.reindexN', n) : t('group.tile.reindex'), icon: 'reindex', onSelect: () => setAsk({ kind: 'reindex', ids }) },
      '-',
      { key: 'delete', label: many ? t('group.tile.deleteN', n) : t('group.tile.delete'), icon: 'trash', danger: true, onSelect: () => setAsk({ kind: 'delete', ids }) },
    ];
  };

  // ------------------------------------------------------------------ dragging
  const onDropFiles = (ids, target) => {
    const order = browsing.placeBatch(arranged, ids, target);
    const movers = arranged.grouped ? ids.filter((fid) => keyOf(fid) !== target.section) : [];
    if (!movers.length && order.join() === arranged.sequence.map((f) => f.id).join()) return;
    const colorOf = (key) => (key === NONE ? null : key);
    const before = { sort: view.sort, order: data.order, colors: Object.fromEntries(movers.map((fid) => [fid, colorOf(keyOf(fid))])) };
    const commit = async () => {
      const switched = view.sort !== 'custom';
      if (switched) setView({ sort: 'custom' });
      await groupActions.place(id, { order, colors: movers.length ? Object.fromEntries(movers.map((fid) => [fid, colorOf(target.section)])) : undefined });
      setAsk(null);
      const undo = {
        label: t('common.undo'),
        onClick: () => { if (before.sort !== 'custom') setView({ sort: before.sort }); groupActions.place(id, { order: before.order, colors: before.colors }); },
      };
      if (movers.length) toast(t('group.moved', { n: fmt.number(movers.length), count: movers.length, name: sectionInfo(target.section).name }), { tone: 'ok', icon: 'swatches', action: undo });
      else if (switched) toast(t('group.sort.switched'), { icon: 'sort', action: undo });
    };
    if (movers.length) setAsk({ kind: 'move', moves: movers.map((fid) => ({ file: byId.get(fid), from: keyOf(fid) })), to: target.section, commit });
    else commit();
  };
  const onDropSection = (key, index) => {
    const keys = arranged.sections.filter((x) => x.key !== NONE).map((x) => x.key);
    const next = moveTo(keys, key, index);
    if (next.join() !== keys.join()) groupActions.reorderColorGroups(id, data.activeConfigId, next);
  };
  /** A new order for the colour groups (from the outline). `note`: say so, with a way back (sorting, a batch moved far). */
  const orderColors = (next, note) => {
    const before = arranged.sections.filter((x) => x.key !== NONE).map((x) => x.key);
    if (next.join() === before.join()) return;
    const config = data.activeConfigId;
    groupActions.reorderColorGroups(id, config, next);
    if (note) toast(note, { icon: 'sort', action: { label: t('common.undo'), onClick: () => groupActions.reorderColorGroups(id, config, before) } });
  };

  // ------------------------------------------------------------------ the colour-group outline beside the files
  const outlineOpen = arranged.grouped && view.outline;
  const [outlineFocus, setOutlineFocus] = useState(0);   // a moment to put the cursor in its find field
  const showOutline = () => { if (!view.outline) setView({ outline: true }); setOutlineFocus(Date.now()); };

  // a colour group chosen in search: its configuration put to use if it is not, then the page goes to it (once the
  // page has settled in, so arriving from elsewhere does not scroll under the page change)
  const [arrival, setArrival] = useState(null);
  useEffect(() => {
    const check = () => { const p = colorArrival.take(id); if (p) setArrival(p); };
    check();
    return colorArrival.subscribe(check);
  }, [id]);
  useEffect(() => {
    if (!arrival) return undefined;
    if (arrival.configId && arrival.configId !== data.activeConfigId && data.configs.some((c) => c.id === arrival.configId)) {
      groupActions.setActiveConfig(id, arrival.configId);
      return undefined;
    }
    if (!arranged.sections.some((x) => x.key === arrival.colorId)) return undefined;
    const timer = setTimeout(() => { jumpTo(arrival.colorId); setArrival(null); }, 380);
    return () => clearTimeout(timer);
  }, [arrival, data.activeConfigId, arranged.sections]); // eslint-disable-line react-hooks/exhaustive-deps
  const hold = useCallback(() => holdGroupPage(id), [id]);

  // ------------------------------------------------------------------ keys: Ctrl A chooses the page, Escape lets go, Delete deletes
  const keys = useRef(null);
  keys.current = { selection, selectPage, clear, ask: (ids) => setAsk({ kind: 'delete', ids }), outline: arranged.grouped ? showOutline : null, board: boardOn };
  useEffect(() => {
    const onKey = (e) => {
      // a menu or popover open over the page has the keys first (Escape closes it, and only it); the whiteboard has its own
      if (fileId || keys.current.board || pageCover.active() || typing(e.target) || document.querySelector('[role="dialog"]')) return;
      const k = keys.current;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') { e.preventDefault(); k.selectPage(); }
      else if (e.key === 'Escape' && k.selection.size) k.clear();
      else if ((e.key === 'Delete' || e.key === 'Backspace') && k.selection.size) { e.preventDefault(); k.ask([...k.selection]); }
      // G: find a colour group — the outline opens (if it is not open) with the cursor in its find field
      else if ((e.key === 'g' || e.key === 'G') && !e.ctrlKey && !e.metaKey && !e.altKey && k.outline) { e.preventDefault(); k.outline(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fileId]);

  // Ctrl + wheel over the files changes their size, like zooming
  const filesRef = useRef(null);
  const sizeRef = useRef(view.size);
  sizeRef.current = view.size;
  const setViewRef = useRef(setView);
  setViewRef.current = setView;
  useEffect(() => {
    const el = filesRef.current;
    if (!el) return undefined;
    let acc = 0, last = 0;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      acc += e.deltaY;
      if (Math.abs(acc) < 60 || performance.now() - last < 160) return;
      const next = Math.max(1, Math.min(5, sizeRef.current + (acc < 0 ? 1 : -1)));
      acc = 0;
      last = performance.now();
      if (next !== sizeRef.current) setViewRef.current({ size: next });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [group.fileCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // the toolbar takes a surface once it sticks under the top bar
  const sentinel = useRef(null);
  const [stuck, setStuck] = useState(false);
  useLayoutEffect(() => {
    if (!sentinel.current) return undefined;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: '-65px 0px 0px 0px' });
    io.observe(sentinel.current);
    return () => io.disconnect();
  }, [group.fileCount > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const goPage = (p) => {
    setPage(p);
    const top = (filesRef.current?.getBoundingClientRect().top ?? 0) + window.scrollY - 140;
    if (window.scrollY > top) window.scrollTo({ top, behavior: 'smooth' });
  };
  const jumpTo = (key) => {
    const p = browsing.pageOfSection(arranged, view, key);
    if (p && p !== arranged.page.index) setPage(p);
    setReveal({ key, at: Date.now() });
  };
  const closeLightbox = (lastId) => {
    if (board) { closeFile(id, { board: true }); return; }
    const p = browsing.pageOf(arranged, view, lastId);
    if (p && p !== arranged.page.index) setPage(p);
    setFocus({ id: lastId, at: Date.now() });
    closeFile(id);
  };
  const openBoard = () => { boardFrom.current = [...selection]; navigate(paths.board(id)); };

  const selected = useMemo(() => [...selection].map((x) => byId.get(x)).filter(Boolean), [selection, byId]);
  const shownAsk = ask ?? asked.current;
  const paged = arranged.page.count > 1;
  const empty = !data.files.length;
  const pagerLabels = { nav: t('group.pages.nav'), prev: t('common.prev'), next: t('common.next') };

  return (
    <div className={s.page}>
      <Banner group={group} cover={shownCover} bannerRef={bannerRef} />
      <header className={s.head}>
        <div className={s.titleRow}>
          <h1 className={s.title}>{group.name}</h1>
          <Button variant="ghost" size="sm" icon="edit" className={s.edit} data-overlay="groupEditor" onClick={() => editGroup()}>{t('group.edit')}</Button>
          <CoverTicks covers={covers} shown={shownCover?.id} kept={covers.some((c) => c.id === kept) ? kept : mainCover}
            onPeek={setPeek} onKeep={(cid) => { setKept(cid); setPeek(null); }} onEdit={() => editGroup({ focus: 'covers' })} />
        </div>
        <p className={s.meta}>
          <span className="num">{t('home.files', { n: fmt.number(group.fileCount), count: group.fileCount })}</span>
          {group.videoCount > 0 && <span className="num">{t('group.videos', { n: fmt.number(group.videoCount), count: group.videoCount })}</span>}
          {group.bytes > 0 && <SizeLink groupId={id} bytes={group.bytes} />}
          {group.fileCount > 0 && <span>{t('home.updated', { date: fmt.relative(group.updatedAt) })}</span>}
          <IndexHint groupId={id} />
        </p>
      </header>
      <ActiveTasks groupId={id} />
      <UploadWatch groupId={id} />

      {empty ? (
        <section className={s.empty}>
          <Empty title={t('group.emptyTitle')} action={<Button variant="primary" icon="upload" onClick={() => picker.current?.click()}>{t('group.upload')}</Button>}>
            {t('group.emptyBody')}
          </Empty>
        </section>
      ) : (
        <section ref={filesRef} className={s.files}>
          <div ref={sentinel} aria-hidden="true" />
          <div className={s.toolbar} data-stuck={stuck || undefined}>
            <Toolbar data={data} arranged={arranged} view={view} setView={setView} clock={clock} arrived={arrived} stuck={stuck} seen={seen} onJump={jumpTo}
              outline={outlineOpen} onOutline={() => (outlineOpen ? setView({ outline: false }) : showOutline())}
              onRefresh={() => refreshGroupPage(id)} onUpload={() => picker.current?.click()} onWhiteboard={openBoard}
              onEditColors={() => open('colorGroups', { groupId: id })} onUseConfig={(cfg) => groupActions.setActiveConfig(id, cfg)} />
          </div>
          {paged && (
            <div className={s.range}>
              <span className="num">{t('group.pages.range', { from: fmt.number(arranged.page.from), to: fmt.number(arranged.page.to), total: fmt.number(arranged.page.total) })}</span>
              <CompactPager page={arranged.page.index} pageCount={arranged.page.count} onChange={goPage} labels={pagerLabels} />
            </div>
          )}
          <div className={s.body}>
            {outlineOpen && (
              <Outline sections={arranged.sections} seen={seen} view={view} setView={setView} onJump={jumpTo} onOrder={orderColors}
                onEdit={(colorId) => open('colorGroups', { groupId: id, focus: colorId })}
                onClose={() => setView({ outline: false })} focusAt={outlineFocus} />
            )}
            <div className={s.main}>
              <Grid ref={grid} data={data} arranged={arranged} view={view} onView={setView} selection={selection} arrived={arrived} focus={focus} hold={hold}
                reveal={reveal} onSeen={setSeen}
                tile={{ open: openFile, toggle, range, menu: (fid, where) => setMenu(where instanceof Element ? { id: fid, anchor: where } : { id: fid, at: where }) }}
                onDropFiles={onDropFiles} onDropSection={onDropSection} />
              {paged && <Pagination className={s.pager} page={arranged.page.index} pageCount={arranged.page.count} onChange={goPage} labels={pagerLabels} />}
            </div>
          </div>
        </section>
      )}

      <input ref={picker} type="file" multiple accept="image/*,video/*" hidden onChange={(e) => { const list = [...e.target.files]; e.target.value = ''; if (list.length) upload(list); }} />
      <DropUpload enabled={!fileId} group={group} onFiles={upload} />
      <SelectionBar files={boardOn ? [] : selected} allSelected={pageIds.every((x) => selection.has(x))} onSelectAll={selectPage} onClear={clear}
        onDownload={() => download([...selection])} onReindex={() => setAsk({ kind: 'reindex', ids: [...selection] })} onDelete={() => setAsk({ kind: 'delete', ids: [...selection] })} />
      {boardOn && (
        <Board ref={boardRef} id={id} data={data} arranged={arranged} view={view} group={group} covering={covering} withPage={boardWithPage.current}
          open={board} onExited={boardExited}
          fileId={fileId} arrived={arrived} initialSelection={boardFrom.current}
          on={{
            open: openFile, close: () => closeBoard(id), download, remove, reindex: (ids, kinds) => reindex(ids, kinds),
            editColors: (focus) => open('colorGroups', { groupId: id, focus }), useConfig: (cfg) => groupActions.setActiveConfig(id, cfg),
          }} />
      )}
      <Menu open={!!menu} onClose={() => setMenu(null)} anchor={menu?.anchor} at={menu?.at} items={menu ? menuItems(menu.id) : []} label={t('group.tile.more')} />

      <DeleteFiles open={ask?.kind === 'delete'} files={shownAsk?.kind === 'delete' ? shownAsk.ids.map((x) => byId.get(x)).filter(Boolean) : []}
        onCancel={() => setAsk(null)} onConfirm={async () => { await remove(shownAsk.ids); setAsk(null); }} />
      <ReindexFiles ask={ask} shownAsk={shownAsk} onCancel={() => setAsk(null)} onConfirm={(kinds) => reindex(shownAsk.ids, kinds)} />
      <MoveFiles open={ask?.kind === 'move'} moves={shownAsk?.kind === 'move' ? shownAsk.moves : []} to={shownAsk?.to} names={sectionInfo}
        onCancel={() => setAsk(null)} onConfirm={() => shownAsk.commit()} />

      {fileId && (
        <Lightbox key={id} groupId={id} fileId={fileId} group={group} sequence={lightboxFiles} quality={view.quality} withPage={withPage}
          slide={view.slide} onSlide={(sec) => setView({ slide: sec })} onClose={closeLightbox}
          onReveal={(fid, o) => (board ? boardRef.current?.revealFile(fid, o) : grid.current?.revealFile(fid, o)) ?? null}
          {...(board ? { fileUrl: (fid) => paths.boardFile(id, fid), rectOf: (fid) => boardRef.current?.rectOf(fid) ?? null } : {})}
          covering={covering} onDownload={(fid) => download([fid])} onDelete={(fid) => remove([fid])} />
      )}
    </div>
  );
}

/**
 * One of the group's covers, wide, dissolving into the page; it drifts a little slower than the page as it scrolls
 * away. The covers lie stacked: one is fetched when it is first shown and stays, so going back to it is instant, and
 * a newly shown one fades in over the last before that one goes. To a page change they are one picture — the one on
 * show is what the card's cover grows into, or settles back from.
 */
function Banner({ group, cover, bannerRef }) {
  const img = useRef(null);
  const first = useRef(cover?.id);
  const asked = useRef(null);
  asked.current ??= new Set();
  if (cover) asked.current.add(cover.id);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        if (img.current && y < 900) img.current.style.transform = `translate3d(0, ${(y * 0.32).toFixed(1)}px, 0) scale(${(1 + y * 0.00012).toFixed(4)})`;
      });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => { cancelAnimationFrame(raf); window.removeEventListener('scroll', on); };
  }, []);
  return (
    <div ref={bannerRef} className={s.banner} data-blank={!cover || undefined}>
      {cover && (
        <div ref={img} className={s.bannerArt}>
          <ViewTransition name={`group-art-${group.id}`} share="morph">
            <div className={s.bannerFrames}>
              {group.covers.filter((c) => asked.current.has(c.id)).map((c) => (
                // lazy only so a page change never waits on it (React holds a transition for eager images); it is on
                // screen, so it loads at once — and the one the page opened on is drawn at once, for the morph to land on
                <img key={c.id} className={s.bannerImg} data-on={c.id === cover.id} data-later={c.id !== first.current || undefined}
                  src={mediaUrl(c, 'original')} alt="" draggable={false} loading="lazy" decoding={c.id === first.current ? 'sync' : 'async'} />
              ))}
            </div>
          </ViewTransition>
        </div>
      )}
      <div className={s.bannerShade} />
    </div>
  );
}

/**
 * The group's covers as ticks beside its name, the one in the banner lit: moving along them shows each in the banner,
 * a click (or the arrow keys) keeps it there. Going home, the card takes back whichever the banner shows.
 */
function CoverTicks({ covers, shown, kept, onPeek, onKeep, onEdit }) {
  const t = useT();
  const row = useRef(null);
  if (covers.length < 2) return null;
  const onKey = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const k = (covers.findIndex((c) => c.id === kept) + step + covers.length) % covers.length;
    onKeep(covers[k].id);
    row.current?.children[k]?.focus();
  };
  return (
    <div className={s.covers}>
      <div ref={row} className={s.coverTicks} role="radiogroup" aria-label={t('group.covers.label')} onKeyDown={onKey} onPointerLeave={() => onPeek(null)}>
        {covers.map((c, k) => (
          <button key={c.id} type="button" role="radio" aria-checked={c.id === kept} tabIndex={c.id === kept ? 0 : -1}
            aria-label={t('group.covers.nth', { n: k + 1, total: covers.length })} className={s.coverTick}
            data-shown={c.id === shown || undefined} data-kept={c.id === kept || undefined}
            onPointerEnter={(e) => { if (e.pointerType === 'mouse') onPeek(c.id); }} onClick={() => onKeep(c.id)} />
        ))}
      </div>
      <IconButton size="sm" icon="cover" label={t('group.covers.edit')} data-overlay="groupEditor" onClick={onEdit} />
    </div>
  );
}

/** Re-indexing chosen files: what they still need is asked for as the dialog opens (and those kinds start chosen). */
function ReindexFiles({ ask, shownAsk, onCancel, onConfirm }) {
  const open = ask?.kind === 'reindex';
  const ids = shownAsk?.kind === 'reindex' ? shownAsk.ids : null;
  const needs = useIndexNeeds(open ? ids : null);
  return <Reindex open={open} count={ids?.length ?? 0} needs={needs} onCancel={onCancel} onConfirm={onConfirm} />;
}

/** Files of the group waiting to be indexed: a quiet word beside its size, leading to them on the index page. */
function IndexHint({ groupId }) {
  const t = useT();
  const fmt = useFormat();
  const { open } = useOverlays();
  const n = useIndexWaiting(groupId);
  if (!n) return null;
  return (
    <span>
      <button type="button" className={s.indexHint} data-overlay="index" onClick={() => open('index', { groupId })}>
        <Icon name="reindex" size={14} />{t('group.waitingIndex', { n: fmt.number(n), count: n })}
      </button>
    </span>
  );
}

/** The group's size: a quiet way to its statistics (where the space goes in it, its colour groups, its largest files). */
function SizeLink({ groupId, bytes }) {
  const t = useT();
  const fmt = useFormat();
  const { open } = useOverlays();
  return (
    <span>
      <Tooltip label={t('group.sizeTip')}>
        <button type="button" className={`${s.sizeLink} num`} data-overlay="stats" onClick={() => open('stats', { groupId, tab: 'storage' })}>
          {fmt.bytes(bytes)}<Icon name="stats" size={13} />
        </button>
      </Tooltip>
    </span>
  );
}

/** Files sent from here show as soon as their upload is done, without waiting for the page's next look. */
function UploadWatch({ groupId }) {
  const done = useTasks().filter((x) => x.type === 'upload' && x.state === 'done' && x.group?.id === groupId).length;
  const seen = useRef(done);
  useEffect(() => {
    if (done > seen.current) refreshGroupPage(groupId);
    seen.current = done;
  }, [done, groupId]);
  return null;
}

/** Work under way for this group (an upload, a re-index…), right under its name. */
function ActiveTasks({ groupId }) {
  const t = useT();
  const fmt = useFormat();
  const text = useTaskText();
  const tasks = useTasks().filter((x) => (x.state === 'running' || x.state === 'queued') && (x.group?.id === groupId || x.groups.some((g) => g.id === groupId)));
  if (!tasks.length) return null;
  return (
    <div className={s.tasks}>
      {tasks.map((task) => {
        const waiting = task.state === 'queued' || task.stage === 'preparing';
        return (
          <div key={task.id} className={s.task} data-state={task.state}>
            <Icon name={TYPE_ICON[task.type]} size={16} className={s.taskIcon} />
            <span className={s.taskName}>{t(`tasks.types.${task.type}`)}</span>
            <span className={s.taskStage}>
              {task.state === 'queued' ? text.kinds(task) ?? t('tasks.stages.queued') : t(`tasks.stages.${task.stage}`)}
              {task.state === 'running' && text.step(task) && <span className="num"> · {text.step(task)}</span>}
            </span>
            {!waiting && task.total > 0 && <span className={`${s.taskCount} num`}>{fmt.number(task.processed)} / {fmt.number(task.total)}</span>}
            <ProgressBar value={task.processed} max={task.total || 1} indeterminate={waiting} className={s.taskBar} />
          </div>
        );
      })}
    </div>
  );
}

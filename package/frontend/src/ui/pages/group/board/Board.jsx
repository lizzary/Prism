// A group's whiteboard: every file as a square card, gathered into a region per colour group, on a board that goes on
// for ever. Drag the board with the right (or middle) button or Space, zoom with the wheel; draw a marquee with the
// left button, or Ctrl-click cards one by one; carry the chosen cards into another colour group (onto its region, or
// its row in the index), or out of every colour group (onto the empty board). The chosen ones' tags, note, colour group,
// download, re-index and delete are in the dock that rises below — none of it asks twice, all of it can be undone.
// Colour groups are edited where they are: drag a heading to move one, double-click its name, press its dot for a
// colour. For many of them (a hundred and more): the index beside the board finds any one and flies there, the map
// shows where everything is, headings stay readable at every zoom and stay in sight while the view is inside one.
// The board itself (scene.js, stage.js, useBoardInput.js, the headings and every panel) does not care what draws the
// regions and cards: today the DOM renderer, later a WebGL one.
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { browsing, fileActions, groupActions, holdGroupPage, mediaUrl, PLAIN_BOARD, useBoardFind, useOptimisticView, useSetting } from '../../../../bridge/index.js';
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { nextSwatch } from '../../../lib/swatches.js';
import { Portal, useScrollLock } from '../../../components/overlay.jsx';
import { Icon } from '../../../icons/Icon.jsx';
import { Menu } from '../../../components/menu.jsx';
import { toast } from '../../../components/feedback.jsx';
import { SwatchPopover } from '../../../features/colors/Swatches.jsx';
import { buildScene, cardOf, cardsIn, hitTest, inSight, nearestFree, placesOf, resizedSize, snap, GAP, HEAD, PAD, PITCH } from './scene.js';
import { frame, reveal, toScreen } from './camera.js';
import { createStage } from './stage.js';
import { useBoardInput } from './useBoardInput.js';
import { RENDERERS, pickRenderer } from './renderers.js';
import { webglAvailable } from '../../../lib/webgl.js';
import { Headings } from './Headings.jsx';
import { BoardBar } from './BoardBar.jsx';
import { BoardIndex } from './BoardIndex.jsx';
import { Minimap, ZoomBar } from './Minimap.jsx';
import { Dock } from './Dock.jsx';
import { Preview } from './Preview.jsx';
import { useGather } from './gather.js';
import s from './Board.module.css';

const { NONE } = browsing;
const INDEX_W = 292;
/** The camera each board was left with, this session (per group and configuration): coming back, it is there again. */
const cameras = new Map();
/**
 * Prism's arrangement as it was when a board was first opened this session (per group and configuration). It then
 * holds still while files come and go: a colour group that grows only nudges its neighbours aside, nothing reshuffles
 * under the hand that is sorting. Arrange (or a new session) packs the board afresh.
 */
const sessionLayouts = new Map();
const typing = (el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
const PEEK_MS = 360;
const NO_SIZES = {};

/** The part of the view left open by the app's bar, the board's own bar and the index. */
function insetsFor(index) {
  const bar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 64;
  return { top: bar + 76, right: 24, bottom: 28, left: 24 + (index ? INDEX_W + 14 : 0) };
}

/**
 * id · data, arranged, view: the group's page (useGroupPage, domain/arrange.js, its settings) · group: its card
 * covering: the page's cover edits · withPage: the board came with the page (no gathering then) · fileId: a file open
 * over the board · arrived: files new in the page's last look (they glow) · initialSelection: [fileId] chosen on the
 * page · on: { open(fileId), close(), download(ids),
 * remove(ids) (with its own undo), reindex(ids, kinds), editColors(colorId?), useConfig(id) }
 * ref: { revealFile(id, { now }), rectOf(id) } — for the lightbox opened over the board
 */
export function Board({ ref, id, data, arranged, view, group, covering, withPage, fileId, arrived, initialSelection, on }) {
  const t = useT();
  const fmt = useFormat();
  useScrollLock(true);
  const viewport = useRef(null);
  const findField = useRef(null);
  const renderer = pickRenderer(useSetting('whiteboard'), webglAvailable());
  const Renderer = RENDERERS[renderer];
  const grouped = arranged.grouped;
  const configKey = data.activeConfigId ?? PLAIN_BOARD;
  const save = useCallback((b) => groupActions.saveBoard(id, b), [id]);
  const [prefs, setPrefs] = useOptimisticView(data.board, save);
  const colorCount = arranged.sections.filter((x) => x.key !== NONE).length;
  const indexOpen = grouped && (prefs.index ?? colorCount >= 8);
  const insets = useMemo(() => insetsFor(indexOpen), [indexOpen]);
  const insetsRef = useRef(insets);
  insetsRef.current = insets;

  // ------------------------------------------------------------------ the scene: regions, cards, where they are
  // where the colour groups are: put by hand (saved), else Prism's own arrangement, held still for this session
  const saved = prefs.layouts[configKey] ?? null;
  const sessionKey = `${id}|${configKey}`;
  const [, held] = useReducer((x) => x + 1, 0);
  const layout = saved ?? sessionLayouts.get(sessionKey) ?? null;
  // how each colour group was sized by hand — and, while one is being resized, the size the pointer gives it
  const [resizing, setResizing] = useState(null);    // { key, edge, origin: [x, y], base: { cols, w, h }, size, alt, x, y }
  const savedSizes = prefs.sizes?.[configKey] ?? NO_SIZES;
  const sizes = useMemo(() => (resizing ? { ...savedSizes, [resizing.key]: resizing.size } : savedSizes), [savedSizes, resizing?.key, resizing?.size]); // eslint-disable-line react-hooks/exhaustive-deps
  // the shape Prism arranges for: the open part of the view when the board was opened (a resize does not shuffle it)
  const [aspect] = useState(() => { const i = insetsFor(false); return Math.round(((innerWidth - i.left - i.right) / Math.max(200, innerHeight - i.top - i.bottom)) * 10) / 10; });
  // (the files in no colour group have a region only while there are some: dropped on the empty board, files leave
  // their colour groups and it appears)
  const sections = useMemo(() => arranged.sections.filter((x) => x.key !== NONE || x.total > 0), [arranged.sections]);
  const scene = useMemo(
    () => buildScene(sections, { grouped, name: group.name, noneKey: NONE, layout, sizes, aspect }),
    [sections, grouped, group.name, layout, sizes, aspect],
  );
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  useLayoutEffect(() => {
    if (saved || sessionLayouts.has(sessionKey) || !scene.regions.length) return;
    sessionLayouts.set(sessionKey, placesOf(scene));
    held();
  }, [scene, saved, sessionKey]);
  // out of order: put by hand, or nudged since Prism arranged it (a colour group grew, a new one found a spot)
  const untidy = !!saved || scene.regions.some((r) => { const p = layout?.[r.key]; return !p || p[0] !== r.x || p[1] !== r.y; });
  const files = useMemo(() => new Map(data.files.map((f) => [f.id, f])), [data.files]);
  const regionOf = useCallback((fid) => { const w = scene.where.get(fid); return w ? scene.regions[w[0]].key : null; }, [scene]);
  const covers = useMemo(() => new Map(group.covers.map((c, k) => [c.id, k])), [group.covers]);

  // ------------------------------------------------------------------ the stage: camera and motion
  /** The whole board in the open part of the view, no closer than actual size. */
  const fitCam = (sc = scene, ins = insets) => (sc.bounds ? frame(sc.bounds, { w: innerWidth, h: innerHeight }, ins, { max: 1, pad: 40 }) : { x: 0, y: 0, z: 1 });
  const [stage] = useState(() => createStage(cameras.get(`${id}|${configKey}`) ?? fitCam()));
  useEffect(() => () => { cameras.set(`${id}|${configKey}`, stage.camera); }, [stage, id, configKey]);
  useEffect(() => () => stage.dispose(), [stage]);
  const placed = useRef(false);
  useLayoutEffect(() => {
    stage.place(scene.regions, { instant: !placed.current, follow: resizing?.key });
    placed.current = true;
  }, [stage, scene]);
  useLayoutEffect(() => {
    const el = viewport.current;
    const ro = new ResizeObserver(([e]) => stage.setViewport(e.contentRect.width, e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [stage]);
  // another configuration: a different board — framed whole (or as it was left, this session)
  const lastConfig = useRef(configKey);
  useEffect(() => {
    if (lastConfig.current === configKey) return;
    cameras.set(`${id}|${lastConfig.current}`, stage.camera);
    lastConfig.current = configKey;
    stage.flyTo(cameras.get(`${id}|${configKey}`) ?? fitCam());
  }, [configKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fitAll = () => { if (scene.bounds) stage.flyTo(fitCam()); };
  const frameRegion = (key) => {
    const r = scene.regions.find((x) => x.key === key);
    if (r) return stage.flyTo(stage.framing(r, insets, { max: 1.15, pad: 40 }));
    return Promise.resolve();
  };

  // ------------------------------------------------------------------ choosing
  const [selection, setSelection] = useState(() => new Set((initialSelection ?? []).filter((x) => files.has(x))));
  const anchor = useRef(null);
  useEffect(() => {
    setSelection((cur) => { const kept = [...cur].filter((x) => files.has(x)); return kept.length === cur.size ? cur : new Set(kept); });
  }, [files]);
  const sequence = arranged.sequence;
  const clickCard = (fid, m) => {
    if (m.shift && anchor.current && files.has(anchor.current)) {
      const ids = sequence.map((f) => f.id);
      const i = ids.indexOf(anchor.current), j = ids.indexOf(fid);
      setSelection((cur) => new Set([...(m.ctrl ? cur : []), ...ids.slice(Math.min(i, j), Math.max(i, j) + 1)]));
      return;
    }
    anchor.current = fid;
    if (m.ctrl) setSelection((cur) => { const n = new Set(cur); if (n.has(fid)) n.delete(fid); else n.add(fid); return n; });
    else setSelection(new Set([fid]));
  };
  const clear = () => setSelection(new Set());
  const selectAll = () => setSelection(new Set(data.files.map((f) => f.id)));
  const selectedByRegion = useMemo(() => {
    const m = new Map();
    for (const fid of selection) { const k = regionOf(fid); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [selection, regionOf]);

  // ------------------------------------------------------------------ what the pointer is over, and a closer look at it
  const [hover, setHover] = useState(null);          // what the pointer is over on the board (a hit, see scene.js)
  const [indexHot, setIndexHot] = useState(null);    // a colour group pointed at in the index, or a heading
  const [peek, setPeek] = useState(null);            // { id, rect } — a card's file, at its own proportions
  const peekTimer = useRef(0);
  const peekedAt = useRef(0);
  const hotCard = hover?.kind === 'card' ? hover.id : null;
  useEffect(() => {
    clearTimeout(peekTimer.current);
    if (!hotCard) { if (peek) { peekedAt.current = performance.now(); setPeek(null); } return undefined; }
    // one look leads to the next: moving on from a card just looked at, the next one shows at once
    const warm = peek || performance.now() - peekedAt.current < 420;
    peekTimer.current = setTimeout(() => {
      const c = cardOf(sceneRef.current, hotCard);
      if (!c) return;
      const cam = stage.camera, vp = stage.viewport;
      const [x, y] = toScreen(cam, vp, c.x, c.y);
      setPeek({ id: hotCard, rect: { left: x, top: y, width: c.w * cam.z, height: c.h * cam.z } });
    }, warm ? 0 : PEEK_MS);
    return () => clearTimeout(peekTimer.current);
  }, [hotCard]); // eslint-disable-line react-hooks/exhaustive-deps
  // any move of the board puts the closer look away
  useEffect(() => stage.onMove(() => { clearTimeout(peekTimer.current); setPeek((p) => { if (p) peekedAt.current = performance.now(); return null; }); }), [stage]);

  // ------------------------------------------------------------------ the marquee
  const [marquee, setMarquee] = useState(null);      // { rect, mods } in board px
  const preview = useMemo(() => (marquee ? new Set(cardsIn(scene, marquee.rect)) : null), [marquee, scene]);
  const endMarquee = (rect, m) => {
    setMarquee(null);
    const inside = cardsIn(scene, rect);
    if (m.ctrl) setSelection((cur) => { const n = new Set(cur); for (const x of inside) { if (n.has(x)) n.delete(x); else n.add(x); } return n; });
    else if (m.shift) setSelection((cur) => new Set([...cur, ...inside]));
    else setSelection(new Set(inside));
  };

  // ------------------------------------------------------------------ carrying cards to another colour group
  const ghost = useRef(null);
  const [carry, setCarry] = useState(null);          // { ids, target }
  const [pour, setPour] = useState(null);            // { ids, from, at, order }: just dropped, they pour into place
  const targetAt = (x, y, wx, wy) => {
    const el = document.elementFromPoint(x, y);
    const row = el?.closest?.('[data-drop]');
    if (row) return row.dataset.drop;
    if (el?.closest?.('[data-board-chrome]')) return null;
    const heading = el?.closest?.('[data-heading]');
    if (heading) return heading.dataset.heading;
    const hit = hitTest(sceneRef.current, wx, wy);
    if (hit) return hit.region.key;
    return grouped ? NONE : null;
  };
  const colorOfKey = (key) => (key === NONE ? null : key);
  /** Files into a colour group (or out of every one): at once, with a way back. */
  const move = (ids, target, from) => {
    const movers = ids.filter((fid) => files.has(fid) && regionOf(fid) !== target);
    if (!movers.length || !grouped) return;
    const before = Object.fromEntries(movers.map((fid) => [fid, colorOfKey(regionOf(fid))]));
    const order = view.sort === 'custom' ? browsing.placeBatch(arranged, movers, { section: target }) : undefined;
    const prevOrder = data.order;
    groupActions.place(id, { order, colors: Object.fromEntries(movers.map((fid) => [fid, colorOfKey(target)])) });
    if (from) setPour({ ids: new Set(movers), from, at: performance.now(), order: new Map(movers.map((x, i) => [x, i])) });
    const n = { n: fmt.number(movers.length), count: movers.length };
    const undo = { label: t('common.undo'), onClick: () => groupActions.place(id, { order: order ? prevOrder : undefined, colors: before }) };
    if (target === NONE) toast(t('board.movedOut', n), { tone: 'ok', icon: 'swatches', action: undo });
    else toast(t('group.moved', { ...n, name: scene.regions.find((r) => r.key === target)?.name ?? '' }), { tone: 'ok', icon: 'swatches', action: undo });
  };

  // ------------------------------------------------------------------ moving a colour group by hand
  const [lifted, setLifted] = useState(null);        // { key, landing: { x, y } | null }
  const landingAt = (key, x, y) => {
    const r = sceneRef.current.regions.find((q) => q.key === key);
    if (!r) return null;
    const others = sceneRef.current.regions.filter((q) => q.key !== key);
    const [lx, ly] = nearestFree(others, r.w, r.h, snap(x), snap(y));
    return { x: lx, y: ly, w: r.w, h: r.h };
  };
  const lastLanding = useRef(null);
  const dropRegion = (key, landing) => {
    const next = { ...(layout ?? placesOf(scene)), [key]: [landing.x, landing.y] };
    setPrefs({ layouts: { ...prefs.layouts, [configKey]: next } });
  };
  /** Pack the board afresh in colour-group order (what was put by hand goes back to Prism), with a way back. */
  const arrangeAll = () => {
    if (!untidy) return;
    const before = { saved, session: sessionLayouts.get(sessionKey) ?? null, places: placesOf(scene) };
    sessionLayouts.delete(sessionKey);
    if (saved) setPrefs({ layouts: Object.fromEntries(Object.entries(prefs.layouts).filter(([k]) => k !== configKey)) });
    else held();
    toast(t('board.arranged'), {
      icon: 'whiteboard',
      action: {
        label: t('common.undo'),
        onClick: () => {
          if (before.saved) setPrefs({ layouts: { ...prefsRef.current.layouts, [configKey]: before.saved } });
          else { sessionLayouts.set(sessionKey, before.places); held(); }
        },
      },
    });
  };
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;

  /** A colour group's size by hand (null: Prism's own) — saved, like where it is. */
  const sizeRegion = (key, size) => {
    const r = scene.regions.find((q) => q.key === key);
    const clean = r ? resizedSize(r.n, size) : null;
    const of = { ...(prefs.sizes?.[configKey] ?? {}) };
    if (clean) of[key] = clean; else delete of[key];
    setPrefs({ sizes: { ...prefs.sizes, [configKey]: of } });
  };

  // ------------------------------------------------------------------ finding
  const [query, setQuery] = useState('');
  const found = useBoardFind(id, query);
  const finding = !!query.trim();
  const foundFiles = useMemo(() => (finding && found.data ? found.data.files.map((x) => x.id).filter((x) => files.has(x)) : []), [finding, found.data, files]);
  const foundColors = useMemo(() => new Set(finding && found.data ? found.data.colorGroups : []), [finding, found.data]);
  const foundByRegion = useMemo(() => {
    const m = new Map();
    for (const fid of foundFiles) { const k = regionOf(fid); if (k) m.set(k, (m.get(k) ?? 0) + 1); }
    return m;
  }, [foundFiles, regionOf]);
  /** The colour groups a search reached: by name, or through their files (the others step back). */
  const reached = useMemo(() => (finding ? new Set([...foundColors, ...foundByRegion.keys()]) : null), [finding, foundColors, foundByRegion]);
  // the matches in board order (colour groups first), to step through
  const matches = useMemo(() => {
    if (!finding) return [];
    const inScene = new Set(foundFiles);
    return [
      ...scene.regions.filter((r) => foundColors.has(r.key)).map((r) => ({ kind: 'region', key: r.key })),
      ...scene.regions.flatMap((r) => r.ids.filter((x, k) => inScene.has(x) && inSight(r, k)).map((x) => ({ kind: 'card', id: x }))),
    ];
  }, [finding, foundFiles, foundColors, scene]);
  const [step, setStep] = useState(-1);
  useEffect(() => { setStep(-1); }, [query]);
  const goMatch = (dir) => {
    if (!matches.length) return;
    const k = step < 0 ? (dir > 0 ? 0 : matches.length - 1) : (step + dir + matches.length) % matches.length;
    setStep(k);
    const m = matches[k];
    if (m.kind === 'region') frameRegion(m.key);
    else flyToCard(m.id);
  };
  const flyToCard = (fid) => {
    const c = cardOf(scene, fid);
    if (!c) return;
    const z = Math.max(stage.camera.z, 1.1);
    const ins = insets;
    const vp = stage.viewport;
    const cx = ins.left + (vp.w - ins.left - ins.right) / 2, cy = ins.top + (vp.h - ins.top - ins.bottom) / 2;
    stage.flyTo({ z, x: c.x + c.w / 2 - (cx - vp.w / 2) / z, y: c.y + c.h / 2 - (cy - vp.h / 2) / z });
  };

  // a tag pointed at in the dock lights the chosen cards that carry it
  const [tagLit, setTagLit] = useState(null);
  const lit = useMemo(() => (tagLit ? new Set(tagLit) : finding && found.data ? new Set(foundFiles) : null), [tagLit, finding, found.data, foundFiles]);

  // ------------------------------------------------------------------ menus, renaming, colours
  const [menu, setMenu] = useState(null);            // { kind: 'card' | 'region' | 'board', id?, key?, at?, anchor?, world? }
  const [renaming, setRenaming] = useState(null);
  const [recolor, setRecolor] = useState(null);      // { key, anchor }
  const [leaving, setLeaving] = useState(null);
  const config = data.configs.find((c) => c.id === data.activeConfigId) ?? null;
  const rename = (key, name) => {
    setRenaming(null);
    const r = scene.regions.find((x) => x.key === key);
    const v = name?.trim();
    if (!config || !r || !v || v === r.name) return;
    groupActions.updateColorGroup(id, config.id, key, { name: v });
  };
  const paint = (key, color) => { if (config) groupActions.updateColorGroup(id, config.id, key, { color }); };
  // a colour group just made: once it is on the board, it is put where it was asked for, flown to, and named
  const [made, setMade] = useState(null);            // { key, at: [x, y] | null }
  useEffect(() => {
    if (!made) return;
    const r = scene.regions.find((x) => x.key === made.key);
    if (!r) return;
    setMade(null);
    if (made.at) {
      const others = scene.regions.filter((x) => x.key !== r.key);
      const [x, y] = nearestFree(others, r.w, r.h, snap(made.at[0] - r.w / 2), snap(made.at[1] - 26));
      dropRegion(r.key, { x, y });
      stage.flyTo(stage.framing({ x, y, w: r.w, h: r.h }, insets, { max: Math.max(stage.camera.z, 0.9), pad: 160 })).then(() => setRenaming(r.key));
    } else frameRegion(r.key).then(() => setRenaming(r.key));
  }, [made, scene]); // eslint-disable-line react-hooks/exhaustive-deps
  const newColor = async (ids = [], at = null) => {
    if (!config) return;
    const name = t('colorGroups.newName', { n: config.groups.length + 1 });
    const r = await groupActions.createColorGroup(id, config.id, { name, color: nextSwatch(config.groups.map((x) => x.color)) }, ids);
    if (!r?.ok) return;
    if (ids.length) toast(t('group.moved', { n: fmt.number(ids.length), count: ids.length, name }), { tone: 'ok', icon: 'swatches' });
    // by hand, or asked for a place: it goes there; arranged by Prism, it simply joins the end
    setMade({ key: r.colorGroup.id, at: at ?? (saved ? centreOfView() : null) });
  };
  const centreOfView = () => {
    const vp = stage.viewport, ins = insets;
    return stage.toWorld(ins.left + (vp.w - ins.left - ins.right) / 2, ins.top + (vp.h - ins.top - ins.bottom) / 2);
  };
  const removeColor = async (key) => {
    const r = scene.regions.find((x) => x.key === key);
    if (!config || !r || r.none) return;
    const at = [r.x, r.y];
    const res = await groupActions.removeColorGroup(id, config.id, key);
    if (!res?.ok) return;
    toast(t('board.region.removed', { name: r.name }), {
      icon: 'trash',
      action: {
        label: t('common.undo'),
        // it comes back where it was (as a new colour group to the data layer, so its place goes with its new id)
        onClick: async () => {
          const back = await groupActions.createColorGroup(id, config.id, { name: res.colorGroup.name, color: res.colorGroup.color, index: res.index }, res.files);
          if (!back?.ok) return;
          const cur = prefsRef.current.layouts[configKey];
          if (cur) setPrefs({ layouts: { ...prefsRef.current.layouts, [configKey]: { ...cur, [back.colorGroup.id]: at } } });
          else if (sessionLayouts.has(sessionKey)) { sessionLayouts.set(sessionKey, { ...sessionLayouts.get(sessionKey), [back.colorGroup.id]: at }); held(); }
        },
      },
    });
  };

  // ------------------------------------------------------------------ doing things to the chosen files
  const ids = useMemo(() => [...selection], [selection]);
  const removeFiles = (list) => {
    setLeaving(new Set(list));
    setTimeout(() => { setLeaving(null); on.remove(list); setSelection((cur) => new Set([...cur].filter((x) => !list.includes(x)))); }, 230);
  };
  const editTags = async (change, label) => {
    const r = await fileActions.editTags(ids, change);
    const n = r?.changed?.length ?? 0;
    if (change.add) {
      if (!n) { toast(t('board.tags.already', { tag: label }), { icon: 'tag' }); return; }
      toast(t('board.tags.added', { tag: label, n: fmt.number(n), count: n }), { tone: 'ok', icon: 'tag', action: { label: t('common.undo'), onClick: () => fileActions.editTags(r.changed, { remove: change.add }) } });
    } else if (n) {
      toast(t('board.tags.removed', { tag: label, n: fmt.number(n), count: n }), { tone: 'ok', icon: 'tag', action: { label: t('common.undo'), onClick: () => fileActions.editTags(r.changed, { add: [label] }) } });
    }
  };
  const setNote = async (note) => {
    const r = await fileActions.setNotes(Object.fromEntries(ids.map((x) => [x, note])));
    const n = Object.keys(r?.previous ?? {}).length;
    if (!n) return;
    toast(note ? t('board.note.saved', { n: fmt.number(n), count: n }) : t('board.note.cleared', { n: fmt.number(n), count: n }),
      { tone: 'ok', icon: 'text', action: { label: t('common.undo'), onClick: () => fileActions.setNotes(r.previous) } });
  };

  // ------------------------------------------------------------------ the pointer
  const hold = useRef(null);
  const input = useBoardInput(viewport, stage, {
    scene: () => sceneRef.current,
    insets: () => insetsRef.current,
    canCarry: () => grouped,
    canMoveRegion: () => sceneRef.current.regions.length > 1,
    onHover: (hit) => setHover(hit),
    onClickCard: clickCard,
    onClickEmpty: (m) => { if (!m.ctrl && !m.shift) clear(); },
    onMenu: (hit, at) => {
      if (hit?.kind === 'card') setMenu({ kind: 'card', id: hit.id, at });
      else if (hit?.region) setMenu({ kind: 'region', key: hit.region.key, at });
      else setMenu({ kind: 'board', at, world: stage.toWorld(at.x, at.y) });
    },
    onDouble: (hit) => {
      if (hit?.kind === 'card') on.open(hit.id);
      else if (hit?.kind === 'head' && !hit.region.none && !hit.region.plain) setRenaming(hit.region.key);
      else if (hit?.region) frameRegion(hit.region.key);
      else if (!hit) fitAll();
    },
    onMarquee: (rect, m) => setMarquee(rect ? { rect, mods: m } : null),
    onMarqueeEnd: endMarquee,
    onCarryStart: (fid) => {
      const list = selection.has(fid) ? [...selection] : [fid];
      if (!selection.has(fid)) { anchor.current = fid; setSelection(new Set([fid])); }
      hold.current = holdGroupPage(id);
      setPeek(null);
      setCarry({ ids: list, target: null });
      return list;
    },
    onCarry: ({ ids: list, x, y, wx, wy }) => {
      if (ghost.current) {
        ghost.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        // near the right edge it hangs on the pointer's other side, so where it is going stays readable
        ghost.current.toggleAttribute('data-flip', x > innerWidth - 300);
      }
      const target = targetAt(x, y, wx, wy);
      setCarry((c) => (c && c.target === target ? c : { ids: list, target, x, y }));
    },
    onCarryEnd: (res) => {
      hold.current?.(); hold.current = null;
      setCarry(null);
      if (!res) return;
      const target = targetAt(res.x, res.y, res.wx, res.wy);
      if (target != null) move(res.ids, target, [res.wx, res.wy]);
    },
    onRegionStart: (key) => {
      hold.current = holdGroupPage(id);
      setPeek(null);
      setLifted({ key, landing: null });
    },
    onRegion: ({ key, x, y }) => {
      stage.hold({ key, x, y });
      const landing = landingAt(key, x, y);
      const sig = landing && `${landing.x},${landing.y}`;
      if (sig !== lastLanding.current) { lastLanding.current = sig; setLifted({ key, landing }); }
    },
    onRegionEnd: (res) => {
      hold.current?.(); hold.current = null;
      lastLanding.current = null;
      setLifted(null);
      if (!res) { stage.release(null); return; }
      const landing = landingAt(res.key, res.x, res.y);
      stage.release(landing);
      if (landing) dropRegion(res.key, landing);
    },
    // resizing a colour group: its files rearrange to the new size; with Alt, the frame alone changes (files past it hide)
    onResizeStart: (key, edge) => {
      const r = sceneRef.current.regions.find((q) => q.key === key);
      if (!r) return;
      hold.current = holdGroupPage(id);
      setPeek(null);
      setResizing({ key, edge, origin: [r.x, r.y], n: r.n, base: { cols: r.cols, w: r.size?.w, h: r.size?.h }, size: r.size, alt: false });
    },
    onResize: ({ key, edge, wx, wy, alt, x, y }) => setResizing((cur) => {
      if (!cur || cur.key !== key) return cur;
      const w = wx - cur.origin[0], h = wy - cur.origin[1];
      let size;
      if (!alt) {
        // rearranged: as many across as fit the width (from the bottom edge, as few rows as fit the height); all in sight
        const cols = edge === 'b'
          ? Math.max(1, Math.ceil(cur.n / Math.max(1, Math.round((h - HEAD - PAD + GAP) / PITCH))))
          : Math.max(1, Math.round((w - 2 * PAD + GAP) / PITCH));
        size = { cols };
      } else {
        // framed: the files keep their places, the frame follows the pointer
        size = { cols: cur.base.cols, ...(edge !== 'b' ? { w } : cur.base.w ? { w: cur.base.w } : {}), ...(edge !== 'r' ? { h } : cur.base.h ? { h: cur.base.h } : {}) };
      }
      return { ...cur, size, alt, x, y };
    }),
    onResizeEnd: (key) => {
      hold.current?.(); hold.current = null;
      if (key && resizing) sizeRegion(key, resizing.size);
      setResizing(null);
    },
    onPanChange: () => {},
  });
  useEffect(() => () => hold.current?.(), []);

  // ------------------------------------------------------------------ every frame: the paper's dots, the marquee, the landing spot
  const paper = useRef(null);
  const marqueeEl = useRef(null);
  const landingEl = useRef(null);
  const compassEl = useRef(null);
  const live = useRef({});
  live.current = { marquee, lifted };
  useLayoutEffect(() => {
    const paintFrame = (st) => {
      const { camera: c, viewport: vp } = st;
      // a dotted grid that keeps its density: every 32 board px close up, every 128 further out, fading between
      const p = paper.current;
      if (p) {
        const fine = 32 * c.z, coarse = 128 * c.z;
        const ox = vp.w / 2 - c.x * c.z, oy = vp.h / 2 - c.y * c.z;
        p.style.setProperty('--g1', `${fine}px`);
        p.style.setProperty('--g2', `${coarse}px`);
        p.style.setProperty('--ox', `${ox}px`);
        p.style.setProperty('--oy', `${oy}px`);
        p.style.setProperty('--a1', Math.max(0, Math.min(1, (fine - 9) / 14)).toFixed(3));
        p.style.setProperty('--a2', Math.max(0, Math.min(1, (coarse - 14) / 30) * (1 - Math.max(0, Math.min(1, (fine - 9) / 14)) * 0.6)).toFixed(3));
      }
      const toS = (x, y) => [vp.w / 2 + (x - c.x) * c.z, vp.h / 2 + (y - c.y) * c.z];
      const m = live.current.marquee, me = marqueeEl.current;
      if (me) {
        if (m) {
          const [x, y] = toS(m.rect.x, m.rect.y);
          me.style.transform = `translate3d(${x}px, ${y}px, 0)`;
          me.style.width = `${m.rect.w * c.z}px`;
          me.style.height = `${m.rect.h * c.z}px`;
        }
      }
      const l = live.current.lifted?.landing, le = landingEl.current;
      if (le && l) {
        const [x, y] = toS(l.x, l.y);
        le.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        le.style.width = `${l.w * c.z}px`;
        le.style.height = `${l.h * c.z}px`;
        le.style.borderRadius = `${Math.max(4, 16 * c.z)}px`;
      }
      // wandered off into the empty board: a pill at the edge of the view points back to the colour groups
      const ce = compassEl.current, b = sceneRef.current.bounds;
      if (ce) {
        const v = st.view(), ins = insetsRef.current;
        const away = !!b && !(b.x < v.x + v.w && v.x < b.x + b.w && b.y < v.y + v.h && v.y < b.y + b.h);
        ce.toggleAttribute('data-on', away);
        if (away) {
          const [tx, ty] = toS(b.x + b.w / 2, b.y + b.h / 2);
          const cx = ins.left + (vp.w - ins.left - ins.right) / 2, cy = ins.top + (vp.h - ins.top - ins.bottom) / 2;
          const dx = tx - cx, dy = ty - cy;
          // where the line from the middle of the open view towards the colour groups leaves it (less a margin)
          const hw = (vp.w - ins.left - ins.right) / 2 - 110, hh = (vp.h - ins.top - ins.bottom) / 2 - 34;
          const k = Math.min(Math.abs(hw / (dx || 1e-6)), Math.abs(hh / (dy || 1e-6)));
          ce.style.transform = `translate3d(${cx + dx * k}px, ${cy + dy * k}px, 0) translate(-50%, -50%)`;
          ce.style.setProperty('--a', `${Math.atan2(dy, dx)}rad`);
        }
      }
    };
    paintFrame(stage);
    return stage.onFrame(paintFrame);
  }, [stage]);
  // what React just changed (a marquee, a landing spot, a heading that must show) is drawn on the next frame
  useLayoutEffect(() => { stage.redraw(); }, [stage, marquee, lifted, hover, carry, renaming, lit, indexHot]);

  // the colour groups in view (the index and the map light them)
  const [inView, setInView] = useState(() => new Set());
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      const v = stage.view();
      const keys = sceneRef.current.regions.filter((r) => r.x < v.x + v.w && v.x < r.x + r.w && r.y < v.y + v.h && v.y < r.y + r.h).map((r) => r.key);
      setInView((cur) => (cur.size === keys.length && keys.every((k) => cur.has(k)) ? cur : new Set(keys)));
    };
    read();
    const off = stage.onMove(() => { if (!raf) raf = requestAnimationFrame(read); });
    return () => { off(); cancelAnimationFrame(raf); };
  }, [stage, scene]);

  // ------------------------------------------------------------------ arriving and leaving
  const layer = useRef(null);
  const world = useRef(null);
  const gather = useGather({ stage, scene, layer, world, withPage });

  // ------------------------------------------------------------------ keys
  const keys = useRef(null);
  keys.current = { leaving: gather.phase === 'leave', selection, query, clearQuery: () => setQuery(''), ids, clear, selectAll, close: on.close, removeFiles, fitAll, focusFind: () => { findField.current?.focus(); findField.current?.select(); }, toggleIndex: () => setPrefs({ index: !indexOpen }), indexOpen, open: on.open };
  useEffect(() => {
    const onKey = (e) => {
      const k = keys.current;
      if (k.leaving || fileId || typing(e.target) || document.querySelector('[role="dialog"]') || input.busy()) return;
      const vp = stage.viewport;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); k.selectAll(); }
      else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); k.focusFind(); }
      else if (e.key === 'Escape') { e.preventDefault(); if (k.selection.size) k.clear(); else if (k.query) k.clearQuery(); else k.close(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && k.selection.size) { e.preventDefault(); k.removeFiles(k.ids); }
      else if (e.key === 'Enter' && k.selection.size === 1) { e.preventDefault(); k.open(k.ids[0]); }
      else if (mod || e.altKey) return;
      else if (e.key === 'g' || e.key === 'G') { e.preventDefault(); if (!k.indexOpen) k.toggleIndex(); k.focusFind(); }
      else if (e.key === '0' || e.key === ')') { e.preventDefault(); k.fitAll(); }
      else if (e.key === '1') { e.preventDefault(); stage.zoomBy(1 / stage.camera.z, vp.w / 2, vp.h / 2, true); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); stage.zoomBy(1.3, vp.w / 2, vp.h / 2, true); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); stage.zoomBy(1 / 1.3, vp.w / 2, vp.h / 2, true); }
      else if (e.key.startsWith('Arrow')) {
        e.preventDefault();
        const d = e.shiftKey ? 360 : 90;
        stage.panBy(e.key === 'ArrowLeft' ? d : e.key === 'ArrowRight' ? -d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, fileId]); // eslint-disable-line react-hooks/exhaustive-deps


  // ------------------------------------------------------------------ for the lightbox opened over the board
  useImperativeHandle(ref, () => ({
    /** The file's card brought into the open part of the view (at once, under the lightbox's dark room); where it is. */
    revealFile(fid, { now = false } = {}) {
      const c = cardOf(sceneRef.current, fid);
      if (!c) return null;
      const next = reveal(stage.camera, stage.viewport, insetsRef.current, c, 48);
      if (next.x !== stage.camera.x || next.y !== stage.camera.y) {
        if (now) stage.set(next); else stage.flyTo(next);
      }
      const cam = now ? next : stage.camera;
      const [x, y] = toScreen(cam, stage.viewport, c.x, c.y);
      return { left: x, top: y, width: c.w * cam.z, height: c.h * cam.z };
    },
    /** Where the file's card is on screen, if it is in view. */
    rectOf(fid) {
      const c = cardOf(sceneRef.current, fid);
      if (!c) return null;
      const [x, y] = toScreen(stage.camera, stage.viewport, c.x, c.y);
      const w = c.w * stage.camera.z;
      return x + w > 0 && y + w > 0 && x < stage.viewport.w && y < stage.viewport.h ? { left: x, top: y, width: w, height: w } : null;
    },
    /** Leaving: the cards in view fly back to the page's tiles, the board goes. → a promise for when it has gone */
    leave: () => gather.leave(),
  }), [stage, gather]);

  // ------------------------------------------------------------------ menus
  const menuItems = () => {
    if (!menu) return [];
    if (menu.kind === 'card') {
      const f = files.get(menu.id);
      if (!f) return [];
      const many = selection.has(menu.id) && selection.size > 1;
      const list = many ? ids : [menu.id];
      const n = { n: fmt.number(list.length), count: list.length };
      const coverAt = covers.get(menu.id) ?? -1;
      return [
        ...(many ? [] : [
          { key: 'open', label: t('group.tile.open'), icon: 'expand', onSelect: () => on.open(menu.id) },
          { key: 'select', label: selection.has(menu.id) ? t('group.tile.deselect') : t('group.tile.select'), icon: 'check-square', onSelect: () => clickCard(menu.id, { ctrl: true }) },
          ...(f.kind === 'image' ? [
            ...(coverAt !== 0 ? [{ key: 'main', label: t('group.tile.mainCover'), icon: 'cover', onSelect: () => covering.main(menu.id) }] : []),
            coverAt < 0
              ? { key: 'add', label: t('group.tile.addCover'), icon: 'cover-add', onSelect: () => covering.add(menu.id) }
              : { key: 'remove', label: t('group.tile.removeCover'), icon: 'cover-remove', onSelect: () => covering.remove(menu.id) },
          ] : []),
          '-',
        ]),
        { key: 'download', label: many ? t('group.tile.downloadN', n) : t('group.tile.download'), icon: 'download', onSelect: () => on.download(list) },
        '-',
        { key: 'delete', label: many ? t('group.tile.deleteN', n) : t('group.tile.delete'), icon: 'trash', danger: true, onSelect: () => removeFiles(list) },
      ];
    }
    if (menu.kind === 'region') {
      const r = scene.regions.find((x) => x.key === menu.key);
      if (!r) return [];
      const own = !r.none && !r.plain;
      return [
        ...(!own ? [] : [
          { key: 'rename', label: t('board.region.rename'), icon: 'rename', onSelect: () => setRenaming(r.key) },
          { key: 'recolor', label: t('board.region.recolor'), icon: 'palette', onSelect: () => setRecolor({ key: r.key, at: menu.at, anchor: menu.anchor }) },
          '-',
        ]),
        { key: 'select', label: t('board.region.select', { n: fmt.number(r.n), count: r.n }), icon: 'check-square', disabled: !r.n, onSelect: () => setSelection(new Set(r.ids)) },
        { key: 'frame', label: t('board.region.frame'), icon: 'zoom-in', onSelect: () => frameRegion(r.key) },
        ...(r.hidden ? [{ key: 'showAll', label: t('board.region.showAll', { n: fmt.number(r.n), count: r.n }), icon: 'expand', onSelect: () => sizeRegion(r.key, r.size?.cols ? { cols: r.size.cols } : null) }] : []),
        ...(r.size ? [{ key: 'resetSize', label: t('board.region.resetSize'), icon: 'fit', onSelect: () => sizeRegion(r.key, null) }] : []),
        ...(!own ? [] : [
          { key: 'edit', label: t('group.colors.edit'), icon: 'swatches', onSelect: () => on.editColors(r.key) },
          '-',
          { key: 'remove', label: t('board.region.remove'), icon: 'trash', danger: true, onSelect: () => removeColor(r.key) },
        ]),
      ];
    }
    return [
      ...(config ? [{ key: 'new', label: t('board.newColorHere'), icon: 'plus', onSelect: () => newColor([], menu.world) }] : []),
      { key: 'all', label: t('common.selectAll'), icon: 'check-square', hint: 'Ctrl A', onSelect: selectAll },
      { key: 'fit', label: t('board.centre'), icon: 'fit', hint: '0', onSelect: fitAll },
      ...(untidy ? ['-', { key: 'arrange', label: t('board.arrange'), icon: 'whiteboard', onSelect: arrangeAll }] : []),
    ];
  };

  const hotRegion = indexHot ?? hover?.region?.key ?? null;
  // files that just arrived (an upload, an import) glow once where they land
  const fresh = useMemo(() => (arrived?.at && Date.now() - arrived.at < 2600 ? new Set(arrived.ids) : null), [arrived]);
  const look = useMemo(() => ({
    selected: selection, preview, carried: carry ? new Set(carry.ids) : null, lit, hot: carry || lifted ? null : hotCard, fresh,
    leaving, target: carry?.target ?? null, hotRegion: resizing?.key ?? (carry || lifted ? lifted?.key ?? null : hotRegion), liftedRegion: lifted?.key ?? null,
    resizing: resizing?.key ?? null,
    litRegions: finding ? foundColors : null, reached: tagLit ? null : reached, pour,
  }), [selection, preview, carry, lit, hotCard, fresh, leaving, lifted, hotRegion, finding, foundColors, reached, tagLit, pour, resizing?.key]); // eslint-disable-line react-hooks/exhaustive-deps
  const headLook = useMemo(() => ({
    hot: carry ? null : hotRegion, target: carry?.target ?? null, lit: finding ? foundColors : null, found: finding ? foundByRegion : null,
    selected: selectedByRegion, renaming,
  }), [carry, hotRegion, finding, foundColors, foundByRegion, selectedByRegion, renaming]);
  const headOn = useMemo(() => ({
    press: (e, hit) => input.press(e, hit),
    hover: (key) => { if (!input.busy()) setIndexHot(key); },
    startRename: (key) => setRenaming(key),
    rename,
    recolor: (key, el) => setRecolor({ key, anchor: el }),
    menu: (key, where) => setMenu(where instanceof Element ? { kind: 'region', key, anchor: where } : { kind: 'region', key, at: where }),
  }), [scene, config]); // eslint-disable-line react-hooks/exhaustive-deps

  const carriedFiles = carry ? carry.ids.slice(0, 3).map((x) => files.get(x)).filter(Boolean) : [];
  const targetRegion = carry?.target != null ? scene.regions.find((r) => r.key === carry.target) : null;
  const recolorRegion = recolor && scene.regions.find((r) => r.key === recolor.key);
  const resized = resizing?.x != null ? scene.regions.find((r) => r.key === resizing.key) : null;

  return (
    <Portal>
      <div ref={layer} className={s.board} data-phase={gather.phase} data-board-phase={gather.phase} data-renderer={renderer} data-carrying={carry ? '' : undefined}>
        <div ref={paper} className={s.paper} aria-hidden="true" />
        <div ref={viewport} className={s.viewport} tabIndex={0} role="application" aria-label={t('board.label', { name: group.name })}>
          <Renderer stage={stage} scene={scene} files={files} covers={covers} look={look} layerRef={world} />
          <Headings stage={stage} scene={scene} top={insets.top - 6} left={insets.left} look={headLook} on={headOn} noneName={t('group.colors.noColor')} />
          <div ref={landingEl} className={s.landing} data-on={lifted?.landing ? '' : undefined} aria-hidden="true" />
          <div ref={marqueeEl} className={s.marquee} data-on={marquee ? '' : undefined} aria-hidden="true" />
          {!scene.regions.length && <div className={s.blank}>{t('group.emptyTitle')}</div>}
        </div>
        <button ref={compassEl} type="button" className={s.compass} data-board-chrome="" onClick={fitAll}>
          <Icon name="arrow-right" size={15} className={s.compassArrow} />{t('board.centre')}
        </button>

        <BoardBar group={group} data={data} grouped={grouped} colors={scene.regions.filter((r) => !r.none).slice(0, 3).map((r) => r.color)}
          indexOpen={indexOpen} onIndex={() => setPrefs({ index: !indexOpen })} onBack={on.close}
          onUseConfig={on.useConfig} onEditColors={() => on.editColors()} onNewColor={config ? () => newColor() : null}
          arranged={!untidy} onArrange={arrangeAll}
          findRef={findField} query={query} onQuery={setQuery} found={finding && found.data ? { files: foundFiles.length, colors: foundColors.size } : null}
          searching={found.loading} step={step} total={matches.length} onStep={goMatch} onSelectFound={() => { if (foundFiles.length) setSelection(new Set(foundFiles)); }} />

        {indexOpen && (
          <BoardIndex regions={scene.regions} inView={inView} hot={hotRegion} target={carry?.target ?? null} carrying={!!carry}
            selected={selectedByRegion} found={finding ? { colors: foundColors, files: foundByRegion } : null} noneName={t('group.colors.noColor')}
            onHover={setIndexHot} onJump={(key) => frameRegion(key)} onClose={() => setPrefs({ index: false })}
            onMenu={(key, at) => setMenu({ kind: 'region', key, at })} />
        )}

        <div className={s.corner} data-board-chrome="">
          {prefs.minimap && scene.bounds && (
            <Minimap stage={stage} scene={scene} inView={inView} hot={hotRegion} lit={finding ? foundColors : null} reached={reached} selected={selectedByRegion}
              onHide={() => setPrefs({ minimap: false })} />
          )}
          <ZoomBar stage={stage} onFit={fitAll} map={!prefs.minimap} onMap={() => setPrefs({ minimap: true })} />
        </div>

        <Dock ids={ids} files={files} sections={scene.regions} grouped={grouped} noneName={t('group.colors.noColor')}
          onClear={clear} onTagHover={setTagLit} onTags={editTags} onNote={setNote}
          onMove={(key) => move(ids, key, null)} onNewColor={config ? () => newColor(ids) : null}
          onDownload={() => on.download(ids)} onReindex={(kinds) => on.reindex(ids, kinds)} onDelete={() => removeFiles(ids)}
          onSelectOnly={(list) => setSelection(new Set(list))} />

        {peek && !carry && !lifted && !marquee && files.get(peek.id) && <Preview file={files.get(peek.id)} rect={peek.rect} quality={view.quality} key={peek.id} />}

        {resized && (
          <div className={s.sizeChip} style={{ transform: `translate3d(${resizing.x + 18}px, ${resizing.y + 18}px, 0)` }} data-mode={resizing.alt ? 'frame' : 'fit'} aria-hidden="true">
            <span className={s.sizeWhat}>
              <Icon name={resizing.alt ? 'eye-off' : 'size-small'} size={14} />
              {resizing.alt
                ? t('board.resize.shown', { n: fmt.number(resized.n - resized.hidden), total: fmt.number(resized.n) })
                : t('board.resize.across', { n: fmt.number(resized.cols), rows: fmt.number(resized.rows), count: resized.cols })}
            </span>
            <span className={s.sizeHint}><kbd>Alt</kbd>{resizing.alt ? t('board.resize.toFit') : t('board.resize.toFrame')}</span>
          </div>
        )}
        {carry && (
          <div ref={ghost} className={s.ghost} style={{ transform: `translate3d(${carry.x ?? -999}px, ${carry.y ?? -999}px, 0)` }} aria-hidden="true">
            <div className={s.ghostIn}>
              <span className={s.stack}>
                {carriedFiles.map((f, k) => <img key={f.id} src={mediaUrl(f, 'low')} alt="" style={{ '--k': k, '--n': carriedFiles.length }} />)}
                {carry.ids.length > 1 && <b className={`${s.badge} num`}>{fmt.number(carry.ids.length)}</b>}
              </span>
              {carry.target != null && (
                <span className={s.whither} style={{ '--c': targetRegion?.color ?? 'var(--ink-3)' }} data-none={carry.target === NONE || undefined}>
                  <i />{carry.target === NONE ? t('board.outOfColors') : targetRegion?.name ?? ''}
                </span>
              )}
            </div>
          </div>
        )}

        <Menu open={!!menu} onClose={() => setMenu(null)} at={menu?.at} anchor={menu?.anchor} items={menuItems()} label={t('common.more')} />
        <SwatchPopover open={!!recolorRegion} anchor={recolor?.anchor} at={recolor?.at} color={recolorRegion?.color ?? '#8893a5'}
          onPick={(c) => paint(recolor.key, c)} onClose={() => setRecolor(null)} />
      </div>
    </Portal>
  );
}


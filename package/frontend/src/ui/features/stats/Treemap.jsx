// The structure of a scope, as areas as large as their files: the gallery's groups, each laid out in the colour groups
// it is sorted by (in their own colours); a group's colour groups; a colour group's files themselves, as pictures.
// Pressing an area looks inside it: the area grows to fill the map while the rest fades away — and going back up, it
// settles into its place again. The list beside it is the same structure in rows (and the way to it by keyboard).
import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl, statsRules } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { EmptyArt } from '../../components/feedback.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { HEAD, hasHead, inset, squarify } from './treemap.js';
import { useStatsFormat } from './look.js';
import s from './Treemap.module.css';

const { NONE } = statsRules;
const valueOf = (x, measure) => (measure === 'files' ? x.files : x.bytes);

/**
 * The scope's areas as one tree, whatever the scope — so an area keeps its element as the map zooms in and out of it:
 * groups (g:) hold colour groups (c:), which hold files (f:); a group sorted by no colour groups holds its files.
 */
function treeOf(data) {
  const { scope } = data;
  if (scope.kind === 'all') {
    return data.children.map((g) => ({
      key: `g:${g.id}`, id: g.id, name: g.name, cover: g.cover, bytes: g.bytes, files: g.files, configId: g.config?.id ?? null,
      cells: g.parts.map((p) => ({ key: `c:${p.id}`, id: p.id, kind: p.kind, name: p.name, color: p.color, bytes: p.bytes, files: p.files })),
    }));
  }
  // (the largest files only: the smaller rest is named beside the map, not drawn as one block that would outgrow them)
  const tiles = data.tiles.map((f) => ({ key: `f:${f.id}`, file: f, bytes: f.size, files: 1 }));
  const g = scope.group;
  const base = { key: `g:${g.id}`, id: g.id, name: g.name, cover: g.cover, bytes: data.bytes, files: data.files, configId: scope.config?.id ?? null, open: true };
  if (scope.kind === 'group') {
    if (!scope.config) return [{ ...base, cells: [], tiles }];
    return [{ ...base, cells: data.children.map((c) => ({ key: `c:${c.id}`, id: c.id, kind: c.kind, name: c.name, color: c.color, bytes: c.bytes, files: c.files })) }];
  }
  const c = scope.color;
  return [{
    ...base, bytes: data.share?.bytes ?? data.bytes,
    cells: [{ key: `c:${c.id}`, id: c.id, kind: c.id === NONE ? 'none' : 'color', name: c.name, color: c.color, bytes: data.bytes, files: data.files, open: true, tiles }],
  }];
}

/**
 * Where everything goes in a w × h map. Areas that are leaving (the rest of the gallery, the other colour groups) keep
 * the place they had — and their place in the list: an element moved in the DOM loses its transition, so the area that
 * grows stays where it was among them (it is lifted above them instead).
 */
const among = (ghosts, open) => {
  if (!ghosts?.some((x) => x.key === open.key)) return [...(ghosts ?? []).map((x) => ({ ...x, gone: true })), open];
  return ghosts.map((x) => (x.key === open.key ? open : { ...x, gone: true }));
};
function place(tree, measure, w, h, ghosts) {
  const R = { x: 0, y: 0, w, h };
  const out = [];
  const lay = (items, r) => squarify(items.map((x) => ({ ...x, value: valueOf(x, measure) })), r.x, r.y, r.w, r.h).map((b) => ({ ...b.item, ...inset(b, 1) }));
  const inner = (r, head) => ({ x: 3, y: head ? HEAD : 3, w: r.w - 6, h: r.h - (head ? HEAD + 3 : 6) });
  const groups = tree.length === 1 && tree[0].open ? [{ ...tree[0], x: 0, y: 0, w, h }] : lay(tree, R);
  for (const g of groups) {
    const head = g.open || hasHead(g);
    const box = inner(g, head);
    let cells = [];
    if (g.cells.length) {
      const open = g.cells.find((c) => c.open);
      cells = open ? [{ ...open, ...inset({ ...box }, 0) }] : lay(g.cells, box);
      cells = cells.map((c) => {
        if (!c.tiles) return c;
        const ch = hasHead(c);
        return { ...c, head: ch, tiles: lay(c.tiles, inner({ w: c.w, h: c.h }, ch)) };
      });
      if (open && ghosts?.cells?.[g.key]) cells = among(ghosts.cells[g.key], cells[0]);
    }
    out.push({ ...g, head, cells, tiles: g.tiles ? lay(g.tiles, box) : null });
  }
  if (ghosts?.groups && tree.length === 1 && tree[0].open) return among(ghosts.groups, out[0]);
  return out;
}

export const Treemap = memo(function Treemap({ data, measure, hot, onHot, onGroup, onColor, onFile, onPrefetch }) {
  const t = useT();
  const f = useStatsFormat();
  const box = useRef(null);
  const tip = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [info, setInfo] = useState(null);
  useLayoutEffect(() => {
    const el = box.current;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const tree = useMemo(() => (data ? treeOf(data) : []), [data]);
  // what the map showed one level up: it stays where it was, fading, while the area pressed grows out of it
  const above = useRef({ groups: null, cells: {} });
  const layout = useMemo(() => {
    if (!data || !size.w) return [];
    const kind = data.scope.kind;
    const out = place(tree, measure, size.w, size.h, kind === 'all' ? null : above.current);
    return out;
  }, [tree, measure, size, data]);
  useLayoutEffect(() => {
    if (!data) return;
    const kind = data.scope.kind;
    if (kind === 'all') above.current = { groups: layout.map((g) => ({ ...g, cells: g.cells.map(({ tiles, ...c }) => c), tiles: null, gone: undefined })), cells: {} };
    else if (kind === 'group' && layout.length) {
      const g = layout.find((x) => x.open);
      if (g) above.current = { ...above.current, cells: { ...above.current.cells, [g.key]: g.cells.map((c) => ({ ...c, gone: undefined })) } };
    }
  }, [layout, data]);

  const scopeOf = (g, c) => ({ groupId: g.id, configId: g.configId, colorId: c?.id ?? null });
  const point = (e) => {
    const r = box.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    if (tip.current) {
      const flip = x > r.width - 230;
      tip.current.style.transform = `translate(${Math.round(flip ? x - 14 : x + 14)}px, ${Math.round(y + 16)}px) translateX(${flip ? '-100%' : '0'})`;
    }
  };
  const enter = (e, item) => { onHot?.(item.hot); setInfo(item); point(e); if (item.prefetch) onPrefetch?.(item.prefetch); };
  const leave = () => { onHot?.(null); setInfo(null); };

  if (data && !data.files) {
    return (
      <div ref={box} className={s.map} data-empty="">
        <div className={s.empty}><EmptyArt size={96} /><span>{t('stats.emptyScope')}</span></div>
      </div>
    );
  }
  return (
    <div ref={box} className={s.map} aria-hidden="true" onPointerMove={point} onPointerLeave={leave}>
      {layout.map((g) => {
        const plain = !g.cells.length && !g.tiles;
        const hotG = hot === g.id;
        return (
          <div key={g.key} data-key={g.key} className={s.group} data-plain={plain || undefined} data-open={g.open || undefined} data-gone={g.gone || undefined}
            data-hot={hotG || undefined} style={{ left: g.x, top: g.y, width: g.w, height: g.h }}
            onPointerEnter={g.open ? undefined : (e) => enter(e, { hot: g.id, kind: 'group', name: g.name, bytes: g.bytes, files: g.files, cells: g.cells.length, prefetch: scopeOf(g) })}
            onPointerLeave={g.open ? undefined : leave}
            onClick={g.open || g.gone ? undefined : () => onGroup(g.id)}>
            {g.head ? (
              <span className={s.head}>
                {g.cover && <img src={mediaUrl(g.cover, 'low')} alt="" loading="lazy" decoding="async" draggable={false} />}
                <span className={s.name}>{g.name}</span>
                {(g.open || g.w >= 150) && <span className={`${s.value} num`}>{measure === 'files' ? f.number(g.files) : f.bytes(g.bytes)}</span>}
              </span>
            ) : plain && g.w > 46 && g.h > 24 && <span className={s.small}>{g.name}</span>}
            {g.cells.map((c) => {
              const hotC = hot === c.id && (g.open || hot !== g.id);
              const label = c.kind === 'none' ? t('stats.noColor') : c.name;
              return (
                <div key={c.key} data-key={c.key} className={s.cell} data-kind={c.kind} data-open={c.open || undefined} data-gone={c.gone || undefined} data-hot={hotC || undefined}
                  style={{ left: c.x, top: c.y, width: c.w, height: c.h, '--c': c.color ?? 'transparent' }}
                  onPointerEnter={c.open ? undefined : (e) => { e.stopPropagation(); enter(e, { hot: g.open ? c.id : g.id, kind: c.kind, color: c.color, name: label, group: g.open ? null : g.name, bytes: c.bytes, files: c.files, prefetch: scopeOf(g, c) }); }}
                  onPointerLeave={c.open ? undefined : (e) => { e.stopPropagation(); if (!g.open) enter(e, { hot: g.id, kind: 'group', name: g.name, bytes: g.bytes, files: g.files, cells: g.cells.length }); else leave(); }}
                  onClick={c.open || c.gone ? undefined : (e) => { e.stopPropagation(); onColor(g.id, g.configId, c.id); }}>
                  {(c.open ? c.head : g.open && c.w >= 64 && c.h >= 36) && (
                    <span className={s.cellHead}><i />{label}<span className={`${s.value} num`}>{measure === 'files' ? f.number(c.files) : f.bytes(c.bytes)}</span></span>
                  )}
                  {c.tiles?.map((x) => <Tile key={x.key} x={x} measure={measure} enter={enter} leave={leave} onFile={onFile} />)}
                </div>
              );
            })}
            {g.tiles?.map((x) => <Tile key={x.key} x={x} measure={measure} enter={enter} leave={leave} onFile={onFile} />)}
          </div>
        );
      })}
      {data && data.rest.files > 0 && (data.scope.kind === 'color' || !data.scope.config) && (
        <span className={`${s.restNote} num`}>{t('stats.rest', { n: f.number(data.rest.files), count: data.rest.files, size: f.bytes(data.rest.bytes) })}</span>
      )}
      <div ref={tip} className={s.tip} data-on={info ? '' : undefined}>
        {info && <TipBody info={info} measure={measure} />}
      </div>
    </div>
  );
});

/** A file, drawn as itself. */
function Tile({ x, measure, enter, leave, onFile }) {
  const t = useT();
  const f = useStatsFormat();
  if (x.rest) {
    return (
      <div className={s.rest} style={{ left: x.x, top: x.y, width: x.w, height: x.h }}
        onPointerEnter={(e) => { e.stopPropagation(); enter(e, { kind: 'rest', name: t('stats.rest', { n: f.number(x.rest.files), count: x.rest.files, size: f.bytes(x.rest.bytes) }) }); }}
        onPointerLeave={(e) => { e.stopPropagation(); leave(); }}>
        {x.w > 60 && x.h > 30 && <span>+{f.number(x.rest.files)}</span>}
      </div>
    );
  }
  const file = x.file;
  return (
    <div className={s.tile} style={{ left: x.x, top: x.y, width: x.w, height: x.h }}
      onPointerEnter={(e) => { e.stopPropagation(); enter(e, { kind: 'file', name: `${file.name}.${file.ext}`, bytes: file.size, file }); }}
      onPointerLeave={(e) => { e.stopPropagation(); leave(); }}
      onClick={(e) => { e.stopPropagation(); onFile(file); }}>
      <img src={mediaUrl(file, x.w > 220 || x.h > 220 ? 'medium' : 'low')} alt="" loading="lazy" decoding="async" draggable={false} />
      {file.kind === 'video' && <span className={s.play}><Icon name="play" size={10} /></span>}
      {measure === 'size' && x.w > 74 && x.h > 40 && <span className={`${s.tileSize} num`}>{f.bytes(file.size)}</span>}
    </div>
  );
}

function TipBody({ info, measure }) {
  const t = useT();
  const f = useStatsFormat();
  if (info.kind === 'rest') return <span className={s.tipName}>{info.name}</span>;
  return (
    <>
      <span className={s.tipName}>
        {(info.kind === 'color' || info.kind === 'none') && <i style={{ background: info.color ?? 'transparent' }} data-none={info.kind === 'none' || undefined} />}
        {info.name}
      </span>
      {info.group && <span className={s.tipSub}>{info.group}</span>}
      <span className={s.tipValue}>
        <strong>{measure === 'files' && info.kind !== 'file' ? t('stats.files', { n: f.number(info.files), count: info.files }) : f.bytes(info.bytes)}</strong>
        {info.kind === 'file' ? `${info.file.width} × ${info.file.height}` : measure === 'files' ? f.bytes(info.bytes) : t('stats.files', { n: f.number(info.files), count: info.files })}
      </span>
      {info.kind === 'group' && info.cells > 0 && <span className={s.tipSub}>{t('stats.colorGroups', { n: info.cells, count: info.cells })}</span>}
    </>
  );
}

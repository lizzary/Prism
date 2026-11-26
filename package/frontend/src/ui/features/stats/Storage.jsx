// The storage part: any scope of the gallery — the whole of it, a group, a colour group (or a group's files in none) —
// as its structure (Treemap), its parts ranked (groups, colour groups or file types), how its files spread over sizes
// and types, and its largest files. Every row leads further in, or out to the page it belongs to.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl, prefetchStatsScope, statsRules, useStatsFiles, useStatsScope } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton, Segmented, Select } from '../../components/controls.jsx';
import { Spinner } from '../../components/feedback.jsx';
import { GroupCover } from '../../components/GroupSelector.jsx';
import { Treemap } from './Treemap.jsx';
import { TYPE_COLOR, useStatsFormat } from './look.js';
import s from './Storage.module.css';

const { NONE, BUCKETS } = statsRules;
const ROW = 46;

/** A callback that never changes, calling whatever was passed last. */
function useStable(fn) {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback((...args) => ref.current(...args), []);
}
const same = (a, b) => (a.groupId ?? null) === (b.groupId ?? null) && (a.colorId ?? null) === (b.colorId ?? null) && (!b.configId || a.configId === b.configId);
const scopeOfData = (sc) => ({ groupId: sc.group?.id ?? null, configId: sc.config?.id ?? null, colorId: sc.color?.id ?? null });

export const Storage = memo(function Storage({ scope, onScope, filter, onFilter, measure, onMeasure, leave }) {
  const t = useT();
  const f = useStatsFormat();
  const { data, loading } = useStatsScope(scope);
  const [hot, setHot] = useState(null);
  // where the backend says the scope is (a group deleted meanwhile is the whole gallery again): the page follows it
  const shown = data ? scopeOfData(data.scope) : null;
  useEffect(() => {
    if (!loading && data && !same(shown, scope)) onScope(shown);
  }, [loading, data]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setHot(null); }, [data?.scope.kind, data?.scope.group?.id, data?.scope.color?.id]);

  const onGroup = useStable((id) => onScope({ groupId: id }));
  const onColor = useStable((groupId, configId, colorId) => onScope({ groupId, configId, colorId }));
  const onFile = useStable((file) => leave.file(file));
  const onPrefetch = useStable((q) => prefetchStatsScope(q));
  const measures = useMemo(() => [{ value: 'size', label: t('stats.measure.size') }, { value: 'files', label: t('stats.measure.files') }], [t]);

  if (!data) return <div className={s.wait}><Spinner size={20} /></div>;
  const kind = data.scope.kind;
  const sc = data.scope;
  return (
    <div className={s.storage} data-loading={loading || undefined}>
      <header className={s.bar}>
        <Crumbs sc={sc} onScope={onScope} />
        <div className={s.tools}>
          {kind !== 'all' && data.configs.length > 0 && (
            <label className={s.config}>
              <span>{t('stats.splitBy')}</span>
              <Select size="sm" value={sc.config?.id ?? data.configs.find((c) => c.active)?.id} label={t('stats.splitBy')}
                onChange={(v) => onScope({ groupId: sc.group.id, configId: v })}
                options={data.configs.map((c) => ({ value: c.id, label: `${c.name} · ${c.colorGroups}` }))} />
            </label>
          )}
          <Segmented size="sm" value={measure} onChange={onMeasure} options={measures} label={t('stats.measure.label')} />
          {kind !== 'all' && (
            <button type="button" className={s.out} onClick={() => (sc.color ? leave.color(sc.group.id, sc.config?.id, sc.color.id) : leave.group(sc.group.id))}>
              {sc.color ? t('stats.showInGroup') : t('stats.openGroup')}<Icon name="arrow-up-right" size={14} />
            </button>
          )}
        </div>
      </header>

      <ScopeHead data={data} />

      <section className={s.top}>
        <div className={s.panel}>
          <div className={s.panelHead}>
            <h3>{t('stats.structure')}</h3>
            <span className={s.hint}>{t('stats.structureTip')}</span>
          </div>
          <div className={s.mapBox}>
            <Treemap data={data} measure={measure} hot={hot} onHot={setHot} onGroup={onGroup} onColor={onColor} onFile={onFile} onPrefetch={onPrefetch} />
          </div>
        </div>
        <Parts data={data} measure={measure} hot={hot} onHot={setHot} onGroup={onGroup} onColor={onColor} filter={filter} onFilter={onFilter} leave={leave} />
      </section>

      <section className={s.bottom}>
        <Sizes data={data} measure={measure} filter={filter} onFilter={onFilter} />
        <Files scope={shown} filter={filter} onFilter={onFilter} onOpen={onFile} />
      </section>
    </div>
  );
});

/** Where the scope is: the gallery, its group, its colour group — each a step back up. */
function Crumbs({ sc, onScope }) {
  const t = useT();
  const steps = [{ key: 'all', label: t('stats.gallery'), icon: 'gallery', to: {} }];
  if (sc.group) steps.push({ key: 'group', label: sc.group.name, cover: sc.group, to: { groupId: sc.group.id, configId: sc.config?.id } });
  if (sc.color) steps.push({ key: 'color', label: sc.color.id === NONE ? t('stats.noColor') : sc.color.name, color: sc.color, to: null });
  return (
    <nav className={s.crumbs} aria-label={t('stats.scope')}>
      {steps.map((x, i) => {
        const last = i === steps.length - 1;
        const body = (
          <>
            {x.icon && <Icon name={x.icon} size={15} />}
            {x.cover && <GroupCover group={x.cover} className={s.crumbCover} />}
            {x.color && <i className={s.dot} style={{ background: x.color.color ?? 'transparent' }} data-none={x.color.id === NONE || undefined} />}
            <span className={s.crumbText}>{x.label}</span>
          </>
        );
        return (
          <span key={x.key} className={s.crumbStep}>
            {i > 0 && <Icon name="chevron-right" size={14} className={s.crumbSep} />}
            {last ? <span className={s.crumb} aria-current="page">{body}</span>
              : <button type="button" className={s.crumb} onClick={() => onScope(x.to)} aria-label={t('stats.up', { name: x.label })}>{body}</button>}
          </span>
        );
      })}
    </nav>
  );
}

/** The scope's name and its figures: size (and its share of the whole above it), files, colour groups, the typical file. */
function ScopeHead({ data }) {
  const t = useT();
  const f = useStatsFormat();
  const sc = data.scope;
  const name = sc.color ? (sc.color.id === NONE ? t('stats.noColor') : sc.color.name) : sc.group?.name ?? t('stats.gallery');
  const share = data.share ? (sc.kind === 'group' ? t('stats.shareOf.all', { p: f.pct(data.bytes, data.share.bytes) }) : t('stats.shareOf.group', { p: f.pct(data.bytes, data.share.bytes), name: sc.group.name })) : null;
  const colorGroups = sc.kind === 'all' ? data.children.reduce((n, g) => n + g.colorGroups, 0) : sc.kind === 'group' ? data.children.filter((c) => c.kind === 'color').length : null;
  return (
    <div className={s.head} key={`${sc.kind}:${sc.group?.id}:${sc.color?.id}`}>
      <h3 className={s.name}>
        {sc.color && <i className={s.dotBig} style={{ background: sc.color.color ?? 'transparent' }} data-none={sc.color.id === NONE || undefined} />}
        {name}
      </h3>
      <dl className={s.figures}>
        <div className={s.fig}>
          <dt>{t('stats.fig.size')}</dt>
          <dd><span className={s.figBig}>{f.bytes(data.bytes)}</span>{share && <span className={s.figSub}>{share}</span>}</dd>
        </div>
        <div className={s.fig}>
          <dt>{t('stats.fig.files')}</dt>
          <dd>
            <span className={s.figBig}>{f.number(data.files)}</span>
            <span className={s.figSub}>{t('stats.pictures', { n: f.number(data.images), count: data.images })} · {t('stats.videos', { n: f.number(data.videos), count: data.videos })}</span>
          </dd>
        </div>
        {colorGroups != null && (
          <div className={s.fig}>
            <dt>{t('stats.fig.colorGroups')}</dt>
            <dd>
              <span className={s.figBig}>{f.number(colorGroups)}</span>
              <span className={s.figSub}>{sc.kind === 'group' ? sc.config?.name ?? t('stats.noColorGroups') : t('stats.groups', { n: f.number(data.children.length), count: data.children.length })}</span>
            </dd>
          </div>
        )}
        <div className={s.fig}>
          <dt>{t('stats.fig.median')}</dt>
          <dd><span className={s.figBig}>{f.bytes(data.median)}</span><span className={s.figSub}>{t('stats.fig.mean')} {f.bytes(data.mean)}</span></dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * The scope's parts, largest first — the map's rows: the gallery's groups, a group's colour groups (each with the mix of
 * its file types), or a colour group's file types (which narrow the files below).
 */
function Parts({ data, measure, hot, onHot, onGroup, onColor, filter, onFilter, leave }) {
  const t = useT();
  const f = useStatsFormat();
  const sc = data.scope;
  const byTypes = sc.kind === 'color' || (sc.kind === 'group' && !sc.config);
  const value = (x) => (measure === 'files' ? x.files : x.bytes);
  const rows = useMemo(() => {
    const list = byTypes ? data.types.map((x) => ({ ...x, id: x.type, kind: 'type' })) : data.children;
    return [...list].sort((a, b) => value(b) - value(a));
  }, [data, measure]); // eslint-disable-line react-hooks/exhaustive-deps
  const max = Math.max(1, ...rows.map(value));
  const total = measure === 'files' ? data.files : data.bytes;
  const title = byTypes ? t('stats.children.color') : t(`stats.children.${sc.kind}`);
  // what a row does, the same function for every row and every render (rows are drawn again only when they change)
  const press = useStable((x) => {
    if (x.kind === 'group') onGroup(x.id);
    else if (x.kind === 'type') onFilter({ ...filter, type: filter.type === x.type ? null : x.type });
    else onColor(sc.group.id, sc.config.id, x.id);
  });
  const out = useStable((x) => (x.kind === 'group' ? leave.group(x.id) : leave.color(sc.group.id, sc.config.id, x.id)));
  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <h3>{title}</h3>
        <span className={`${s.count} num`}>{f.number(rows.length)}</span>
      </div>
      <ul className={s.parts} onPointerLeave={() => onHot(null)}>
        {rows.map((x) => (
          <PartRow key={x.id} x={x} measure={measure} max={max} total={total} hot={hot === x.id} chosen={x.kind === 'type' && filter.type === x.type}
            onHot={onHot} onPress={press} onOut={out} />
        ))}
      </ul>
    </div>
  );
}

const PartRow = memo(function PartRow({ x, measure, max, total, hot, chosen, onHot, onPress, onOut }) {
  const t = useT();
  const f = useStatsFormat();
  const v = measure === 'files' ? x.files : x.bytes;
  const color = x.kind === 'type' ? TYPE_COLOR[x.type] : x.kind === 'color' ? x.color : x.kind === 'none' ? 'var(--ink-4)' : 'var(--st-files)';
  const name = x.kind === 'type' ? f.typeName(x.type) : x.kind === 'none' ? t('stats.noColor') : x.name;
  const out = x.kind !== 'type';
  return (
    <li className={s.part} data-hot={hot || undefined} data-chosen={chosen || undefined}
      onPointerEnter={() => { onHot(x.id); if (x.kind === 'group') prefetchStatsScope({ groupId: x.id }); }}>
      <button type="button" className={s.partMain} onClick={() => onPress(x)} aria-pressed={x.kind === 'type' ? chosen : undefined}>
        {x.kind === 'group' ? <GroupCover group={x} className={s.partCover} />
          : <i className={s.partKey} data-kind={x.kind} style={{ background: x.kind === 'none' ? 'transparent' : color }} />}
        <span className={s.partText}>
          <span className={s.partName}>{name}</span>
          <span className={s.partMeta}>
            {measure === 'files' ? f.bytes(x.bytes) : t('stats.files', { n: f.number(x.files), count: x.files })}
            {x.kind === 'group' && x.colorGroups > 0 && <> · {t('stats.colorGroups', { n: x.colorGroups, count: x.colorGroups })}</>}
            {(x.kind === 'color' || x.kind === 'none') && x.types?.length > 0 && <TypeMix types={x.types} />}
          </span>
        </span>
        <span className={s.partFig}>
          <span className={`${s.partValue} num`}>{measure === 'files' ? f.number(v) : f.bytes(v)}</span>
          <span className={s.track}><i style={{ width: `${Math.max(1.5, (v / max) * 100)}%`, background: color }} /></span>
          <span className={`${s.partShare} num`}>{f.pct(v, total)}</span>
        </span>
      </button>
      {out && <IconButton size="sm" icon="arrow-up-right" className={s.partOut} label={x.kind === 'group' ? t('stats.openGroup') : t('stats.showInGroup')} onClick={() => onOut(x)} />}
    </li>
  );
});

/** A colour group's files by type: a small tag for each (the most common first; the rest counted together). */
function TypeMix({ types }) {
  const f = useStatsFormat();
  const list = [...types].sort((a, b) => b.files - a.files);
  const shown = list.slice(0, 3), more = list.slice(3);
  return (
    <span className={s.mix}>
      {shown.map((x) => <span key={x.type} className={s.mixTag}><i style={{ background: TYPE_COLOR[x.type] }} />{f.typeName(x.type)}<em className="num">{f.number(x.files)}</em></span>)}
      {more.length > 0 && <span className={s.mixTag}>+{more.length}</span>}
    </span>
  );
}

/** A column's top block: rounded where the data ends, square where it stands. */
function topBlock(x, y, w, h, r) {
  const k = Math.min(r, h, w / 2);
  return `M${x} ${y + h}V${y + k}Q${x} ${y} ${x + k} ${y}H${x + w - k}Q${x + w} ${y} ${x + w} ${y + k}V${y + h}Z`;
}

/**
 * How the scope's files spread over sizes: a column for each bucket, stacked by file type — the number of files, or the
 * space they take. A column, or a type below, narrows the files on the right to it.
 */
function Sizes({ data, measure, filter, onFilter }) {
  const t = useT();
  const f = useStatsFormat();
  const box = useRef(null);
  const [w, setW] = useState(480);
  const [hot, setHot] = useState(null);
  useLayoutEffect(() => {
    // (a hidden part measures nothing: keep the last width)
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.width > 0) setW(Math.round(e.contentRect.width)); });
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const types = data.types.map((x) => x.type);
  const value = (b) => (measure === 'files' ? b.files : b.bytes);
  const max = Math.max(1, ...data.buckets.map(value));
  const total = measure === 'files' ? data.files : data.bytes;
  const H = 230, BASE = H - 36, TOP = 26;
  const slot = (w - 8) / data.buckets.length;
  const barW = Math.min(28, slot * 0.42);
  const y = (v) => BASE - (v / max) * (BASE - TOP);
  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <h3>{measure === 'files' ? t('stats.sizes.files') : t('stats.sizes.size')}</h3>
        {(filter.bucket || filter.type) && (
          <button type="button" className={s.clear} onClick={() => onFilter({ bucket: null, type: null })}>{t('stats.clearFilter')}</button>
        )}
      </div>
      <div ref={box} className={s.hist} style={{ height: H }} onPointerLeave={() => setHot(null)}>
        <svg width={w} height={H} aria-hidden="true">
          <line x1={0} x2={w} y1={BASE + 0.5} y2={BASE + 0.5} className={s.baseline} />
          {data.buckets.map((b, i) => {
            const cx = 4 + slot * i + slot / 2, x = cx - barW / 2;
            const v = value(b);
            const parts = types.filter((ty) => b.types[ty]).map((ty) => ({ ty, v: measure === 'files' ? b.types[ty].files : b.types[ty].bytes }));
            let acc = 0;
            return (
              <g key={b.id} className={s.col} data-dim={(filter.bucket && filter.bucket !== b.id) || undefined} data-hot={hot === b.id || undefined}>
                {parts.map((p, k) => {
                  const bottom = y(acc) - (k ? 2 : 0), top = y(acc + p.v);
                  acc += p.v;
                  const h = Math.max(0.75, bottom - top);
                  const dim = filter.type && filter.type !== p.ty;
                  return k === parts.length - 1
                    ? <path key={p.ty} d={topBlock(x, top, barW, h, 4)} fill={TYPE_COLOR[p.ty]} opacity={dim ? 0.22 : 1} />
                    : <rect key={p.ty} x={x} y={top} width={barW} height={h} fill={TYPE_COLOR[p.ty]} opacity={dim ? 0.22 : 1} />;
                })}
                <text x={cx} y={(v > 0 ? y(v) : BASE) - 7} className={s.colValue} textAnchor="middle">{v > 0 ? (measure === 'files' ? f.compact(v) : f.bytes(v)) : '0'}</text>
                <text x={cx} y={BASE + 18} className={s.colLabel} textAnchor="middle">{f.bucket(b)}</text>
              </g>
            );
          })}
        </svg>
        {data.buckets.map((b, i) => (
          <button key={b.id} type="button" className={s.colHit} style={{ left: 4 + slot * i, width: slot }} aria-pressed={filter.bucket === b.id}
            aria-label={`${f.bucket(b)} · ${t('stats.files', { n: f.number(b.files), count: b.files })} · ${f.bytes(b.bytes)}`}
            onPointerEnter={() => setHot(b.id)} onFocus={() => setHot(b.id)} onBlur={() => setHot(null)}
            onClick={() => onFilter({ ...filter, bucket: filter.bucket === b.id ? null : b.id })}>
            {hot === b.id && (
              <span className={s.colTip} data-edge={i === 0 ? 'start' : i === data.buckets.length - 1 ? 'end' : undefined} style={{ bottom: H - (value(b) > 0 ? y(value(b)) : BASE) + 24 }}>
                <strong>{measure === 'files' ? t('stats.files', { n: f.number(b.files), count: b.files }) : f.bytes(b.bytes)}</strong>
                <span>{measure === 'files' ? f.bytes(b.bytes) : t('stats.files', { n: f.number(b.files), count: b.files })} · {f.pct(value(b), total)}</span>
                {types.filter((ty) => b.types[ty]).map((ty) => (
                  <span key={ty} className={s.colTipRow}><i style={{ background: TYPE_COLOR[ty] }} />{f.typeName(ty)}<em className="num">{measure === 'files' ? f.number(b.types[ty].files) : f.bytes(b.types[ty].bytes)}</em></span>
                ))}
              </span>
            )}
          </button>
        ))}
      </div>
      <div className={s.types}>
        {data.types.map((x) => (
          <button key={x.type} type="button" className={s.typeChip} data-on={filter.type === x.type || undefined} aria-pressed={filter.type === x.type}
            onClick={() => onFilter({ ...filter, type: filter.type === x.type ? null : x.type })}>
            <i style={{ background: TYPE_COLOR[x.type] }} />
            <span className={s.typeName}>{f.typeName(x.type)}</span>
            <span className={`${s.typeCount} num`}>{measure === 'files' ? f.number(x.files) : f.bytes(x.bytes)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The scope's files, the largest first (narrowed to a size or a type): each opens in its group. */
function Files({ scope, filter, onFilter, onOpen }) {
  const t = useT();
  const f = useStatsFormat();
  const { data } = useStatsFiles({ ...scope, bucket: filter.bucket, type: filter.type, limit: 400 });
  const list = useRef(null);
  const [top, setTop] = useState(0);
  const [height, setHeight] = useState(420);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setHeight(e.contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = `${scope?.groupId}|${scope?.colorId}|${filter.bucket}|${filter.type}`;
  useEffect(() => { if (list.current) list.current.scrollTop = 0; setTop(0); }, [key]);
  const rows = data?.rows ?? [];
  const max = rows[0]?.size ?? 1;
  const from = Math.max(0, Math.floor(top / ROW) - 6);
  const to = Math.min(rows.length, Math.ceil((top + height) / ROW) + 6);
  const bucket = filter.bucket ? BUCKETS.find((b) => b.id === filter.bucket) : null;
  const onRow = useStable(onOpen);
  return (
    <div className={s.panel}>
      <div className={s.panelHead}>
        <h3>{filter.bucket || filter.type ? t('stats.matching') : t('stats.largest')}</h3>
        {bucket && <Chip onClear={() => onFilter({ ...filter, bucket: null })}>{f.bucket({ ...bucket, max: Number.isFinite(bucket.max) ? bucket.max : null })}</Chip>}
        {filter.type && <Chip color={TYPE_COLOR[filter.type]} onClear={() => onFilter({ ...filter, type: null })}>{f.typeName(filter.type)}</Chip>}
        {data && <span className={`${s.count} num`}>{t('stats.files', { n: f.number(data.total), count: data.total })} · {f.bytes(data.bytes)}</span>}
      </div>
      <div ref={list} className={s.files} onScroll={(e) => setTop(e.currentTarget.scrollTop)}>
        {!data ? <div className={s.wait}><Spinner size={18} /></div> : !rows.length ? <div className={s.none}>{t('stats.emptyScope')}</div> : (
          <div className={s.filesInner} style={{ height: rows.length * ROW + (data.total > rows.length ? 40 : 0) }}>
            {rows.slice(from, to).map((r, i) => <FileRow key={r.id} r={r} at={(from + i) * ROW} max={max} onOpen={onRow} />)}
            {data.total > rows.length && (
              <div className={s.more} style={{ top: rows.length * ROW }}>{t('stats.moreFiles', { n: f.number(data.total - rows.length), count: data.total - rows.length })}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const FileRow = memo(function FileRow({ r, at, max, onOpen }) {
  const t = useT();
  const f = useStatsFormat();
  return (
    <button type="button" className={s.file} style={{ top: at }} onClick={() => onOpen(r)} title={t('common.open')}>
      <span className={s.thumb}>
        <img src={mediaUrl(r, 'low')} alt="" loading="lazy" decoding="async" draggable={false} />
        {r.kind === 'video' && <Icon name="play" size={9} className={s.thumbPlay} />}
      </span>
      <span className={s.fileText}>
        <span className={s.fileName}>{r.name}<span className={s.ext}>.{r.ext}</span></span>
        <span className={s.fileWhere}>
          {r.group}
          {r.color && <><Icon name="chevron-right" size={11} /><i style={{ background: r.color.color }} />{r.color.name}</>}
        </span>
      </span>
      <span className={`${s.fileDims} num`}>{r.width} × {r.height}</span>
      <span className={s.fileFig}>
        <span className={`${s.fileSize} num`}>{f.bytes(r.size)}</span>
        <span className={s.fileBar}><i style={{ width: `${Math.max(2, (r.size / max) * 100)}%` }} /></span>
      </span>
      <Icon name="arrow-right" size={15} className={s.fileGo} />
    </button>
  );
}, (a, b) => a.r === b.r && a.at === b.at && a.max === b.max);

function Chip({ children, color, onClear }) {
  const t = useT();
  return (
    <span className={s.chip}>
      {color && <i style={{ background: color }} />}
      {children}
      <button type="button" onClick={onClear} aria-label={t('common.clear')}><Icon name="close" size={11} /></button>
    </span>
  );
}

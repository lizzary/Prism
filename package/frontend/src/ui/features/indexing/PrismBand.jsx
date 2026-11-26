// The night over the index page: the Prism mark, drawn large. Starlight — the gallery's files — comes in from the left;
// the prism lets it out as three rays, one for each kind of index, and each ray runs on as that kind's measure: lit as
// far as its files are up to date, shimmering where they are being built, striped where they are outdated, dark where
// they are not indexed yet. While a kind is being built, light runs down its ray to where the work is. Pressing a part
// of a ray shows those files; on the right, what is waiting and the way to index it — or the work under way.
import { useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { useNow } from '../../lib/useNow.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton } from '../../components/controls.jsx';
import { ModelCatalog } from '../models/ModelPicker.jsx';
import { KIND_ICON, NIGHT_RAY } from './kinds.js';
import s from './PrismBand.module.css';

export const BAND_H = 170;
const ROWS = [46, 90, 134];
const KINDS = ['tagging', 'embedding', 'metadata'];
/** The prism: its apex, and its base from lx to rx. */
const P = { ax: 120, ay: 34, lx: 74, rx: 166, by: 142 };
const onRight = (t) => [P.ax + (P.rx - P.ax) * t, P.ay + (P.by - P.ay) * t];
const onLeft = (t) => [P.ax - (P.ax - P.lx) * t, P.ay + (P.by - P.ay) * t];
const ENTRY = onLeft(0.58);
const EXITS = [onRight(0.42), onRight(0.5), onRight(0.58)];
const BEND = [-21, -2, 15];
const BEAM = [14, 120];
/** Where the rays straighten out into their measures; the room the summary on the right takes. */
const X0 = 252;
const SIDE = 252;
/** A bar's parts, in order along the ray. */
const PARTS = ['done', 'queued', 'stale', 'failed', 'missing'];

const f1 = (n) => n.toFixed(1);
const rayPath = (k) => {
  const [ex, ey] = EXITS[k];
  return `M${f1(ex)} ${f1(ey)}C${f1(ex + 46)} ${f1(ey + BEND[k])} ${X0 - 56} ${ROWS[k]} ${X0} ${ROWS[k]}`;
};
/** Catmull-Rom → cubic Bézier through the points: smooth, never a chain of corners. */
function smooth(pts, start = 'M') {
  let d = `${start}${f1(pts[0][0])} ${f1(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${f1(p1[0] + (p2[0] - p0[0]) / 6)} ${f1(p1[1] + (p2[1] - p0[1]) / 6)} ${f1(p2[0] - (p3[0] - p1[0]) / 6)} ${f1(p2[1] - (p3[1] - p1[1]) / 6)} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d;
}
/**
 * One arm of the swirl as a brushstroke, the way the home painting's sky is laid on: a shape either side of a spiral
 * that swells in its middle and tapers to a point at both ends.
 */
function swirlArm(c, { r0, r1, turns, phase, width, squash = 0.8, steps = 56 }) {
  const spine = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, a = phase + t * turns * Math.PI * 2, r = r0 + (r1 - r0) * Math.pow(t, 0.85);
    spine.push([c + r * Math.cos(a), c + r * Math.sin(a) * squash]);
  }
  const left = [], right = [];
  spine.forEach(([x, y], i) => {
    const [ax, ay] = spine[Math.max(0, i - 1)], [bx, by] = spine[Math.min(steps, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const w = width * Math.pow(Math.sin(Math.PI * (i / steps)), 0.9);
    const nx = (-(by - ay) / len) * w, ny = ((bx - ax) / len) * w;
    left.push([x + nx, y + ny]);
    right.push([x - nx, y - ny]);
  });
  return `${smooth(left)}${smooth(right.reverse(), 'L')}Z`;
}
/** The swirl turning in the corner of the sky: its arms (cream and the pale blue of the painting), widest near the eye. */
const SWIRL_R = 120;
const SWIRL_ARMS = [
  { r0: 5, r1: 96, turns: 1.18, phase: 0.2, width: 4.6, tone: 'cream' },
  { r0: 9, r1: 82, turns: 1.08, phase: 2.3, width: 3.6, tone: 'blue' },
  { r0: 14, r1: 108, turns: 0.96, phase: 4.4, width: 3, tone: 'blue' },
  { r0: 34, r1: 116, turns: 0.62, phase: 1.25, width: 1.7, tone: 'cream' },
].map((a) => ({ ...a, d: swirlArm(SWIRL_R, a) }));
const SPARKS = [[0.3, 12, 1.1], [0.43, 160, 0.9], [0.55, 10, 1.2], [0.64, 161, 1], [0.79, 14, 0.9], [0.9, 158, 1.2], [0.07, 30, 0.8], [0.18, 160, 1]];

/**
 * Lengths of a bar's parts (px), in PARTS order: in proportion to their files, none so small it can't be seen.
 */
function partsOf(c, total, width) {
  const raw = PARTS.map((p) => (total ? (c[p] / total) * width : 0));
  const small = raw.map((v, i) => (c[PARTS[i]] > 0 && v < 3 ? 3 : 0));
  const grow = small.reduce((a, b) => a + b, 0) - raw.reduce((a, v, i) => a + (small[i] ? v : 0), 0);
  const big = raw.reduce((a, v, i) => a + (small[i] ? 0 : v), 0);
  const k = big > 0 ? Math.max(0, (big - grow) / big) : 1;
  let x = 0;
  return raw.map((v, i) => { const len = small[i] || v * k; const part = { part: PARTS[i], x, len }; x += len; return part; });
}

export function PrismBand({ overview, focus, onFocus, onIndexWaiting, onCancel, starting }) {
  const t = useT();
  const fmt = useFormat();
  useNow();
  const box = useRef(null);
  const [w, setW] = useState(1180);
  const [hot, setHot] = useState(null);              // { kind, part } pointed at
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const x1 = Math.max(X0 + 140, w - SIDE - 26);
  const barW = x1 - X0;
  const total = overview.total;
  const active = overview.active;
  const building = active?.state === 'running' ? active.stage : null;
  const glow = !!building;

  // Three layers: the sky's own slow motion (a turning swirl, twinkling stars, the prism's glow) moved by the compositor;
  // the drawing of the measures, which is painted again only when the numbers change; and the light that runs (no
  // filters, so its every frame is cheap).
  return (
    <div ref={box} className={s.band} data-active={glow || undefined} style={{ height: BAND_H }}>
      <div className={s.swirl} style={{ left: w - 58 - SWIRL_R, top: 64 - SWIRL_R }} aria-hidden="true">
        <svg width={SWIRL_R * 2} height={SWIRL_R * 2} viewBox={`0 0 ${SWIRL_R * 2} ${SWIRL_R * 2}`}>
          <defs>
            {/* each arm fades as it leaves the eye of the swirl */}
            <radialGradient id="pr-swirl-cream" gradientUnits="userSpaceOnUse" cx={SWIRL_R} cy={SWIRL_R} r={SWIRL_R}>
              <stop offset="0" stopColor="#fff6dc" stopOpacity=".62" /><stop offset=".5" stopColor="#fff6dc" stopOpacity=".26" /><stop offset="1" stopColor="#fff6dc" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="pr-swirl-blue" gradientUnits="userSpaceOnUse" cx={SWIRL_R} cy={SWIRL_R} r={SWIRL_R}>
              <stop offset="0" stopColor="#b4d0ea" stopOpacity=".6" /><stop offset=".55" stopColor="#b4d0ea" stopOpacity=".22" /><stop offset="1" stopColor="#b4d0ea" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="pr-swirl-eye"><stop offset="0" stopColor="#fff6dc" stopOpacity=".5" /><stop offset="1" stopColor="#fff6dc" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx={SWIRL_R} cy={SWIRL_R} r="20" fill="url(#pr-swirl-eye)" />
          {SWIRL_ARMS.map((a) => <path key={a.phase} d={a.d} fill={`url(#pr-swirl-${a.tone})`} />)}
        </svg>
      </div>
      {SPARKS.map(([fx, y, r], i) => (
        <i key={i} className={s.spark} style={{ left: fx * w - r, top: y - r, width: r * 2, height: r * 2, '--d': `${(i * 0.7) % 3.2}s` }} aria-hidden="true" />
      ))}
      <i className={s.prismGlow} style={{ left: P.ax + 6 - 66, top: 92 - 66 }} aria-hidden="true" />
      <svg className={s.sky} width={w} height={BAND_H} viewBox={`0 0 ${w} ${BAND_H}`} aria-hidden="true">
        <defs>
          <filter id="pr-ray-glow" filterUnits="userSpaceOnUse" x="0" y="0" width={w} height={BAND_H}><feGaussianBlur stdDeviation="2.6" /></filter>
          {/* the prism: glass that catches the light at its apex */}
          <linearGradient id="pr-glass" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor="#3a4f8f" />
            <stop offset="0.55" stopColor="#22326a" />
            <stop offset="1" stopColor="#1a2858" />
          </linearGradient>
          <linearGradient id="pr-facet" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f6f0de" stopOpacity=".2" />
            <stop offset="1" stopColor="#f6f0de" stopOpacity="0" />
          </linearGradient>
          {/* outdated: the ray in stripes (the mask in the band's own units — a line has no height of its own) */}
          <pattern id="pr-stale" width="5" height="6" patternUnits="userSpaceOnUse" patternTransform="skewX(-30)">
            <rect width="2.4" height="6" fill="#fff" />
          </pattern>
          <mask id="pr-stale-mask" maskUnits="userSpaceOnUse" x="0" y="0" width={w} height={BAND_H}><rect width={w} height={BAND_H} fill="url(#pr-stale)" /></mask>
        </defs>
        {/* the files coming in as a thread of starlight, and the prism that splits it */}
        <path d={`M${BEAM[0]} ${BEAM[1]}L${f1(ENTRY[0])} ${f1(ENTRY[1])}`} className={s.beam} />
        <path d={`M${P.ax} ${P.ay}L${P.rx} ${P.by}H${P.lx}Z`} className={s.prism} />
        <path d={`M${P.ax} ${P.ay}L${f1(P.ax + (P.rx - P.lx) * 0.2)} ${P.by}H${P.lx}Z`} fill="url(#pr-facet)" />
        <path d={`M${P.ax} ${P.ay}L${f1(P.ax + (P.rx - P.lx) * 0.2)} ${P.by}`} className={s.facet} />
        <path d={`M${f1(ENTRY[0])} ${f1(ENTRY[1])}L${f1(EXITS[1][0])} ${f1(EXITS[1][1])}`} className={s.inner} />

        {KINDS.map((kind, k) => {
          const c = overview.kinds[kind];
          const y = ROWS[k];
          const color = NIGHT_RAY[kind];
          if (!c.available) {
            return (
              <g key={kind} className={s.off}>
                <path d={rayPath(k)} stroke={color} />
                <line x1={X0} x2={x1} y1={y} y2={y} />
              </g>
            );
          }
          const parts = partsOf(c, total, barW);
          const done = parts[0];
          const dim = hot && hot.kind !== kind;
          return (
            <g key={kind} className={s.ray} data-dim={dim || undefined} style={{ '--c': color }}>
              <line x1={X0} x2={x1} y1={y} y2={y} className={s.track} />
              <g filter="url(#pr-ray-glow)" className={s.glow}>
                <path d={rayPath(k)} />
                {done.len > 0 && <line x1={X0} x2={X0 + done.len} y1={y} y2={y} />}
              </g>
              <path d={rayPath(k)} className={s.fan} />
              {parts.filter((p) => p.len > 0 && p.part !== 'missing').map((p) => (
                <line key={p.part} x1={X0 + p.x} x2={X0 + p.x + p.len} y1={y} y2={y} className={s.part} data-part={p.part}
                  mask={p.part === 'stale' ? 'url(#pr-stale-mask)' : undefined}
                  data-hot={(hot?.kind === kind && hot.part === p.part) || (focus?.kind === kind && focus.state === p.part) || undefined} />
              ))}
            </g>
          );
        })}
      </svg>
      <svg className={s.sky} width={w} height={BAND_H} viewBox={`0 0 ${w} ${BAND_H}`} aria-hidden="true">
        {glow && <path d={`M${BEAM[0]} ${BEAM[1]}L${f1(ENTRY[0])} ${f1(ENTRY[1])}`} className={s.beamTravel} />}
        {KINDS.map((kind, k) => {
          const c = overview.kinds[kind];
          if (!c.available) return null;
          const [done, queued] = partsOf(c, total, barW);
          const y = ROWS[k];
          return (
            <g key={kind} style={{ '--c': NIGHT_RAY[kind] }}>
              {/* being built: light flows along the waiting part */}
              {queued.len > 4 && <line x1={X0 + queued.x} x2={X0 + queued.x + queued.len} y1={y} y2={y} className={s.flow} />}
              {building === kind && (
                <>
                  <path d={`${rayPath(k)}H${f1(X0 + Math.max(4, done.len))}`} className={s.travelHalo} pathLength="1" />
                  <path d={`${rayPath(k)}H${f1(X0 + Math.max(4, done.len))}`} className={s.travel} pathLength="1" />
                </>
              )}
            </g>
          );
        })}
      </svg>
      <i className={s.glint} style={{ left: P.ax - 2.5, top: P.ay - 1.5 }} aria-hidden="true" />

      <span className={`${s.entering} num`} style={{ left: BEAM[0] - 2, top: BAND_H - 24 }}>{t('index.files', { n: fmt.number(total), count: total })}</span>

      {KINDS.map((kind, k) => {
        const c = overview.kinds[kind];
        const parts = c.available ? partsOf(c, total, barW) : [];
        const rest = ['queued', 'stale', 'missing', 'failed'].filter((p) => c[p] > 0);
        return (
          <div key={kind} className={s.row} style={{ top: ROWS[k] - 27, left: X0, width: barW, '--c': NIGHT_RAY[kind] }} data-off={!c.available || undefined}
            onPointerLeave={() => setHot(null)}>
            <span className={s.label}>
              <Icon name={KIND_ICON[kind]} size={14} className={s.kindIcon} />
              <span className={s.kindName}>{t(`index.kinds.${kind}`)}</span>
              {kind !== 'metadata' && <ModelChip kind={kind} model={c.model} />}
            </span>
            {c.available && (
              <span className={`${s.numbers} num`}>
                {rest.map((p) => (
                  <button key={p} type="button" className={s.count} data-part={p} data-hot={(hot?.kind === kind && hot.part === p) || undefined}
                    onPointerEnter={() => setHot({ kind, part: p })} onClick={() => onFocus({ kind, state: p })}>
                    {t(`index.counts.${p}`, { n: fmt.number(c[p]), count: c[p] })}
                  </button>
                ))}
                <button type="button" className={s.of} onPointerEnter={() => setHot({ kind, part: 'done' })} onClick={() => onFocus({ kind, state: 'done' })}>
                  {t('index.of', { n: fmt.number(c.done), total: fmt.number(total) })}
                </button>
              </span>
            )}
            {/* each part of the measure can be pressed: those files are listed below */}
            {parts.filter((p) => p.len > 0).map((p) => (
              <button key={p.part} type="button" className={s.hit} style={{ left: p.x, width: p.len }} aria-label={t(`index.counts.${p.part}`, { n: c[p.part], count: c[p.part] })}
                onPointerEnter={() => setHot({ kind, part: p.part })} onClick={() => onFocus({ kind, state: p.part })} />
            ))}
          </div>
        );
      })}

      <div className={s.side} style={{ width: SIDE - 24 }}>
        {active ? <Working active={active} more={overview.tasks - 1} waiting={overview.waiting} onCancel={onCancel} onIndexWaiting={onIndexWaiting} starting={starting} />
          : overview.waiting > 0 ? (
            <div className={s.summary} key="waiting">
              <span className={`${s.big} num`}>{fmt.number(overview.waiting)}</span>
              <span className={s.bigLabel}>{t('index.waiting', { count: overview.waiting })}</span>
              <span className={s.when}>{overview.lastIndexedAt ? t('index.lastIndexed', { when: fmt.relative(overview.lastIndexedAt) }) : t('index.neverIndexed')}</span>
              <Button variant="primary" tone="art" size="sm" icon="reindex" className={s.go} loading={starting} onClick={onIndexWaiting}>
                {t('index.indexWaiting', { n: fmt.number(overview.waiting), count: overview.waiting })}
              </Button>
            </div>
          ) : (
            <div className={s.summary} key="clean">
              <span className={s.clean}><Icon name="check" size={16} stroke={2} /></span>
              <span className={s.cleanTitle}>{total ? t('index.upToDate') : t('index.emptyTitle')}</span>
              {total > 0 && <span className={s.when}>{overview.lastIndexedAt ? t('index.lastIndexed', { when: fmt.relative(overview.lastIndexedAt) }) : t('index.neverIndexed')}</span>}
            </div>
          )}
      </div>
    </div>
  );
}

/** The model building a kind, named on its ray: pressing it opens that kind's catalog right there (or offers one). */
function ModelChip({ kind, model }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  return (
    <>
      {model ? (
        <button ref={ref} type="button" className={s.model} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className={s.modelName}>{model.name}</span><Icon name="chevron-down" size={11} />
        </button>
      ) : (
        <button ref={ref} type="button" className={s.choose} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {t('index.noModel')}<span>{t('index.chooseModel')}</span><Icon name="chevron-down" size={12} />
        </button>
      )}
      <ModelCatalog kind={kind} open={open} onClose={() => setOpen(false)} anchor={ref} />
    </>
  );
}

/** The index task under way: which kind, how far, what it is working through — a way to stop it, and what else waits. */
function Working({ active, more, waiting, onCancel, onIndexWaiting, starting }) {
  const t = useT();
  const fmt = useFormat();
  const running = active.state === 'running' && KINDS.includes(active.stage);
  const k = active.kinds.indexOf(active.stage);
  const p = running && active.total ? active.processed / active.total : 0;
  const where = active.origin ? t(`index.origin.${active.origin}`)
    : active.groups.length ? (active.groups.length > 1 ? t('tasks.scopeMany', { name: active.groups[0], n: active.groups.length, more: active.groups.length - 1 }) : active.groups[0]) : '';
  return (
    <div className={s.summary} key="working">
      <span className={s.kicker}>
        <i className={s.pulse} data-wait={!running || undefined} />{running ? t('index.indexing') : t('index.queuedTask')}
        {more > 0 && <span className={s.more}>{t('index.moreTasks', { n: more, count: more })}</span>}
      </span>
      <span className={s.stage}>
        {running ? (active.kinds.length > 1 ? t('index.stage', { kind: t(`index.kinds.${active.stage}`), k: k + 1, n: active.kinds.length }) : t(`index.kinds.${active.stage}`))
          : t('index.files', { n: fmt.number(active.files), count: active.files })}
        {where && <span className={s.where} title={where}>{where}</span>}
      </span>
      <span className={s.progressRow}>
        <span className={s.progress} style={{ '--p': p, '--c': running ? NIGHT_RAY[active.stage] : 'rgba(246,240,222,.4)' }} data-wait={!running || undefined}><i /></span>
        {running && <span className={`${s.progressNum} num`}>{fmt.number(active.processed)} / {fmt.number(active.total)}</span>}
        <IconButton icon="close" size="sm" tone="art" label={t('index.cancel')} onClick={() => onCancel(active.id)} />
      </span>
      {waiting > 0 && (
        <button type="button" className={`${s.alsoWaiting} num`} disabled={starting} onClick={onIndexWaiting}>
          <Icon name="plus" size={12} stroke={2} />{t('index.alsoWaiting', { n: fmt.number(waiting), count: waiting })}
        </button>
      )}
    </div>
  );
}

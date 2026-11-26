// The storage part's night sky: everything in the database folder, as starlight through the Prism mark. The beam
// comes in from the total; the prism lets it out as a ray for each part of the folder — the files, their previews,
// the database, the image index, the backup history — and each ray lands on its own block of the spectrum, a bar as
// long as the folder is large. On the right, the drive the folder is on, and how much room is left on it.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { statsRules, useStorage, useSetting } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { PART_COLOR, useStatsFormat } from './look.js';
import s from './Spectrum.module.css';

const H = 176;
const HERO_W = 256;           // the total, on the left
const DRIVE_W = 214;          // the drive, on the right (wide skies only)
const BAR_Y = 100, BAR_H = 26;
const GAP = 2, MIN_PART = 3;
/** The prism (relative to its left edge): apex, base. */
const P = { ax: 42, ay: 30, lx: 6, rx: 78, by: 116 };
const onRight = (t) => [P.ax + (P.rx - P.ax) * t, P.ay + (P.by - P.ay) * t];
const onLeft = (t) => [P.ax - (P.ax - P.lx) * t, P.ay + (P.by - P.ay) * t];

/** Where each part's block sits on the bar: as long as its share, none so small it can't be seen; 2px of night between. */
function layoutParts(parts, total, width) {
  const shown = parts.filter((p) => p.bytes > 0);
  const room = Math.max(0, width - GAP * Math.max(0, shown.length - 1));
  const raw = shown.map((p) => (total ? (p.bytes / total) * room : 0));
  const lift = raw.map((v) => (v < MIN_PART ? MIN_PART - v : 0));
  const big = raw.reduce((n, v, i) => n + (lift[i] ? 0 : v), 0);
  const k = big > 0 ? Math.max(0, (big - lift.reduce((a, b) => a + b, 0)) / big) : 1;
  let x = 0;
  return shown.map((p, i) => {
    const w = lift[i] ? MIN_PART : raw[i] * k;
    const at = { ...p, x, w };
    x += w + GAP;
    return at;
  });
}

export function Spectrum({ onPart }) {
  const t = useT();
  const f = useStatsFormat();
  const { data } = useStorage();
  const dbPath = useSetting('dbPath');
  const uid = useId().replace(/[^\w-]/g, '');
  const box = useRef(null);
  const [w, setW] = useState(1180);
  const [hot, setHot] = useState(null);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const wide = w >= 1040;
  const prismX = HERO_W + 20;
  const bx0 = prismX + 112, bx1 = w - (wide ? DRIVE_W + 52 : 28);
  const barW = Math.max(120, bx1 - bx0);
  const parts = data?.parts ?? statsRules.PARTS.map((id) => ({ id, bytes: 0 }));
  const total = data?.total ?? 0;
  const blocks = useMemo(() => layoutParts(parts, total, barW), [parts, total, barW]);
  // the rays leave the prism's far face one above another: the block farthest away takes the highest, so none cross
  const rays = blocks.map((b, i) => {
    const tFace = blocks.length > 1 ? 0.66 - (0.24 * i) / (blocks.length - 1) : 0.56;
    const [ex, ey] = onRight(tFace);
    return { id: b.id, x1: prismX + ex, y1: ey, x2: bx0 + b.x + b.w / 2, y2: BAR_Y - 1 };
  });
  const entry = onLeft(0.6);
  const hotPart = blocks.find((b) => b.id === hot);
  const growth = data?.growth;
  const growthText = !growth ? '' : growth.bytes > 0 ? t('stats.growth.up', { size: f.bytes(growth.bytes) })
    : growth.bytes < 0 ? t('stats.growth.down', { size: f.bytes(-growth.bytes) }) : t('stats.growth.none');
  const drive = data?.drive;

  return (
    <div ref={box} className={s.band} style={{ height: H }} data-ready={data ? '' : undefined} onPointerLeave={() => setHot(null)}>
      {[[0.36, 22, 1.1], [0.52, 12, 0.9], [0.63, 18, 1.2], [0.71, 40, 1], [0.86, 168, 0.9], [0.92, 34, 1.1], [0.46, 54, 0.8], [0.2, 168, 0.9]].map(([fx, y, r], i) => (
        <i key={i} className={s.spark} style={{ left: fx * w - r, top: y - r, width: r * 2, height: r * 2, '--d': `${(i * 0.8) % 3.4}s` }} aria-hidden="true" />
      ))}

      {/* the total */}
      <div className={s.hero} style={{ width: HERO_W }}>
        <span className={s.kicker} title={dbPath}><Icon name="database" size={13} />{dbPath}</span>
        <span className={s.total}>{f.bytes(total)}</span>
        <span className={s.sub}>
          {data ? `${t('stats.files', { n: f.number(data.files), count: data.files })} · ${t('stats.groups', { n: f.number(data.groups), count: data.groups })}` : ' '}
        </span>
        {growthText && <span className={s.growth} data-dir={growth.bytes > 0 ? 'up' : growth.bytes < 0 ? 'down' : undefined}>{growthText}</span>}
      </div>

      {/* the light: in from the total, through the prism, a ray to each block */}
      <i className={s.glow} style={{ left: prismX + P.ax - 70, top: 76 - 70 }} aria-hidden="true" />
      <svg className={s.sky} width={w} height={H} viewBox={`0 0 ${w} ${H}`} aria-hidden="true">
        <defs>
          <filter id="st-ray-glow" filterUnits="userSpaceOnUse" x="0" y="0" width={w} height={H}><feGaussianBlur stdDeviation="2.4" /></filter>
          <linearGradient id="st-glass" x1="0" y1="0" x2="0.35" y2="1">
            <stop offset="0" stopColor="#3a4f8f" /><stop offset="0.55" stopColor="#22326a" /><stop offset="1" stopColor="#1a2858" />
          </linearGradient>
          <linearGradient id="st-facet" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#f6f0de" stopOpacity=".2" /><stop offset="1" stopColor="#f6f0de" stopOpacity="0" />
          </linearGradient>
          {/* each ray is brightest as it leaves the prism, and thins out on its way to its block */}
          {rays.map((r) => (
            <linearGradient key={r.id} id={`${uid}${r.id}`} gradientUnits="userSpaceOnUse" x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2}>
              <stop offset="0" stopColor={PART_COLOR[r.id]} stopOpacity="1" /><stop offset="1" stopColor={PART_COLOR[r.id]} stopOpacity="0.3" />
            </linearGradient>
          ))}
        </defs>
        <path d={`M${HERO_W - 26} 104L${prismX + entry[0]} ${entry[1]}`} className={s.beam} />
        <g filter="url(#st-ray-glow)" className={s.rayGlow}>
          {rays.map((r) => <line key={r.id} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={PART_COLOR[r.id]} data-dim={(hot && hot !== r.id) || undefined} />)}
        </g>
        {rays.map((r, i) => (
          <line key={r.id} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke={`url(#${uid}${r.id})`} className={s.ray} style={{ '--k': i }}
            data-dim={(hot && hot !== r.id) || undefined} data-hot={hot === r.id || undefined} />
        ))}
        <g transform={`translate(${prismX} 0)`}>
          <path d={`M${P.ax} ${P.ay}L${P.rx} ${P.by}H${P.lx}Z`} className={s.prism} />
          <path d={`M${P.ax} ${P.ay}L${P.ax + (P.rx - P.lx) * 0.2} ${P.by}H${P.lx}Z`} fill="url(#st-facet)" />
          <path d={`M${P.ax} ${P.ay}L${P.ax + (P.rx - P.lx) * 0.2} ${P.by}`} className={s.facet} />
        </g>
      </svg>
      <i className={s.glint} style={{ left: prismX + P.ax - 2.5, top: P.ay - 1.5 }} aria-hidden="true" />

      {/* the spectrum: a block for each part, its share on it where it fits */}
      <div className={s.bar} style={{ left: bx0, top: BAR_Y, width: barW, height: BAR_H }}>
        {blocks.map((b, i) => {
          const share = f.pct(b.bytes, total);
          const label = `${t(`stats.parts.${b.id}`)} · ${f.bytes(b.bytes)} · ${share}`;
          const go = (b.id === 'snapshots' || b.id === 'index') ? () => onPart(b.id) : undefined;
          return (
            <button key={b.id} type="button" className={s.block} style={{ left: b.x, width: b.w, '--c': PART_COLOR[b.id], '--k': i }} aria-label={label}
              data-dim={(hot && hot !== b.id) || undefined} data-go={go ? '' : undefined} tabIndex={go ? 0 : -1}
              onPointerEnter={() => setHot(b.id)} onFocus={() => setHot(b.id)} onBlur={() => setHot(null)} onClick={go}>
              {b.w > 46 && <span className={`${s.share} num`}>{share}</span>}
            </button>
          );
        })}
      </div>
      {hotPart && (
        <div className={s.tip} style={{ left: Math.max(bx0, Math.min(bx0 + hotPart.x + hotPart.w / 2, bx0 + barW)), top: BAR_Y - 10 }} key={hotPart.id}>
          <span className={s.tipHead}><i style={{ background: PART_COLOR[hotPart.id] }} />{t(`stats.parts.${hotPart.id}`)}</span>
          <span className={s.tipValue}>{f.bytes(hotPart.bytes)}<span>{f.pct(hotPart.bytes, total)}</span></span>
          <span className={s.tipDesc}>{t(`stats.partsDesc.${hotPart.id}`)}</span>
          {(hotPart.id === 'snapshots' || hotPart.id === 'index') && <span className={s.tipGo}>{t(`stats.partOpen.${hotPart.id}`)}<Icon name="arrow-right" size={12} /></span>}
        </div>
      )}

      {/* the parts by name, in the bar's order (one with nothing in it stays, quietly) */}
      {/* (on a narrow sky it starts under the prism, for the room) */}
      <ul className={s.legend} style={{ left: wide ? bx0 : prismX + 6, top: BAR_Y + BAR_H + 12, width: wide ? barW : bx1 - prismX - 6 }}>
        {parts.map((p) => {
          const go = (p.id === 'snapshots' || p.id === 'index') && p.bytes > 0 ? () => onPart(p.id) : undefined;
          return (
            <li key={p.id}>
              <button type="button" className={s.item} data-empty={!p.bytes || undefined} data-dim={(hot && hot !== p.id) || undefined} data-go={go ? '' : undefined}
                onPointerEnter={() => p.bytes && setHot(p.id)} onClick={go} tabIndex={go ? 0 : -1}>
                <i style={{ background: PART_COLOR[p.id] }} />
                <span className={s.itemName}>{t(`stats.parts.${p.id}`)}</span>
                <span className={`${s.itemSize} num`}>{p.bytes ? f.bytes(p.bytes) : '—'}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* the drive: the room left on it */}
      {wide && drive && (
        <div className={s.drive} style={{ width: DRIVE_W }}>
          <span className={s.kicker}><Icon name="drive" size={13} />{t('stats.drive', { name: drive.name })}</span>
          <span className={s.free}>{t('stats.free', { size: f.bytes(drive.free) })}</span>
          <span className={s.meter} aria-hidden="true">
            <i className={s.meterPrism} style={{ width: `${Math.max(1.5, (total / drive.total) * 100)}%` }} />
            <i className={s.meterOther} style={{ width: `${Math.max(0, ((drive.total - drive.free - total) / drive.total) * 100)}%` }} />
          </span>
          <span className={s.driveSub}>{t('stats.ofTotal', { size: f.bytes(drive.total) })} · {t('stats.prismShare', { p: f.pct(total, drive.total) })}</span>
        </div>
      )}
    </div>
  );
}

// The map of the whiteboard: every colour group as a small patch of its colour, and a starlit frame for the part of the
// board in view. It always shows the view too — wandered off into the empty board, the colour groups shrink into a
// corner of the map, so the way back is plain. Press anywhere on it to fly there, or drag across it; pointing at a
// colour group names it underneath. Beside it, the zoom: smaller, how close, larger, and back to the whole board.
import { useLayoutEffect, useRef, useState } from 'react';
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { IconButton } from '../../../components/controls.jsx';
import { Tooltip } from '../../../components/overlay.jsx';
import s from './Board.module.css';

const W = 220, H = 140;

/** The board rectangle the map shows: the colour groups and the view, letterboxed to the map's proportions. */
function frameOf(b, v) {
  let x0 = Math.min(b.x, v.x), y0 = Math.min(b.y, v.y);
  let fw = Math.max(b.x + b.w, v.x + v.w) - x0, fh = Math.max(b.y + b.h, v.y + v.h) - y0;
  const pad = Math.max(fw, fh) * 0.05;
  x0 -= pad; y0 -= pad; fw += 2 * pad; fh += 2 * pad;
  if (fw / fh > W / H) { const nh = (fw * H) / W; y0 -= (nh - fh) / 2; fh = nh; } else { const nw = (fh * W) / H; x0 -= (nw - fw) / 2; fw = nw; }
  return { x: x0, y: y0, w: fw, h: fh };
}

export function Minimap({ stage, scene, inView, hot, lit, reached, selected, onHide }) {
  const t = useT();
  const fmt = useFormat();
  const svg = useRef(null);
  const view = useRef(null);
  const frameRef = useRef(null);
  const [pointed, setPointed] = useState(null);
  const drag = useRef(null);

  useLayoutEffect(() => {
    const paint = (st) => {
      if (!scene.bounds || !svg.current) return;
      const v = st.view();
      const f = frameOf(scene.bounds, v);
      frameRef.current = f;
      svg.current.setAttribute('viewBox', `${f.x} ${f.y} ${f.w} ${f.h}`);
      const el = view.current;
      el.setAttribute('x', v.x); el.setAttribute('y', v.y); el.setAttribute('width', v.w); el.setAttribute('height', v.h);
    };
    paint(stage);
    return stage.onFrame(paint);
  }, [stage, scene]);

  const toBoard = (e) => {
    const f = frameRef.current, r = svg.current.getBoundingClientRect();
    return f ? [f.x + ((e.clientX - r.left) / r.width) * f.w, f.y + ((e.clientY - r.top) / r.height) * f.h] : null;
  };
  const regionAt = (p) => (p ? scene.regions.find((r) => p[0] >= r.x && p[0] <= r.x + r.w && p[1] >= r.y && p[1] <= r.y + r.h) ?? null : null);
  const centreOn = (p, fly) => {
    if (!p) return;
    const c = stage.camera;
    const next = { ...c, x: p[0], y: p[1] };
    if (fly) stage.flyTo(next); else stage.set(next);
  };

  const r0 = pointed && scene.regions.find((r) => r.key === pointed);
  return (
    <div className={s.minimap}>
      <svg ref={svg} className={s.mapSvg} width={W} height={H} preserveAspectRatio="xMidYMid meet" role="img" aria-label={t('board.minimap')}
        onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { moved: false }; }}
        onPointerMove={(e) => {
          const p = toBoard(e);
          if (drag.current) { drag.current.moved = true; centreOn(p, false); return; }
          const r = regionAt(p);
          setPointed(r?.key ?? null);
        }}
        onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && !d.moved) centreOn(toBoard(e), true); }}
        onPointerLeave={() => { if (!drag.current) setPointed(null); }}>
        {scene.regions.map((r) => (
          <rect key={r.key} x={r.x} y={r.y} width={r.w} height={r.h} rx={18} className={s.mapRegion} style={{ '--c': r.color ?? 'var(--ink-3)' }}
            data-none={r.none || undefined} data-in={inView.has(r.key) || undefined} data-hot={(hot === r.key || pointed === r.key) || undefined}
            data-lit={lit?.has(r.key) || undefined} data-dim={(reached && !reached.has(r.key)) || undefined} data-sel={selected.get(r.key) ? '' : undefined} />
        ))}
        <rect ref={view} className={s.mapView} rx={8} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className={s.mapFoot}>
        <span className={s.mapName}>
          {r0 ? <><i style={{ '--c': r0.color ?? 'var(--ink-3)' }} data-none={r0.none || undefined} />{r0.name ?? t('group.colors.noColor')}<span className="num">{fmt.number(r0.n)}</span></>
            : <span className={s.mapHint}>{t('board.mapHint')}</span>}
        </span>
        <IconButton size="sm" icon="close" label={t('board.hideMap')} onClick={onHide} />
      </div>
    </div>
  );
}

/** − how close + · back to the whole board (and the map, when it is put away). */
export function ZoomBar({ stage, onFit, map, onMap }) {
  const t = useT();
  const pct = useRef(null);
  useLayoutEffect(() => {
    const show = (c) => { if (pct.current) pct.current.textContent = `${Math.round(c.z * 100)}%`; };
    show(stage.camera);
    return stage.onMove(show);
  }, [stage]);
  const at = () => [stage.viewport.w / 2, stage.viewport.h / 2];
  return (
    <div className={s.zoom}>
      <IconButton size="sm" icon="minus" label={`${t('board.zoomOut')} · −`} onClick={() => stage.zoomBy(1 / 1.35, ...at(), true)} />
      <Tooltip label={`${t('board.zoom100')} · 1`}>
        <button type="button" ref={pct} className={`${s.zoomPct} num`} onClick={() => stage.zoomBy(1 / stage.camera.z, ...at(), true)} aria-label={t('board.zoom100')} />
      </Tooltip>
      <IconButton size="sm" icon="plus" label={`${t('board.zoomIn')} · +`} onClick={() => stage.zoomBy(1.35, ...at(), true)} />
      <span className={s.zoomSep} />
      <IconButton size="sm" icon="fit" label={`${t('board.centre')} · 0`} onClick={onFit} />
      {map && <IconButton size="sm" icon="layers" label={t('board.showMap')} onClick={onMap} />}
    </div>
  );
}


// The whiteboard drawn with the DOM: a region for each colour group, its files as square cards in it. One transformed
// layer holds them all (the camera moves only that layer); a region's place is written by the stage every frame it
// glides, its cards sit inside it, and only the cards near the view exist. The drawing takes no pointer events: the
// board hit-tests its scene (see Board), so another renderer can take this one's place without anything else changing.
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl } from '../../../../../bridge/index.js';
import { Icon } from '../../../../icons/Icon.jsx';
import { useFormat } from '../../../../lib/format.js';
import { CARD, cardOffset, cardSpan } from '../scene.js';
import s from './DomRenderer.module.css';

/** Cards are drawn this far beyond the view (in screen px), so a pan never shows them arriving. */
const MARGIN = 700;
/** How a card looks at a zoom: a plain swatch of its colour (far), its picture (mid), with its marks (near). */
const TIERS = [['far', 0], ['mid', 22], ['near', 58]];
function tierOf(z, was) {
  const px = z * CARD;
  let tier = 'far';
  for (const [name, at] of TIERS) {
    // a little give either way, so a zoom resting on an edge does not flicker between the two
    const edge = name === was ? at * 0.92 : at * 1.08;
    if (px >= edge) tier = name;
  }
  return tier;
}

/**
 * stage: stage.js · scene: scene.js · files: Map(id → file) · covers: Map(id → place among the group's covers)
 * look: { selected: Set, preview: Set | null (inside the marquee), carried: Set | null (being dragged), lit: Set | null
 *   (found, or carrying a tag pointed at — the rest step back), hot: id (under the pointer), fresh: Set | null (just
 *   arrived), leaving: Set | null (being deleted), target: region key (files would land there), hotRegion, liftedRegion,
 *   litRegions: Set | null (found by name), reached: Set | null (a search reached them, by name or files: the rest step
 *   back), pour: { ids: Set, from: [x, y], at, order } | null (files just dropped: they pour in from there),
 *   resizing: region key (being resized) }
 * A region framed smaller than its cards (see scene.js) clips them, fading out along the framed edges, and says how
 * many are past the frame.
 */
export const DomRenderer = memo(function DomRenderer({ stage, scene, files, covers, look, layerRef }) {
  const world = useRef(null);
  const regionEls = useRef(new Map());
  const [win, setWin] = useState(() => windowAround(stage));
  const [tier, setTier] = useState(() => tierOf(stage.camera.z, null));
  const tierRef = useRef(tier);
  tierRef.current = tier;

  // every frame: the camera's transform on the layer, and the regions where they are shown (when they moved).
  // While the camera moves the layer is a picture the compositor slides and scales (cheap, a little soft when zoomed);
  // a moment after it rests the hint is dropped, and the layer is drawn again, sharp, at the zoom it came to rest at.
  useLayoutEffect(() => {
    const written = new Map();
    let lastCam = '', settle = 0;
    const paint = (st) => {
      const { camera: c, viewport: vp } = st;
      const el = world.current;
      const tf = `translate3d(${vp.w / 2 - c.x * c.z}px, ${vp.h / 2 - c.y * c.z}px, 0) scale(${c.z})`;
      if (el && tf !== lastCam) {
        if (lastCam) {
          el.style.willChange = 'transform';
          clearTimeout(settle);
          settle = setTimeout(() => { el.style.willChange = 'auto'; }, 180);
        }
        lastCam = tf;
        el.style.transform = tf;
      }
      for (const [key, el] of regionEls.current) {
        const r = st.rect(key);
        if (!r) continue;
        const last = written.get(key);
        if (last && last.x === r.x && last.y === r.y && last.w === r.w && last.h === r.h && last.el === el) continue;
        el.style.transform = `translate3d(${r.x}px, ${r.y}px, 0)`;
        el.style.width = `${r.w}px`;
        el.style.height = `${r.h}px`;
        written.set(key, { ...r, el });
      }
    };
    paint(stage);
    const off = stage.onFrame(paint);
    return () => { off(); clearTimeout(settle); };
  }, [stage, scene]);

  // in steps: which cards exist (the view and a margin round it), and how they look at this zoom
  useEffect(() => stage.onMove((c) => {
    const v = stage.view();
    setWin((w) => (inside(v, w, MARGIN * 0.35 / c.z) ? w : windowAround(stage)));
    const t = tierOf(c.z, tierRef.current);
    if (t !== tierRef.current) setTier(t);
  }), [stage]);

  return (
    // (the board has the layer too, in the same commit: the gathering at the start begins on its very first frame)
    <div ref={(el) => { world.current = el; if (layerRef) layerRef.current = el; }} className={s.world} data-tier={tier}>
      {scene.regions.map((r) => (
        <Region key={r.key} r={r} win={win} tier={tier} files={files} covers={covers} look={look}
          refEl={(el) => { if (el) regionEls.current.set(r.key, el); else regionEls.current.delete(r.key); }} />
      ))}
    </div>
  );
});

function windowAround(stage) {
  const v = stage.view(), m = MARGIN / stage.camera.z;
  return { x: v.x - m, y: v.y - m, w: v.w + 2 * m, h: v.h + 2 * m };
}
/** Is the view `v` still well inside the drawn window `w` (by `slack` board px)? */
const inside = (v, w, slack) => v.x - slack >= w.x && v.y - slack >= w.y && v.x + v.w + slack <= w.x + w.w && v.y + v.h + slack <= w.y + w.h;

const Region = memo(function Region({ r, win, tier, files, covers, look, refEl }) {
  const fmt = useFormat();
  // the cards that meet the window (only the rows and columns there)
  const span = useMemo(() => cardSpan(r, win), [r, win]);
  const cards = [];
  if (span) {
    for (let row = span.r0; row < span.r1; row++) {
      for (let c = span.c0; c < span.c1; c++) {
        const k = row * r.cols + c;
        if (k >= r.n) break;
        cards.push(k);
      }
    }
  }
  const pour = look.pour;
  return (
    <div ref={refEl} className={s.region} data-region={r.key} style={{ '--c': r.color ?? 'var(--ink-3)' }}
      data-none={r.none || undefined} data-plain={r.plain || undefined} data-empty={!r.n || undefined}
      data-target={look.target === r.key || undefined} data-hot={look.hotRegion === r.key || undefined}
      data-lifted={look.liftedRegion === r.key || undefined} data-lit={look.litRegions?.has(r.key) || undefined}
      data-dim={(look.reached && !look.reached.has(r.key)) || undefined} data-resizing={look.resizing === r.key || undefined}
      data-crop-x={r.cropX || undefined} data-crop-y={r.cropY || undefined}>
      <div className={s.body} />
      {!r.n && <div className={s.drop}><Icon name="drag-drop" size={20} /></div>}
      <div className={s.cards}>
      {cards.map((k) => {
        const id = r.ids[k];
        const f = files.get(id);
        if (!f) return null;
        const [dx, dy] = cardOffset(r, k);
        const poured = pour?.ids.has(id) ? [pour.from[0] - (r.x + dx), pour.from[1] - (r.y + dy), pour.at, pour.order.get(id) ?? 0] : null;
        return (
          <Card key={id} file={f} dx={dx} dy={dy} tier={tier} cover={covers.get(id)}
            sel={look.selected.has(id)} pre={look.preview?.has(id) ?? false} carried={look.carried?.has(id) ?? false}
            dim={!!look.lit && !look.lit.has(id)} lit={look.lit?.has(id) ?? false} hot={look.hot === id}
            fresh={look.fresh?.has(id) ?? false} leaving={look.leaving?.has(id) ?? false} poured={poured} />
        );
      })}
      </div>
      {r.hidden > 0 && <span className={`${s.more} num`}>+{fmt.number(r.hidden)}</span>}
      <i className={s.grip} aria-hidden="true" />
    </div>
  );
});

/** A small angle of a card's own (±1.5°, never 0), the same every time: chosen cards tilt by it, like picked-up prints. */
function tiltOf(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const k = (Math.abs(h) % 6) - 3;
  return `${(k >= 0 ? k + 1 : k) * 0.5}deg`;
}

/** A picture seen once in this session appears at once after that (no fade). */
const seen = new Set();
function CardImage({ src }) {
  const [ready, setReady] = useState(() => seen.has(src));
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (seen.has(src) || (ref.current?.complete && ref.current.naturalWidth)) { seen.add(src); setReady(true); }
  }, [src]);
  return <img ref={ref} className={s.img} src={src} alt="" draggable={false} loading="lazy" decoding="async" data-ready={ready || undefined} onLoad={() => { seen.add(src); setReady(true); }} />;
}

const Card = memo(function Card({ file, dx, dy, tier, cover, sel, pre, carried, dim, lit, hot, fresh, leaving, poured }) {
  const face = useRef(null);
  // its picture is fetched the first time it is close enough to be seen, and kept after that: further out it is only
  // hidden (the card shows its colour), so zooming out and back in again costs nothing
  const pictured = useRef(false);
  if (tier !== 'far') pictured.current = true;
  // dropped here: it pours in from where it was let go, the batch one after another
  useLayoutEffect(() => {
    if (!poured || !face.current || performance.now() - poured[2] > 600) return;
    const [fx, fy, , n] = poured;
    face.current.animate(
      [{ transform: `translate(${fx}px, ${fy}px) scale(0.42)`, opacity: 0.4 }, { transform: 'none', opacity: 1 }],
      { duration: 560, delay: Math.min(n, 24) * 14, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'backwards' },
    );
  }, [poured?.[2]]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={s.card} style={{ transform: `translate(${dx}px, ${dy}px)`, '--tilt': tiltOf(file.id) }} data-card={file.id}
      data-sel={sel || undefined} data-pre={pre || undefined} data-carried={carried || undefined} data-dim={dim || undefined}
      data-lit={lit || undefined} data-hot={hot || undefined} data-fresh={fresh || undefined} data-leaving={leaving || undefined}>
      <div ref={face} className={s.face} style={file.tone ? { '--tone': file.tone } : undefined}>
        {pictured.current && <CardImage src={mediaUrl(file, 'medium')} />}
        {tier === 'near' && file.kind === 'video' && <span className={s.play}><Icon name="play" size={11} /></span>}
        {tier === 'near' && cover != null && <span className={s.cover} data-main={cover === 0 || undefined}><Icon name="cover" size={12} /></span>}
      </div>
    </div>
  );
});

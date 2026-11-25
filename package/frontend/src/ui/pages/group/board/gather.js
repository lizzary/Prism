// The whiteboard arriving and leaving. Opened from the page, the tiles on screen gather onto the board: each picture
// flies from its tile to its card — evenly scaled and cropped from the tile's shape to the card's square, as the
// lightbox does — while the board's paper rises over the page and the regions, headings and tools come in behind them.
// Leaving, the cards in view fly back to their tiles as the board lifts off the page. The page's tiles are hidden while
// the board is open (`data-board` on the root), so nothing is ever seen twice.
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { CARD, cardOffset } from './scene.js';

const EASE_OUT = 'cubic-bezier(.22,1,.36,1)';
const EASE_IN_OUT = 'cubic-bezier(.65,0,.35,1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The page's tiles on screen: fileId → their rectangle. */
function tilesOnScreen() {
  const out = new Map();
  for (const el of document.querySelectorAll('[data-file-id]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) out.set(el.dataset.fileId, r);
  }
  return out;
}

/**
 * The transform that lays a card (`c`: its square on screen, side S) over a tile `t` the way the tile shows it: scaled
 * evenly until it covers the tile, cropped to it with the tile's corners, centred on it. In the card's own units (the
 * board's: a card is CARD wide), for an element transformed about its centre.
 */
function onTile(t, c, z) {
  const S = CARD * z;
  const k = Math.max(t.width / S, t.height / S);
  const dx = (t.left + t.width / 2 - (c.left + S / 2)) / z, dy = (t.top + t.height / 2 - (c.top + S / 2)) / z;
  const ix = Math.max(0, (CARD - t.width / (k * z)) / 2), iy = Math.max(0, (CARD - t.height / (k * z)) / 2);
  return { transform: `translate(${dx}px, ${dy}px) scale(${k})`, clipPath: `inset(${iy}px ${ix}px round ${5 / (k * z)}px)` };
}
const ON_CARD = { transform: 'none', clipPath: 'inset(0px 0px round 7px)' };

/** → { phase: 'enter' | 'open' | 'leave', leave() → promise once gone } */
export function useGather({ stage, scene, layer, world, withPage }) {
  const [phase, setPhase] = useState(withPage || reduced() ? 'open' : 'enter');
  const done = useRef(false);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  // the page's tiles are the board's from now on: hidden under it, so a picture is never seen twice
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.board = '';
    return () => { delete root.dataset.board; };
  }, []);

  /** Each card in view with its square on screen: [{ id, face, rect }] */
  const cardsInView = useCallback(() => {
    if (!world.current) return [];
    const { camera: c, viewport: vp } = stage;
    const out = [];
    for (const el of world.current.querySelectorAll('[data-card]')) {
      const id = el.dataset.card;
      const w = sceneRef.current.where.get(id);
      if (!w) continue;
      const r = sceneRef.current.regions[w[0]];
      const [dx, dy] = cardOffset(r, w[1]);
      const x = r.x + dx, y = r.y + dy;
      const left = vp.w / 2 + (x - c.x) * c.z, top = vp.h / 2 + (y - c.y) * c.z, S = CARD * c.z;
      if (left + S < 0 || top + S < 0 || left > vp.w || top > vp.h) continue;
      out.push({ id, face: el.firstElementChild, rect: { left, top } });
    }
    return out;
  }, [stage, world]);

  // arriving: the tiles on screen fly to their cards (once), and the board is fully in a moment later
  useLayoutEffect(() => {
    if (phase !== 'enter') return undefined;
    const id = setTimeout(() => setPhase('open'), 640);
    if (done.current || !world.current) return () => clearTimeout(id);
    done.current = true;
    const tiles = tilesOnScreen();
    const z = stage.camera.z;
    const cards = cardsInView();
    const cx = innerWidth / 2, cy = innerHeight / 2;
    for (const { id, face, rect } of cards) {
      const t = tiles.get(id);
      if (t) {
        // nearer the middle first, so the board fills from its heart outwards
        const d = Math.hypot(t.left + t.width / 2 - cx, t.top + t.height / 2 - cy) / Math.hypot(cx, cy);
        face.animate([onTile(t, rect, z), ON_CARD], { duration: 620, delay: d * 70, easing: EASE_OUT, fill: 'backwards' });
      } else {
        face.animate([{ opacity: 0, transform: 'scale(0.86)' }, { opacity: 1, transform: 'none' }], { duration: 520, delay: 160, easing: EASE_OUT, fill: 'backwards' });
      }
    }
    return () => clearTimeout(id);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const leave = useCallback(() => new Promise((resolve) => {
    if (reduced()) { resolve(); return; }
    setPhase('leave');
    const tiles = tilesOnScreen();
    const z = stage.camera.z;
    for (const { id, face, rect } of cardsInView()) {
      const t = tiles.get(id);
      if (t) face.animate([ON_CARD, onTile(t, rect, z)], { duration: 440, easing: EASE_IN_OUT, fill: 'forwards' });
      else face.animate([{ opacity: 1 }, { opacity: 0, transform: 'scale(0.9)' }], { duration: 260, easing: EASE_IN_OUT, fill: 'forwards' });
    }
    // the tiles take over the very moment the pictures arrive on them
    setTimeout(() => { delete document.documentElement.dataset.board; layer.current?.setAttribute('data-gone', ''); resolve(); }, 450);
  }), [stage, cardsInView, layer]);

  return { phase, leave };
}

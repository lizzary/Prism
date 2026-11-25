import { tiltDegrees } from '../cardAppearance.js';
import { easeInOut } from '../camera.js';
import { cardOffset } from '../scene.js';

const mix = (from, to, t) => from + (to - from) * t;
const progress = (elapsed, duration) => Math.min(1, Math.max(0, elapsed / duration));
const easeOut = (t) => 1 - Math.pow(1 - t, 5);

function faceOf(look, tier, id) {
  const selected = look.selected.has(id);
  const hot = look.hot === id;
  const swatch = selected && tier === 'far';
  const carried = look.carried?.has(id);
  const dim = look.lit && !look.lit.has(id);
  return {
    faceScale: swatch ? 0.66 : selected ? (hot ? 0.84 : 0.8) : hot ? 1.04 : 1,
    faceY: hot && !swatch ? (selected ? -1 : -2) : 0,
    angle: selected && !swatch ? tiltDegrees(id) * Math.PI / 180 : 0,
    dimOpacity: dim ? 0.3 : 1,
    saturation: dim ? 0.45 : carried ? 0.3 : 1,
    carriedOpacity: carried ? 0.28 : 1,
  };
}

function faceChanged(before, after, oldTier, tier, id) {
  return before.selected.has(id) !== after.selected.has(id)
    || (oldTier !== tier && after.selected.has(id))
    || (before.hot === id) !== (after.hot === id)
    || !!before.carried?.has(id) !== !!after.carried?.has(id)
    || (!!before.lit && !before.lit.has(id)) !== (!!after.lit && !after.lit.has(id));
}

function interpolateFace(fade, now) {
  const t = easeOut(progress(now - fade.at, 260));
  const result = {};
  for (const key of Object.keys(fade.to)) result[key] = mix(fade.from[key], fade.to[key], t);
  return result;
}

/** Only cards changing appearance or moving between cells need animation records. */
export function createCardMotion() {
  const fades = new Map();
  const moves = new Map();
  let previous = null, props, tier, now, reduced;
  let freshAt = 0, leaveAt = 0, animating = false;

  return {
    begin(input, level, time, reducedMotion) {
      props = input;
      tier = level;
      now = time;
      reduced = reducedMotion;
      animating = false;
      if (props.look.fresh !== previous?.look.fresh) freshAt = time;
      if (props.look.leaving !== previous?.look.leaving) leaveAt = time;
      for (const [id, fade] of fades) if (reduced || now >= fade.at + 260) fades.delete(id);
      for (const [id, move] of moves) if (reduced || now >= move.at + 420) moves.delete(id);
    },

    card(id, r, dx, dy, x, y) {
      const { scene, look } = props;
      if (!reduced && previous) {
        if ((look !== previous.look || tier !== previous.tier)
          && faceChanged(previous.look, look, previous.tier, tier, id)) {
          const fade = fades.get(id);
          const from = fade ? interpolateFace(fade, now) : faceOf(previous.look, previous.tier, id);
          fades.set(id, { from, to: faceOf(look, tier, id), at: now });
        }
        // The stage moves the region; only changes in the card's local cell need a second glide.
        if (scene !== previous.scene) {
          const where = previous.scene.where.get(id);
          const region = where && previous.scene.regions[where[0]];
          if (region?.key === r.key) {
            const [ox, oy] = cardOffset(region, where[1]);
            if (ox !== dx || oy !== dy) {
              const old = moves.get(id);
              const remainder = old ? 1 - easeOut(progress(now - old.at, 420)) : 0;
              moves.set(id, { x: ox - dx + (old?.x ?? 0) * remainder, y: oy - dy + (old?.y ?? 0) * remainder, at: now });
            }
          } else moves.delete(id);
        }
      }
      const fade = fades.get(id), move = moves.get(id);
      const pour = look.pour;
      const pouring = !reduced && pour && now < pour.at + 896 && pour.ids.has(id);
      const fresh = !reduced && now < freshAt + 2000 && look.fresh?.has(id);
      const leaving = look.leaving?.has(id);
      if (!fade && !move && !pouring && !fresh && !leaving) return undefined;
      const motion = fade ? interpolateFace(fade, now) : {};
      if (fade || move) animating = true;
      if (move) {
        const remainder = 1 - easeOut(progress(now - move.at, 420));
        motion.dx = move.x * remainder;
        motion.dy = move.y * remainder;
      }
      if (pouring) {
        const delay = Math.min(pour.order.get(id) ?? 0, 24) * 14;
        const t = easeOut(progress(now - pour.at - delay, 560));
        motion.dx = mix(pour.from[0] - x, 0, t);
        motion.dy = mix(pour.from[1] - y, 0, t);
        motion.scale = mix(0.42, 1, t);
        motion.opacity = mix(0.4, 1, t);
        animating = true;
      }
      if (fresh) {
        const t = progress(now - freshAt, 2000);
        motion.fresh = t < 0.3 ? easeOut(t / 0.3) : 1 - easeOut((t - 0.3) / 0.7);
        animating = true;
      }
      if (leaving) {
        const t = reduced ? 1 : easeInOut(progress(now - leaveAt, 240));
        motion.scale = mix(1, 0.55, t);
        motion.opacity = 1 - t;
        if (t < 1) animating = true;
      }
      return motion;
    },

    end() {
      previous = { scene: props.scene, look: props.look, tier };
      return animating;
    },
  };
}

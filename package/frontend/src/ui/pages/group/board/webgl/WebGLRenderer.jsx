import { memo, useLayoutEffect, useRef } from 'react';
import { Icon } from '../../../../icons/Icon.jsx';
import { useFormat } from '../../../../lib/format.js';
import { boardContext } from '../../../../lib/webgl.js';
import { tierOf } from '../cardAppearance.js';
import { cardOffset, cardSpan } from '../scene.js';
import dom from '../dom/DomRenderer.module.css';
import { createCardMotion } from './cardMotion.js';
import { createPainter } from './painter.js';
import s from './WebGLRenderer.module.css';

/** The canvas only draws within a small guard around the viewport for shadows and tilted cards.
 * Use each region's displayed rectangle here so culling follows it throughout a drag or glide. */
export const WebGLRenderer = memo(function WebGLRenderer({ stage, scene, files, covers, look, onFallback }) {
  const canvas = useRef(null);
  const props = useRef(null);
  const details = useRef(new Map());
  const labels = useRef(null);
  const fmt = useFormat();

  useLayoutEffect(() => {
    props.current = { scene, files, covers, look, onFallback };
    stage.redraw();
  }, [stage, scene, files, covers, look, onFallback]);

  useLayoutEffect(() => {
    const element = canvas.current;
    const motion = createCardMotion();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let painter, tier, failed = false;
    const fallback = () => {
      if (failed) return;
      failed = true;
      props.current.onFallback();
    };
    const redraw = () => { if (!failed) stage.redraw(); };
    element.addEventListener('webglcontextlost', fallback);

    const paint = (st, now) => {
      if (failed) return;
      try {
        const input = props.current;
        const { camera, viewport } = st;
        tier = tierOf(camera.z, tier);
        const v = st.view(), m = 48 / camera.z;
        const area = { x: v.x - m, y: v.y - m, w: v.w + 2 * m, h: v.h + 2 * m };
        const { look, scene, files, covers } = input;
        painter.begin(camera, viewport, now);
        motion.begin(input, tier, now, reduced.matches);
        labels.current.style.transform = `translate3d(${viewport.w / 2 - camera.x * camera.z}px,${viewport.h / 2 - camera.y * camera.z}px,0) scale(${camera.z})`;
        const draw = (r) => {
          const rect = st.rect(r.key) ?? r;
          const near = rect.x <= area.x + area.w && rect.y <= area.y + area.h && rect.x + rect.w >= area.x && rect.y + rect.h >= area.y;
          const label = details.current.get(r.key);
          if (label) {
            label.hidden = !near;
            if (near) {
              label.style.transform = `translate3d(${rect.x}px,${rect.y}px,0)`;
              label.style.width = `${rect.w}px`;
              label.style.height = `${rect.h}px`;
            }
          }
          if (!near) return;
          painter.region(r, rect, look);
          const span = cardSpan({ ...r, ...rect }, area);
          if (!span) return;
          for (let row = span.r0; row < span.r1; row++) {
            for (let col = span.c0; col < span.c1; col++) {
              const at = row * r.cols + col;
              if (at >= r.n) break;
              const id = r.ids[at], file = files.get(id);
              if (!file) continue;
              const [dx, dy] = cardOffset(r, at);
              const x = rect.x + dx, y = rect.y + dy;
              const effect = motion.card(id, r, dx, dy, x, y);
              painter.card(file, x + (effect?.dx ?? 0), y + (effect?.dy ?? 0), tier, covers.get(id), look, effect);
            }
          }
        };
        let lifted;
        for (const r of scene.regions) {
          if (r.key === look.liftedRegion) lifted = r;
          else draw(r);
        }
        if (lifted) draw(lifted);
        painter.end();
        if (motion.end()) redraw();
      } catch {
        fallback();
      }
    };

    let unsubscribe;
    try {
      painter = createPainter(element, redraw);
      paint(stage, performance.now());
      unsubscribe = stage.onFrame(paint);
    } catch {
      fallback();
    }
    const theme = new MutationObserver(redraw);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('resize', redraw);
    reduced.addEventListener('change', redraw);
    return () => {
      failed = true;
      theme.disconnect();
      window.removeEventListener('resize', redraw);
      reduced.removeEventListener('change', redraw);
      element.removeEventListener('webglcontextlost', fallback);
      unsubscribe?.();
      painter?.dispose();
      // StrictMode can reattach this same element immediately. Release the GPU context only after unmount.
      queueMicrotask(() => {
        if (element.isConnected || !painter) return;
        const gl = boardContext(element);
        if (gl && !gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
      });
    };
  }, [stage]);

  return <>
    <canvas ref={canvas} className={s.canvas} aria-hidden="true" />
    <div className={dom.world} ref={labels} aria-hidden="true">
      {scene.regions.map((r) => {
        const hot = r.key === look.hotRegion, resizing = r.key === look.resizing;
        if (r.n && !r.hidden && !hot && !resizing) return null;
        return <div key={r.key} className={dom.region}
          ref={(el) => { if (el) details.current.set(r.key, el); else details.current.delete(r.key); }}
          data-hot={hot || undefined} data-resizing={resizing || undefined} data-lifted={r.key === look.liftedRegion || undefined}
          data-none={r.none || undefined} data-plain={r.plain || undefined} style={{ '--c': r.color ?? 'var(--ink-3)' }}>
          {!r.n && <div className={`${dom.drop} ${s.dropIcon}`}><Icon name="drag-drop" size={20} /></div>}
          {r.hidden > 0 && <span className={`${dom.more} num`}>+{fmt.number(r.hidden)}</span>}
          <i className={dom.grip} />
        </div>;
      })}
    </div>
  </>;
});

import { useLayoutEffect, useRef, useState } from 'react';
import s from './media.module.css';

const cx = (...a) => a.filter(Boolean).join(' ');

/** Images already shown in this session: they appear at once, without the fade. */
const shown = new Set();

/**
 * An image that fades in once decoded. `focus` = { x, y } in 0–1 picks the crop.
 * An image already shown in this session appears at once: coming back to a page its pictures are simply there, and a
 * picture morphing between pages finds its other end visible.
 */
export function Picture({ src, alt = '', ratio, fit = 'cover', focus, className, imgClassName, eager, style, children, onLoad }) {
  const [loadedUrl, setLoadedUrl] = useState(() => (shown.has(src) ? src : null));
  const img = useRef(null);
  useLayoutEffect(() => {
    const el = img.current;
    if (shown.has(src) || (el?.complete && el.naturalWidth > 0)) { shown.add(src); setLoadedUrl(src); }
  }, [src]);
  return (
    <div className={cx(s.pic, loadedUrl === src && s.loaded, className)} style={{ aspectRatio: ratio, ...style }}>
      {src && (
        <img
          key={src}
          ref={img}
          src={src}
          alt={alt}
          className={imgClassName}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={(e) => { shown.add(src); setLoadedUrl(src); onLoad?.(e); }}
          style={{ objectFit: fit, objectPosition: focus ? `${(focus.x * 100).toFixed(1)}% ${(focus.y * 100).toFixed(1)}%` : undefined }}
        />
      )}
      {children}
    </div>
  );
}

// Handing something to another place: a copy button that confirms itself, and a QR code for phones.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { copyText } from '../lib/clipboard.js';
import { encodeQr } from '../lib/qr.js';
import { Button, IconButton } from './controls.jsx';
import s from './share.module.css';

/** Copies `text`; the icon turns into a tick for a moment. `iconOnly` gives a quiet icon button. */
export function CopyButton({ text, label, iconOnly, size = 'sm', variant = 'ghost', className }) {
  const t = useT();
  const [done, setDone] = useState(false);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    if (!(await copyText(text))) return;
    setDone(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDone(false), 1600);
  };
  if (iconOnly) {
    return <IconButton icon={done ? 'check' : 'copy'} size={size} label={done ? t('common.copied') : (label ?? t('common.copy'))} onClick={copy} className={`${className ?? ''} ${done ? s.done : ''}`} />;
  }
  return (
    <Button variant={variant} size={size} icon={done ? 'check' : 'copy'} onClick={copy} className={`${className ?? ''} ${done ? s.done : ''}`}>
      {done ? t('common.copied') : (label ?? t('common.copy'))}
    </Button>
  );
}

/**
 * A QR code drawn as one SVG path. Always dark modules on a light card, in both themes:
 * inverted codes are not read by every phone.
 */
export function QrCode({ text, size = 148, className }) {
  const qr = useMemo(() => encodeQr(text), [text]);
  if (!qr) return null;
  const q = 3, n = qr.size + q * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) if (qr.dark(x, y)) d += `M${x + q} ${y + q}h1v1h-1z`;
  }
  return (
    <svg className={`${s.qr} ${className ?? ''}`} width={size} height={size} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" role="img" aria-label={text}>
      <rect width={n} height={n} rx={1.4} fill="#fbf8f1" />
      <path d={d} fill="#1f2533" />
    </svg>
  );
}

// A closer look at the card under the pointer: its file at its own proportions, in the picture quality the group's
// page uses, beside the card (on whichever side has the room), with its name and size. It rises out of the card.
import { useLayoutEffect, useRef, useState } from 'react';
import { mediaUrl } from '../../../../bridge/index.js';
import { useFormat } from '../../../lib/format.js';
import { Icon } from '../../../icons/Icon.jsx';
import s from './Board.module.css';

const LONG = 300, SHORT = 150, GAP = 14, EDGE = 12, FOOT = 34;

export function Preview({ file, rect, quality }) {
  const fmt = useFormat();
  const ratio = file.width / file.height;
  // its own proportions, within reason: very long or very tall pictures keep a readable short side
  let w = ratio >= 1 ? LONG : Math.max(SHORT, LONG * ratio), h = ratio >= 1 ? Math.max(SHORT * 0.8, LONG / ratio) : LONG;
  if (ratio > 2.4) { w = LONG * 1.2; h = w / ratio; }
  const room = { right: innerWidth - (rect.left + rect.width) - GAP - EDGE, left: rect.left - GAP - EDGE };
  const side = room.right >= w || room.right >= room.left ? 'right' : 'left';
  const left = side === 'right' ? rect.left + rect.width + GAP : rect.left - GAP - w;
  const top = Math.max(EDGE + 64, Math.min(innerHeight - h - FOOT - EDGE, rect.top + rect.height / 2 - (h + FOOT) / 2));
  const origin = `${side === 'right' ? 0 : w}px ${Math.max(0, Math.min(h, rect.top + rect.height / 2 - top))}px`;
  const [ready, setReady] = useState(false);
  const img = useRef(null);
  useLayoutEffect(() => { if (img.current?.complete && img.current.naturalWidth) setReady(true); }, []);
  return (
    <div className={s.preview} style={{ transform: `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`, '--o': origin, width: w }} aria-hidden="true">
      <div className={s.previewPic} style={{ height: h, background: file.tone ?? undefined }}>
        <img ref={img} src={mediaUrl(file, quality)} alt="" draggable={false} decoding="async" data-ready={ready || undefined} onLoad={() => setReady(true)} />
        {file.kind === 'video' && <span className={s.previewPlay}><Icon name="play" size={11} />{fmt.duration(file.duration)}</span>}
      </div>
      <div className={s.previewFoot}>
        <span className={s.previewName}>{file.name}<span>.{file.ext}</span></span>
        <span className={`${s.previewDims} num`}>{file.width} × {file.height}</span>
      </div>
    </div>
  );
}

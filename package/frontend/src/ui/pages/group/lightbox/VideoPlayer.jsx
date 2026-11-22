// A video in the lightbox: it plays on its own, loops, and keeps its controls quiet — a thin bar along its foot that
// comes up when the pointer is over it or the video is paused. Space plays and pauses (through the lightbox).
import { useImperativeHandle, useRef, useState } from 'react';
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { Icon } from '../../../icons/Icon.jsx';
import s from './VideoPlayer.module.css';

export function VideoPlayer({ ref, src, poster, autoPlay, muted = false, duration }) {
  const t = useT();
  const fmt = useFormat();
  const video = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [length, setLength] = useState(duration || 0);
  const [mute, setMute] = useState(muted);
  const toggle = () => { const v = video.current; if (!v) return; if (v.paused) v.play().catch(() => {}); else v.pause(); };
  // a stream without its length in the header reports Infinity until it has been read through
  const measure = (e) => { const d = e.currentTarget.duration; if (Number.isFinite(d) && d > 0) setLength(d); };
  useImperativeHandle(ref, () => ({ toggle }), []);
  return (
    <div className={s.player} data-playing={playing || undefined}>
      <video ref={video} className={s.video} src={src} poster={poster} autoPlay={autoPlay} muted={mute || muted} loop playsInline
        onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onClick={toggle}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onLoadedMetadata={measure} onDurationChange={measure} />
      {!playing && <button type="button" className={s.big} onClick={toggle} aria-label={t('lightbox.play')}><Icon name="play" size={26} /></button>}
      <div className={s.controls}>
        <button type="button" className={s.btn} onClick={toggle} aria-label={playing ? t('lightbox.pause') : t('lightbox.play')}>
          <Icon name={playing ? 'pause' : 'play'} size={15} />
        </button>
        <span className={`${s.time} num`}>{fmt.duration(time)}</span>
        <span className={s.scrub} style={{ '--p': length ? time / length : 0 }}>
          <input type="range" min={0} max={1000} value={length ? Math.round((time / length) * 1000) : 0} aria-label={t('lightbox.seek')}
            onChange={(e) => { const v = video.current; if (v && length) { v.currentTime = (Number(e.target.value) / 1000) * length; setTime(v.currentTime); } }} />
        </span>
        <span className={`${s.time} num`}>{fmt.duration(length)}</span>
        <button type="button" className={s.btn} onClick={() => setMute((m) => !m)} aria-label={mute ? t('lightbox.unmute') : t('lightbox.mute')}>
          <Icon name={mute || muted ? 'volume-off' : 'volume'} size={16} />
        </button>
      </div>
    </div>
  );
}

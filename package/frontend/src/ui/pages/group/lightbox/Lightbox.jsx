// The lightbox: one file of the group at a time, as large as the screen allows, in a night room faintly lit by the
// picture's own colours. The wheel or the quiet slider zooms, dragging looks around, the arrow keys (or the arrows at
// the sides) step through the group in the page's order. A slideshow, the file's details (tags and note editable),
// cover, download and delete. The controls step back when the pointer rests, so the picture is left on its own.
import { ViewTransition, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { browsing, fileActions, mediaUrl, streamUrl } from '../../../../bridge/index.js';
import { navigate, paths } from '../../../../app/router.jsx';
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { Icon } from '../../../icons/Icon.jsx';
import { Button, IconButton, Stepper } from '../../../components/controls.jsx';
import { Popover, Portal, Tooltip, useScrollLock } from '../../../components/overlay.jsx';
import { Menu } from '../../../components/menu.jsx';
import { afterViewTransition } from '../../../lib/viewTransition.js';
import { Details } from './Details.jsx';
import { VideoPlayer } from './VideoPlayer.jsx';
import s from './Lightbox.module.css';

const IDLE_MS = 2600;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const typing = (el) => /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable;
/** The details stay open from one file, and one visit, to the next. */
let detailsOpen = false;

/**
 * The room the stage leaves the picture (its content box: the window less .stage's padding in Lightbox.module.css),
 * known before the stage is drawn. A file opened from another page is in the very commit that brings its page, and the
 * page change carries its picture in from there — so the picture must be on the stage, at its size, from that commit.
 * The stage's own measurement takes over once it is drawn.
 */
function stageRoom(details) {
  const w = document.documentElement.clientWidth, h = document.documentElement.clientHeight;
  const narrow = matchMedia('(max-width: 900px)').matches;
  const side = narrow ? Math.min(360, innerWidth * 0.92) : 384;        // --side, the details
  const x = narrow ? 16 : 88;
  return { w: Math.max(0, w - x - (details ? side + 40 : x)), h: Math.max(0, h - 66 - 74) };
}

/** Where the tile of a file is on the page, if it is on screen. */
function tileRect(id) {
  const el = document.querySelector(`[data-file-id="${CSS.escape(id)}"]`);
  const r = el?.getBoundingClientRect();
  return r && r.bottom > 0 && r.top < innerHeight && r.width > 0 ? r : null;
}
/**
 * The picture (its box `m` on screen) laid over a tile `t` the way the tile shows it: scaled evenly until it covers the
 * tile, cropped to it with the tile's corners, centred on it — so it lands on (and lifts off) its tile seamlessly,
 * whatever the tile's shape.
 */
function onTile(t, m) {
  const k = Math.max(t.width / m.width, t.height / m.height);
  const dx = t.left + t.width / 2 - (m.left + m.width / 2), dy = t.top + t.height / 2 - (m.top + m.height / 2);
  const ix = Math.max(0, (m.width - t.width / k) / 2), iy = Math.max(0, (m.height - t.height / k) / 2);
  return { transform: `translate(${dx}px, ${dy}px) scale(${k})`, clipPath: `inset(${iy}px ${ix}px round ${5 / k}px)` };
}
const SHOWN = { transform: 'none', clipPath: 'inset(0px 0px round 3px)' };

/**
 * sequence: the files to walk, in order (the page's files on show); onReveal(id, { now }): bring a file's tile into full
 * view on the page, at once, and say where it is on screen ({ left, top, width, height } | null).
 * withPage: the file came with its page (opened from another page, or a link straight to it). Then the page change
 * brings the lightbox in — the room darkens over the page being left as the picture travels from where it was opened
 * (router.jsx, base.css) — so the lightbox is there whole from its first frame, and does not come in again itself.
 * Opened over the whiteboard: fileUrl(id) is where stepping goes (the board's own file addresses), and rectOf(id) says
 * where a file's card is on screen, to rise from and settle back into (the page's tiles are under the board then).
 */
export function Lightbox({
  groupId, fileId, group, sequence, quality, slide, onSlide, onClose, onReveal, covering, onDownload, onDelete, withPage = false,
  fileUrl = (id) => paths.file(groupId, id), rectOf = tileRect,
}) {
  const t = useT();
  const fmt = useFormat();
  const index = sequence.findIndex((f) => f.id === fileId);
  const known = useRef(index);
  if (index >= 0) known.current = index;
  const file = index >= 0 ? sequence[index] : sequence[Math.min(Math.max(0, known.current), sequence.length - 1)];
  const [phase, setPhase] = useState(withPage ? 'open' : 'enter');        // enter → open → exit
  const [details, setDetails] = useState(detailsOpen);
  const [idle, setIdle] = useState(false);
  const [box, setBox] = useState(() => stageRoom(detailsOpen));
  const [zoom, setZoom] = useState({ z: 1, x: 0, y: 0 });
  const [still, setStill] = useState(false);          // no glide: dragging or wheeling
  const [dir, setDir] = useState(0);                  // which way the last step went
  const [show, setShow] = useState(null);             // slideshow: { paused, startedAt, left }
  const [pick, setPick] = useState(false);            // the slideshow's seconds
  const [flash, setFlash] = useState(null);           // a moment's sign that the slideshow paused or went on
  const [madeCover, setMadeCover] = useState(null);   // the file just made one of the group's covers here (its mark arrives with a glint)
  const [coverMenu, setCoverMenu] = useState(false);
  const coverMark = useRef(null);
  const stage = useRef(null);
  const img = useRef(null);
  const player = useRef(null);
  const slideBtn = useRef(null);
  const idleTimer = useRef(0);
  const drag = useRef(null);
  const wheelTimer = useRef(0);
  const leaving = useRef(false);                      // closing: the picture is on its way back
  const boxEl = useRef(null);
  useScrollLock(true);

  // the file left the group (deleted here, or elsewhere): its neighbour takes its place; nothing left, the lightbox closes
  useEffect(() => {
    if (index >= 0) return;
    if (!sequence.length || known.current < 0) { onClose(null); return; }
    navigate(fileUrl(sequence[clamp(known.current, 0, sequence.length - 1)].id), { replace: true });
  }, [index, sequence]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { detailsOpen = details; }, [details]);
  useEffect(() => { setZoom({ z: 1, x: 0, y: 0 }); }, [fileId]);
  // Arriving with its page, the lightbox leaves what cannot be seen yet — the page following under the room, the
  // neighbours' pictures — until the page change has played, so nothing holds up its frames.
  const [settled, setSettled] = useState(!withPage);
  useEffect(() => (withPage ? afterViewTransition(() => setSettled(true)) : undefined), []); // eslint-disable-line react-hooks/exhaustive-deps
  // the page follows along under the dark room, a moment after each step: the file's tile is kept in view, so on
  // closing it is there — drawn, its picture loaded — for the picture to fly back to
  useEffect(() => {
    if (!onReveal || !settled) return undefined;
    const id = setTimeout(() => { if (!leaving.current) onReveal(fileId); }, 450);
    return () => clearTimeout(id);
  }, [fileId, settled]); // eslint-disable-line react-hooks/exhaustive-deps
  // the file being looked at, for the home page's "last viewed"
  useEffect(() => { const id = setTimeout(() => fileActions.viewed(fileId), 500); return () => clearTimeout(id); }, [fileId]);
  // the neighbours are fetched ahead, so stepping is instant
  useEffect(() => {
    if (!settled) return;
    for (const k of [index - 1, index + 1]) { const f = sequence[k]; if (f) new Image().src = mediaUrl(f, 'original'); }
  }, [index, sequence, settled]);

  // ------------------------------------------------------------------ size of the stage, the fit, the zoom
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => {
      const { width: w, height: h } = e.contentRect;
      setBox((b) => (b.w === w && b.h === h ? b : { w, h }));
    });
    ro.observe(stage.current);
    return () => ro.disconnect();
  }, []);
  const fit = file && box.w ? Math.min(box.w / file.width, box.h / file.height) : 0;
  const zMax = fit ? Math.max(3, 4 / fit) : 1;
  const dw = file ? file.width * fit * zoom.z : 0, dh = file ? file.height * fit * zoom.z : 0;
  const pan = (v) => {
    const w = file.width * fit * v.z, h = file.height * fit * v.z;
    const mx = Math.max(0, (w - box.w) / 2), my = Math.max(0, (h - box.h) / 2);
    return { z: v.z, x: clamp(v.x, -mx, mx), y: clamp(v.y, -my, my) };
  };
  /** Zoom to z (relative to the fit), keeping the point (px, py) — from the stage's centre — where it is. */
  const zoomTo = (z2, px = 0, py = 0) => setZoom((v) => {
    const z = clamp(z2, 1, zMax);
    if (z === 1) return { z: 1, x: 0, y: 0 };
    const k = z / v.z;
    return pan({ z, x: px - (px - v.x) * k, y: py - (py - v.y) * k });
  });
  const fromCentre = (e) => { const r = stage.current.getBoundingClientRect(); return [e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)]; };
  const isVideo = file?.kind === 'video';

  // ------------------------------------------------------------------ arriving and leaving
  // While the lightbox is open the page's top bar steps aside (see TopBar): the lightbox's own bar comes down into
  // its place as it rises, and it settles back the moment the lightbox starts to close.
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.lightbox = '';
    return () => { delete root.dataset.lightbox; };
  }, []);
  const entered = useRef(false);
  useLayoutEffect(() => {
    if (entered.current || !fit || !img.current) return;
    entered.current = true;
    if (withPage) return;
    // from its tile on the page (or its card on the board) when it is on screen; otherwise it simply comes forward
    const from = rectOf(file.id);
    const ease = 'cubic-bezier(.22,1,.36,1)';
    if (from) img.current.animate([onTile(from, img.current.getBoundingClientRect()), SHOWN], { duration: 460, easing: ease });
    else img.current.animate([{ opacity: 0, transform: 'scale(0.965)' }, { opacity: 1, transform: 'none' }], { duration: 420, easing: ease });
    requestAnimationFrame(() => setPhase('open'));
  }, [fit]); // eslint-disable-line react-hooks/exhaustive-deps
  // Leaving: the room fades as one (backdrop, glow, vignette) while the picture flies back into its tile, and the
  // lightbox goes the moment both arrive. A tile that is off screen (the files were stepped through) is brought into
  // view first, unseen under the still-dark room; a picture with nowhere to go (zoomed in, or one the page does not
  // show) fades with the room instead.
  const exit = (to) => {
    setPhase('exit');
    delete document.documentElement.dataset.lightbox;
    const el = img.current;
    // once the picture is down the lightbox is gone at once — the page under it is whole and can be used — and
    // only then is it taken away
    const done = () => { boxEl.current?.setAttribute('data-gone', ''); onClose(file?.id ?? null); };
    if (to && el) {
      el.animate([SHOWN, onTile(to, el.getBoundingClientRect())], { duration: 380, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' });
      setTimeout(done, 380);
    } else {
      el?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'forwards' });
      setTimeout(done, 320);
    }
  };
  const close = () => {
    if (leaving.current) return;
    leaving.current = true;
    setShow(null);
    const id = file?.id;
    // the page puts the tile in full view if it is not (unseen, under the still-dark room) and says where it is
    exit(id && zoom.z === 1 ? (onReveal?.(id, { now: true }) ?? rectOf(id)) : null);
  };

  // ------------------------------------------------------------------ stepping
  const go = (k, how = 'step') => {
    if (!sequence.length || leaving.current) return;
    const next = how === 'loop' ? (k + sequence.length) % sequence.length : clamp(k, 0, sequence.length - 1);
    if (next === index) return;
    setDir(next > index ? 1 : -1);
    if (show) setShow((v) => v && { paused: v.paused, startedAt: Date.now(), left: slide * 1000 });
    navigate(fileUrl(sequence[next].id), { replace: true });
  };
  const remove = () => {
    const id = file.id;
    // the next file comes in at once; the deleted one can come back from the toast
    if (sequence.length > 1) go(index < sequence.length - 1 ? index + 1 : index - 1);
    onDelete(id);
  };

  // ------------------------------------------------------------------ the slideshow
  const start = (sec) => {
    setPick(false);
    if (sec !== slide) onSlide(sec);
    setShow({ paused: false, startedAt: Date.now(), left: sec * 1000 });
    setIdle(true);
    // the closing popover hands focus back to the slideshow button; let it go, so its label does not hang in the air
    // once the controls step back (Space still pauses — the lightbox listens for it everywhere)
    setTimeout(() => { if (document.activeElement === slideBtn.current) slideBtn.current.blur(); }, 0);
  };
  const playPause = () => {
    setShow((v) => {
      if (!v) return v;
      if (v.paused) return { paused: false, startedAt: Date.now(), left: v.left };
      return { paused: true, startedAt: v.startedAt, left: Math.max(0, v.left - (Date.now() - v.startedAt)) };
    });
    setFlash({ icon: show?.paused ? 'play' : 'pause', at: Date.now() });
  };
  useEffect(() => {
    if (!show || show.paused) return undefined;
    const id = setTimeout(() => go(index + 1, 'loop'), show.left);
    return () => clearTimeout(id);
  }, [show, index]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ the controls step back when the pointer rests
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), show ? 1400 : IDLE_MS);
  };
  useEffect(() => { wake(); return () => clearTimeout(idleTimer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ------------------------------------------------------------------ keys
  const keys = useRef(null);
  keys.current = { close, go, index, playPause, show, zoomTo, zoom, remove, isVideo, setDetails, setShow };
  useEffect(() => {
    const onKey = (e) => {
      if (typing(e.target) || e.defaultPrevented) return;
      const k = keys.current;
      if (e.key === 'Escape') {
        // a popover of the lightbox's own (the slideshow's seconds, a colour group to move to) closes first
        if (document.querySelectorAll('[role="dialog"]').length > 1) return;
        e.preventDefault();
        if (k.show) k.setShow(null); else k.close();
      }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); k.go(k.index + 1, k.show ? 'loop' : 'step'); }
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); k.go(k.index - 1, k.show ? 'loop' : 'step'); }
      else if (e.key === 'Home') { e.preventDefault(); k.go(0); }
      else if (e.key === 'End') { e.preventDefault(); k.go(Infinity); }
      else if (e.key === ' ') { e.preventDefault(); if (k.show) k.playPause(); else if (k.isVideo) player.current?.toggle(); }
      else if (e.key === 'i' || e.key === 'I') k.setDetails((d) => !d);
      else if (e.key === '+' || e.key === '=') k.zoomTo(k.zoom.z * 1.25);
      else if (e.key === '-') k.zoomTo(k.zoom.z / 1.25);
      else if (e.key === '0') k.zoomTo(1);
      else if (e.key === 'Delete') { e.preventDefault(); k.remove(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!file) return null;
  const small = file.width * fit < 0.9 * box.w && file.height * fit < 0.9 * box.h;
  const actual = fit ? fit * zoom.z : 1;                  // shown pixels per file pixel
  const slider = zMax > 1 ? Math.log(zoom.z) / Math.log(zMax) : 0;
  const coverAt = file.kind === 'image' ? group.covers.findIndex((c) => c.id === file.id) : -1;   // its place among the covers
  const chromeHidden = idle && !pick && phase === 'open';

  return (
    <Portal>
      <div ref={boxEl} className={`${s.box} theme-night`} data-phase={phase} data-idle={chromeHidden || undefined} data-details={details || undefined} data-show={show ? (show.paused ? 'paused' : 'playing') : undefined}
        role="dialog" aria-modal="true" aria-label={`${file.name}.${file.ext}`} onPointerMove={wake} onPointerDown={wake}>
        {/* the room: dark, faintly lit by the picture's own colours, darker at the edges — it comes and goes as one */}
        <div className={s.room} aria-hidden="true">
          <div className={s.backdrop} />
          <div key={file.id} className={s.ambient} style={{ backgroundImage: `url("${mediaUrl(file, 'low')}")` }} />
        </div>

        <header className={s.top}>
          <IconButton icon="close" tone="art" label={t('lightbox.close')} onClick={close} placement="bottom" />
          <div className={s.where}>
            <span className={s.groupName}>{group.name}</span>
            <span className={`${s.count} num`}>{t('lightbox.position', { n: fmt.number(index + 1), total: fmt.number(sequence.length) })}</span>
          </div>
          <div className={s.fileName}>
            <span className={s.name}>{file.name}<span className={s.ext}>.{file.ext}</span></span>
            <span className={`${s.dims} num`}>{file.width} × {file.height}</span>
          </div>
          <div className={s.tools}>
            <IconButton ref={slideBtn} icon={show && !show.paused ? 'pause' : 'slideshow'} tone="art" active={!!show || pick}
              label={show ? t('lightbox.stop') : t('lightbox.slideshow')} onClick={() => (show ? setShow(null) : setPick((p) => !p))} />
            {/* being a cover is a fact about the picture, not a button held down: once it is one, the button gives way to a
                mark that says which (the main one, or its place), and offers the rest */}
            {file.kind === 'image' && (coverAt < 0 ? (
              <IconButton icon="cover-add" tone="art" label={t('lightbox.addCover')} onClick={() => { if (covering.add(file.id)) setMadeCover(file.id); }} />
            ) : (
              <>
                {/* (made the main cover, the mark comes in anew: its star glints again) */}
                <Tooltip key={coverAt === 0 ? 'main' : 'cover'} label={coverAt === 0 ? t('lightbox.isMainCover') : t('lightbox.isCover', { n: coverAt + 1 })}>
                  <button ref={coverMark} type="button" className={s.coverMark} data-fresh={madeCover === file.id || undefined} data-open={coverMenu || undefined}
                    aria-haspopup="menu" aria-expanded={coverMenu} onClick={() => setCoverMenu((o) => !o)}>
                    <Icon name="cover" size={16} /><span>{coverAt === 0 ? t('lightbox.mainCoverMark') : t('lightbox.coverMark', { n: coverAt + 1 })}</span>
                  </button>
                </Tooltip>
                <Menu open={coverMenu} onClose={() => setCoverMenu(false)} anchor={coverMark} placement="bottom-end" className={`${s.pop} theme-night`} label={t('lightbox.coverMenu')}
                  items={[
                    ...(coverAt > 0 ? [{ key: 'main', label: t('group.tile.mainCover'), icon: 'cover', onSelect: () => { if (covering.main(file.id)) setMadeCover(file.id); } }] : []),
                    { key: 'remove', label: t('group.tile.removeCover'), icon: 'cover-remove', onSelect: () => covering.remove(file.id) },
                  ]} />
              </>
            ))}
            <IconButton icon="download" tone="art" label={t('lightbox.download')} onClick={() => onDownload(file.id)} />
            <IconButton icon="trash" tone="art" label={t('lightbox.delete')} className={s.danger} onClick={remove} />
            <span className={s.sep} />
            <IconButton icon="info" tone="art" active={details} label={t('lightbox.details')} onClick={() => setDetails((d) => !d)} />
          </div>
        </header>

        <div ref={stage} className={s.stage} data-zoomed={zoom.z > 1 || undefined}
          onWheel={(e) => {
            if (isVideo || e.ctrlKey) return;
            setStill(true);
            clearTimeout(wheelTimer.current);
            wheelTimer.current = setTimeout(() => setStill(false), 160);
            const [px, py] = fromCentre(e);
            zoomTo(zoom.z * Math.exp(-e.deltaY * 0.0016), px, py);
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 || zoom.z === 1) return;
            drag.current = { x: e.clientX - zoom.x, y: e.clientY - zoom.y };
            e.currentTarget.setPointerCapture(e.pointerId);
            setStill(true);
          }}
          onPointerMove={(e) => { if (drag.current) setZoom((v) => pan({ z: v.z, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })); }}
          onPointerUp={() => { if (drag.current) { drag.current = null; setStill(false); } }}
          onClick={(e) => { if (e.target === e.currentTarget && zoom.z === 1 && !show) close(); }}>
          {/* The picture (all of it: the page's quality, the original over it) shares its name with the thumbnail it
              was opened from on another page, so a page change carries it between the two. Opened that way, React
              waits for the page's picture before it shows the change (the one image it holds a page change for). */}
          {!fit ? null : isVideo ? (
            <ViewTransition key={file.id} name={`file-art-${file.id}`} share="travel" default="none">
              <div ref={img} className={s.media} style={{ width: dw, height: dh }}>
                <VideoPlayer ref={player} src={streamUrl(file)} poster={mediaUrl(file, 'original')} autoPlay muted={!!show} duration={file.duration} />
              </div>
            </ViewTransition>
          ) : (
            <ViewTransition key={file.id} name={`file-art-${file.id}`} share="travel" default="none">
              <div ref={img} className={s.media} data-dir={dir} data-still={still || undefined}
                style={{ width: dw, height: dh, transform: `translate(${zoom.x}px, ${zoom.y}px)`, '--slide': `${slide}s` }}
                onDoubleClick={(e) => { const [px, py] = fromCentre(e); if (zoom.z > 1) zoomTo(1); else zoomTo(small ? 2.2 : Math.max(2, 1 / fit), px, py); }}>
                <img className={s.preview} src={mediaUrl(file, quality)} alt="" draggable={false} loading={withPage ? 'eager' : 'lazy'} decoding="sync" />
                <FullImage src={mediaUrl(file, 'original')} />
              </div>
            </ViewTransition>
          )}
        </div>

        {index > 0 && <button type="button" className={`${s.arrow} ${s.prev}`} onClick={() => go(index - 1)} aria-label={t('lightbox.prev')}><Icon name="chevron-left" size={28} /></button>}
        {index < sequence.length - 1 && <button type="button" className={`${s.arrow} ${s.next}`} onClick={() => go(index + 1)} aria-label={t('lightbox.next')}><Icon name="chevron-right" size={28} /></button>}

        {!isVideo && (
          <div className={s.zoom} data-on={zoom.z > 1 || undefined}>
            <button type="button" className={s.zoomBtn} onClick={() => zoomTo(zoom.z / 1.3)} disabled={zoom.z <= 1} aria-label={t('lightbox.zoomOut')}><Icon name="minus" size={14} /></button>
            <span className={s.zoomTrack} style={{ '--p': slider }}>
              <input type="range" min={0} max={1000} value={Math.round(slider * 1000)} aria-label={t('lightbox.zoom')}
                onChange={(e) => zoomTo(Math.exp((Number(e.target.value) / 1000) * Math.log(zMax)))} />
              <i />
            </span>
            <button type="button" className={s.zoomBtn} onClick={() => zoomTo(zoom.z * 1.3)} disabled={zoom.z >= zMax} aria-label={t('lightbox.zoomIn')}><Icon name="plus" size={14} /></button>
            <span className={`${s.zoomPct} num`}>{Math.round(actual * 100)}%</span>
            <Tooltip label={t('lightbox.fit')} placement="top">
              <button type="button" className={s.fit} onClick={() => zoomTo(1)} disabled={zoom.z === 1} aria-label={t('lightbox.fit')}><Icon name="fit" size={15} /></button>
            </Tooltip>
          </div>
        )}

        {show && (
          <div className={s.progress} aria-hidden="true">
            <i key={`${file.id}:${show.startedAt}`} style={{ animationDuration: `${show.left}ms`, '--from': 1 - show.left / (slide * 1000) }} />
          </div>
        )}
        {flash && <span key={flash.at} className={s.flash} aria-hidden="true"><Icon name={flash.icon} size={26} /></span>}

        <aside className={s.side} aria-hidden={!details}>
          {details && <Details fileId={file.id} groupName={group.name} />}
        </aside>

        <Popover open={pick} onClose={() => setPick(false)} anchor={slideBtn} placement="bottom-end" label={t('lightbox.slideshow')} className={`${s.pop} theme-night`}>
          <div className={s.pick}>
            <span className={s.pickLabel}>{t('lightbox.seconds')}</span>
            {/* any number of seconds: typed (Enter starts), or one more / one less; a few usual ones under it */}
            <div className={s.pickRow}>
              <Stepper value={slide} min={browsing.SLIDE_RANGE[0]} max={browsing.SLIDE_RANGE[1]} onChange={onSlide} onEnter={start}
                label={t('lightbox.seconds')} decLabel={t('lightbox.secondLess')} incLabel={t('lightbox.secondMore')} inputProps={{ 'data-autofocus': '' }} />
              <span className={s.pickUnit}>{t('lightbox.secondsUnit', { n: slide })}</span>
            </div>
            <div className={s.presets}>
              {browsing.SLIDE_SECONDS.map((n) => (
                <button key={n} type="button" className="num" data-on={n === slide || undefined} onClick={() => onSlide(n)}>{t('lightbox.secondsN', { n })}</button>
              ))}
            </div>
            <Button variant="primary" icon="play" onClick={() => start(slide)}>{t('lightbox.start')}</Button>
          </div>
        </Popover>
      </div>
    </Portal>
  );
}

/** The original picture, over the one already on screen (the page's quality), shown once it has arrived. */
function FullImage({ src }) {
  const [ready, setReady] = useState(false);
  const ref = useRef(null);
  useLayoutEffect(() => { if (ref.current?.complete && ref.current.naturalWidth) setReady(true); }, [src]);
  return <img ref={ref} className={s.full} data-ready={ready || undefined} src={src} alt="" draggable={false} decoding="async" onLoad={() => setReady(true)} />;
}

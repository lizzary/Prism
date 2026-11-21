import { ViewTransition, useEffect, useRef, useState } from 'react';
import { libraryActions, mediaUrl, useSettings } from '../../../bridge/index.js';
import { Link, navigate, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { StarryNight } from '../../art/starry/StarryNight.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Picture } from '../../components/media.jsx';
import s from './HomeHero.module.css';

export function greetingKey(h) {
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 13) return 'noon';
  if (h >= 13 && h < 18) return 'afternoon';
  if (h >= 18 && h < 23) return 'evening';
  return 'night';
}

/** Reveal accent text only once its face has loaded, so it never swaps in front of the reader. */
export function useFontReady(family, sample) {
  const [ready, setReady] = useState(() => document.fonts?.check?.(`48px "${family}"`, sample) ?? true);
  useEffect(() => {
    if (ready) return undefined;
    let alive = true;
    const done = () => { if (alive) setReady(true); };
    document.fonts.load(`48px "${family}"`, sample).then(done, done);
    const t = setTimeout(done, 2500);
    return () => { alive = false; clearTimeout(t); };
  }, [family, sample, ready]);
  return ready;
}

export function HomeHero({ home, heroRef }) {
  const t = useT();
  const fmt = useFormat();
  const greeting = t(`home.greeting.${greetingKey(new Date().getHours())}`);
  const fontReady = useFontReady('Prism WenKai', greeting);
  const { stats, lastViewed } = home;
  const { dbPath } = useSettings();

  return (
    <section ref={heroRef} className={s.hero}>
      <div className={s.art}><StarryNight /></div>
      <div className={s.veil} aria-hidden="true" />
      <div className={s.content}>
        <div className={`${s.greeting} ${fontReady ? s.in : ''}`}>
          <h1 className={`${s.hello} kai`}>{greeting}</h1>
          <p className={s.prompt}>{t('home.prompt')}</p>
        </div>
        <div className={s.row}>
          {lastViewed && <LastViewed item={lastViewed} />}
          {stats.files > 0 && <RandomDeck key={dbPath} excludeId={lastViewed?.file.id} />}
        </div>
        {stats.files > 0 && (
          <p className={s.stats}>
            <span>{t('home.stats', { groups: fmt.number(stats.groups), files: fmt.number(stats.files), size: fmt.bytes(stats.bytes) })}</span>
            {stats.thisWeek > 0 && <span className={s.week}><Icon name="sparkle" size={14} />{t('home.thisWeek', { n: fmt.number(stats.thisWeek) })}</span>}
          </p>
        )}
      </div>
    </section>
  );
}

/** Where you left off: the picture, its group, and how far into the group it is. */
function LastViewed({ item }) {
  const t = useT();
  const fmt = useFormat();
  const { file, group, index, total } = item;
  const ratio = Math.max(0.7, Math.min(1.8, file.width / file.height));
  return (
    <Link to={paths.file(group.id, file.id)} className={s.last}>
      <ViewTransition name={`file-art-${file.id}`} share="morph">
        <Picture src={mediaUrl(file, 'medium')} className={s.lastCover} style={{ width: Math.round(76 * ratio) }} eager />
      </ViewTransition>
      <span className={s.lastBody}>
        <span className={s.kicker}><Icon name="history" size={14} />{t('home.lastViewed')} · {fmt.relative(item.viewedAt)}</span>
        <span className={s.lastTitle}>{group.name}</span>
        <span className={s.lastWhere}>
          <span className="num">{t('home.position', { n: fmt.number(index + 1), total: fmt.number(total) })}</span>
          <span className={s.track} aria-hidden="true"><span style={{ width: `${Math.max(4, ((index + 1) / total) * 100)}%` }} /></span>
        </span>
      </span>
      <span className={s.lastGo}><Icon name="arrow-right" size={18} /></span>
    </Link>
  );
}

/** A small deck of pictures. Drawing riffles through it, then opens whatever comes up. */
function RandomDeck({ excludeId }) {
  const t = useT();
  const [cards, setCards] = useState([]);
  const [face, setFace] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const timers = useRef([]);
  useEffect(() => {
    let alive = true;
    const pending = timers.current;
    libraryActions.sampleFiles(8).then((list) => { if (alive) setCards(list.map((f) => mediaUrl(f, 'low'))); });
    return () => { alive = false; pending.forEach(clearTimeout); };
  }, []);

  const draw = async () => {
    if (drawing || !cards.length) return;
    setDrawing(true);
    const pick = libraryActions.randomFile(excludeId);
    // riffle: quick at first, slowing down
    let at = 0;
    for (let i = 0; i < 9; i++) { at += 55 + i * i * 7; timers.current.push(setTimeout(() => setFace((f) => (f + 1) % cards.length), at)); }
    const [hit] = await Promise.all([pick, new Promise((r) => setTimeout(r, at + 60))]);
    if (!hit) { setDrawing(false); return; }
    setCards((c) => { const next = [...c]; next[(face + 9) % c.length] = mediaUrl(hit.file, 'low'); return next; });
    timers.current.push(setTimeout(() => navigate(paths.file(hit.group.id, hit.file.id)), 260));
  };

  const at = (k) => cards[(face + k) % Math.max(1, cards.length)];
  return (
    <button type="button" className={`${s.deck} ${drawing ? s.drawing : ''}`} onClick={draw} aria-busy={drawing}>
      <span className={s.cards} aria-hidden="true">
        {[2, 1, 0].map((k) => (
          <span key={k} className={s.card} data-k={k}>
            {at(k) && <img src={at(k)} alt="" draggable={false} />}
          </span>
        ))}
      </span>
      <span className={s.deckLabel}>
        <Icon name="dice" size={17} />
        {drawing ? t('home.drawing') : t('home.random')}
      </span>
    </button>
  );
}

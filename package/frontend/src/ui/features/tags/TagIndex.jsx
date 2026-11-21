// Every tag in the gallery, once. Each chip carries a thin trace of how often it is used; tags the user added by
// hand look different from the tagger's. Resting on a tag shows a few pictures that carry it; choosing it searches.
import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl, useTagIndex, useTagSamples } from '../../../bridge/index.js';
import { useOverlays } from '../../../app/shell.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton, Segmented } from '../../components/controls.jsx';
import { Popover, Sheet } from '../../components/overlay.jsx';
import { Empty, Spinner } from '../../components/feedback.jsx';
import s from './TagIndex.module.css';

const norm = (x) => (x || '').normalize('NFKC').toLowerCase();
const PEEK_DELAY = 420;

function Marked({ text, q }) {
  const i = q ? norm(text).indexOf(q) : -1;
  if (i < 0) return text;
  return <>{text.slice(0, i)}<mark>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function TagIndex({ open, onClose }) {
  const t = useT();
  const fmt = useFormat();
  const { open: openOverlay } = useOverlays();
  const { data, loading } = useTagIndex();
  const [query, setQuery] = useState('');
  const [source, setSource] = useState('all');
  const [sort, setSort] = useState('count');
  const [peek, setPeek] = useState(null);         // { tag, el }
  const timer = useRef(0);
  const body = useRef(null);
  useEffect(() => { if (open) { setQuery(''); setPeek(null); } }, [open]);
  useEffect(() => { body.current?.scrollTo(0, 0); }, [sort, source]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const q = norm(query.trim());
  const tags = useMemo(() => {
    const list = (data?.tags ?? []).filter((x) => (source === 'all' || x.source === source) && (!q || norm(x.label).includes(q)));
    return sort === 'name' ? [...list].sort((a, b) => a.label.localeCompare(b.label, 'en')) : list;
  }, [data, source, q, sort]);
  const max = Math.log((data?.tags[0]?.count ?? 1) + 1);
  const sections = useMemo(() => {
    if (sort !== 'name') return [{ key: 'all', tags }];
    const by = new Map();
    for (const x of tags) {
      const c = x.label[0]?.toUpperCase() ?? '';
      const key = /[A-Z]/.test(c) ? c : /[0-9]/.test(c) ? '#' : '…';
      if (!by.has(key)) by.set(key, []);
      by.get(key).push(x);
    }
    return [...by].sort(([a], [b]) => (a === '…') - (b === '…') || (a === '#') - (b === '#') || a.localeCompare(b)).map(([key, list]) => ({ key, tags: list }));
  }, [tags, sort]);

  const search = (tag) => { clearTimeout(timer.current); onClose(); openOverlay('search', { text: tag.label, domains: { tags: true, positive: false } }); };
  const hover = (tag, el) => { clearTimeout(timer.current); timer.current = setTimeout(() => setPeek({ tag, el }), peek ? 90 : PEEK_DELAY); };
  const leave = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setPeek(null), 160); };
  const stay = () => clearTimeout(timer.current);

  const chip = (tag) => (
    <button key={tag.key} type="button" className={s.tag} data-source={tag.source} data-peek={peek?.tag.key === tag.key || undefined}
      style={{ '--f': (Math.log(tag.count + 1) / max).toFixed(3) }}
      onClick={() => search(tag)} onPointerEnter={(e) => e.pointerType === 'mouse' && hover(tag, e.currentTarget)} onPointerLeave={leave}
      onFocus={(e) => e.target.matches(':focus-visible') && hover(tag, e.currentTarget)} onBlur={leave}>
      {tag.source === 'user' && <Icon name="edit" size={11} className={s.mine} />}
      <span className={s.label}><Marked text={tag.label} q={q} /></span>
      <span className={`${s.count} num`}>{fmt.number(tag.count)}</span>
    </button>
  );

  return (
    <Sheet open={open} onClose={onClose} label={t('tagIndex.title')} className={s.sheet}>
      <header className={s.head}>
        <span className={s.headIcon}><Icon name="tags" size={20} /></span>
        <div className={s.titles}>
          <h2 className={s.title}>{t('tagIndex.title')}</h2>
          {data && <span className={`${s.summary} num`}>{t('tagIndex.summary', { n: fmt.number(data.tags.length), files: fmt.number(data.files) })}</span>}
        </div>
        <IconButton icon="close" label={t('common.close')} onClick={onClose} />
      </header>
      <div className={s.tools}>
        <label className={s.find}>
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('tagIndex.find')} spellCheck={false} data-autofocus />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}><Icon name="close" size={12} /></button>}
        </label>
        <Segmented size="sm" value={source} onChange={setSource} label={t('tagIndex.title')}
          options={['all', 'model', 'user'].map((v) => ({ value: v, label: t(`tagIndex.source.${v}`) }))} />
        <Segmented size="sm" value={sort} onChange={setSort} label={t('tagIndex.title')}
          options={['count', 'name'].map((v) => ({ value: v, label: t(`tagIndex.sort.${v}`) }))} />
      </div>
      <div ref={body} className={s.body}>
        {!data && loading && <div className={s.wait}><Spinner size={20} /></div>}
        {data && !data.tags.length && <Empty title={t('tagIndex.emptyTitle')}>{t('tagIndex.emptyBody')}</Empty>}
        {data && data.tags.length > 0 && !tags.length && <Empty compact title={t('tagIndex.none')} />}
        {sections.map((sec, i) => sec.tags.length > 0 && (
          <section key={sec.key} className={s.section} style={{ '--d': `${Math.min(i, 10) * 40}ms` }}>
            {sort === 'name' && <h3 className={s.letter}>{sec.key === '…' ? t('tagIndex.other') : sec.key}</h3>}
            <div className={s.chips}>{sec.tags.map(chip)}</div>
          </section>
        ))}
      </div>
      <Popover open={!!peek} onClose={() => setPeek(null)} anchor={peek?.el} placement="bottom-start" offset={8} trapFocus={false} label={peek?.tag.label}>
        {peek && <Peek tag={peek.tag} onEnter={stay} onLeave={leave} onSearch={() => search(peek.tag)} />}
      </Popover>
    </Sheet>
  );
}

/** A few pictures that carry the tag. */
function Peek({ tag, onEnter, onLeave, onSearch }) {
  const t = useT();
  const { data } = useTagSamples(tag.key);
  return (
    <div className={s.peek} onPointerEnter={onEnter} onPointerLeave={onLeave}>
      <div className={s.peekGrid}>
        {Array.from({ length: 6 }, (_, k) => {
          const hit = data?.[k];
          return <span key={k} className={s.peekCell} style={{ '--k': k }}>{hit && <img src={mediaUrl(hit.file, 'low')} alt="" draggable={false} />}</span>;
        })}
      </div>
      <div className={s.peekFoot}>
        <span className={s.peekName}>
          {tag.source === 'user' && <Icon name="edit" size={12} className={s.mine} />}
          {tag.label}
        </span>
        <span className={`${s.peekCount} num`}>
          {t('tagIndex.files', { n: tag.count })}
          {tag.source === 'user' && ` · ${t('tagIndex.userTag')}`}
        </span>
        <button type="button" className={s.peekGo} onClick={onSearch}><Icon name="search" size={14} />{t('tagIndex.search')}</button>
      </div>
    </div>
  );
}

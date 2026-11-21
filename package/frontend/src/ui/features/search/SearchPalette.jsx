// Search across the gallery. Each domain is a place to look; what they find is put together (a union).
// Groups and colour groups can also be chosen as places to look inside. Text → pictures and picture → pictures
// stay locked until the gallery has an image index.
import { useEffect, useMemo, useRef, useState } from 'react';
import { mediaUrl, searchActions, useColorGroupList, useGroupList, useSearch, useSearchCapabilities } from '../../../bridge/index.js';
import { navigate, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Popover, Portal, Tooltip, usePresence, useScrollLock } from '../../components/overlay.jsx';
import { Spinner } from '../../components/feedback.jsx';
import { ScopePicker } from './ScopePicker.jsx';
import s from './SearchPalette.module.css';

const TEXT_DOMAINS = [['tags', 'tag'], ['positive', 'prompt-plus'], ['negative', 'prompt-minus']];
const INDEX_DOMAINS = [['semantic', 'text-image'], ['similar', 'image-search']];
const COLS = 6;
const MAX_TOKENS = 6;

/** A search opened on a group's page looks inside that group; from anywhere else it looks at tags and prompts. */
const initialDomains = (groupId, preset) => ({
  tags: !groupId, positive: !groupId, negative: false, semantic: false, similar: false,
  groups: groupId ? [groupId] : [], colorGroups: [],
  ...preset,
});

function Marked({ text, ranges }) {
  if (!ranges?.length) return text;
  const out = [];
  let at = 0;
  ranges.forEach(([a, b], i) => { if (a < at) return; out.push(text.slice(at, a), <mark key={i}>{text.slice(a, b)}</mark>); at = b; });
  out.push(text.slice(at));
  return out;
}

export default function SearchPalette({ open, onClose, groupId, text: presetText = '', domains: presetDomains, nonce }) {
  const t = useT();
  const fmt = useFormat();
  const { mounted, state } = usePresence(open, 220);
  const [text, setText] = useState('');
  const [domains, setDomains] = useState(() => initialDomains(groupId, presetDomains));
  const [image, setImage] = useState(null);          // { token, url, name }: the picture to find similar ones to
  const [active, setActive] = useState(0);
  const [picking, setPicking] = useState(null);       // 'groups' | 'colors'
  const [dragOver, setDragOver] = useState(false);
  const [nudge, setNudge] = useState(null);           // a locked domain that was pressed
  const input = useRef(null);
  const list = useRef(null);
  const groupsBtn = useRef(null);
  const colorsBtn = useRef(null);
  const fileInput = useRef(null);
  const { data: caps } = useSearchCapabilities();
  const { data: groups } = useGroupList();
  const { data: colors } = useColorGroupList();
  const { data, loading, settled } = useSearch(text, domains, domains.similar ? image?.token : null);
  useScrollLock(mounted);

  // every opening starts from its page's scope
  useEffect(() => {
    if (!open) return;
    setDomains(initialDomains(groupId, presetDomains));
    setText(presetText);
    setImage(null);
    setActive(0);
    setTimeout(() => input.current?.focus(), 30);
  }, [open, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setActive(0); }, [settled?.text, settled?.image, domains]);

  const items = useMemo(() => [
    ...data.groups.map((g) => ({ kind: 'group', key: `g:${g.id}`, go: () => navigate(paths.group(g.id)) })),
    ...data.colorGroups.map((c) => ({ kind: 'color', key: `c:${c.id}`, go: () => navigate(paths.group(c.group.id)) })),
    ...data.files.map((h) => ({ kind: 'file', key: `f:${h.file.id}`, hit: h, go: () => navigate(paths.file(h.group.id, h.file.id)) })),
  ], [data]);
  const firstFile = items.findIndex((x) => x.kind === 'file');
  useEffect(() => { list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' }); }, [active]);

  if (!mounted) return null;
  const choose = (item) => { if (!item) return; onClose(); item.go(); };
  const move = (d) => setActive((a) => Math.max(0, Math.min(items.length - 1, a + d)));
  const onKey = (e) => {
    const inGrid = items[active]?.kind === 'file';
    const atEnd = e.target !== input.current || input.current.selectionStart === text.length;
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); move(inGrid ? COLS : 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(inGrid && active - COLS >= firstFile ? -COLS : -1); }
    else if (inGrid && atEnd && e.key === 'ArrowRight') { e.preventDefault(); move(1); }
    else if (inGrid && atEnd && e.key === 'ArrowLeft' && !text) { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(items[active]); }
  };

  const available = (k) => caps?.[k]?.available;
  const toggle = (k) => {
    if (INDEX_DOMAINS.some(([d]) => d === k) && !available(k)) { setNudge(`${k}:${Date.now()}`); return; }
    setDomains((d) => ({ ...d, [k]: !d[k] }));
    if (k === 'similar' && !domains.similar && !image) setTimeout(() => fileInput.current?.click(), 0);
  };
  const setScope = (key, ids) => setDomains((d) => ({ ...d, [key]: ids }));
  const takeImage = async (source) => {
    if (!source || !available('similar')) return;
    if (source instanceof Blob && !source.type.startsWith('image/')) return;
    const q = await searchActions.queryImage(source);
    setImage(q);
    setDomains((d) => ({ ...d, similar: true }));
  };

  const tokens = [
    ...(groups ?? []).filter((g) => domains.groups.includes(g.id)).map((g) => ({
      key: `g:${g.id}`, name: g.name, mark: g.cover ? <img src={mediaUrl(g.cover, 'low')} alt="" className={s.tokenPic} /> : <Icon name="gallery" size={14} />,
      remove: () => setScope('groups', domains.groups.filter((x) => x !== g.id)),
    })),
    ...(colors ?? []).filter((c) => domains.colorGroups.includes(c.id)).map((c) => ({
      key: `c:${c.id}`, name: `${c.name} · ${c.group.name}`, mark: <i className={s.swatch} style={{ background: c.color }} />,
      remove: () => setScope('colorGroups', domains.colorGroups.filter((x) => x !== c.id)),
    })),
  ];
  const activeHit = items[active]?.kind === 'file' ? items[active].hit : null;
  let k = -1;

  return (
    <Portal>
      <div className={s.layer} data-state={state}>
        <div className={s.scrim} onPointerDown={onClose} />
        <div className={s.palette} role="dialog" aria-modal="true" aria-label={t('bar.search')} onKeyDown={onKey} data-drag={dragOver || undefined}
          onDragOver={(e) => { if (available('similar') && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); setDragOver(true); } }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); takeImage(e.dataTransfer.files?.[0]); }}>
          <div className={s.inputRow}>
            {loading ? <Spinner size={20} className={s.lead} /> : <Icon name="search" size={21} className={s.lead} />}
            {domains.similar && (image ? (
              <span className={s.queryImage}>
                <img src={image.url} alt="" />
                <button type="button" onClick={() => setImage(null)} aria-label={t('search.removeImage')}><Icon name="close" size={11} /></button>
              </span>
            ) : (
              <Tooltip label={t('search.dropImage')}>
                <button type="button" className={s.imageSlot} onClick={() => fileInput.current?.click()} aria-label={t('search.pickImage')}>
                  <Icon name="image-search" size={18} />
                </button>
              </Tooltip>
            ))}
            <input ref={input} className={s.input} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('search.placeholder')} spellCheck={false} />
            <kbd className={s.esc} onClick={onClose}>Esc</kbd>
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => { takeImage(e.target.files?.[0]); e.target.value = ''; }} />
          </div>

          <div className={s.domains}>
            <div className={s.domainRow}>
              <span className={s.fields} role="group" aria-label={t('search.domains')}>
                {TEXT_DOMAINS.map(([d, icon]) => (
                  <button key={d} type="button" className={s.field} aria-pressed={domains[d]} onClick={() => toggle(d)}>
                    <Icon name={icon} size={14} />{t(`search.d.${d}`)}
                  </button>
                ))}
              </span>
              <span className={s.fields} role="group">
                {INDEX_DOMAINS.map(([d, icon]) => {
                  const locked = caps && !available(d);
                  const btn = (
                    <button key={d} type="button" className={s.field} aria-pressed={!locked && domains[d]} aria-disabled={locked || undefined}
                      data-nudge={nudge?.startsWith(`${d}:`) ? nudge : undefined} onClick={() => toggle(d)}>
                      <Icon name={locked ? 'lock' : icon} size={14} />{t(`search.d.${d}`)}
                    </button>
                  );
                  return locked ? <Tooltip key={d} label={t('search.locked')}>{btn}</Tooltip> : btn;
                })}
              </span>
            </div>
            {/* the places to look inside, and what has been chosen there */}
            <div className={s.scopeRow}>
              <button ref={groupsBtn} type="button" className={s.scopeBtn} data-on={domains.groups.length > 0} aria-expanded={picking === 'groups'} onClick={() => setPicking((p) => (p === 'groups' ? null : 'groups'))}>
                <Icon name="gallery" size={14} />
                <span>{domains.groups.length ? t('search.groupsCount', { n: domains.groups.length }) : t('search.allGroups')}</span>
                <Icon name="chevron-down" size={13} />
              </button>
              <button ref={colorsBtn} type="button" className={s.scopeBtn} data-on={domains.colorGroups.length > 0} aria-expanded={picking === 'colors'} onClick={() => setPicking((p) => (p === 'colors' ? null : 'colors'))}>
                <Icon name="swatches" size={14} />
                <span>{domains.colorGroups.length ? t('search.colorsCount', { n: domains.colorGroups.length }) : t('search.allColors')}</span>
                <Icon name="chevron-down" size={13} />
              </button>
              {tokens.length > 0 && (
                <span className={s.picked}>
                  {tokens.slice(0, MAX_TOKENS).map((x) => (
                    <button key={x.key} type="button" className={s.token} onClick={x.remove} title={t('common.remove')}>
                      {x.mark}<span>{x.name}</span><Icon name="close" size={12} />
                    </button>
                  ))}
                  {tokens.length > MAX_TOKENS && <span className={s.tokenMore}>+{tokens.length - MAX_TOKENS}</span>}
                  <button type="button" className={s.reset} onClick={() => setDomains((d) => ({ ...d, groups: [], colorGroups: [] }))}>{t('common.clear')}</button>
                </span>
              )}
            </div>
          </div>

          <div ref={list} className={s.results}>
            {!settled && <div className={s.hint}><Icon name="sparkle" size={18} />{t('search.idle')}</div>}
            {settled && !loading && !items.length && <div className={s.hint}><Icon name="search" size={18} />{t('search.none')}</div>}
            {data.groups.length > 0 && (
              <section>
                <h4 className={s.section}>{t('search.resultsGroups')}</h4>
                <div className={s.groupHits}>
                  {data.groups.map((g) => {
                    const idx = ++k;
                    return (
                      <button key={g.id} type="button" className={s.groupHit} data-active={idx === active} onPointerEnter={() => setActive(idx)} onClick={() => choose(items[idx])}>
                        <span className={s.groupPic}>{g.cover ? <img src={mediaUrl(g.cover, 'low')} alt="" /> : <Icon name="gallery" size={16} />}</span>
                        <span className={s.groupText}>
                          <span className={s.groupName}><Marked text={g.name} ranges={g.ranges} /></span>
                          <span className={`${s.groupMeta} num`}>{t('home.files', { n: g.fileCount })}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}
            {data.colorGroups.length > 0 && (
              <section>
                <h4 className={s.section}>{t('search.resultsColors')}</h4>
                <ul className={s.colorHits}>
                  {data.colorGroups.map((c) => {
                    const idx = ++k;
                    return (
                      <li key={c.id}>
                        <button type="button" className={s.colorHit} data-active={idx === active} onPointerEnter={() => setActive(idx)} onClick={() => choose(items[idx])} style={{ '--c': c.color }}>
                          <i className={s.colorChip} />
                          <span className={s.colorName}><Marked text={c.name} ranges={c.ranges} /></span>
                          <span className={s.colorWhere}>{c.group.name} · {c.config}</span>
                          <span className={`${s.colorCount} num`}>{t('home.files', { n: c.fileCount })}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
            {data.files.length > 0 && (
              <section>
                <h4 className={s.section}>{t('search.resultsFiles')}<span className={`${s.count} num`}>{t('search.results', { n: data.total })}</span></h4>
                <div className={s.grid} style={{ '--cols': COLS }}>
                  {data.files.map((h) => {
                    const idx = ++k;
                    return (
                      <button key={h.file.id} type="button" className={s.tile} data-active={idx === active} onPointerEnter={() => setActive(idx)} onClick={() => choose(items[idx])}
                        aria-label={`${h.file.name}.${h.file.ext}`} style={{ '--i': Math.min(idx, 24) }}>
                        <img src={mediaUrl(h.file, 'low')} alt="" loading="lazy" decoding="async" draggable={false} />
                        {h.file.kind === 'video' && <span className={s.tileVideo}><Icon name="play" size={10} /></span>}
                        {h.similarity && <span className={`${s.tileSim} num`}>{Math.round(h.similarity * 100)}%</span>}
                      </button>
                    );
                  })}
                </div>
                {data.total > data.files.length && <div className={`${s.more} num`}>{t('search.more', { n: fmt.number(data.total - data.files.length) })}</div>}
              </section>
            )}
          </div>

          {activeHit && <Detail hit={activeHit} />}
          {dragOver && <div className={s.dropVeil}><Icon name="image-search" size={26} /><span>{t('search.dropImage')}</span></div>}
        </div>

        <Popover open={picking === 'groups'} onClose={() => setPicking(null)} anchor={groupsBtn} placement="bottom-start" label={t('search.chooseGroups')} trapFocus={false}>
          <ScopePicker kind="groups" items={groups ?? []} value={domains.groups} onChange={(ids) => setScope('groups', ids)} />
        </Popover>
        <Popover open={picking === 'colors'} onClose={() => setPicking(null)} anchor={colorsBtn} placement="bottom-start" label={t('search.chooseColors')} trapFocus={false}>
          <ScopePicker kind="colors" items={colors ?? []} value={domains.colorGroups} onChange={(ids) => setScope('colorGroups', ids)} />
        </Popover>
      </div>
    </Portal>
  );
}

/** Why the active file was found: the tag, the words in its prompt, or how alike it is. */
function Detail({ hit }) {
  const t = useT();
  const { file, group, matched, tag, prompt, similarity } = hit;
  return (
    <footer className={s.detail} key={file.id}>
      <span className={s.detailPic} style={{ aspectRatio: Math.max(0.6, Math.min(1.8, file.width / file.height)) }}>
        <img src={mediaUrl(file, 'low')} alt="" />
      </span>
      <span className={s.detailBody}>
        <span className={s.detailTitle}>
          <span className={s.detailName}>{file.name}.{file.ext}</span>
          <span className={s.detailGroup}>{group.name}</span>
          <span className={`${s.detailSize} num`}>{file.width} × {file.height}</span>
        </span>
        <span className={s.why}>
          {matched.map((m) => <span key={m} className={s.badge} data-m={m}>{t(`search.matched.${m}`)}</span>)}
          {tag && matched.includes('tags') && <span className={s.whyTag} data-source={tag.source}><Marked text={tag.label} ranges={tag.ranges} /></span>}
          {prompt && <span className={s.whyPrompt}><Marked text={prompt.text} ranges={prompt.ranges} /></span>}
          {similarity && <span className={`${s.whySim} num`}>{t('search.similarity', { n: Math.round(similarity * 100) })}</span>}
        </span>
      </span>
    </footer>
  );
}

// Choosing groups out of dozens or hundreds. Groups are known by their covers, so they are picked from a small wall
// of covers: type to narrow it down, click to tick, Shift-click to tick a run. Used by export, MCP keys and snapshots.
//   GroupSelector — the wall itself (in a popover or inside a dialog)
//   GroupsField   — a compact summary of what is chosen, that opens the wall on demand
import { useMemo, useRef, useState } from 'react';
import { mediaUrl } from '../../bridge/index.js';
import { useT } from '../../i18n/index.jsx';
import { useFormat } from '../lib/format.js';
import { Icon } from '../icons/Icon.jsx';
import { Tick } from './controls.jsx';
import { Popover } from './overlay.jsx';
import s from './GroupSelector.module.css';

const norm = (x) => (x || '').normalize('NFKC').toLowerCase();
const cx = (...a) => a.filter(Boolean).join(' ');

/** A group's cover at thumbnail size, or a quiet frame for a group without pictures. */
export function GroupCover({ group, className, style }) {
  return (
    <span className={cx(s.cover, className)} style={style} data-empty={!group.cover || undefined}>
      {group.cover ? <img src={mediaUrl(group.cover, 'low')} alt="" loading="lazy" decoding="async" draggable={false} /> : <Icon name="gallery" size={14} />}
    </span>
  );
}

/**
 * groups: [{ id, name, fileCount, cover, removed? }]; value: [id]; meta(group) → what the line under a name says
 * (default: how many files).
 */
export function GroupSelector({ groups, value, onChange, meta, autoFocus, className }) {
  const t = useT();
  const fmt = useFormat();
  const [query, setQuery] = useState('');
  const chosen = useMemo(() => new Set(value), [value]);
  const last = useRef(null);
  const q = norm(query.trim());
  const shown = q ? groups.filter((g) => norm(g.name).includes(q)) : groups;
  const ids = shown.map((g) => g.id);
  const nShown = ids.filter((id) => chosen.has(id)).length;

  const setMany = (list, on) => {
    const next = new Set(chosen);
    for (const id of list) (on ? next.add(id) : next.delete(id));
    // keep the gallery's order, so summaries read the way the home page does
    onChange(groups.map((g) => g.id).filter((id) => next.has(id)));
  };
  // a click ticks one group; Shift extends from the last one clicked, in the order shown
  const click = (e, id) => {
    const from = last.current ? ids.indexOf(last.current) : -1;
    last.current = id;
    if (e.shiftKey && from >= 0) {
      const to = ids.indexOf(id);
      setMany(ids.slice(Math.min(from, to), Math.max(from, to) + 1), true);
      return;
    }
    setMany([id], !chosen.has(id));
  };
  const picked = groups.filter((g) => chosen.has(g.id));

  return (
    <div className={cx(s.selector, className)}>
      <div className={s.top}>
        <label className={s.search}>
          <Icon name="search" size={15} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('picker.find')} autoFocus={autoFocus} spellCheck={false} />
          {query && <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}><Icon name="close" size={12} /></button>}
        </label>
        <span className={s.actions}>
          <button type="button" disabled={!ids.length || nShown === ids.length} onClick={() => setMany(ids, true)}>{t('common.selectAll')}</button>
          <button type="button" disabled={!nShown} onClick={() => setMany(ids, false)}>{t('common.selectNone')}</button>
        </span>
      </div>
      <div className={s.wall} role="group" aria-label={t('picker.choose')}>
        {shown.map((g, i) => {
          const on = chosen.has(g.id);
          return (
            <button key={g.id} type="button" role="checkbox" aria-checked={on} className={s.tile} data-on={on} data-removed={g.removed || undefined}
              style={{ '--i': Math.min(i, 24) }} onClick={(e) => click(e, g.id)}>
              <span className={s.frame}>
                <GroupCover group={g} />
                <span className={s.tick}><Tick state={on ? 'on' : 'off'} size={16} /></span>
              </span>
              <span className={s.name} title={g.name}>{g.name}</span>
              <span className={`${s.meta} num`}>
                {g.removed ? <span className={s.removed}>{t('picker.removed')}</span> : null}
                <span className={s.metaText}>{meta ? meta(g) : t('picker.files', { n: fmt.number(g.fileCount) })}</span>
              </span>
            </button>
          );
        })}
        {!shown.length && <div className={s.none}>{t('picker.none')}</div>}
      </div>
      <div className={s.foot} data-empty={!picked.length}>
        <span className={s.stack} aria-hidden="true">
          {picked.slice(0, 6).map((g, k) => <GroupCover key={g.id} group={g} className={s.stackItem} style={{ '--k': k }} />)}
        </span>
        <span className={`${s.count} num`}>{picked.length ? t('picker.selected', { n: picked.length }) : t('picker.groups', { n: groups.length })}</span>
        {picked.length > 0 && <button type="button" className={s.clear} onClick={() => onChange([])}>{t('common.clear')}</button>}
      </div>
    </div>
  );
}

/**
 * What is chosen, at a glance: a fan of the first covers, the first names and the totals. Opens the selector.
 * `allLabel` adds a one-click "every group" toggle next to it.
 */
export function GroupsField({ groups, value, onChange, placeholder, allLabel, meta, invalid }) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const chosen = value.map((id) => groups.find((g) => g.id === id)).filter(Boolean);
  const all = groups.length > 0 && chosen.length >= groups.length;
  const files = chosen.reduce((n, g) => n + (g.fileCount ?? 0), 0);
  return (
    <div className={s.field}>
      <button ref={btn} type="button" className={s.summary} data-empty={!chosen.length} data-invalid={invalid || undefined} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {chosen.length ? (
          <>
            <span className={s.fan} data-n={Math.min(4, chosen.length)}>
              {chosen.slice(0, 4).map((g) => <GroupCover key={g.id} group={g} className={s.fanItem} />)}
            </span>
            <span className={s.text}>
              <span className={s.names}>
                <span className={s.namesText}>{all && allLabel ? allLabel : chosen.slice(0, 2).map((g) => g.name).join(t('common.and'))}</span>
                {!(all && allLabel) && chosen.length > 2 && <span className={s.plus}>+{chosen.length - 2}</span>}
              </span>
              <span className={`${s.sub} num`}>{t('picker.groups', { n: chosen.length })} · {t('picker.files', { n: fmt.number(files) })}</span>
            </span>
          </>
        ) : (
          <span className={s.text}><span className={s.names} data-placeholder=""><span className={s.namesText}>{placeholder ?? t('picker.choose')}</span></span></span>
        )}
        <Icon name="chevron-down" size={15} className={s.chev} />
      </button>
      {allLabel && (
        <button type="button" className={s.allBtn} data-on={all} disabled={!groups.length}
          onClick={() => onChange(all ? [] : groups.map((g) => g.id))}>
          <Icon name={all ? 'check' : 'gallery'} size={14} />{allLabel}
        </button>
      )}
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} placement="bottom-start" trapFocus={false} label={placeholder ?? t('picker.choose')} className={s.pop}>
        <GroupSelector groups={groups} value={value} onChange={onChange} meta={meta} autoFocus />
      </Popover>
    </div>
  );
}

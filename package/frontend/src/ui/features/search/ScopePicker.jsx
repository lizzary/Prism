// Choosing the groups or colour groups a search looks inside. Built to stay quick with dozens of groups and
// hundreds of colour groups: a search field on top, colour groups listed under the group they belong to.
import { useMemo, useState } from 'react';
import { mediaUrl } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Tick } from '../../components/controls.jsx';
import s from './ScopePicker.module.css';

const norm = (x) => (x || '').normalize('NFKC').toLowerCase();

/** kind: 'groups' (items: [{ id, name, fileCount, cover }]) | 'colors' (items: [{ id, name, color, config, group, fileCount }]) */
export function ScopePicker({ kind, items, value, onChange }) {
  const t = useT();
  const [query, setQuery] = useState('');
  const chosen = useMemo(() => new Set(value), [value]);
  const q = norm(query.trim());
  const shown = items.filter((x) => !q || norm(x.name).includes(q) || (kind === 'colors' && norm(x.group.name).includes(q)));
  const toggle = (id) => onChange(chosen.has(id) ? value.filter((x) => x !== id) : [...value, id]);

  const row = (x) => (
    <button key={x.id} type="button" role="checkbox" aria-checked={chosen.has(x.id)} className={s.row} data-on={chosen.has(x.id)} onClick={() => toggle(x.id)}>
      <Tick state={chosen.has(x.id) ? 'on' : 'off'} size={16} />
      {kind === 'groups'
        ? <span className={s.pic}>{x.cover ? <img src={mediaUrl(x.cover, 'low')} alt="" loading="lazy" /> : <Icon name="gallery" size={14} />}</span>
        : <i className={s.swatch} style={{ background: x.color }} />}
      <span className={s.text}>
        <span className={s.name}>{x.name}</span>
        {kind === 'colors' && <span className={s.sub}>{x.config}</span>}
      </span>
      <span className={`${s.count} num`}>{x.fileCount}</span>
    </button>
  );

  // colour groups sit under the group they belong to
  const sections = kind === 'colors'
    ? [...shown.reduce((m, x) => m.set(x.group.id, [...(m.get(x.group.id) ?? []), x]), new Map()).values()]
    : [shown];

  return (
    <div className={s.picker}>
      <label className={s.search}>
        <Icon name="search" size={15} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={kind === 'groups' ? t('search.findGroup') : t('search.findColor')} autoFocus spellCheck={false} />
      </label>
      <div className={s.list}>
        {sections.map((list) => (
          <section key={list[0]?.group?.id ?? 'all'} className={s.section}>
            {kind === 'colors' && <h5 className={s.head}>{list[0].group.name}</h5>}
            {list.map(row)}
          </section>
        ))}
        {!shown.length && <div className={s.none}>{t('search.none2')}</div>}
      </div>
      <div className={s.foot}>
        <span className="num">{value.length ? t('search.selected', { n: value.length }) : kind === 'groups' ? t('search.allGroups') : t('search.allColors')}</span>
        {value.length > 0 && <button type="button" onClick={() => onChange([])}>{t('common.clear')}</button>}
      </div>
    </div>
  );
}

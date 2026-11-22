// A file's details beside the lightbox: where it is (its group, and its colour group — which can be changed here), its
// size and dates, its tags (the tagger's, and the user's own, which can be edited) and note, and the ComfyUI
// parameters it was made with, when it carries them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { fileActions, useFileDetail, useTagIndex } from '../../../../bridge/index.js';
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { Icon } from '../../../icons/Icon.jsx';
import { Button, TextArea } from '../../../components/controls.jsx';
import { Spinner, toast } from '../../../components/feedback.jsx';
import { Menu } from '../../../components/menu.jsx';
import { CopyButton } from '../../../components/share.jsx';
import { Tooltip } from '../../../components/overlay.jsx';
import s from './Details.module.css';

const norm = (x) => (x || '').normalize('NFKC').toLowerCase().replace(/[\s_]+/g, ' ').trim();
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** 2:3, 16:9 … or the plain proportion when it has no small whole numbers. */
function ratioOf(w, h) {
  const g = gcd(w, h), a = w / g, b = h / g;
  return a <= 32 && b <= 32 ? `${a}:${b}` : (w / h).toFixed(2);
}

export function Details({ fileId }) {
  const t = useT();
  const fmt = useFormat();
  const { data: d } = useFileDetail(fileId);
  if (!d) return <div className={s.wait}><Spinner size={18} /></div>;
  const f = d.file;
  return (
    <div className={s.details} data-stale={f.id !== fileId || undefined}>
      <header className={s.head}>
        <h2 className={s.title}>{f.name}<span className={s.ext}>.{f.ext}</span></h2>
        <p className={s.sub}>
          <span><Icon name={f.kind === 'video' ? 'video' : 'image'} size={14} />{t(`details.kind.${f.kind}`)}</span>
          <span className="num">{ratioOf(f.width, f.height)}</span>
          {d.cover && <span className={s.coverTag}><Icon name="cover" size={13} />{t('details.cover')}</span>}
        </p>
      </header>

      <dl className={s.facts}>
        <div><dt>{t('details.group')}</dt><dd>{d.group.name}</dd></div>
        <div><dt>{t('details.color')}</dt><dd><ColorPick key={f.id} d={d} /></dd></div>
        <div><dt>{t('details.resolution')}</dt><dd className="num">{f.width} × {f.height}</dd></div>
        <div><dt>{t('details.size')}</dt><dd className="num">{fmt.bytes(d.size)}</dd></div>
        {f.kind === 'video' && <div><dt>{t('details.duration')}</dt><dd className="num">{fmt.duration(f.duration)}</dd></div>}
        <div><dt>{t('details.created')}</dt><dd>{fmt.dateTime(d.createdAt)}</dd></div>
        <div><dt>{t('details.imported')}</dt><dd>{fmt.dateTime(d.importedAt)}</dd></div>
      </dl>

      <Tags key={`tags:${f.id}`} d={d} />
      <Note key={`note:${f.id}`} d={d} />
      {d.comfy && <Comfy c={d.comfy} />}
    </div>
  );
}

/** The colour group the file is in (in the configuration its group uses); choosing another moves it there. */
function ColorPick({ d }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  if (!d.config) return <span className={s.muted}>{t('details.noColors')}</span>;
  const move = (id) => { if (id !== (d.color?.id ?? null)) fileActions.update(d.file.id, { color: id }); };
  const items = [
    ...d.config.colors.map((c) => ({ key: c.id, label: c.name, swatch: c.color, checked: d.color?.id === c.id, onSelect: () => move(c.id) })),
    '-',
    { key: 'none', label: t('group.colors.noColor'), swatch: 'none', checked: !d.color, onSelect: () => move(null) },
  ];
  return (
    <>
      <button ref={ref} type="button" className={s.colorBtn} style={{ '--c': d.color?.color }} data-none={!d.color || undefined} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <i />
        <span>{d.color ? d.color.name : t('group.colors.noColor')}</span>
        <Icon name="chevron-down" size={13} />
      </button>
      <Menu open={open} onClose={() => setOpen(false)} anchor={ref} items={items} label={t('details.color')} className={`${s.over} theme-night`} />
    </>
  );
}

/** The tagger's tags (each with a trace of how sure it was) and the user's own, which are edited and saved here. */
function Tags({ d }) {
  const t = useT();
  const original = useMemo(() => d.tags.filter((x) => x.source === 'user').map((x) => x.label), [d.tags]);
  const model = d.tags.filter((x) => x.source === 'model');
  const [editing, setEditing] = useState(false);
  const [mine, setMine] = useState(original);
  const [text, setText] = useState('');
  const [hi, setHi] = useState(-1);
  const [saving, setSaving] = useState(false);
  const { data: index } = useTagIndex();
  // while not being edited, the tags follow what is saved (they may change elsewhere)
  useEffect(() => { if (!editing) setMine(original); }, [original, editing]);
  const taken = new Set([...model.map((x) => norm(x.label)), ...mine.map(norm)]);
  const q = norm(text);
  const suggestions = !editing || !q ? [] : (index?.tags ?? [])
    .filter((x) => !taken.has(norm(x.label)) && norm(x.label).includes(q))
    .sort((a, b) => (norm(b.label).startsWith(q) - norm(a.label).startsWith(q)) || b.count - a.count)
    .slice(0, 6);

  const add = (label) => {
    const v = label.trim().slice(0, 60);
    setText('');
    setHi(-1);
    if (v && !taken.has(norm(v))) setMine((m) => [...m, v]);
  };
  const cancel = () => { setMine(original); setText(''); setEditing(false); };
  const save = async () => {
    const pending = text.trim() && !taken.has(norm(text)) ? [text.trim()] : [];
    setSaving(true);
    await fileActions.update(d.file.id, { userTags: [...mine, ...pending] });
    setSaving(false);
    setText('');
    setEditing(false);
    toast(t('details.saved'), { tone: 'ok', icon: 'tag' });
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (hi >= 0 && suggestions[hi]) add(suggestions[hi].label); else if (text.trim()) add(text); else save(); }
    else if (e.key === 'ArrowDown' && suggestions.length) { e.preventDefault(); setHi((h) => (h + 1) % suggestions.length); }
    else if (e.key === 'ArrowUp' && suggestions.length) { e.preventDefault(); setHi((h) => (h <= 0 ? suggestions.length - 1 : h - 1)); }
    else if (e.key === 'Backspace' && !text && mine.length) setMine((m) => m.slice(0, -1));
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  };

  return (
    <section className={s.block} data-editing={editing || undefined}>
      <div className={s.blockHead}>
        <h3 className={s.blockTitle}>{t('details.tags')}<span className="num">{model.length + mine.length}</span></h3>
        {!editing && <button type="button" className={s.editBtn} onClick={() => setEditing(true)}><Icon name="edit" size={13} />{t('details.editTags')}</button>}
      </div>
      <div className={s.tags}>
        {mine.map((label) => (
          <span key={label} className={s.tag} data-source="user">
            <Icon name="edit" size={11} className={s.pen} />
            {label}
            {editing && <button type="button" className={s.untag} onClick={() => setMine((m) => m.filter((x) => x !== label))} aria-label={t('common.remove')}><Icon name="close" size={10} stroke={2} /></button>}
          </span>
        ))}
        {model.map((x) => (
          <Tooltip key={x.key} label={x.score != null ? t('details.score', { n: Math.round(x.score * 100) }) : x.label} delay={600}>
            <span className={s.tag} style={{ '--f': x.score ?? 0.6 }} tabIndex={-1}>{x.label}</span>
          </Tooltip>
        ))}
        {!model.length && !mine.length && !editing && <span className={s.muted}>{t('details.noTags')}</span>}
      </div>
      {editing && (
        <div className={s.adder}>
          <div className={s.field}>
            <Icon name="tag" size={14} />
            <input value={text} onChange={(e) => { setText(e.target.value); setHi(-1); }} onKeyDown={onKey} placeholder={t('details.addTag')} autoFocus spellCheck={false} maxLength={60} />
          </div>
          {suggestions.length > 0 && (
            <ul className={s.suggest} role="listbox">
              {suggestions.map((x, i) => (
                <li key={x.key} role="option" aria-selected={i === hi} data-hi={i === hi || undefined} onPointerDown={(e) => { e.preventDefault(); add(x.label); }}>
                  <span>{x.label}</span><span className="num">{x.count}</span>
                </li>
              ))}
            </ul>
          )}
          <div className={s.editFoot}>
            <span className={s.hint}>{t('details.mineHint')}</span>
            <Button variant="ghost" size="sm" onClick={cancel}>{t('common.cancel')}</Button>
            <Button variant="primary" size="sm" loading={saving} onClick={save}>{t('common.save')}</Button>
          </div>
        </div>
      )}
    </section>
  );
}

function Note({ d }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(d.note ?? '');
  const [saving, setSaving] = useState(false);
  const edit = () => { setText(d.note ?? ''); setEditing(true); };
  const cancel = () => { setText(d.note ?? ''); setEditing(false); };
  const save = async () => {
    setSaving(true);
    await fileActions.update(d.file.id, { note: text.trim() });
    setSaving(false);
    setEditing(false);
    toast(t('details.saved'), { tone: 'ok', icon: 'text' });
  };
  return (
    <section className={s.block}>
      <div className={s.blockHead}>
        <h3 className={s.blockTitle}>{t('details.note')}</h3>
        {!editing && d.note && <button type="button" className={s.editBtn} onClick={edit}><Icon name="edit" size={13} />{t('common.edit')}</button>}
      </div>
      {editing ? (
        <>
          <TextArea value={text} onChange={(e) => setText(e.target.value)} placeholder={t('details.notePlaceholder')} autoFocus maxLength={4000} className={s.noteInput}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(); }
              else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
            }} />
          <div className={s.editFoot}>
            <span className={s.hint}>{t('details.noteHint')}</span>
            <Button variant="ghost" size="sm" onClick={cancel}>{t('common.cancel')}</Button>
            <Button variant="primary" size="sm" loading={saving} onClick={save}>{t('common.save')}</Button>
          </div>
        </>
      ) : d.note
        ? <p className={s.note} onClick={edit}>{d.note}</p>
        : <button type="button" className={s.addNote} onClick={edit}><Icon name="plus" size={14} />{t('details.writeNote')}</button>}
    </section>
  );
}

/** How it was made: the checkpoint, both prompts (copyable), and the sampling settings. */
function Comfy({ c }) {
  const t = useT();
  const params = [['seed', c.seed], ['sampler', c.sampler], ['scheduler', c.scheduler], ['steps', c.steps], ['cfg', c.cfg], ['denoise', c.denoise]];
  return (
    <section className={s.block}>
      <div className={s.blockHead}><h3 className={s.blockTitle}>ComfyUI</h3></div>
      <div className={s.model}><Icon name="chip" size={15} /><span>{c.model}</span></div>
      <Prompt label={t('details.positive')} text={c.positive} icon="prompt-plus" />
      {c.negative && <Prompt label={t('details.negative')} text={c.negative} icon="prompt-minus" />}
      <dl className={s.params}>
        {params.map(([k, v]) => (
          <div key={k}>
            <dt>{t(`details.${k}`)}</dt>
            <dd className="num">{v}{k === 'seed' && <CopyButton iconOnly text={String(v)} label={t('details.copySeed')} className={s.copySeed} />}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Prompt({ label, text, icon }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const long = text.length > 200;
  return (
    <div className={s.prompt}>
      <div className={s.promptHead}>
        <Icon name={icon} size={14} />
        <span>{label}</span>
        <CopyButton iconOnly text={text} label={t('common.copy')} className={s.copy} />
      </div>
      <p className={s.promptText} data-clipped={(long && !open) || undefined} onClick={() => long && setOpen((o) => !o)}>{text}</p>
    </div>
  );
}

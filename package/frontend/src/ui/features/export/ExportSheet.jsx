// Export: which groups, where to, which import dates and file types, and how the files are named and arranged —
// with the folders it will create previewed live. From a group's page the group is already chosen.
import { useEffect, useMemo, useRef, useState } from 'react';
import { FILE_KINDS, exportActions, useExportOptions, useExportPreview, useLastExportConfig } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { dayKey, useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, TextInput, Tick } from '../../components/controls.jsx';
import { Calendar } from '../../components/calendar.jsx';
import { Popover, Sheet } from '../../components/overlay.jsx';
import { Spinner, toast } from '../../components/feedback.jsx';
import { GroupsField } from '../../components/GroupSelector.jsx';
import { FolderPicker } from '../folders/FolderPicker.jsx';
import { TemplateInput } from './TemplateInput.jsx';
import { TreePreview } from './TreePreview.jsx';
import s from './ExportSheet.module.css';

/** group / colour group / original name: each group a folder, its colour groups inside (files in none sit in the group's folder). */
const DEFAULT_TEMPLATE = [
  { type: 'key', kind: 'agg', id: 'group.name' }, { type: 'text', text: '/' },
  { type: 'key', kind: 'agg', id: 'color.name' }, { type: 'text', text: '/' },
  { type: 'key', kind: 'data', id: 'file.name' },
];
const PRESETS = ['today', 'd7', 'd30', 'month', 'year', 'all'];
function presetRange(key) {
  const now = new Date(), today = dayKey(now);
  const back = (n) => { const d = new Date(now); d.setDate(d.getDate() - n); return dayKey(d); };
  return {
    today: { mode: 'range', from: today, to: today },
    d7: { mode: 'range', from: back(6), to: today },
    d30: { mode: 'range', from: back(29), to: today },
    month: { mode: 'range', from: dayKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: today },
    year: { mode: 'range', from: `${now.getFullYear()}-01-01`, to: today },
    all: { mode: 'all' },
  }[key];
}
const sameDates = (a, b) => a.mode === b.mode && (a.mode === 'all' || (a.from === b.from && a.to === b.to));

export default function ExportSheet({ open, onClose, scope = 'home', groupId, nonce }) {
  const t = useT();
  const fmt = useFormat();
  const inGroup = scope === 'group' && !!groupId;
  const { data: last, loading: lastLoading } = useLastExportConfig(inGroup ? 'group' : 'home', groupId);
  const [cfg, setCfg] = useState(null);
  const [starting, setStarting] = useState(false);
  const inited = useRef(null);

  // each opening starts from the page's last configuration; a group's page always includes its group
  useEffect(() => {
    if (!open || lastLoading || inited.current === nonce) return;
    inited.current = nonce;
    const base = { groupIds: inGroup ? [groupId] : [], outputDir: 'D:\\Exports\\Prism', dates: { mode: 'all' }, fileTypes: null, template: DEFAULT_TEMPLATE, maxPerDir: 5, ...(last ?? {}) };
    if (inGroup && !base.groupIds.includes(groupId)) base.groupIds = [groupId, ...base.groupIds];
    setCfg(base);
  }, [open, lastLoading, last, nonce, inGroup, groupId]);

  // the configuration is remembered for the page (optimistically: nothing waits for it)
  useEffect(() => {
    if (!cfg) return undefined;
    const id = setTimeout(() => exportActions.saveConfig(inGroup ? 'group' : 'home', groupId, cfg), 500);
    return () => clearTimeout(id);
  }, [cfg, inGroup, groupId]);

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  const { data: options } = useExportOptions(inGroup ? 'group' : 'home', cfg?.groupIds ?? []);
  const allTypes = useMemo(() => options?.fileTypes.map((f) => f.ext) ?? [], [options]);
  const known = useMemo(() => new Set(options?.groups.map((g) => g.id) ?? []), [options]);
  const errors = useMemo(() => (cfg ? exportActions.validate(cfg.template) : []), [cfg]);
  const resolved = cfg && options ? {
    groupIds: cfg.groupIds.filter((id) => known.has(id)), outputDir: cfg.outputDir, dates: cfg.dates,
    fileTypes: (cfg.fileTypes ?? allTypes).filter((x) => allTypes.includes(x)), template: cfg.template,
  } : null;
  const previewable = resolved && !errors.length && resolved.groupIds.length > 0;
  const { data: plan, loading: planning } = useExportPreview(previewable ? resolved : null, cfg?.maxPerDir ?? 5);
  // nothing chosen yet is where everyone starts: said quietly; a missing folder is a real problem
  const problem = !cfg ? null : !resolved?.groupIds.length ? { tone: 'hint', text: t('export.errors.noGroups') }
    : !cfg.outputDir.trim() ? { tone: 'warn', text: t('export.errors.noDir') } : null;
  const canStart = previewable && !problem && plan?.files > 0 && !starting;

  const start = async () => {
    setStarting(true);
    const res = await exportActions.start(resolved);
    setStarting(false);
    toast(t('export.started', { n: res.files, count: fmt.number(res.files) }), { tone: 'ok', icon: 'export' });
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} label={t('export.title')}>
      <div className={s.sheet}>
        <header className={s.head}>
          <span className={s.mark}><Icon name="export" size={19} /></span>
          <h2 className={s.title}>{inGroup ? t('export.groupTitle') : t('export.homeTitle')}</h2>
          <IconButton icon="close" label={t('common.close')} onClick={onClose} />
        </header>
        {!cfg ? <div className={s.wait}><Spinner size={22} /></div> : (
          <div className={s.main}>
            <div className={s.config}>
              <Section n={1} title={t('export.groups')}>
                <GroupsField groups={options?.groups ?? []} value={resolved?.groupIds ?? cfg.groupIds} allLabel={t('picker.all')}
                  onChange={(groupIds) => set({ groupIds })} />
              </Section>
              <Section n={2} title={t('export.outputDir')}>
                <DirField value={cfg.outputDir} onChange={(outputDir) => set({ outputDir })} />
              </Section>
              <Section n={3} title={t('export.dates')}>
                <DatesField dates={cfg.dates} onChange={(dates) => set({ dates })} marks={options?.calendar} />
              </Section>
              <Section n={4} title={t('export.fileTypes')} aside={allTypes.length > 0 && (
                <span className={s.miniActions}>
                  <button type="button" onClick={() => set({ fileTypes: null })}>{t('common.selectAll')}</button>
                  <button type="button" onClick={() => set({ fileTypes: [] })}>{t('common.selectNone')}</button>
                </span>
              )}>
                <TypesField types={options?.fileTypes ?? []} value={cfg.fileTypes} onChange={(fileTypes) => set({ fileTypes })} />
              </Section>
            </div>

            <div className={s.result}>
              <div className={s.nameBlock}>
                <div className={s.nameHead}><span className={s.step}>5</span>{t('export.fileName')}</div>
                <TemplateInput value={cfg.template} onChange={(template) => set({ template })} catalog={options?.keys}
                  prefix={cfg.outputDir || '…'} suffix={`.${options?.fileTypes[0]?.ext ?? 'png'}`} invalid={errors.length > 0} />
                {errors.length > 0 && <ul className={s.errors}>{errors.map((e) => <li key={e.code}><Icon name="alert" size={14} />{t(`export.errors.${e.code}`)}</li>)}</ul>}
              </div>
              <TreePreview plan={previewable ? plan : null} loading={planning} maxPerDir={cfg.maxPerDir} onMaxPerDir={(maxPerDir) => set({ maxPerDir })} />
            </div>
          </div>
        )}
        <footer className={s.foot}>
          <div className={s.summary}>
            {plan && previewable && <span className="num">{t('export.summary', { files: fmt.number(plan.files), size: fmt.bytes(plan.bytes) })}</span>}
            {problem && !errors.length && <span className={s.problem} data-tone={problem.tone}><Icon name={problem.tone === 'hint' ? 'info' : 'alert'} size={14} />{problem.text}</span>}
          </div>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="export" disabled={!canStart} loading={starting} onClick={start}>{t('export.start')}</Button>
        </footer>
      </div>
    </Sheet>
  );
}

function Section({ n, title, aside, children }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHead}>
        <span className={s.step}>{n}</span>
        <h3 className={s.sectionTitle}>{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function DirField({ value, onChange }) {
  const t = useT();
  const [browsing, setBrowsing] = useState(false);
  return (
    <div className={s.dir}>
      <TextInput icon="folder" value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} className={s.dirInput} />
      <Button icon="folder-open" onClick={() => setBrowsing(true)}>{t('export.chooseDir')}</Button>
      <FolderPicker open={browsing} onClose={() => setBrowsing(false)} onPick={onChange} initialPath={value} kind="export" />
    </div>
  );
}

/** The import dates as one field; presets and the calendar (marked with how much came in each day) share a popover. */
function DatesField({ dates: d, onChange, marks }) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(false);
  const btn = useRef(null);
  const single = d.mode === 'range' && d.from === d.to ? d.from : null;
  const days = d.mode === 'range' ? Math.round((new Date(`${d.to}T00:00`) - new Date(`${d.from}T00:00`)) / 86400000) + 1 : 0;
  const preset = PRESETS.find((p) => sameDates(d, presetRange(p)));
  const rangeText = d.mode === 'all' ? t('export.allDates') : single ? fmt.date(single) : `${fmt.date(d.from)} – ${fmt.date(d.to)}`;
  return (
    <div className={s.dates}>
      <button ref={btn} type="button" className={s.pickField} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon name="calendar" size={16} className={s.pickIcon} />
        <span className={s.pickText}>
          <span className={s.pickMain}>{preset && preset !== 'all' ? t(`export.presets.${preset}`) : rangeText}</span>
          {d.mode === 'range' && <span className={`${s.pickSub} num`}>{preset ? `${rangeText} · ` : ''}{t('export.days', { n: days })}</span>}
        </span>
        <Icon name="chevron-down" size={15} className={s.fieldChev} />
      </button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={btn} placement="bottom-start" trapFocus={false} label={t('export.dates')}>
        <div className={s.datePop}>
          <ul className={s.presetList}>
            {PRESETS.map((p) => (
              <li key={p}>
                <button type="button" data-on={preset === p} onClick={() => { onChange(presetRange(p)); setOpen(false); }}>
                  {t(`export.presets.${p}`)}{preset === p && <Icon name="check" size={14} />}
                </button>
              </li>
            ))}
          </ul>
          <div className={s.calPop}>
            <Calendar mode="range" value={d.mode === 'range' ? { from: d.from, to: d.to } : null} marks={marks} maxDay={dayKey(new Date())}
              onChange={(r) => onChange({ mode: 'range', from: r.from, to: r.to })} />
          </div>
        </div>
      </Popover>
    </div>
  );
}

const KIND_ICON = { image: 'image', video: 'video' };
/** File types grouped by kind: one line per kind, its extensions unfold on demand. */
function TypesField({ types, value, onChange }) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(() => new Set());
  const all = types.map((x) => x.ext);
  const on = new Set(value ?? all);
  const kinds = FILE_KINDS.map((k) => ({ k, list: types.filter((x) => x.kind === k) })).filter((g) => g.list.length);
  const put = (exts, yes) => {
    const next = new Set(on);
    for (const e of exts) (yes ? next.add(e) : next.delete(e));
    onChange(next.size === all.length ? null : all.filter((e) => next.has(e)));
  };
  if (!types.length) return <div className={s.typesNone}>{t('export.noTypes')}</div>;
  return (
    <ul className={s.kinds}>
      {kinds.map(({ k, list }) => {
        const exts = list.map((x) => x.ext), n = exts.filter((e) => on.has(e)).length;
        const files = list.reduce((sum, x) => sum + (on.has(x.ext) ? x.count : 0), 0);
        const expanded = open.has(k);
        return (
          <li key={k} className={s.kind} data-open={expanded} data-off={n === 0}>
            <div className={s.kindRow}>
              <button type="button" className={s.kindTick} onClick={() => put(exts, n !== exts.length)} aria-label={t(`export.kinds.${k}`)}>
                <Tick state={n === 0 ? 'off' : n === exts.length ? 'on' : 'mixed'} size={16} />
              </button>
              <button type="button" className={s.kindMain} aria-expanded={expanded}
                onClick={() => setOpen((cur) => { const x = new Set(cur); if (x.has(k)) x.delete(k); else x.add(k); return x; })}>
                <Icon name={KIND_ICON[k]} size={15} className={s.kindIcon} />
                <span className={s.kindName}>{t(`export.kinds.${k}`)}</span>
                <span className={`${s.kindMeta} num`}>
                  {exts.length > 1 ? t('export.kindTypes', { n, total: exts.length }) : `.${exts[0]}`} · {t('export.kindFiles', { n: fmt.number(files) })}
                </span>
                {exts.length > 1 && <Icon name="chevron-down" size={14} className={s.kindChev} />}
              </button>
            </div>
            {expanded && exts.length > 1 && (
              <div className={s.exts}>
                {list.map(({ ext, count }) => (
                  <button key={ext} type="button" className={s.ext} aria-pressed={on.has(ext)} onClick={() => put([ext], !on.has(ext))}>
                    .{ext}<span className="num">{fmt.number(count)}</span>
                  </button>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

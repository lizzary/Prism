// Indexing by itself. Files can be indexed as they are uploaded; and two rules watch the gallery — when enough files
// are waiting, when nothing has been indexed for long enough — each a "when" with its number, live as it stands now,
// and a "then": remind me (a reminder that leads here), index in the background, both or neither. One switch pauses
// all of it and keeps every rule as it is. The line between a rule and what it does lights up while the rule is met.
import { indexRules, settingsActions, useSettings } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { useNow } from '../../lib/useNow.js';
import { Icon } from '../../icons/Icon.jsx';
import { Stepper, Switch, Tick } from '../../components/controls.jsx';
import { UploadIndexing } from './UploadIndexing.jsx';
import s from './AutoIndexing.module.css';

const RULES = ['backlog', 'age'];

export function AutoIndexing({ overview }) {
  const t = useT();
  const { indexing } = useSettings();
  const auto = indexing.auto;
  const setAuto = (patch) => settingsActions.update({ indexing: { ...indexing, auto: { ...auto, ...patch } } });
  const setRule = (id, patch) => setAuto({ [id]: { ...auto[id], ...patch } });
  return (
    <div className={s.auto}>
      <div className={s.column}>
        <UploadIndexing />
        <section className={s.section} data-paused={!auto.on || undefined}>
          <header className={s.head}>
            <span className={s.headIcon}><Icon name="reindex" size={18} /></span>
            <h3 className={s.title}>{t('index.auto.title')}</h3>
            {!auto.on && <span className={s.paused} key="paused"><i />{t('index.auto.paused')}</span>}
            <Switch checked={auto.on} label={t('index.auto.title')} onChange={(on) => setAuto({ on })} />
          </header>
          <div className={s.rules}>
            {RULES.map((id, i) => (
              <Rule key={id} id={id} i={i} rule={auto[id]} paused={!auto.on} overview={overview} onChange={(patch) => setRule(id, patch)} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function Rule({ id, i, rule, paused, overview, onChange }) {
  const t = useT();
  const fmt = useFormat();
  const now = useNow();
  const { waiting, lastIndexedAt } = overview;
  const hours = lastIndexedAt ? Math.max(0, (now - Date.parse(lastIndexedAt)) / 3_600_000) : Infinity;
  // where the rule stands now (met only while it is on, automatic indexing too)
  const live = id === 'backlog'
    ? { p: Math.min(1, waiting / rule.count), met: waiting >= rule.count, text: t('index.auto.backlog.now', { n: fmt.number(waiting), count: waiting }) }
    : {
      p: Number.isFinite(hours) ? Math.min(1, hours / rule.hours) : 1,
      met: waiting > 0 && hours > rule.hours,
      // in hours, as the rule counts (renewed every minute)
      text: !lastIndexedAt ? t('index.neverIndexed') : hours < 1 ? t('index.auto.age.sinceNow')
        : t('index.auto.age.since', { n: fmt.number(Math.floor(hours)), count: Math.floor(hours) }),
      quiet: !waiting && hours > rule.hours ? t('index.auto.age.nothing') : null,
    };
  const doing = rule.remind || rule.background;
  const lit = live.met && rule.on && !paused && doing;
  const limits = indexRules.limits[id === 'backlog' ? 'count' : 'hours'];
  const value = id === 'backlog' ? rule.count : rule.hours;
  const set = (n) => onChange(id === 'backlog' ? { count: n } : { hours: n });
  const days = id === 'age' && rule.hours >= 48 ? rule.hours / 24 : null;
  return (
    <div className={s.rule} data-on={rule.on || undefined} data-lit={lit || undefined} style={{ '--i': i }}>
      <div className={s.when}>
        <span className={s.kicker}>{t('index.auto.when')}</span>
        <div className={s.sentence}>
          <button type="button" role="checkbox" aria-checked={rule.on} className={s.tick} onClick={() => onChange({ on: !rule.on })}
            aria-label={`${t(`index.auto.${id}.before`)} ${value} ${t(`index.auto.${id}.after`, { count: value })}`.trim()}>
            <Tick state={rule.on ? 'on' : 'off'} size={16} />
          </button>
          <span className={s.words}>
            <Icon name={id === 'backlog' ? 'layers' : 'history'} size={16} className={s.ruleIcon} />
            {t(`index.auto.${id}.before`) || null}
            <Stepper size="xs" className={s.number} value={value} min={limits[0]} max={limits[1]} onChange={set}
              label={t(id === 'backlog' ? 'index.auto.count' : 'index.auto.hours')} />
            {t(`index.auto.${id}.after`, { count: value })}
            {days && (
              <span className={`${s.days} num`}>
                {Number.isInteger(days) ? t('index.auto.age.daysExact', { n: days, count: days }) : t('index.auto.age.days', { n: fmt.number(Math.round(days * 10) / 10) })}
              </span>
            )}
          </span>
        </div>
        <div className={s.live} data-met={(live.met && rule.on) || undefined}>
          <span className={s.meter} style={{ '--p': live.p }}><i /></span>
          <span className={`${s.liveText} num`}>{live.text}{live.quiet && <span className={s.liveQuiet}> · {live.quiet}</span>}</span>
          {live.met && rule.on && <span className={s.met} key="met">{t('index.auto.met')}</span>}
        </div>
      </div>

      <svg className={s.link} viewBox="0 0 64 24" aria-hidden="true">
        <path d="M4 12H54" className={s.linkLine} />
        <path d="m48 6 6 6-6 6" className={s.linkHead} />
        {lit && <path d="M4 12H54" className={s.linkLight} pathLength="1" />}
      </svg>

      <div className={s.then}>
        <span className={s.kicker}>{t('index.auto.then')}</span>
        <div className={s.actions}>
          <Action icon="bell" on={rule.remind} onClick={() => onChange({ remind: !rule.remind })} label={t('index.auto.remind')}
            note={rule.remind ? (id === 'backlog' ? t('index.auto.every', { n: fmt.number(indexRules.remindStep(rule.count)) }) : t('index.auto.daily')) : null} />
          <Action icon="reindex" on={rule.background} onClick={() => onChange({ background: !rule.background })} label={t('index.auto.background')} />
        </div>
        {!doing && <span className={s.none}>{t('index.auto.none')}</span>}
      </div>
    </div>
  );
}

function Action({ icon, on, onClick, label, note }) {
  return (
    <button type="button" className={s.action} aria-pressed={on} onClick={onClick}>
      <span className={s.box}><Icon name="check" size={11} stroke={2.4} /></span>
      <Icon name={icon} size={16} className={s.actionIcon} />
      <span className={s.actionLabel}>{label}</span>
      {note && <span className={`${s.note} num`} key={note}>{note}</span>}
    </button>
  );
}

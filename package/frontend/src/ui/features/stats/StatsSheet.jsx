// Statistics: where the space goes and what has been happening. Two parts under a night sky —
//   Storage: the database folder split like light through the Prism mark (Spectrum), then any scope of it — the
//     gallery, a group, a colour group — as its structure, its parts, its file sizes and its largest files (Storage);
//   Activity: a year of days as stars (StarCalendar), then the gallery's size over time, every day's figures and one
//     day up close (Activity).
// Opened from the top bar (at the group on screen), the home page's summary, a group's size, and Settings → Data.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { statsRules } from '../../../bridge/index.js';
import { useOverlays } from '../../../app/shell.jsx';
import { navigate, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { colorArrival } from '../../lib/arrival.js';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton } from '../../components/controls.jsx';
import { Sheet } from '../../components/overlay.jsx';
import { NightTabs } from '../../components/NightTabs.jsx';
import { Spectrum } from './Spectrum.jsx';
import { StarCalendar } from './StarCalendar.jsx';
import { Storage } from './Storage.jsx';
import { Activity } from './Activity.jsx';
import { statsMemory as memory } from './memory.js';
import s from './StatsSheet.module.css';

const TABS = ['storage', 'activity'];
const { dayOf, daysBetween } = statsRules.rules;
const ALL = { groupId: null, configId: null, colorId: null };

export default function StatsSheet({ open, onClose, onLeave, nonce, handoff, tab: startTab, groupId, configId, colorId }) {
  const t = useT();
  const { handOff } = useOverlays();
  const [tab, setTabState] = useState(startTab ?? memory.tab);
  const [scope, setScope] = useState(ALL);
  const [filter, setFilter] = useState({ bucket: null, type: null });
  const [measure, setMeasureState] = useState(memory.measure);
  const [range, setRangeState] = useState(memory.range);
  const [metric, setMetricState] = useState(memory.metric);
  const [day, setDay] = useState(null);                 // the day up close (null: today)
  const [hover, setHover] = useState(null);             // the day pointed at, in the sky or on a chart
  const [seen, setSeen] = useState(() => new Set([startTab ?? memory.tab]));
  useEffect(() => {
    if (!open) return;
    const first = startTab ?? memory.tab;
    setTabState(first);
    setSeen(new Set([first]));
    setScope({ groupId: groupId ?? null, configId: groupId ? configId ?? null : null, colorId: groupId ? colorId ?? null : null });
    setFilter({ bucket: null, type: null });
    setDay(null);
    setHover(null);
  }, [open, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // (the handlers never change: each part is drawn again only when what it shows changes — not, say, the storage part
  // while a day is pointed at on the activity part)
  const setTab = (v) => { memory.tab = v; setTabState(v); setSeen((cur) => (cur.has(v) ? cur : new Set([...cur, v]))); };
  const setMeasure = useCallback((v) => { memory.measure = v; setMeasureState(v); }, []);
  const setRange = useCallback((v) => { memory.range = v; setRangeState(v); }, []);
  const setMetric = useCallback((v) => { memory.metric = v; setMetricState(v); }, []);
  const goScope = useCallback((next) => { setScope({ ...ALL, ...next }); setFilter({ bucket: null, type: null }); }, []);
  // a day chosen beyond the charts' range widens it just enough to show that day (a range chosen by hand stretches to it)
  const chooseDay = useCallback((d) => {
    setDay(d);
    if (!d) return;
    setRangeState((r) => {
      let next = r;
      if (typeof r === 'object') {
        if (d < r.from || d > r.to) next = { from: d < r.from ? d : r.from, to: d > r.to ? d : r.to };
      } else {
        const back = daysBetween(d, dayOf(Date.now())) + 1;
        if (back > statsRules.RANGES[r]) next = Object.keys(statsRules.RANGES).find((k) => statsRules.RANGES[k] >= back) ?? 'all';
      }
      memory.range = next;
      return next;
    });
  }, []);

  // leaving for a page: the sheet closes as the page opens
  const leaveRef = useRef(onLeave);
  leaveRef.current = onLeave;
  const leave = useMemo(() => ({
    file: (f) => { leaveRef.current(); navigate(paths.file(f.groupId, f.id)); },
    group: (id) => { leaveRef.current(); navigate(paths.group(id)); },
    color: (id, cfg, cid) => {
      leaveRef.current();
      colorArrival.set(id, cid, cfg);
      if (location.hash !== `#${paths.group(id)}`) navigate(paths.group(id));
    },
  }), []);
  // the snapshots and the image index have pages of their own: those take over, and come back here when they close
  const openPart = (part) => {
    const back = { tab, ...scope };
    if (part === 'snapshots') handOff('stats', 'backup', {}, back);
    else if (part === 'index') handOff('stats', 'index', {}, back);
  };

  return (
    <Sheet open={open} onClose={onClose} label={t('stats.title')} className={s.frame} handoff={handoff}>
      <div className={s.sheet}>
        <div className={`${s.night} theme-night`}>
          <header className={s.head}>
            <span className={s.mark}><Icon name="stats" size={18} /></span>
            <h2 className={s.title}>{t('stats.title')}</h2>
            <NightTabs tabs={TABS.map((id) => ({ id, label: t(`stats.tabs.${id}`) }))} value={tab} onChange={setTab} label={t('stats.title')} />
            <IconButton icon="close" tone="art" label={t('common.close')} onClick={onClose} />
          </header>
          <div className={s.band} key={tab}>
            {tab === 'storage'
              ? <Spectrum onPart={openPart} />
              : <StarCalendar metric={metric} onMetric={setMetric} day={day} onDay={chooseDay} hover={hover} onHover={setHover} />}
          </div>
        </div>
        <div className={s.body}>
          {seen.has('storage') && (
            <div className={s.pane} hidden={tab !== 'storage'}>
              <Storage scope={scope} onScope={goScope} filter={filter} onFilter={setFilter} measure={measure} onMeasure={setMeasure} leave={leave} />
            </div>
          )}
          {seen.has('activity') && (
            <div className={s.pane} hidden={tab !== 'activity'}>
              <Activity range={range} onRange={setRange} day={day} onDay={chooseDay} hover={hover} onHover={setHover} leave={leave} />
            </div>
          )}
        </div>
      </div>
    </Sheet>
  );
}

import { useLayoutEffect, useRef, useState } from 'react';
import { useAccess, useTasks } from '../../bridge/index.js';
import { useOverlays, usePageMetaValue } from '../../app/shell.jsx';
import { Link, paths } from '../../app/router.jsx';
import { useT } from '../../i18n/index.jsx';
import { Icon } from '../icons/Icon.jsx';
import { LogoMark } from '../icons/Logo.jsx';
import { IconButton } from '../components/controls.jsx';
import { Popover, Tooltip } from '../components/overlay.jsx';
import { TYPE_ICON, TasksPanel } from '../features/tasks/TasksPanel.jsx';
import { ServerPanel } from '../features/server/ServerPanel.jsx';
import s from './TopBar.module.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

/** Pages that open under artwork (the bar sits on it until scrolled past). */
const OVER_ART = { home: true, group: true };
const metaKey = (m) => (m.scope === 'home' ? 'home' : `group:${m.groupId}`);

export function TopBar({ route }) {
  const t = useT();
  const live = usePageMetaValue();
  // The page reports itself (art height…) only after it has rendered. In the render that switches pages the bar
  // goes by the route instead — kind of page, and the scroll it will land on — plus what the page said last time.
  const seen = useRef(new Map());
  if (metaKey(live) === route.key) seen.current.set(route.key, live);
  const meta = metaKey(live) === route.key ? live
    : seen.current.get(route.key) ?? { scope: route.name, groupId: route.id, overArt: OVER_ART[route.name], artHeight: 600, wide: route.name === 'group' };
  const predicted = metaKey(live) !== route.key;
  const { open } = useOverlays();
  // solid once the bar reaches the foot of the art, where the painting dissolves into the page
  const solidAt = (y) => !meta.overArt || y > Math.max(40, meta.artHeight * 0.7 - 64);
  const [solidLive, setSolid] = useState(false);
  const solid = predicted ? solidAt(route.scroll ?? 0) : solidLive;
  // A new page sets the bar at once: the page transition already cross-fades it, and the bar's own fade would be
  // caught half-way in the transition's picture of the new page. Scrolling within a page keeps the fade.
  const [instant, setInstant] = useState(false);
  const page = useRef(null);

  useLayoutEffect(() => {
    const key = route.key;
    const fresh = page.current !== null && page.current !== key;
    page.current = key;
    const on = () => setSolid(solidAt(window.scrollY));
    let r1 = 0, r2 = 0;
    if (fresh) { setInstant(true); r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setInstant(false)); }); }
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => { window.removeEventListener('scroll', on); cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, [meta.overArt, meta.artHeight, route.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const art = !solid;
  const scope = meta.scope === 'group' ? { scope: 'group', groupId: meta.groupId } : { scope: 'home' };

  // A file open in the lightbox covers the bar, so the bar is then simply part of the page: no name of its own that
  // a page transition would lift above the lightbox (opening a file from the home page, going back from one).
  return (
    <header className={`${s.bar} ${solid ? s.solid : s.onArt}`} style={{ viewTransitionName: route.fileId ? 'none' : 'topbar' }} data-vt-name=""
      data-wide={meta.wide || undefined} data-instant={instant || predicted || undefined}>
      <div className={s.inner}>
        <div className={s.left}>
          <Link to={paths.home()} className={s.brand} aria-label="Prism">
            <LogoMark size={28} className={s.mark} />
            <span className={s.word}>Prism</span>
          </Link>
          {meta.crumbs?.length > 0 && (
            <nav className={s.crumbs} aria-label="breadcrumb">
              {meta.crumbs.map((c) => (
                <span key={c.label} className={s.crumb}>
                  <Icon name="chevron-right" size={14} className={s.crumbSep} />
                  {c.to ? <Link to={c.to} className={s.crumbLink}>{c.label}</Link> : <span className={s.crumbText}>{c.label}</span>}
                </span>
              ))}
            </nav>
          )}
        </div>

        <button type="button" className={s.search} data-overlay="search" onClick={() => open('search', { groupId: meta.scope === 'group' ? meta.groupId : null })}>
          <Icon name="search" size={17} />
          <span className={s.searchText}>{t('bar.searchHint')}</span>
          <kbd className={s.kbd}>{isMac ? 'Cmd K' : 'Ctrl K'}</kbd>
        </button>

        <div className={s.right}>
          <button type="button" className={s.action} data-overlay="tags" onClick={() => open('tags')}>
            <Icon name="tags" size={18} /><span>{t('bar.tags')}</span>
          </button>
          <button type="button" className={s.action} data-overlay="export" onClick={() => open('export', scope)}>
            <Icon name="export" size={18} /><span>{t('bar.export')}</span>
          </button>
          <span className={s.divider} />
          <ServerButton art={art} />
          <TasksButton art={art} />
          <IconButton icon="settings" label={t('bar.settings')} tone={art ? 'art' : undefined} data-overlay="settings" onClick={() => open('settings')} />
        </div>
      </div>
    </header>
  );
}

/** Silent while server mode is off; when it is on (or waiting for a restart), the way to its addresses. */
function ServerButton({ art }) {
  const t = useT();
  const { server } = useAccess();
  const { open: openOverlay } = useOverlays();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  if (!server.enabled && !server.running) return null;
  const state = server.enabled ? (server.running ? 'running' : 'pendingOn') : 'pendingOff';
  const tip = state === 'running' ? `${t('server.title')} · ${server.addresses[0]?.url.replace(/^http:\/\//, '')}` : `${t('server.title')} · ${t(`server.${state}`)}`;
  return (
    <>
      <Tooltip label={tip}>
        <button ref={ref} type="button" aria-label={t('server.title')} aria-expanded={open}
          className={`${s.iconBtn} ${art ? s.iconArt : ''} ${open ? s.iconOn : ''}`} onClick={() => setOpen((o) => !o)}>
          <Icon name="broadcast" size={19} />
          <span className={s.serverDot} data-state={state} />
        </button>
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" label={t('server.title')}>
        <ServerPanel onSettings={() => { setOpen(false); openOverlay('settings', { section: 'access' }); }} />
      </Popover>
    </>
  );
}

/** Quiet while nothing runs; a running task turns it into a small gauge that fills with the work. */
function TasksButton({ art }) {
  const t = useT();
  const tasks = useTasks();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const running = tasks.filter((x) => x.state === 'running');
  const active = running.length + tasks.filter((x) => x.state === 'queued').length;
  const cur = running[0];
  const p = cur?.total ? cur.processed / cur.total : 0;
  const amount = cur && (cur.unit === 'bytes' ? `${Math.floor(p * 100)}%` : `${cur.processed}/${cur.total}`);
  return (
    <>
      <Tooltip label={active ? t('bar.running', { n: active }) : t('bar.tasks')}>
        {cur ? (
          <button ref={ref} type="button" aria-label={t('bar.tasks')} aria-expanded={open} style={{ '--p': p }}
            className={`${s.taskPill} ${art ? s.taskPillArt : ''} ${open ? s.iconOn : ''}`} onClick={() => setOpen((o) => !o)}>
            <span className={s.taskFill} data-indeterminate={!cur.total} />
            <Icon name={TYPE_ICON[cur.type]} size={16} className={s.taskSpin} />
            <span className={`${s.taskNum} num`}>{cur.total ? amount : t(`tasks.stages.${cur.stage}`)}</span>
            {active > 1 && <span className={`${s.taskMore} num`}>+{active - 1}</span>}
          </button>
        ) : (
          <button ref={ref} type="button" aria-label={t('bar.tasks')} aria-expanded={open} className={`${s.iconBtn} ${art ? s.iconArt : ''} ${open ? s.iconOn : ''}`} onClick={() => setOpen((o) => !o)}>
            <Icon name="tasks" size={19} />
            {active > 0 && <span className={s.count}>{active}</span>}
          </button>
        )}
      </Tooltip>
      <Popover open={open} onClose={() => setOpen(false)} anchor={ref} placement="bottom-end" label={t('tasks.title')} className={s.panel}>
        <TasksPanel />
      </Popover>
    </>
  );
}

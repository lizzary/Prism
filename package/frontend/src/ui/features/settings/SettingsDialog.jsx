// Settings, grouped by what they are about: the interface, where the gallery lives (and its backups), files,
// the tagging models, who may open the gallery, and MCP.
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { settingsActions, useAccess, useBackup, useModels, useSettings } from '../../../bridge/index.js';
import { useOverlays } from '../../../app/shell.jsx';
import { navigate, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { webglAvailable } from '../../lib/webgl.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, Segmented } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import { Spinner, toast } from '../../components/feedback.jsx';
import { FolderPicker } from '../folders/FolderPicker.jsx';
import { PasswordSetting, ServerSetting } from './AccessSettings.jsx';
import { McpSetting } from './McpSettings.jsx';
import { FileSettings } from './FileSettings.jsx';
import { ModelSettings } from './ModelSettings.jsx';
import s from './SettingsDialog.module.css';

/**
 * Swap the theme with a circle that grows from where it was asked for. `commit` records the choice; it runs inside
 * the transition's update, so the page (and the switch itself) changes in the new picture, never before the old one
 * has been taken.
 */
function switchTheme(theme, from, commit) {
  const apply = () => { document.documentElement.dataset.theme = theme; commit(); };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce) { apply(); return; }
  const r = from?.getBoundingClientRect();
  const x = r ? r.left + r.width / 2 : innerWidth / 2, y = r ? r.top + r.height / 2 : 0;
  const end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  const root = document.documentElement;
  root.classList.add('vt-theme');
  const vt = document.startViewTransition(() => flushSync(apply));
  vt.finished.finally(() => root.classList.remove('vt-theme'));
  vt.ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${end}px at ${x}px ${y}px)`] },
      { duration: 620, easing: 'cubic-bezier(.65,0,.35,1)', pseudoElement: '::view-transition-new(root)' },
    );
  }).catch(() => {});
}

const SECTIONS = [
  { id: 'general', icon: 'sliders' },
  { id: 'data', icon: 'database' },
  { id: 'files', icon: 'file-stack' },
  { id: 'models', icon: 'chip' },
  { id: 'access', icon: 'lock' },
  { id: 'mcp', icon: 'mcp' },
];

/** `section` opens a group directly; `focus` brings one setting in it forward. */
export default function SettingsDialog({ open, onClose, section = 'general', focus, nonce, handoff }) {
  const t = useT();
  const access = useAccess();
  const models = useModels();
  const { handOff: handOverlay } = useOverlays();
  const [current, setCurrent] = useState(section);
  const [spot, setSpot] = useState(null);          // { id, n }: a setting to bring forward
  useEffect(() => { if (open) { setCurrent(section); setSpot(focus ? { id: focus, n: Date.now() } : null); } }, [open, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const go = (id, f = null) => { setCurrent(id); setSpot(f ? { id: f, n: Date.now() } : null); };
  // the big work surfaces open on their own: settings steps aside for them, and comes back (to this section) when they close
  const handOff = (name) => handOverlay('settings', name, {}, { section: current });

  const downloading = models.list.some((m) => m.state === 'downloading');
  const status = {
    models: downloading ? ['busy'] : models.list.some((m) => m.inUse) ? [] : ['warn'],
    access: [access.password.enabled && 'lock', (access.server.enabled || access.server.running) && 'broadcast'].filter(Boolean),
    mcp: access.mcp.enabled ? ['on'] : [],
  };

  return (
    <Dialog open={open} onClose={onClose} bare label={t('settings.title')} className={s.dialog} handoff={handoff}>
      <div className={s.layout}>
        <nav className={s.nav} aria-label={t('settings.title')}>
          <h2 className={s.title}>{t('settings.title')}</h2>
          <ul className={s.navList}>
            {SECTIONS.map((x) => (
              <li key={x.id}>
                <button type="button" className={s.navItem} data-on={current === x.id} aria-current={current === x.id ? 'page' : undefined}
                  data-overlay={x.id === 'data' ? 'backup' : x.id === 'mcp' ? 'mcp' : undefined} onClick={() => go(x.id)}>
                  <Icon name={x.icon} size={17} />
                  <span className={s.navLabel}>{t(`settings.sections.${x.id}`)}</span>
                  {status[x.id]?.length > 0 && (
                    <span className={s.navStatus}>
                      {status[x.id].map((k) => (k === 'on' || k === 'warn' || k === 'busy' ? <i key={k} className={s.navDot} data-kind={k} /> : <Icon key={k} name={k} size={13} />))}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <div className={s.about}>{t('settings.about', { version: '0.2.0' })}</div>
        </nav>
        <div className={s.pane}>
          <header className={s.paneHead}>
            <h3 className={s.paneTitle}>{t(`settings.sections.${current}`)}</h3>
            <IconButton icon="close" label={t('common.close')} onClick={onClose} />
          </header>
          <div className={s.paneBody} key={current}>
            {current === 'general' && <General />}
            {current === 'data' && <Data onOpenBackup={() => handOff('backup')} />}
            {current === 'files' && <FileSettings />}
            {current === 'models' && <ModelSettings />}
            {current === 'access' && (
              <>
                <PasswordSetting highlight={spot?.id === 'password' ? spot.n : 0} />
                <ServerSetting onSuggestPassword={() => go('access', 'password')} />
              </>
            )}
            {current === 'mcp' && <McpSetting onManage={() => handOff('mcp')} />}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function General() {
  const t = useT();
  const settings = useSettings();
  const themeRef = useRef(null);
  const setTheme = (theme) => {
    switchTheme(theme, themeRef.current?.querySelector('[data-selected="false"]'), () => settingsActions.update({ theme }));
  };
  const gl = webglAvailable();
  const renderer = settings.whiteboard === 'auto' ? (gl ? 'WebGL' : 'DOM') : null;
  return (
    <section className={s.group}>
      <div className={s.row}>
        <div className={s.label}><Icon name="language" size={18} />{t('settings.language')}</div>
        <Segmented value={settings.language} onChange={(v) => settingsActions.update({ language: v })} label={t('settings.language')}
          options={[{ value: 'en', label: 'English' }, { value: 'zh-CN', label: '简体中文' }]} />
      </div>
      <div className={s.row}>
        <div className={s.label}><Icon name="palette" size={18} />{t('settings.theme')}</div>
        <div ref={themeRef}>
          <Segmented value={settings.theme} onChange={setTheme} label={t('settings.theme')}
            options={[{ value: 'light', label: t('settings.light'), icon: 'sun' }, { value: 'dark', label: t('settings.dark'), icon: 'moon' }]} />
        </div>
      </div>
      <div className={s.row}>
        <div className={s.labelStack}>
          <div className={s.label}><Icon name="whiteboard" size={18} />{t('settings.whiteboard')}</div>
          {renderer && <span className={s.labelSub} key={renderer}>{t('settings.rendererNow', { name: renderer })}</span>}
          {settings.whiteboard === 'webgl' && !gl && <span className={s.labelSub} data-tone="warn">{t('settings.noWebgl')}</span>}
        </div>
        <Segmented size="sm" value={settings.whiteboard} onChange={(v) => settingsActions.update({ whiteboard: v })} label={t('settings.whiteboard')}
          options={['auto', 'webgl', 'dom'].map((v) => ({
            value: v, label: t(`settings.renderers.${v}`), disabled: v === 'webgl' && !gl, tip: v === 'webgl' && !gl ? t('settings.noWebgl') : undefined,
          }))} />
      </div>
    </section>
  );
}

function Data({ onOpenBackup }) {
  const t = useT();
  const settings = useSettings();
  const [picking, setPicking] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  // switching databases re-reads everything; start again from the home page of the new gallery
  const applyDb = async (path) => {
    if (!path || path === settings.dbPath) return;
    setPicking(true);
    await settingsActions.update({ dbPath: path });
    setPicking(false);
    navigate(paths.home());
    toast(t('settings.dbSwitched'), { tone: 'ok', icon: 'database' });
  };
  return (
    <section className={s.group}>
      <div className={s.stack}>
        <div className={s.label}><Icon name="database" size={18} />{t('settings.dbPath')}</div>
        <button type="button" className={s.path} onClick={() => setBrowsing(true)} disabled={picking} title={settings.dbPath}>
          <Icon name="folder" size={17} />
          <span className={s.pathText}>{settings.dbPath}</span>
          {picking ? <Spinner size={15} /> : <span className={s.pathAction}>{t('common.change')}</span>}
        </button>
        {settings.dbPath !== settings.defaultDbPath && (
          <Button variant="quiet" size="sm" icon="undo" className={s.reset} onClick={() => applyDb(settings.defaultDbPath)}>{t('common.reset')}</Button>
        )}
      </div>
      <BackupCard onOpen={onOpenBackup} />
      <FolderPicker open={browsing} onClose={() => setBrowsing(false)} onPick={applyDb} initialPath={settings.dbPath} kind="database" />
    </section>
  );
}

/**
 * The data-backup entry: the recent snapshots as a small timeline — each one placed by its date, its bar showing how
 * much it saved — ending in "now" with what is still unsaved.
 */
function BackupCard({ onOpen }) {
  const t = useT();
  const fmt = useFormat();
  const { data } = useBackup();
  const snaps = data?.snapshots ?? [];
  const last = snaps.at(-1);
  const pending = data?.pending.total ?? 0;
  const shown = snaps.slice(-8);
  const W = 140, AXIS = 34, X0 = 6, X1 = W - 8;
  const t0 = shown.length ? Date.parse(shown[0].createdAt) : Date.now(), t1 = Date.now();
  const xOf = (iso) => X0 + ((Date.parse(iso) - t0) / Math.max(1, t1 - t0)) * (X1 - X0 - 16);
  const max = Math.max(1, pending, ...shown.map((x) => x.changes.total));
  const h = (n) => (n ? 4 + 18 * Math.sqrt(n / max) : 0);
  const lastX = last ? xOf(last.createdAt) : X0;
  return (
    <button type="button" className={s.backup} data-overlay="backup" onClick={onOpen}>
      <svg className={s.mini} viewBox={`0 0 ${W} 44`} aria-hidden="true">
        <path d={`M2 ${AXIS}H${W - 2}`} className={s.miniAxis} />
        {last && <path d={`M${lastX} ${AXIS}H${X1}`} className={s.miniLit} data-pending={pending > 0} />}
        {shown.map((x, i) => {
          const cx = xOf(x.createdAt);
          return (
            <g key={x.id} className={s.miniSnap} style={{ '--k': i }}>
              <rect x={cx - 2} y={AXIS - 5 - h(x.changes.total)} width={4} height={h(x.changes.total)} rx={1.5} />
              <circle cx={cx} cy={AXIS} r={2.6} />
            </g>
          );
        })}
        <g className={s.miniNow} data-pending={pending > 0} style={{ '--k': shown.length }}>
          {pending > 0 && <rect x={X1 - 2.5} y={AXIS - 5 - h(pending)} width={5} height={h(pending)} rx={1.5} />}
          <circle cx={X1} cy={AXIS} r={3.4} />
        </g>
      </svg>
      <span className={s.backupText}>
        <span className={s.backupTitle}><Icon name="snapshot" size={16} />{t('backup.entry')}</span>
        <span className={s.backupMeta}>{data ? (last ? t('settings.backupMeta', { n: snaps.length, date: fmt.relative(last.createdAt) }) : t('settings.backupNone')) : ' '}</span>
        {data && (pending > 0 || last) && <span className={s.backupState} data-pending={pending > 0}><i />{pending > 0 ? t('settings.backupPending', { n: fmt.number(pending) }) : t('settings.backupClean')}</span>}
      </span>
      <span className={s.backupGo}>{t('settings.open')}<Icon name="arrow-right" size={15} /></span>
    </button>
  );
}

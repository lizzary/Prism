import { useAccess } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { ServerAddresses } from './ServerAddresses.jsx';
import s from './ServerPanel.module.css';

/** What the top bar's server button opens: is it on, where to reach it, and a way to its settings. */
export function ServerPanel({ onSettings }) {
  const t = useT();
  const { server, password } = useAccess();
  const state = server.enabled ? (server.running ? 'running' : 'pendingOn') : 'pendingOff';
  return (
    <div className={s.panel}>
      <header className={s.head}>
        <h3 className={s.title}><Icon name="broadcast" size={17} />{t('server.title')}</h3>
        <span className={s.pill} data-state={state}><i />{t(`server.${state}`)}</span>
      </header>
      {state !== 'running' && (
        <p className={s.note}><Icon name="refresh" size={14} />{t(state === 'pendingOn' ? 'server.restartOn' : 'server.restartOff')}</p>
      )}
      {server.enabled && <div className={s.body}><ServerAddresses addresses={server.addresses} compact dim={!server.running} /></div>}
      {server.enabled && !password.enabled && <p className={s.hint}><Icon name="info" size={14} />{t('server.suggestPassword')}</p>}
      <button type="button" className={s.more} onClick={onSettings}>{t('server.manage')}<Icon name="arrow-right" size={14} /></button>
    </div>
  );
}

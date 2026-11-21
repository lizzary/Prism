import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { settingsActions, useSettings } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton, Segmented } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import s from './SettingsDialog.module.css';

/** Swap the theme with a circle that grows from where it was asked for. */
function switchTheme(theme, from) {
  const apply = () => { document.documentElement.dataset.theme = theme; };
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

const SECTIONS = [{ id: 'general', icon: 'sliders' }];

/** Settings, grouped by what they are about. `section` opens a group directly. */
export default function SettingsDialog({ open, onClose, section = 'general', nonce }) {
  const t = useT();
  const [current, setCurrent] = useState(section);
  useEffect(() => { if (open) setCurrent(section); }, [open, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onClose={onClose} bare label={t('settings.title')} className={s.dialog}>
      <div className={s.layout}>
        <nav className={s.nav} aria-label={t('settings.title')}>
          <h2 className={s.title}>{t('settings.title')}</h2>
          <ul className={s.navList}>
            {SECTIONS.map((x) => (
              <li key={x.id}>
                <button type="button" className={s.navItem} data-on={current === x.id} aria-current={current === x.id ? 'page' : undefined} onClick={() => setCurrent(x.id)}>
                  <Icon name={x.icon} size={17} />
                  <span className={s.navLabel}>{t(`settings.sections.${x.id}`)}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className={s.about}>{t('settings.about', { version: '0.1.0' })}</div>
        </nav>
        <div className={s.pane}>
          <header className={s.paneHead}>
            <h3 className={s.paneTitle}>{t(`settings.sections.${current}`)}</h3>
            <IconButton icon="close" label={t('common.close')} onClick={onClose} />
          </header>
          <div className={s.paneBody} key={current}>
            {current === 'general' && <General />}
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
    switchTheme(theme, themeRef.current?.querySelector('[data-selected="false"]'));
    settingsActions.update({ theme });
  };
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
    </section>
  );
}

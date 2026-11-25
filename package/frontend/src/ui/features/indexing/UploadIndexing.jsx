// Indexing files as they are uploaded: on or off, and which kinds to try — a kind with no model in use is skipped until
// there is one. Settings and the index page's automation show this same setting.
import { INDEX_KINDS, settingsActions, useIndexOverview, useSettings } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Switch } from '../../components/controls.jsx';
import { Block } from '../settings/Block.jsx';
import { KIND_ICON, KIND_RAY } from './kinds.js';
import s from './UploadIndexing.module.css';

export function UploadIndexing({ highlight }) {
  const t = useT();
  const { indexing } = useSettings();
  const overview = useIndexOverview();
  const up = indexing.upload;
  const set = (patch) => settingsActions.update({ indexing: { ...indexing, upload: { ...up, ...patch } } });
  const flip = (k) => set({ kinds: up.kinds.includes(k) ? up.kinds.filter((x) => x !== k) : INDEX_KINDS.filter((x) => x === k || up.kinds.includes(x)) });
  return (
    <Block icon="upload" title={t('index.upload.title')} highlight={highlight}
      control={<Switch checked={up.on} label={t('index.upload.title')} onChange={(on) => set({ on })} />}>
      <div className={s.kinds} data-off={!up.on || undefined} role="group" aria-label={t('index.upload.build')}>
        <span className={s.label}>{t('index.upload.build')}</span>
        {INDEX_KINDS.map((k) => {
          const on = up.kinds.includes(k);
          const ready = overview.kinds[k].available;
          return (
            <button key={k} type="button" className={s.kind} aria-pressed={on} disabled={!up.on} data-unready={!ready || undefined}
              style={{ '--c': KIND_RAY[k] }} onClick={() => flip(k)}>
              <span className={s.box}><Icon name="check" size={11} stroke={2.4} /></span>
              <Icon name={KIND_ICON[k]} size={14} className={s.icon} />
              <span>{t(`index.kinds.${k}`)}</span>
              {!ready && <span className={s.unready}>{t('index.upload.noModel')}</span>}
            </button>
          );
        })}
      </div>
    </Block>
  );
}

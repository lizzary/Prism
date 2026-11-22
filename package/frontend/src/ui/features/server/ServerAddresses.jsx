import { useState } from 'react';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { CopyButton, QrCode } from '../../components/share.jsx';
import s from './ServerAddresses.module.css';

const KIND_ICON = { wifi: 'wifi', ethernet: 'network' };

/** Where other devices on the network can open the library: one row per address, and a QR code for the chosen one. */
export function ServerAddresses({ addresses, compact, dim }) {
  const t = useT();
  const [pick, setPick] = useState(0);
  const current = addresses[Math.min(pick, addresses.length - 1)];
  if (!current) return null;
  return (
    <div className={`${s.card} ${compact ? s.compact : ''}`} data-dim={!!dim}>
      <figure className={s.code}>
        <QrCode text={current.url} size={compact ? 112 : 124} />
        <figcaption><Icon name="phone" size={13} />{t('server.scan')}</figcaption>
      </figure>
      <div className={s.list}>
        <div className={s.head}>{t('server.open')}</div>
        {addresses.map((a, i) => (
          <div key={a.id} className={s.row} data-on={a === current}>
            <button type="button" className={s.pick} onClick={() => setPick(i)} aria-pressed={a === current}>
              <span className={`${s.url} num`}>{a.url.replace(/^http:\/\//, '')}</span>
              <span className={s.kind}><Icon name={KIND_ICON[a.kind] ?? 'globe'} size={13} />{t(`server.kinds.${a.kind}`)}</span>
            </button>
            <CopyButton text={a.url} iconOnly size="sm" />
          </div>
        ))}
      </div>
    </div>
  );
}

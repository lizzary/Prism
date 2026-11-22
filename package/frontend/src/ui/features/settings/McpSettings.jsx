import { accessActions, useAccess } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Switch } from '../../components/controls.jsx';
import { CopyButton } from '../../components/share.jsx';
import { Block } from './Block.jsx';
import { useOptimisticToggle } from '../../lib/useOptimisticToggle.js';
import s from './SettingsDialog.module.css';

/** The MCP service switch, where it listens, and the way into key management. */
export function McpSetting({ onManage }) {
  const t = useT();
  const fmt = useFormat();
  const { mcp } = useAccess();
  const [enabled, setEnabled] = useOptimisticToggle(mcp.enabled, accessActions.setMcp);
  return (
    <>
      <Block icon="mcp" title={t('mcp.service')} desc={t('mcp.desc')}
        control={<Switch checked={enabled} label={t('mcp.service')} onChange={setEnabled} />}>
        {enabled && (
          <div className={s.endpoint}>
            <span className={s.endpointLabel}>{t('mcp.endpoint')}</span>
            <code className={`${s.endpointValue} num`}>{mcp.endpoint}</code>
            <CopyButton text={mcp.endpoint} iconOnly size="sm" />
          </div>
        )}
      </Block>
      <button type="button" className={s.keysCard} data-off={!mcp.enabled} onClick={onManage}>
        <span className={s.keysIcon}><Icon name="key" size={18} /></span>
        <span className={s.backupText}>
          <span className={s.backupTitle}>{t('mcp.sheet')}</span>
          <span className={s.backupMeta}>
            {t('mcp.keyCount', { n: mcp.keys })}
            {mcp.keys > 0 && ` · ${mcp.lastUsedAt ? t('mcp.lastUsed', { date: fmt.relative(mcp.lastUsedAt) }) : t('mcp.neverUsed')}`}
          </span>
        </span>
        <span className={s.backupGo}>{t('mcp.manage')}<Icon name="arrow-right" size={15} /></span>
      </button>
      <p className={s.footnote}>{t('mcp.what')}</p>
    </>
  );
}

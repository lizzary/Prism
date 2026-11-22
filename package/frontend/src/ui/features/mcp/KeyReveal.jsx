import { mcpClientConfig } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Button } from '../../components/controls.jsx';
import { CopyButton } from '../../components/share.jsx';
import s from './McpSheet.module.css';

/** A key's secret, shown once: copy it, or copy the whole client configuration. */
export function KeyReveal({ secret, endpoint, regenerated, onDone, compact }) {
  const t = useT();
  const config = mcpClientConfig(endpoint, secret);
  return (
    <div className={`${s.reveal} ${compact ? s.revealCompact : ''}`}>
      <div className={s.revealHead}>
        <span className={s.revealMark}><Icon name="key" size={17} /></span>
        <div>
          <div className={s.revealTitle}>{t(regenerated ? 'mcp.reveal.regenerated' : 'mcp.reveal.created')}</div>
          <p className={s.revealBody}>{t('mcp.reveal.body')}</p>
        </div>
      </div>
      <div className={s.secret}>
        <code className={`${s.secretText} num`}>{secret}</code>
        <CopyButton text={secret} variant="secondary" />
      </div>
      {!compact && (
        <details className={s.config}>
          <summary><Icon name="chevron-right" size={14} />{t('mcp.reveal.config')}</summary>
          <div className={s.configBody}>
            <pre className="num">{config}</pre>
            <CopyButton text={config} label={t('mcp.reveal.copyConfig')} />
          </div>
        </details>
      )}
      {onDone && <div className={s.revealFoot}><Button size="sm" variant="primary" icon="check" onClick={onDone}>{t('mcp.reveal.done')}</Button></div>}
    </div>
  );
}

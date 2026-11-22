import { useT } from '../../../i18n/index.jsx';
import { Switch } from '../../components/controls.jsx';
import { GroupsField } from '../../components/GroupSelector.jsx';
import s from './McpSheet.module.css';

/** How a scope reads in a sentence. */
export function scopeText(t, scope, total) {
  const n = scope.groupIds.length;
  if (n >= total && total > 0) return scope.future ? t('mcp.scopeSummary.allFuture') : t('mcp.scopeSummary.all', { n: total });
  if (n === 0) return scope.future ? t('mcp.scopeSummary.futureOnly') : t('mcp.scopeSummary.none');
  return scope.future ? t('mcp.scopeSummary.someFuture', { n }) : t('mcp.scopeSummary.some', { n });
}

/**
 * The groups a key may reach: a summary that opens the group wall, a one-click "all groups", and whether groups
 * created later join automatically.
 */
export function ScopeField({ value, onChange, groups }) {
  const t = useT();
  const known = new Set(groups.map((g) => g.id));
  return (
    <div className={s.scope}>
      <GroupsField groups={groups} value={value.groupIds.filter((id) => known.has(id))} placeholder={t('mcp.scopePick')} allLabel={t('mcp.scopeAll')}
        onChange={(groupIds) => onChange({ ...value, groupIds })} />
      <label className={s.futureRow}>
        <Switch size="sm" checked={value.future} label={t('mcp.future')} onChange={(future) => onChange({ ...value, future })} />
        <span>{t('mcp.future')}</span>
      </label>
    </div>
  );
}

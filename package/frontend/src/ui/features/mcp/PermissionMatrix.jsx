import { MCP_PERMISSIONS } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Segmented, Tick } from '../../components/controls.jsx';
import { Tooltip } from '../../components/overlay.jsx';
import { CATEGORIES, PRESETS, PRESET_NAMES, presetOf } from './permissions.js';
import s from './McpSheet.module.css';

const CAT_ICON = { group: 'gallery', colorGroup: 'swatches', file: 'image' };
const tickState = (n, total) => (!n ? 'off' : n === total ? 'on' : 'mixed');

/** Presets for the common cases, and every permission as a toggle for the rest. Deleting reads as the weightier choice. */
export function PermissionMatrix({ value, onChange, compact }) {
  const t = useT();
  const preset = presetOf(value);
  const toggle = (cat, p) => onChange({ ...value, [cat]: { ...value[cat], [p]: !value[cat][p] } });
  const setRow = (cat, on) => onChange({ ...value, [cat]: Object.fromEntries(MCP_PERMISSIONS[cat].map((p) => [p, on])) });

  return (
    <div className={`${s.matrix} ${compact ? s.matrixCompact : ''}`}>
      <Segmented size="sm" value={preset} label={t('mcp.permissions')} className={s.presets}
        onChange={(v) => { if (v !== 'custom') onChange(PRESETS[v]()); }}
        options={[...PRESET_NAMES, ...(preset === 'custom' ? ['custom'] : [])].map((v) => ({ value: v, label: t(`mcp.presets.${v}`) }))} />
      {!compact && (
        <div className={s.grid}>
          {CATEGORIES.map((cat) => {
            const list = MCP_PERMISSIONS[cat];
            const n = list.filter((p) => value[cat][p]).length;
            return (
              <div key={cat} className={s.permRow}>
                <button type="button" className={s.permHead} onClick={() => setRow(cat, n !== list.length)} aria-label={t(`mcp.groups.${cat}`)}>
                  <Tick state={tickState(n, list.length)} size={16} />
                  <Icon name={CAT_ICON[cat]} size={16} className={s.permIcon} />
                  <span>{t(`mcp.groups.${cat}`)}</span>
                </button>
                <div className={s.chips}>
                  {list.map((p) => (
                    <Tooltip key={p} label={t(`mcp.tips.${cat}.${p}`)}>
                      <button type="button" className={s.perm} aria-pressed={!!value[cat][p]} data-weight={p === 'delete' ? 'heavy' : undefined} onClick={() => toggle(cat, p)}>
                        <span className={s.permBox}><Icon name="check" size={11} stroke={2.4} /></span>
                        {t(`mcp.perms.${cat}.${p}`)}
                      </button>
                    </Tooltip>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "Read only", "Organize"… or "Custom", for lists. */
export function permissionLabel(t, perms) {
  return t(`mcp.presets.${presetOf(perms)}`);
}

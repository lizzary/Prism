// Chosen files (Ctrl or Shift and click, or the tick on a tile): a small dock rises from the bottom with what can be
// done to all of them at once.
import { useRef } from 'react';
import { mediaUrl } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton } from '../../components/controls.jsx';
import { Portal, usePresence } from '../../components/overlay.jsx';
import s from './SelectionBar.module.css';

export function SelectionBar({ files, onDownload, onReindex, onDelete, onSelectAll, onClear, allSelected }) {
  const t = useT();
  const fmt = useFormat();
  const open = files.length > 0;
  const { mounted, state } = usePresence(open, 260);
  // while it leaves, it keeps showing what it showed
  const last = useRef(files);
  if (open) last.current = files;
  const shown = last.current;
  if (!mounted) return null;
  const peek = shown.slice(-3);
  return (
    <Portal>
      <div className={s.bar} data-state={state} role="toolbar" aria-label={t('group.selection.count', { n: shown.length })}>
        <span className={s.peek} aria-hidden="true">
          {peek.map((f, k) => <img key={f.id} src={mediaUrl(f, 'low')} alt="" draggable={false} style={{ '--k': k, '--n': peek.length }} />)}
        </span>
        <span key={shown.length} className={`${s.count} num`}>{t('group.selection.count', { n: fmt.number(shown.length), count: shown.length })}</span>
        {!allSelected && <button type="button" className={s.quiet} onClick={onSelectAll}>{t('group.selection.all')}</button>}
        <span className={s.sep} />
        <button type="button" className={s.action} onClick={onDownload}><Icon name="download" size={17} /><span>{t('group.tile.download')}</span></button>
        <button type="button" className={s.action} onClick={onReindex}><Icon name="reindex" size={17} /><span>{t('group.tile.reindex')}</span></button>
        <button type="button" className={`${s.action} ${s.danger}`} onClick={onDelete}><Icon name="trash" size={17} /><span>{t('group.tile.delete')}</span></button>
        <span className={s.sep} />
        <IconButton icon="close" size="sm" label={t('group.selection.clear')} className={s.close} onClick={onClear} placement="top" />
      </div>
    </Portal>
  );
}

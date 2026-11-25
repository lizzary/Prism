// The whiteboard's own bar, floating over the board's top left: back to the files; the colour groups (their index
// beside the board, the configuration in use, a new one, arranging them again); and finding on the board — names, tags,
// prompts and colour groups light up as they are typed, Enter flies from one to the next, and they can all be chosen.
import { useT } from '../../../../i18n/index.jsx';
import { useFormat } from '../../../lib/format.js';
import { Icon } from '../../../icons/Icon.jsx';
import { Button, IconButton } from '../../../components/controls.jsx';
import { Tooltip } from '../../../components/overlay.jsx';
import { Spinner } from '../../../components/feedback.jsx';
import { ListToggle, Palette } from '../Toolbar.jsx';
import s from './Board.module.css';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function BoardBar({
  data, grouped, colors, indexOpen, onIndex, onBack, onUseConfig, onEditColors, onNewColor, arranged, onArrange,
  findRef, query, onQuery, found, searching, step, total, onStep, onSelectFound,
}) {
  const t = useT();
  return (
    <div className={s.bar} data-board-chrome="">
      <div className={s.barGroup}>
        <IconButton icon="arrow-left" size="sm" label={`${t('board.back')} · Esc`} onClick={onBack} />
        <span className={s.barSep} />
        {grouped && <ListToggle open={indexOpen} colors={colors} onToggle={onIndex} labels={{ open: t('board.index.open'), close: t('board.index.close') }} />}
        <Palette data={data} onUse={onUseConfig} onEdit={onEditColors} />
        {onNewColor && <IconButton icon="plus" size="sm" label={t('board.newColor')} onClick={onNewColor} />}
        {!arranged && (
          <Tooltip label={t('board.arrangeTip')} delay={500}>
            <Button variant="ghost" size="sm" icon="whiteboard" onClick={onArrange}>{t('board.arrange')}</Button>
          </Tooltip>
        )}
      </div>
      <Find findRef={findRef} query={query} onQuery={onQuery} found={found} searching={searching} step={step} total={total} onStep={onStep} onSelectFound={onSelectFound} />
    </div>
  );
}

function Find({ findRef, query, onQuery, found, searching, step, total, onStep, onSelectFound }) {
  const t = useT();
  const fmt = useFormat();
  const has = !!query;
  const summary = found && (total
    ? step >= 0 ? `${fmt.number(step + 1)} / ${fmt.number(total)}`
      : [found.files && t('board.found.files', { n: fmt.number(found.files), count: found.files }), found.colors && t('board.found.colors', { n: fmt.number(found.colors), count: found.colors })].filter(Boolean).join(' · ')
    : t('board.findNone'));
  return (
    <label className={s.find} data-active={has || undefined} data-none={(found && !total) || undefined}>
      {searching ? <Spinner size={14} className={s.findIcon} /> : <Icon name="search" size={15} className={s.findIcon} />}
      <input ref={findRef} value={query} onChange={(e) => onQuery(e.target.value)} placeholder={t('board.find')} spellCheck={false} autoComplete="off"
        aria-keyshortcuts={isMac ? 'Meta+F' : 'Control+F'}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onStep(e.shiftKey ? -1 : 1); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (query) onQuery(''); else e.currentTarget.blur(); }
        }} />
      {has ? (
        <span className={s.findTools}>
          {summary && <span key={summary} className={`${s.findCount} num`}>{summary}</span>}
          <IconButton size="sm" icon="chevron-up" label={`${t('board.findPrev')} · Shift Enter`} disabled={!total} onClick={() => onStep(-1)} />
          <IconButton size="sm" icon="chevron-down" label={`${t('board.findNext')} · Enter`} disabled={!total} onClick={() => onStep(1)} />
          <IconButton size="sm" icon="check-square" label={t('board.selectFound', { n: fmt.number(found?.files ?? 0), count: found?.files ?? 0 })} disabled={!found?.files} onClick={onSelectFound} />
          <IconButton size="sm" icon="close" label={t('common.clear')} onClick={() => { onQuery(''); findRef.current?.focus(); }} />
        </span>
      ) : <kbd className={s.kbd} aria-hidden="true">{isMac ? 'Cmd F' : 'Ctrl F'}</kbd>}
    </label>
  );
}

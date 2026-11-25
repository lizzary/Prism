// The short decisions of a group's page: deleting files, re-indexing them, and moving files into another colour group.
import { useEffect, useState } from 'react';
import { mediaUrl, useModels } from '../../../bridge/index.js';
import { useOverlays } from '../../../app/shell.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, Tick } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import s from './dialogs.module.css';

/** A few of the files, fanned out like prints on a table (and how many more). */
export function Fan({ files, max = 5, size = 74 }) {
  const fmt = useFormat();
  const shown = files.slice(0, max);
  const rest = files.length - shown.length;
  return (
    <div className={s.fan} style={{ '--s': `${size}px`, '--n': shown.length }} aria-hidden="true">
      {shown.map((f, k) => (
        <span key={f.id} className={s.print} style={{ '--k': k }}>
          <img src={mediaUrl(f, 'low')} alt="" draggable={false} />
          {f.kind === 'video' && <Icon name="play" size={10} className={s.play} />}
        </span>
      ))}
      {rest > 0 && <span className={`${s.rest} num`}>+{fmt.number(rest)}</span>}
    </div>
  );
}

const run = (setBusy, fn) => async () => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

export function DeleteFiles({ open, files, onCancel, onConfirm }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const n = files.length;
  return (
    <Dialog open={open} onClose={onCancel} title={t('group.delete.title', { n })} size="sm"
      footer={<>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="danger" icon="trash" loading={busy} data-autofocus onClick={run(setBusy, onConfirm)}>{t('group.delete.confirm')}</Button>
      </>}>
      <div className={s.stage}><Fan files={files} /></div>
      <p className={s.body}>{t('group.delete.body', { n })}</p>
    </Dialog>
  );
}

const KINDS = [['tagging', 'tag'], ['embedding', 'image-search'], ['metadata', 'info']];

/**
 * What a re-index builds again, chosen together (at least one): the kinds, and the way to the tagging models when
 * none is downloaded (tags need one). → { kinds (in their order), view } — the dialog below and the whiteboard's dock
 * both ask with it. `onLeave`: called before going to Settings.
 */
export function useReindexKinds(open, onLeave) {
  const t = useT();
  const { open: openOverlay } = useOverlays();
  const models = useModels();
  const tagger = models.list.some((m) => m.inUse);
  const [kinds, setKinds] = useState([]);
  useEffect(() => { if (open) setKinds(tagger ? ['tagging', 'metadata'] : ['metadata']); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = (k) => setKinds((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));
  const chosen = KINDS.map(([k]) => k).filter((k) => kinds.includes(k) && (k !== 'tagging' || tagger));
  const view = (
    <>
      <div className={s.kinds} role="group" aria-label={t('group.reindex.label')}>
        {KINDS.map(([k, icon], i) => {
          const locked = k === 'tagging' && !tagger;
          const on = kinds.includes(k) && !locked;
          return (
            <button key={k} type="button" role="checkbox" aria-checked={on} disabled={locked} className={s.kind} data-on={on || undefined} style={{ '--i': i }} onClick={() => flip(k)}>
              <span className={s.kindIcon}><Icon name={icon} size={19} /></span>
              <span className={s.kindText}>
                <span className={s.kindTitle}>{t(`group.reindex.kinds.${k}.title`)}</span>
                <span className={s.kindBody}>{locked ? t('group.reindex.noModel') : t(`group.reindex.kinds.${k}.body`)}</span>
              </span>
              <Tick state={on ? 'on' : 'off'} />
            </button>
          );
        })}
      </div>
      {!tagger && (
        <button type="button" className={s.link} onClick={() => { onLeave?.(); openOverlay('settings', { section: 'models' }); }}>
          <Icon name="chip" size={15} />{t('group.reindex.openModels')}<Icon name="arrow-right" size={14} />
        </button>
      )}
    </>
  );
  return { kinds: chosen, view };
}

/** Which indexes to build again for the chosen files (at least one). Tags need a downloaded tagging model. */
export function Reindex({ open, count, onCancel, onConfirm }) {
  const t = useT();
  const fmt = useFormat();
  const { kinds, view } = useReindexKinds(open, onCancel);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onClose={onCancel} title={t('group.reindex.title', { n: fmt.number(count), count })} size="md"
      footer={<>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="primary" icon="reindex" loading={busy} disabled={!kinds.length} onClick={run(setBusy, () => onConfirm(kinds))}>{t('group.reindex.start')}</Button>
      </>}>
      {view}
    </Dialog>
  );
}

/**
 * Files dropped into another colour group change colour group: a look at where each one comes from before it
 * happens. moves: [{ file, from }] · names: key → { name, color } · to: key
 */
export function MoveFiles({ open, moves, to, names, onCancel, onConfirm }) {
  const t = useT();
  const fmt = useFormat();
  const [busy, setBusy] = useState(false);
  const from = new Map();
  for (const m of moves) { if (!from.has(m.from)) from.set(m.from, []); from.get(m.from).push(m.file); }
  const dest = names(to);
  return (
    <Dialog open={open} onClose={onCancel} title={t('group.move.title', { n: moves.length, name: dest.name })} size="md"
      footer={<>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="primary" icon="check" loading={busy} data-autofocus onClick={run(setBusy, onConfirm)}>{t('group.move.confirm')}</Button>
      </>}>
      <ul className={s.moves}>
        {[...from].map(([key, files], i) => {
          const src = names(key);
          return (
            <li key={key} className={s.move} style={{ '--i': i }}>
              <div className={s.route}>
                <Chip {...src} />
                <span className={s.arrow} aria-hidden="true"><i /><Icon name="arrow-right" size={14} /></span>
                <Chip {...dest} />
                <span className={`${s.moveCount} num`}>{t('group.move.files', { n: fmt.number(files.length), count: files.length })}</span>
              </div>
              <div className={s.thumbs}>
                {files.slice(0, 8).map((f) => <img key={f.id} src={mediaUrl(f, 'low')} alt="" draggable={false} />)}
                {files.length > 8 && <span className={`${s.thumbMore} num`}>+{fmt.number(files.length - 8)}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

function Chip({ name, color, none }) {
  return <span className={s.chip} data-none={none || undefined} style={{ '--c': color }}><i />{name}</span>;
}

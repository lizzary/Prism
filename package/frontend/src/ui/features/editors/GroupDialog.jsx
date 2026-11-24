import { useEffect, useMemo, useRef, useState } from 'react';
import { coverRules, libraryActions, mediaUrl, useGroupPictures } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { useReorder } from '../../lib/useReorder.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, Chip, Field, TextInput } from '../../components/controls.jsx';
import { Dialog, Portal } from '../../components/overlay.jsx';
import { EmptyArt, Spinner, toast } from '../../components/feedback.jsx';
import s from './GroupDialog.module.css';

const SHAKE = [{ transform: 'none' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'none' }];

/**
 * New group (no `group`), or edit one: its name, its covers, and deleting it (`onDeleted` after it is gone).
 * `focus: 'covers'` opens it with the covers at hand.
 */
export default function GroupDialog({ open, onClose, group, onCreated, onDeleted, nonce, focus }) {
  const t = useT();
  const editing = !!group;
  const [name, setName] = useState('');
  const [covers, setCovers] = useState({ auto: true, ids: [] });   // the covers as edited here; auto: Prism picks them
  const [peek, setPeek] = useState(null);                           // a cover pointed at on the shelf: the card shows it
  const [full, setFull] = useState(false);                          // a picture just did not fit
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { data: pics, loading } = useGroupPictures(editing && open ? group.id : null);
  const shelf = useRef(null);
  const fullTimer = useRef(0);

  // every opening starts afresh — set up in the very render that opens it, so the covers are on the shelf by the
  // time the dialog puts the focus in (on the main cover, when it opens at the covers)
  const [opening, setOpening] = useState(null);
  if (open && opening !== nonce) {
    setOpening(nonce);
    setName(group?.name ?? '');
    setCovers({ auto: !group || group.coverAuto, ids: group && !group.coverAuto ? group.covers.map((c) => c.id) : [] });
    setPeek(null);
    setFull(false);
    setTried(false);
    setSaving(false);
    setConfirming(false);
  }
  useEffect(() => () => clearTimeout(fullTimer.current), []);

  // every picture this dialog may show, by id: the covers it opened with, the pictures to choose from, Prism's picks
  const refs = useMemo(() => new Map([...(group?.covers ?? []), ...(pics?.pictures ?? []), ...(pics?.auto ?? [])].map((f) => [f.id, f])), [group, pics]);
  const autoIds = pics?.auto.map((f) => f.id) ?? (group?.coverAuto ? group.covers.map((c) => c.id) : []);
  const ids = covers.auto ? autoIds : covers.ids;
  const list = ids.map((x) => refs.get(x)).filter(Boolean);
  const place = new Map(ids.map((x, k) => [x, k]));
  // covers are pictures: a group of videos alone shows their frames, chosen by Prism, with nothing to arrange here
  const choosing = list.length > 0 && (!pics || pics.pictures.length > 0);

  /** An edit of the covers on show (Prism's picks become yours); none left gives them back to Prism. */
  const edit = (fn) => {
    const next = fn(ids);
    if (!next) {
      // no room: the shelf shakes its head and its count lights up for a moment
      shelf.current?.animate(SHAKE, { duration: 380, easing: 'ease-out' });
      setFull(true);
      clearTimeout(fullTimer.current);
      fullTimer.current = setTimeout(() => setFull(false), 1400);
      return;
    }
    setCovers(next.length ? { auto: false, ids: next } : { auto: true, ids: [] });
  };
  const drag = useReorder({ listRef: shelf, scrollRef: shelf, mode: 'grid', axis: 'x', onDrop: (id, index) => edit((x) => coverRules.move(x, id, index)) });
  const missing = !name.trim();

  const submit = async () => {
    setTried(true);
    if (missing || saving) return;
    setSaving(true);
    if (editing) {
      await libraryActions.updateGroup(group.id, { name: name.trim(), coverFileIds: covers.auto ? null : covers.ids });
      toast(t('groupEditor.saved'), { tone: 'ok' });
    } else {
      const created = await libraryActions.createGroup({ name: name.trim() });
      toast(t('groupEditor.created', { name: created.name }), { tone: 'ok', icon: 'gallery-plus' });
      onCreated?.(created);
    }
    setSaving(false);
    onClose();
  };

  const shelfKeys = (e, id) => {
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      const to = Math.max(0, Math.min(ids.length - 1, place.get(id) + (e.key === 'ArrowLeft' ? -1 : 1)));
      edit((x) => coverRules.move(x, id, to));
      requestAnimationFrame(() => shelf.current?.querySelector(`[data-reorder-id="${CSS.escape(id)}"]`)?.focus());
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      edit((x) => coverRules.remove(x, id));
    }
  };

  return (
    <>
      <Dialog open={open} onClose={onClose} title={editing ? t('groupEditor.editTitle') : t('groupEditor.newTitle')} size={editing ? 'lg' : 'md'}
        footer={<>
          {editing && <Button variant="quiet" icon="trash" className={s.delete} onClick={() => setConfirming(true)}>{t('groupEditor.delete')}</Button>}
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon={editing ? 'check' : 'gallery-plus'} loading={saving} onClick={submit}>{editing ? t('common.save') : t('groupEditor.create')}</Button>
        </>}>
        <form className={s.layout} data-editing={editing} onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Preview name={name} covers={list} peek={peek} group={group} />
          <div className={s.fields}>
            <Field label={t('groupEditor.name')} error={tried && missing ? t('groupEditor.nameRequired') : null}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('groupEditor.namePlaceholder')} invalid={tried && missing} maxLength={80}
                data-autofocus={focus !== 'covers' || undefined} spellCheck={false} />
            </Field>
            {editing && (
              <Field className={s.coverField}
                label={<>{t('groupEditor.covers')}<span className={`${s.count} num`} data-full={full || undefined}>{list.length} / {coverRules.MAX}</span></>}
                aside={choosing && (
                  // on: Prism picks them (and keeps picking as the group grows); off: the ones on show stay as they are
                  <Chip icon="sparkle" selected={covers.auto} className={s.autoChip}
                    onClick={() => setCovers(covers.auto ? { auto: false, ids: autoIds } : { auto: true, ids: [] })}>{t('groupEditor.coverAuto')}</Chip>
                )}>
                {choosing && (
                  <div ref={shelf} className={s.shelf} data-auto={covers.auto || undefined} role="list" aria-label={t('groupEditor.covers')}>
                    {list.map((f, k) => (
                      <div key={f.id} role="listitem" tabIndex={0} className={s.slot} data-main={k === 0 || undefined} {...drag.handle(f.id)}
                        aria-label={k === 0 ? t('groupEditor.coverMain') : t('groupEditor.coverNth', { n: k + 1 })} data-autofocus={(focus === 'covers' && k === 0) || undefined}
                        onKeyDown={(e) => shelfKeys(e, f.id)} onPointerEnter={() => setPeek(f.id)} onPointerLeave={() => setPeek(null)}
                        onFocus={() => setPeek(f.id)} onBlur={() => setPeek(null)}>
                        <img src={mediaUrl(f, 'low')} alt="" draggable={false} decoding="async" />
                        <span className={s.place}>{k === 0 ? <Icon name="star" size={10} stroke={2.2} /> : covers.auto ? <Icon name="sparkle" size={10} stroke={2} /> : k + 1}</span>
                        <button type="button" className={s.unpick} tabIndex={-1} aria-label={t('groupEditor.coverRemove')}
                          onClick={() => { edit((x) => coverRules.remove(x, f.id)); setPeek(null); }}>
                          <Icon name="close" size={10} stroke={2.2} />
                        </button>
                      </div>
                    ))}
                    {/* the room left, as faint empty places */}
                    {Array.from({ length: coverRules.MAX - list.length }, (_, k) => <span key={`room${k}`} className={s.room} aria-hidden="true" />)}
                  </div>
                )}
                {loading && !pics ? <div className={s.loading}><Spinner size={18} /></div>
                  : pics?.pictures.length ? (
                    <div className={s.scroller}>
                      <div className={s.pictures} role="group" aria-label={t('groupEditor.pictures')}>
                        {pics.pictures.map((p) => {
                          const k = place.get(p.id);
                          return (
                            <button key={p.id} type="button" aria-pressed={k != null} aria-label={`${p.name}.${p.ext}`} className={s.pick} data-on={k != null || undefined}
                              data-auto={(k != null && covers.auto) || undefined} onClick={() => edit((x) => coverRules.toggle(x, p.id))}
                              onPointerEnter={() => k != null && setPeek(p.id)} onPointerLeave={() => setPeek(null)}>
                              <img src={mediaUrl(p, 'low')} alt="" loading="lazy" decoding="async" draggable={false} />
                              {k != null && <span className={s.tick}>{k === 0 ? <Icon name="star" size={11} stroke={2.2} /> : k + 1}</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : <p className={s.none}>{t('groupEditor.noPictures')}</p>}
              </Field>
            )}
          </div>
          <button type="submit" hidden />
        </form>
      </Dialog>
      {drag.marker && <Portal><span className={s.marker} style={drag.marker} /></Portal>}
      {editing && <DeleteGroup open={open && confirming} group={group} onCancel={() => setConfirming(false)} onDeleted={() => { setConfirming(false); onClose(); onDeleted?.(); }} />}
    </>
  );
}

/**
 * How the card will look on the wall: the main cover at its own proportions, the name under it. Moving across it
 * glances through the covers as the wall will; a cover pointed at on the shelf shows here too.
 */
function Preview({ name, covers, peek, group }) {
  const t = useT();
  const fmt = useFormat();
  const [at, setAt] = useState(0);
  const n = covers.length;
  const main = covers[0];
  const shown = covers.find((c) => c.id === peek) ?? covers[Math.min(at, n - 1)];
  const ratio = main ? Math.max(0.55, Math.min(2, main.width / main.height)) : 0.8;
  const skim = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setAt(Math.max(0, Math.min(n - 1, Math.floor(((e.clientX - r.left) / r.width) * n))));
  };
  return (
    <div className={s.preview}>
      <div className={s.stage}>
        <div className={s.card} style={{ aspectRatio: ratio, [ratio >= 1 ? 'width' : 'height']: '100%' }} onPointerMove={n > 1 ? skim : undefined} onPointerLeave={() => setAt(0)}>
          {n ? covers.map((c) => <img key={c.id} src={mediaUrl(c, 'original')} alt="" draggable={false} decoding="async" data-on={c.id === shown?.id} />)
            : <span className={s.blank}><EmptyArt size={92} /></span>}
          {n > 1 && <span className={s.ticks} aria-hidden="true">{covers.map((c) => <i key={c.id} data-on={c.id === shown?.id} />)}</span>}
        </div>
      </div>
      <div className={s.previewName}>{name.trim() || t('groupEditor.namePlaceholder')}</div>
      <div className={s.previewMeta}>
        {group ? t('groupEditor.summary', { files: fmt.number(group.fileCount), size: fmt.bytes(group.bytes) }) : t('home.emptyGroup')}
      </div>
    </div>
  );
}

function DeleteGroup({ open, group, onCancel, onDeleted }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    await libraryActions.deleteGroup(group.id);
    setBusy(false);
    toast(t('groupEditor.deleted', { name: group.name }), { icon: 'trash' });
    onDeleted();
  };
  return (
    <Dialog open={open} onClose={onCancel} title={t('groupEditor.deleteTitle')} size="sm"
      footer={<>
        <Button variant="ghost" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button variant="danger" icon="trash" loading={busy} onClick={remove} data-autofocus>{t('groupEditor.deleteConfirm')}</Button>
      </>}>
      <p className={s.warn}>
        {group.fileCount ? t('groupEditor.deleteBody', { name: group.name, n: group.fileCount }) : t('groupEditor.deleteEmpty', { name: group.name })}
      </p>
    </Dialog>
  );
}

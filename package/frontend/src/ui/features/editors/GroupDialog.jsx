import { useEffect, useState } from 'react';
import { libraryActions, mediaUrl, useGroupPictures } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, Field, TextInput } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import { EmptyArt, Spinner, toast } from '../../components/feedback.jsx';
import s from './GroupDialog.module.css';

const AUTO = 'auto';

/** New group (no `group`), or edit one: its name and its cover, and deleting it. */
export default function GroupDialog({ open, onClose, group, onCreated, nonce }) {
  const t = useT();
  const editing = !!group;
  const [name, setName] = useState('');
  const [cover, setCover] = useState(AUTO);
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const { data: pictures, loading } = useGroupPictures(editing && open ? group.id : null);

  useEffect(() => {
    if (!open) return;
    setName(group?.name ?? '');
    setCover(group && !group.coverAuto ? group.cover?.id ?? AUTO : AUTO);
    setTried(false);
    setSaving(false);
    setConfirming(false);
  }, [open, nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const missing = !name.trim();
  const shownCover = cover === AUTO ? (editing ? pictures?.[0] ?? (group.coverAuto ? group.cover : null) : null) : pictures?.find((p) => p.id === cover) ?? group?.cover;

  const submit = async () => {
    setTried(true);
    if (missing || saving) return;
    setSaving(true);
    if (editing) {
      await libraryActions.updateGroup(group.id, { name: name.trim(), coverFileId: cover === AUTO ? null : cover });
      toast(t('groupEditor.saved'), { tone: 'ok' });
    } else {
      const created = await libraryActions.createGroup({ name: name.trim() });
      toast(t('groupEditor.created', { name: created.name }), { tone: 'ok', icon: 'gallery-plus' });
      onCreated?.(created);
    }
    setSaving(false);
    onClose();
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
          <Preview name={name} cover={shownCover} group={group} />
          <div className={s.fields}>
            <Field label={t('groupEditor.name')} error={tried && missing ? t('groupEditor.nameRequired') : null}>
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t('groupEditor.namePlaceholder')} invalid={tried && missing} maxLength={80} data-autofocus spellCheck={false} />
            </Field>
            {editing && (
              <Field label={t('groupEditor.cover')} className={s.coverField}>
                {loading && !pictures ? <div className={s.loading}><Spinner size={18} /></div>
                  : pictures?.length ? (
                    <div className={s.scroller}>
                      <div className={s.pictures} role="radiogroup" aria-label={t('groupEditor.cover')}>
                        <button type="button" role="radio" aria-checked={cover === AUTO} className={`${s.pick} ${s.auto}`} data-on={cover === AUTO} onClick={() => setCover(AUTO)}>
                          <Icon name="sparkle" size={18} />
                          <span>{t('groupEditor.coverAuto')}</span>
                        </button>
                        {pictures.map((p) => (
                          <button key={p.id} type="button" role="radio" aria-checked={cover === p.id} aria-label={`${p.name}.${p.ext}`} className={s.pick} data-on={cover === p.id} onClick={() => setCover(p.id)}>
                            <img src={mediaUrl(p, 'low')} alt="" loading="lazy" decoding="async" draggable={false} />
                            {cover === p.id && <span className={s.tick}><Icon name="check" size={12} stroke={2.4} /></span>}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : <p className={s.none}>{t('groupEditor.noPictures')}</p>}
              </Field>
            )}
          </div>
          <button type="submit" hidden />
        </form>
      </Dialog>
      {editing && <DeleteGroup open={open && confirming} group={group} onCancel={() => setConfirming(false)} onDeleted={() => { setConfirming(false); onClose(); }} />}
    </>
  );
}

/** How the card will look on the wall: the cover at its own proportions, the name under it. */
function Preview({ name, cover, group }) {
  const t = useT();
  const fmt = useFormat();
  const ratio = cover ? Math.max(0.55, Math.min(2, cover.width / cover.height)) : 0.8;
  return (
    <div className={s.preview}>
      <div className={s.stage}>
        <div className={s.card} style={{ aspectRatio: ratio, [ratio >= 1 ? 'width' : 'height']: '100%' }}>
          {cover ? <img key={cover.id} src={mediaUrl(cover, 'original')} alt="" draggable={false} /> : <span className={s.blank}><EmptyArt size={92} /></span>}
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

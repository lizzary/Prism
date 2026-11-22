import { useEffect, useRef, useState } from 'react';
import { folderActions } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import { Spinner } from '../../components/feedback.jsx';
import s from './FolderPicker.module.css';

const PLACE_ICON = { desktop: 'monitor', documents: 'file', downloads: 'download', pictures: 'image' };
const crumbsOf = (path) => {
  const parts = path.split('\\').filter(Boolean);
  return parts.map((name, i) => ({ name, path: i === 0 ? `${parts[0]}\\` : parts.slice(0, i + 1).join('\\') }));
};

/**
 * Browse folders and pick one. onPick(path) runs only after the user confirms.
 * kind: 'database' | 'export' (title and the hint about existing libraries) | 'archive' (picks a file)
 * accept: file extensions; when given, those files are listed and one of them is what gets picked.
 */
export function FolderPicker({ open, onClose, onPick, initialPath, kind = 'export', accept }) {
  const t = useT();
  const fmt = useFormat();
  const files = !!accept;
  const [roots, setRoots] = useState(null);
  const [dir, setDir] = useState(null);           // { path, parent, entries, files }
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [typed, setTyped] = useState('');
  const [missing, setMissing] = useState(false);
  const [naming, setNaming] = useState(null);
  const list = useRef(null);

  const go = async (path, select = null) => {
    const res = await folderActions.list(path, files ? { accept } : undefined);
    if (!res.ok) { setMissing(true); return false; }
    setMissing(false); setEditing(false);
    setDir(res); setSelected(select ?? (files ? res.files[0]?.path ?? null : res.path));
    list.current?.scrollTo(0, 0);
    return true;
  };

  useEffect(() => {
    if (!open) return;
    folderActions.roots().then(setRoots);
    // open where the current choice lives, with it selected (a file picker opens inside its folder)
    (async () => {
      if (initialPath && files && await go(initialPath)) return;
      if (initialPath && !files) {
        const parent = initialPath.replace(/\\[^\\]+\\?$/, '') || initialPath;
        if (await go(parent.length === 2 ? `${parent}\\` : parent, initialPath)) return;
      }
      go('C:\\');
    })();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const createFolder = async () => {
    const name = naming?.trim();
    setNaming(null);
    if (!name) return;
    const res = await folderActions.create(dir.path, name);
    if (res.ok) go(dir.path, res.path);
  };

  const sel = dir?.entries.find((e) => e.path === selected);
  const selFile = dir?.files?.find((f) => f.path === selected);
  const ready = files ? !!selFile : !!selected;
  const pick = (path) => { onPick(path); onClose(); };
  return (
    <Dialog open={open} onClose={onClose} size="lg" className={s.dialog} title={t(`folders.title.${kind}`)}
      footer={<>
        <div className={s.choice}>
          <Icon name={files ? 'snapshot' : sel?.library ? 'database' : 'folder'} size={16} />
          <span className={s.choicePath} title={selected ?? ''}>{files ? selFile?.path ?? '' : selected ?? ''}</span>
          {kind === 'database' && sel?.library && <span className={s.tag}>{t('folders.library')}</span>}
        </div>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button variant="primary" icon="check" disabled={!ready} onClick={() => pick(selected)}>{files ? t('folders.chooseFile') : t('folders.choose')}</Button>
      </>}>
      <div className={s.body}>
        <nav className={s.side}>
          <div className={s.sideTitle}>{t('folders.places')}</div>
          {roots?.places.map((p) => (
            <button key={p.id} type="button" className={s.place} data-on={dir?.path === p.path} onClick={() => go(p.path)}>
              <Icon name={PLACE_ICON[p.id]} size={16} />{t(`folders.place.${p.id}`)}
            </button>
          ))}
          <div className={s.sideTitle}>{t('folders.thisPc')}</div>
          {roots?.drives.map((d) => (
            <button key={d.path} type="button" className={s.place} data-on={dir?.path?.startsWith(d.path)} onClick={() => go(d.path)}>
              <Icon name="drive" size={16} />{t('folders.drive', { name: d.name })}
            </button>
          ))}
        </nav>

        <div className={s.main}>
          <div className={s.bar}>
            <IconButton icon="arrow-left" size="sm" label={t('folders.up')} disabled={!dir?.parent} onClick={() => go(dir.parent)} />
            {editing ? (
              <input className={`${s.address} ${missing ? s.addressBad : ''}`} value={typed} autoFocus spellCheck={false}
                onChange={(e) => { setTyped(e.target.value); setMissing(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go(typed); } if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
                onBlur={() => setEditing(false)} />
            ) : (
              <div className={s.crumbs} onClick={(e) => { if (e.target === e.currentTarget) { setTyped(dir?.path ?? ''); setEditing(true); } }}>
                {dir && crumbsOf(dir.path).map((c, i, arr) => (
                  <span key={c.path} className={s.crumb}>
                    <button type="button" onClick={() => go(c.path)} data-last={i === arr.length - 1}>{c.name}</button>
                    {i < arr.length - 1 && <Icon name="chevron-right" size={13} className={s.crumbSep} />}
                  </span>
                ))}
              </div>
            )}
            <IconButton icon="plus" size="sm" label={t('folders.newFolder')} disabled={!dir} onClick={() => setNaming(t('folders.newFolderName'))} />
          </div>
          {missing && <div className={s.missing}><Icon name="alert" size={14} />{t('folders.notFound')}</div>}

          <ul ref={list} className={s.list} role="listbox" aria-label={t(`folders.title.${kind}`)}>
            {!dir && <li className={s.state}><Spinner size={18} /></li>}
            {naming != null && (
              <li className={s.row} data-on="true">
                <Icon name="folder" size={18} className={s.folderIcon} />
                <input className={s.nameInput} value={naming} autoFocus onFocus={(e) => e.target.select()}
                  onChange={(e) => setNaming(e.target.value)} onBlur={createFolder}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.stopPropagation(); setNaming(null); } }} />
              </li>
            )}
            {dir?.entries.map((e) => (
              <li key={e.path} role="option" aria-selected={selected === e.path} className={s.row} data-on={selected === e.path}
                onClick={() => setSelected(e.path)} onDoubleClick={() => go(e.path)}>
                <Icon name={e.library ? 'database' : 'folder'} size={18} className={e.library ? s.libIcon : s.folderIcon} />
                <span className={s.name}>{e.name}</span>
                {e.library && <span className={s.tag}>{t('folders.library')}</span>}
                <button type="button" className={s.enter} onClick={(ev) => { ev.stopPropagation(); go(e.path); }} aria-label={t('common.open')} tabIndex={-1}>
                  <Icon name="chevron-right" size={16} />
                </button>
              </li>
            ))}
            {dir?.files?.map((f) => (
              <li key={f.path} role="option" aria-selected={selected === f.path} className={`${s.row} ${s.fileRow}`} data-on={selected === f.path}
                onClick={() => setSelected(f.path)} onDoubleClick={() => pick(f.path)}>
                <Icon name="snapshot" size={18} className={s.fileIcon} />
                <span className={s.name}>{f.name}</span>
                <span className={`${s.fileMeta} num`}>{fmt.dateSmart(f.modifiedAt)} · {fmt.bytes(f.size)}</span>
              </li>
            ))}
            {dir && !dir.entries.length && !dir.files?.length && naming == null && <li className={s.state}>{t('folders.empty')}</li>}
          </ul>
        </div>
      </div>
    </Dialog>
  );
}

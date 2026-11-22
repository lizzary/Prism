// Files: what happens when a name is already taken, and how downloaded files are named.
import { useEffect, useMemo, useRef, useState } from 'react';
import { exportActions, mediaUrl, settingsActions, useKeyCatalog, useNamePreview, useSettings } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Button, Segmented } from '../../components/controls.jsx';
import { TemplateInput } from '../export/TemplateInput.jsx';
import { Block } from './Block.jsx';
import s from './SettingsDialog.module.css';

const CONFLICTS = ['keep', 'skip', 'overwrite'];

export function FileSettings() {
  const t = useT();
  const settings = useSettings();
  return (
    <>
      <Block icon="file-stack" title={t('settings.conflict')}
        control={<Segmented size="sm" value={settings.conflict} label={t('settings.conflict')} onChange={(conflict) => settingsActions.update({ conflict })}
          options={CONFLICTS.map((v) => ({ value: v, label: t(`settings.conflicts.${v}`) }))} />}>
        <ConflictOutcome mode={settings.conflict} />
      </Block>
      <DownloadName />
    </>
  );
}

/**
 * What the choice does, acted out: a file is already there, a new one with the same name arrives — and is numbered,
 * turned away, or put in its place.
 */
function ConflictOutcome({ mode }) {
  const t = useT();
  return (
    <div className={s.outcome} data-mode={mode} aria-live="polite">
      <div className={s.outcomeStage}>
        <span className={`${s.fileChip} ${s.fileOld}`}>
          <i className={s.fileArt} data-tone="warm" />
          <span className={s.fileName}>sunset.png</span>
        </span>
        <span className={`${s.fileChip} ${s.fileNew}`}>
          <i className={s.fileArt} data-tone="cool"><b className={s.fileStar} /></i>
          <span className={s.fileName}>sunset<span className={s.fileNum}>(1)</span>.png</span>
        </span>
      </div>
      <span className={s.outcomeText} key={mode}>{t(`settings.conflictResult.${mode}`)}</span>
    </div>
  );
}

/** A file-name pattern for downloads: data keys and text only — a name, never a folder. Saved once it is valid. */
function DownloadName() {
  const t = useT();
  const settings = useSettings();
  const { data: catalog } = useKeyCatalog();
  const [tpl, setTpl] = useState(settings.downloadName);
  const errors = useMemo(() => exportActions.validate(tpl), [tpl]);
  const original = tpl.length === 1 && tpl[0].type === 'key' && tpl[0].id === 'file.name';
  useEffect(() => {
    if (errors.length || JSON.stringify(tpl) === JSON.stringify(settings.downloadName)) return undefined;
    const id = setTimeout(() => settingsActions.update({ downloadName: tpl }), 500);
    return () => clearTimeout(id);
  }, [tpl, errors.length]); // eslint-disable-line react-hooks/exhaustive-deps
  // while the pattern is broken, the examples stay as they last were (dimmed)
  const lastValid = useRef(tpl);
  if (!errors.length) lastValid.current = tpl;
  const { data: preview } = useNamePreview(lastValid.current);
  return (
    <Block icon="rename" title={t('settings.downloadName')}
      control={!original && (
        <Button variant="quiet" size="sm" icon="undo" onClick={() => setTpl([{ type: 'key', kind: 'data', id: 'file.name' }])}>{t('settings.downloadOriginal')}</Button>
      )}>
      <TemplateInput pathless value={tpl} onChange={setTpl} catalog={catalog} invalid={errors.length > 0} label={t('settings.downloadName')} />
      {errors.length > 0 && <p className={s.nameError}><Icon name="alert" size={14} />{t(`export.errors.${errors[0].code}`)}</p>}
      <ul className={s.names} data-stale={errors.length > 0 || undefined}>
        {(preview ?? []).map((x) => (
          <li key={x.file.id} className={s.nameRow}>
            <img src={mediaUrl(x.file, 'low')} alt="" className={s.nameThumb} draggable={false} />
            <span className={s.nameFrom} title={x.original}>{x.original}</span>
            <Icon name="arrow-right" size={14} className={s.nameArrow} />
            <span className={s.nameTo} title={x.name} key={x.name}>{x.name}</span>
          </li>
        ))}
      </ul>
    </Block>
  );
}

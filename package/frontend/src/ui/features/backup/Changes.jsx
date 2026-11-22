import { useState } from 'react';
import { mediaUrl } from '../../../bridge/index.js';
import { Link, paths } from '../../../app/router.jsx';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Segmented } from '../../components/controls.jsx';
import { Picture } from '../../components/media.jsx';
import { Spinner } from '../../components/feedback.jsx';
import { GroupCover } from '../../components/GroupSelector.jsx';
import s from './BackupSheet.module.css';

const SHOWN = 18;
const GLYPH = { added: 'plus', modified: 'edit', deleted: 'minus' };

/** What changed, shown as the gallery's own things (with their pictures), or as files of the database folder. */
export function Changes({ data, loading, baseName, onNavigate }) {
  const t = useT();
  const fmt = useFormat();
  const [view, setView] = useState('items');
  if (!data) return <div className={s.changesWait}>{loading && <Spinner size={18} />}</div>;
  const none = !data.groups.length;

  return (
    <div className={s.changes}>
      <div className={s.changesHead}>
        <Segmented size="sm" value={view} onChange={setView} label={t('backup.view.items')}
          options={[{ value: 'items', label: t('backup.view.items'), icon: 'image' }, { value: 'files', label: t('backup.view.files'), icon: 'folder' }]} />
        {!none && (
          <span className={`${s.tally} num`}>
            {['added', 'modified', 'deleted'].map((c) => data.summary[c] > 0 && (
              <span key={c} data-change={c}><i />{t(`backup.summary.${c}`, { n: fmt.number(data.summary[c]) })}</span>
            ))}
          </span>
        )}
      </div>
      {none ? (
        <div className={s.same}>
          <Icon name="check-circle" size={22} />
          <span>{baseName ? t('backup.identical', { name: baseName }) : t('backup.emptyFolder')}</span>
        </div>
      ) : view === 'items' ? (
        <div className={s.groups}>
          {data.groups.map((g) => <Section key={`${g.kind}-${g.change}`} g={g} onNavigate={onNavigate} />)}
        </div>
      ) : (
        <FileList files={data.files} />
      )}
    </div>
  );
}

function Section({ g, onNavigate }) {
  const t = useT();
  const fmt = useFormat();
  const more = g.count - (g.kind === 'file' ? Math.min(SHOWN, g.items.length) : g.items.length);
  return (
    <section className={s.group} data-change={g.change}>
      <h4 className={s.groupHead}>
        <span className={s.badge} data-change={g.change}><Icon name={GLYPH[g.change]} size={11} stroke={2.2} /></span>
        {t(`backup.kinds.${g.kind}.${g.change}`)}
        {g.kind !== 'settings' && <span className={`${s.groupCount} num`}>{fmt.number(g.count)}</span>}
      </h4>
      {g.kind === 'file' && (
        <div className={s.thumbs}>
          {g.items.slice(0, SHOWN).map((x, i) => {
            const body = (
              <>
                <Picture src={mediaUrl(x.file, 'low')} className={s.thumbPic}>
                  {x.file.kind === 'video' && <span className={s.videoMark}><Icon name="play" size={10} /></span>}
                </Picture>
                <span className={s.thumbName}>{x.file.name}.{x.file.ext}</span>
                {x.group && <span className={s.thumbGroup}>{x.group.name}</span>}
              </>
            );
            return x.inLibrary && x.group
              ? <Link key={x.id} to={paths.file(x.group.id, x.id)} className={s.thumb} style={{ '--i': i }} onClick={onNavigate}>{body}</Link>
              : <span key={x.id} className={s.thumb} style={{ '--i': i }} data-gone="true">{body}</span>;
          })}
          {more > 0 && <span className={`${s.more} num`}>{t('backup.moreItems', { n: fmt.number(more) })}</span>}
        </div>
      )}
      {g.kind === 'group' && (
        <div className={s.chips}>
          {g.items.map((x) => {
            const body = <><GroupCover group={x} className={s.chipCover} />{x.name}</>;
            return x.inLibrary
              ? <Link key={x.id} to={paths.group(x.id)} className={s.chip} onClick={onNavigate}>{body}</Link>
              : <span key={x.id} className={s.chip} data-gone="true">{body}</span>;
          })}
          {more > 0 && <span className={`${s.more} num`}>{t('backup.moreItems', { n: fmt.number(more) })}</span>}
        </div>
      )}
    </section>
  );
}

function FileList({ files }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <div className={s.files}>
      <ul>
        {files.items.map((f, i) => {
          const cut = f.path.lastIndexOf('\\');
          return (
            <li key={`${f.change}:${f.path}`} className={s.file} data-change={f.change} style={{ '--k': Math.min(i, 30) }}>
              <span className={s.badge} data-change={f.change}><Icon name={GLYPH[f.change]} size={11} stroke={2.2} /></span>
              <span className={s.filePath}>{cut > 0 && <span className={s.fileDir}>{f.path.slice(0, cut + 1)}</span>}{f.path.slice(cut + 1)}</span>
            </li>
          );
        })}
      </ul>
      {files.total > files.items.length && <div className={`${s.moreFiles} num`}>{t('backup.moreFiles', { n: fmt.number(files.total - files.items.length) })}</div>}
    </div>
  );
}

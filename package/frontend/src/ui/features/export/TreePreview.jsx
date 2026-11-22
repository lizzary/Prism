import { useEffect, useState } from 'react';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { IconButton } from '../../components/controls.jsx';
import s from './TreePreview.module.css';

const FILE_ICON = { image: 'image', video: 'video' };

/** The folders an export will create, as a tree that opens and closes like the real one. */
export function TreePreview({ plan, loading, maxPerDir, onMaxPerDir }) {
  const t = useT();
  const fmt = useFormat();
  const [open, setOpen] = useState(() => new Set(['']));

  // when the structure changes, keep what is still there and open the first branch two levels deep
  useEffect(() => {
    if (!plan) return;
    setOpen((cur) => {
      const next = new Set(['']);
      const exists = new Set();
      const walk = (n) => { exists.add(n.path); n.dirs.forEach(walk); };
      walk(plan.root);
      for (const p of cur) if (exists.has(p)) next.add(p);
      let n = plan.root;
      for (let d = 0; d < 2 && n.dirs.length; d++) { n = n.dirs[0]; next.add(n.path); }
      return next;
    });
  }, [plan]);

  const toggle = (path) => setOpen((cur) => { const n = new Set(cur); if (n.has(path)) n.delete(path); else n.add(path); return n; });

  const renderDir = (node, depth) => {
    const isOpen = open.has(node.path);
    return (
      <li key={node.path || 'root'} className={s.dir} style={{ '--d': depth }}>
        <button type="button" className={s.row} onClick={() => toggle(node.path)} aria-expanded={isOpen}>
          <Icon name="chevron-right" size={14} className={`${s.chev} ${isOpen ? s.chevOpen : ''}`} />
          <Icon name={isOpen ? 'folder-open' : 'folder'} size={17} className={s.folder} />
          <span className={s.name}>{node.name}</span>
          <span className={`${s.meta} num`}>{t('export.summary', { files: fmt.number(node.count), size: fmt.bytes(node.bytes) })}</span>
        </button>
        {isOpen && (
          <ul className={s.children}>
            {node.dirs.map((d) => renderDir(d, depth + 1))}
            {node.files.map((f, i) => (
              <li key={`${node.path}/${f.name}`} className={s.file} style={{ '--d': depth + 1, '--k': i }}>
                <Icon name={FILE_ICON[f.kind] ?? 'file'} size={15} className={s.fileIcon} />
                <span className={s.name}>{f.name}</span>
                <span className={`${s.meta} num`}>{fmt.bytes(f.size)}</span>
              </li>
            ))}
            {node.hidden > 0 && (
              <li className={`${s.file} ${s.more}`} style={{ '--d': depth + 1 }}>
                <Icon name="more" size={15} className={s.fileIcon} />
                <span>{t('export.moreFiles', { n: fmt.number(node.hidden) })}</span>
              </li>
            )}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className={`${s.tree} ${loading ? s.loading : ''}`}>
      <div className={s.head}>
        <span className={s.title}><Icon name="folder-open" size={16} />{t('export.preview')}</span>
        <span className={s.per}>
          {t('export.perDir')}
          <IconButton icon="minus" size="sm" tip={false} label="−" disabled={maxPerDir <= 1} onClick={() => onMaxPerDir(maxPerDir - 1)} />
          <span className={`${s.perValue} num`}>{maxPerDir}</span>
          <IconButton icon="plus" size="sm" tip={false} label="+" disabled={maxPerDir >= 50} onClick={() => onMaxPerDir(maxPerDir + 1)} />
        </span>
      </div>
      <div className={s.body}>
        {plan && plan.files > 0 ? <ul className={s.rootList}>{renderDir(plan.root, 0)}</ul>
          : plan && <div className={s.none}><Icon name="folder" size={22} />{t('export.noFiles')}</div>}
      </div>
    </div>
  );
}

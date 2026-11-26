// Models and indexing: indexing files as they are uploaded, the tagging model and the image index model (the very
// pickers of the index page), GPU acceleration — and the way to the index page itself.
import { useIndexOverview } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { GpuSetting, ModelPicker } from '../models/ModelPicker.jsx';
import { UploadIndexing } from '../indexing/UploadIndexing.jsx';
import { KIND_RAY } from '../indexing/kinds.js';
import s from './SettingsDialog.module.css';

export function ModelSettings({ onOpenIndex }) {
  return (
    <>
      <IndexCard onOpen={onOpenIndex} />
      <UploadIndexing />
      <ModelPicker kind="tagging" />
      <ModelPicker kind="embedding" />
      <GpuSetting />
    </>
  );
}

const KINDS = ['tagging', 'embedding', 'metadata'];
const ROWS = [12, 22, 32];

/**
 * The index page's entry: the Prism mark in miniature — its three rays as far as each kind is up to date — and what is
 * waiting.
 */
function IndexCard({ onOpen }) {
  const t = useT();
  const fmt = useFormat();
  const o = useIndexOverview();
  return (
    <button type="button" className={s.indexCard} data-overlay="index" onClick={onOpen}>
      <svg className={s.mini} viewBox="0 0 140 44" aria-hidden="true">
        <path d="M2 27 12 24" className={s.miniBeam} />
        <path d="M17 9 27 34H7Z" className={s.miniPrism} />
        {KINDS.map((k, i) => {
          const c = o.kinds[k];
          const y = ROWS[i];
          const p = c.available && o.total ? c.done / o.total : 0;
          return (
            <g key={k} style={{ '--c': KIND_RAY[k] }} data-off={!c.available || undefined} className={s.miniRay}>
              <path d={`M${22 + i * 0.8} ${20 + i * 2.6}C30 ${20 + i * 2.6} 32 ${y} 40 ${y}`} />
              <line x1="40" x2="136" y1={y} y2={y} className={s.miniTrack} />
              {p > 0 && <line x1="40" x2={40 + 96 * p} y1={y} y2={y} />}
            </g>
          );
        })}
      </svg>
      <span className={s.backupText}>
        <span className={s.backupTitle}><Icon name="reindex" size={16} />{t('settings.indexEntry')}</span>
        <span className={s.backupMeta}>
          {o.waiting
            ? t('settings.indexWaiting', { n: fmt.number(o.waiting), count: o.waiting, when: o.lastIndexedAt ? fmt.relative(o.lastIndexedAt) : t('index.never') })
            : t('settings.indexClean')}
        </span>
      </span>
      <span className={s.backupGo}>{t('settings.open')}<Icon name="arrow-right" size={15} /></span>
    </button>
  );
}

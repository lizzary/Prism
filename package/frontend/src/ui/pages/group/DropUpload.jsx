// Pictures and videos dragged in from the computer can be dropped anywhere on a group's page. Files dragged around
// inside the page never trigger it (those drags are the page's own, not the browser's).
import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Portal, usePresence } from '../../components/overlay.jsx';
import s from './DropUpload.module.css';

const carriesFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files');

export function DropUpload({ enabled, group, onFiles }) {
  const t = useT();
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const take = useRef(onFiles);
  take.current = onFiles;
  const { mounted, state } = usePresence(over, 240);

  useEffect(() => {
    if (!enabled) return undefined;
    // a drag that starts on the page itself (a picture of this group dragged by the browser) is never an upload
    let inside = false;
    const start = () => { inside = true; };
    const stop = () => { inside = false; };
    const ours = (e) => !inside && carriesFiles(e);
    const enter = (e) => { if (!ours(e)) return; e.preventDefault(); depth.current++; setOver(true); };
    const overIt = (e) => { if (!ours(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };
    const leave = (e) => { if (!ours(e)) return; depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); };
    const drop = (e) => {
      if (!ours(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      if (e.dataTransfer.files.length) take.current([...e.dataTransfer.files]);
    };
    window.addEventListener('dragstart', start);
    window.addEventListener('dragend', stop);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragover', overIt);
    window.addEventListener('dragleave', leave);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragstart', start);
      window.removeEventListener('dragend', stop);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragover', overIt);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('drop', drop);
      depth.current = 0;
      setOver(false);
    };
  }, [enabled]);

  if (!mounted) return null;
  return (
    <Portal>
      <div className={s.layer} data-state={state} aria-hidden="true">
        <div className={s.frame}>
          <div className={s.tray}>
            <span className={s.card} data-k="0" />
            <span className={s.card} data-k="1" />
            {group.cover ? <img className={s.cover} src={mediaUrl(group.cover, 'low')} alt="" /> : <span className={s.cover} />}
            <span className={s.arrow}><Icon name="download" size={22} /></span>
          </div>
          <div className={s.title}>{t('group.drop.title', { name: group.name })}</div>
          <div className={s.body}>{t('group.drop.body')}</div>
        </div>
      </div>
    </Portal>
  );
}

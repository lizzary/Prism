import { Icon } from '../../icons/Icon.jsx';
import s from './SettingsDialog.module.css';

/** A setting with a title, a line about what it does, its control, and whatever it needs underneath. */
export function Block({ icon, title, desc, control, status, children, highlight, id }) {
  return (
    <section className={s.block} data-highlight={!!highlight} id={id}>
      <div className={s.blockHead}>
        <span className={s.blockIcon}><Icon name={icon} size={18} /></span>
        <div className={s.blockText}>
          <div className={s.blockTitle}>{title}{status}</div>
          {desc && <p className={s.blockDesc}>{desc}</p>}
        </div>
        {control}
      </div>
      {children && <div className={s.blockBody}>{children}</div>}
    </section>
  );
}

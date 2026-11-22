import { useState } from 'react';
import { useT } from '../../i18n/index.jsx';
import { TextInput } from './controls.jsx';
import { Icon } from '../icons/Icon.jsx';
import s from './password.module.css';

/** A password field with a show / hide toggle. */
export function PasswordInput({ className, autoComplete = 'new-password', ref, ...rest }) {
  const t = useT();
  const [shown, setShown] = useState(false);
  return (
    <div className={`${s.wrap} ${className ?? ''}`}>
      <TextInput ref={ref} type={shown ? 'text' : 'password'} autoComplete={autoComplete} spellCheck={false} className={s.input} {...rest} />
      <button type="button" className={s.eye} onClick={() => setShown((v) => !v)} aria-label={shown ? t('login.hide') : t('login.show')} aria-pressed={shown}>
        <Icon name={shown ? 'eye-off' : 'eye'} size={16} />
      </button>
    </div>
  );
}

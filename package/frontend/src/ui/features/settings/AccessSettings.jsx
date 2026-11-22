import { useEffect, useRef, useState } from 'react';
import { accessActions, useAccess } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, Field, Switch } from '../../components/controls.jsx';
import { PasswordInput } from '../../components/password.jsx';
import { toast } from '../../components/feedback.jsx';
import { ServerAddresses } from '../server/ServerAddresses.jsx';
import { useOptimisticToggle } from '../../lib/useOptimisticToggle.js';
import { Block } from './Block.jsx';
import s from './SettingsDialog.module.css';

// ------------------------------------------------------------------ password login
/**
 * Off → turning the switch on asks for a new password; it takes effect when saved.
 * On  → change it (current + new) or turn it off (current), each in place.
 */
export function PasswordSetting({ highlight }) {
  const t = useT();
  const fmt = useFormat();
  const { password } = useAccess();
  const [mode, setMode] = useState(null);          // null | 'set' | 'change' | 'off'
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [tried, setTried] = useState(false);
  const [wrong, setWrong] = useState(false);
  const [saving, setSaving] = useState(false);
  const first = useRef(null);
  const ref = useRef(null);
  const begin = (m) => { setMode(m); setForm({ current: '', next: '', confirm: '' }); setTried(false); setWrong(false); };
  // brought forward from elsewhere (e.g. the server-mode suggestion): start setting a password right away
  useEffect(() => {
    if (!highlight) return;
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    if (!password.enabled) begin('set');
  }, [highlight]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mode) requestAnimationFrame(() => first.current?.focus()); }, [mode]);
  const set = (patch) => { setForm((f) => ({ ...f, ...patch })); if ('current' in patch) setWrong(false); };
  const min = password.minLength;
  const needsNew = mode === 'set' || mode === 'change';
  const errors = {
    current: mode !== 'set' && wrong ? t('password.wrong') : null,
    next: needsNew && tried && form.next.length < min ? t('password.tooShort', { n: min }) : null,
    confirm: needsNew && tried && form.next.length >= min && form.confirm !== form.next ? t('password.mismatch') : null,
  };

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (needsNew && (form.next.length < min || form.confirm !== form.next)) return;
    if (mode !== 'set' && !form.current) { setWrong(true); return; }
    setSaving(true);
    const res = mode === 'off' ? await accessActions.disablePassword(form.current) : await accessActions.setPassword({ current: form.current, next: form.next });
    setSaving(false);
    if (!res.ok) { if (res.error === 'wrong') setWrong(true); return; }
    toast(t(mode === 'off' ? 'password.disabled' : mode === 'change' ? 'password.changed' : 'password.enabled'), { tone: 'ok', icon: mode === 'off' ? 'unlock' : 'lock' });
    setMode(null);
  };

  const checked = mode === 'set' || (password.enabled && mode !== 'off');
  return (
    <div ref={ref}>
      <Block icon="lock" title={t('password.title')} desc={t('password.desc')} highlight={!!highlight}
        control={<Switch checked={checked} label={t('password.title')}
          onChange={(on) => { if (on) begin(password.enabled ? null : 'set'); else begin(password.enabled ? 'off' : null); }} />}>
        {mode ? (
          <form className={s.inlineForm} onSubmit={submit} data-mode={mode}>
            {mode !== 'set' && (
              <Field label={t('password.current')} error={errors.current}>
                <PasswordInput ref={first} autoComplete="current-password" value={form.current} invalid={!!errors.current} onChange={(e) => set({ current: e.target.value })} />
              </Field>
            )}
            {needsNew && (
              <div className={s.formPair}>
                <Field label={t('password.next')} error={errors.next}>
                  <PasswordInput ref={mode === 'set' ? first : undefined} value={form.next} invalid={!!errors.next} placeholder={t('password.placeholder', { n: min })} onChange={(e) => set({ next: e.target.value })} />
                </Field>
                <Field label={t('password.confirm')} error={errors.confirm}>
                  <PasswordInput value={form.confirm} invalid={!!errors.confirm} onChange={(e) => set({ confirm: e.target.value })} />
                </Field>
              </div>
            )}
            <div className={s.formActions}>
              <Button variant="ghost" size="sm" onClick={() => setMode(null)}>{t('common.cancel')}</Button>
              <Button type="submit" size="sm" variant={mode === 'off' ? 'danger' : 'primary'} loading={saving}>
                {t(mode === 'off' ? 'password.turnOff' : mode === 'change' ? 'password.saveChange' : 'password.save')}
              </Button>
            </div>
          </form>
        ) : password.enabled && (
          <div className={s.metaRow}>
            <span className={s.metaText}><Icon name="check-circle" size={14} className={s.okIcon} />{t('password.since', { date: fmt.date(password.changedAt) })}</span>
            <Button variant="ghost" size="sm" icon="key" onClick={() => begin('change')}>{t('password.change')}</Button>
            <Button variant="ghost" size="sm" icon="lock" onClick={() => accessActions.lock()}>{t('password.lockNow')}</Button>
          </div>
        )}
      </Block>
    </div>
  );
}

// ------------------------------------------------------------------ server mode
/** The saved choice applies from the next start; until then both the address and the restart note are shown. */
export function ServerSetting({ onSuggestPassword }) {
  const t = useT();
  const { server, password } = useAccess();
  const [enabled, setEnabled] = useOptimisticToggle(server.enabled, accessActions.setServer);
  const pending = enabled !== server.running;
  const state = enabled ? (server.running ? 'running' : 'pendingOn') : server.running ? 'pendingOff' : null;
  return (
    <Block icon="broadcast" title={t('server.title')} desc={t('server.desc')}
      status={state && <span className={s.pill} data-state={state}><i />{t(`server.${state}`)}</span>}
      control={<Switch checked={enabled} label={t('server.title')} onChange={setEnabled} />}>
      {(enabled || server.running) && (
        <div className={s.serverBody}>
          {pending && (
            <p className={s.notice} data-tone="warn"><Icon name="refresh" size={15} />{t(enabled ? 'server.restartOn' : 'server.restartOff')}</p>
          )}
          {enabled && <ServerAddresses addresses={server.addresses} dim={!server.running} />}
          {enabled && !password.enabled && (
            <p className={s.notice} data-tone="info">
              <Icon name="info" size={15} />
              <span>{t('server.suggestPassword')}</span>
              <button type="button" className={s.noticeAction} onClick={onSuggestPassword}>{t('server.enablePassword')}</button>
            </p>
          )}
        </div>
      )}
    </Block>
  );
}

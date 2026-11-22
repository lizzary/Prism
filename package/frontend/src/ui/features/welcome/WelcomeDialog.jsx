// First launch: what Prism is, then three choices — password login, server mode, MCP (with a first key if wanted).
// Nothing is applied until the end, except the key, which is created when asked for so it can be copied right away.
import { useEffect, useRef, useState } from 'react';
import { accessActions, mcpActions, settingsActions, useAccess, useGroupList, useSettings } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { Button, Field, Segmented, Switch, TextInput } from '../../components/controls.jsx';
import { Dialog } from '../../components/overlay.jsx';
import { toast } from '../../components/feedback.jsx';
import { PasswordInput } from '../../components/password.jsx';
import { ServerAddresses } from '../server/ServerAddresses.jsx';
import { PermissionMatrix } from '../mcp/PermissionMatrix.jsx';
import { KeyReveal } from '../mcp/KeyReveal.jsx';
import { PRESETS } from '../mcp/permissions.js';
import { WelcomeArt } from './WelcomeArt.jsx';
import s from './Welcome.module.css';

const STEPS = ['welcome', 'password', 'server', 'mcp', 'done'];

export default function WelcomeDialog({ open, onClose }) {
  const t = useT();
  const settings = useSettings();
  const access = useAccess();
  const { data: groups } = useGroupList();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [choice, setChoice] = useState({ password: false, server: false, mcp: false });
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [tried, setTried] = useState(false);
  const [key, setKey] = useState({ state: 'ask', name: null, permissions: PRESETS.read(), secret: null, busy: false });
  const [finishing, setFinishing] = useState(false);
  const pwRef = useRef(null);

  useEffect(() => { if (STEPS[step] === 'password' && choice.password) requestAnimationFrame(() => pwRef.current?.focus()); }, [step, choice.password]);

  const min = access.password.minLength;
  const pwErrors = {
    next: tried && pw.next.length < min ? t('password.tooShort', { n: min }) : null,
    confirm: tried && pw.next.length >= min && pw.confirm !== pw.next ? t('password.mismatch') : null,
  };
  const go = (to) => { setDir(to > step ? 1 : -1); setStep(to); setTried(false); };
  const next = () => {
    if (STEPS[step] === 'password' && choice.password) {
      setTried(true);
      if (pw.next.length < min || pw.confirm !== pw.next) return;
    }
    go(step + 1);
  };
  const finish = async (skip = false) => {
    setFinishing(true);
    await accessActions.completeSetup(skip ? { server: false, mcp: false } : { password: choice.password ? pw.next : null, server: choice.server, mcp: choice.mcp });
    setFinishing(false);
    onClose();
    if (!skip && choice.server) toast(t('server.restartOn'), { icon: 'broadcast' });
  };
  const createKey = async () => {
    setKey((k) => ({ ...k, busy: true }));
    const res = await mcpActions.create({ name: key.name?.trim() || t('welcome.keyName'), scope: { groupIds: (groups ?? []).map((g) => g.id), future: true }, permissions: key.permissions });
    setKey((k) => ({ ...k, busy: false, ...(res.ok ? { state: 'made', secret: res.secret } : {}) }));
  };

  const name = STEPS[step];
  return (
    <Dialog open={open} onClose={() => {}} dismissible={false} bare label={t('welcome.title')} className={s.dialog} scrimClassName={s.scrim}>
      <div className={s.layout}>
        <WelcomeArt step={step} total={STEPS.length} />
        <div className={s.content}>
          <div className={s.topRow}>
            <Segmented size="sm" value={settings.language} onChange={(v) => settingsActions.update({ language: v })} label={t('settings.language')}
              options={[{ value: 'en', label: 'English' }, { value: 'zh-CN', label: '简体中文' }]} />
          </div>
          <div className={s.step} key={name} style={{ '--dir': dir }}>
            {name === 'welcome' && (
              <>
                <h2 className={`${s.hello} kai`}>{t('welcome.title')}</h2>
                <p className={s.lead}>{t('welcome.intro')}</p>
                <ul className={s.points}>
                  {[['organize', 'swatches'], ['find', 'search'], ['export', 'export']].map(([k, icon], i) => (
                    <li key={k} style={{ '--i': i }}>
                      <span className={s.pointIcon}><Icon name={icon} size={18} /></span>
                      <span><b>{t(`welcome.points.${k}.title`)}</b>{t(`welcome.points.${k}.body`)}</span>
                    </li>
                  ))}
                </ul>
                <p className={s.hint}>{t('welcome.setupHint')}</p>
              </>
            )}

            {name === 'password' && (
              <>
                <h2 className={s.heading}>{t('password.title')}</h2>
                <p className={s.lead}>{t('password.desc')}</p>
                <Toggle icon="lock" label={t('welcome.enablePassword')} on={choice.password} onChange={(v) => setChoice((c) => ({ ...c, password: v }))} />
                {choice.password && (
                  <form className={s.reveal} onSubmit={(e) => { e.preventDefault(); next(); }}>
                    <Field label={t('password.next')} error={pwErrors.next}>
                      <PasswordInput ref={pwRef} value={pw.next} invalid={!!pwErrors.next} placeholder={t('password.placeholder', { n: min })} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
                    </Field>
                    <Field label={t('password.confirm')} error={pwErrors.confirm}>
                      <PasswordInput value={pw.confirm} invalid={!!pwErrors.confirm} onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))} />
                    </Field>
                    <button type="submit" hidden />
                  </form>
                )}
              </>
            )}

            {name === 'server' && (
              <>
                <h2 className={s.heading}>{t('server.title')}</h2>
                <p className={s.lead}>{t('server.desc')}</p>
                <Toggle icon="broadcast" label={t('welcome.enableServer')} on={choice.server} onChange={(v) => setChoice((c) => ({ ...c, server: v }))} />
                {choice.server && (
                  <div className={s.reveal}>
                    <p className={s.small}>{t('welcome.serverPreview')}</p>
                    <ServerAddresses addresses={access.server.addresses} compact />
                    <p className={s.notice} data-tone="warn"><Icon name="refresh" size={15} />{t('server.restartOn')}</p>
                    {!choice.password && (
                      <p className={s.notice} data-tone="info">
                        <Icon name="info" size={15} /><span>{t('server.suggestPassword')}</span>
                        <button type="button" onClick={() => { setChoice((c) => ({ ...c, password: true })); go(1); }}>{t('server.enablePassword')}</button>
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {name === 'mcp' && (
              <>
                <h2 className={s.heading}>{t('mcp.title')}</h2>
                <p className={s.lead}>{t('mcp.what')}</p>
                <p className={s.lead2}>{t('mcp.does')}</p>
                <Toggle icon="mcp" label={t('welcome.enableMcp')} on={choice.mcp} onChange={(v) => setChoice((c) => ({ ...c, mcp: v }))} />
                {choice.mcp && (
                  <div className={s.reveal}>
                    {key.state === 'ask' && (
                      <div className={s.keyCard}>
                        <div className={s.keyHead}>
                          <Icon name="key" size={17} />
                          <div><b>{t('welcome.keyTitle')}</b><span>{t('welcome.keyBody')}</span></div>
                        </div>
                        <div className={s.keyRow}>
                          <TextInput value={key.name ?? t('welcome.keyName')} onChange={(e) => setKey((k) => ({ ...k, name: e.target.value }))} aria-label={t('mcp.name')} className={s.keyName} />
                          <PermissionMatrix compact value={key.permissions} onChange={(permissions) => setKey((k) => ({ ...k, permissions }))} />
                        </div>
                        <div className={s.keyActions}>
                          <Button variant="ghost" size="sm" onClick={() => setKey((k) => ({ ...k, state: 'skipped' }))}>{t('welcome.skipKey')}</Button>
                          <Button size="sm" icon="key" loading={key.busy} onClick={createKey}>{t('welcome.createKey')}</Button>
                        </div>
                      </div>
                    )}
                    {key.state === 'made' && <KeyReveal secret={key.secret} endpoint={access.mcp.endpoint} compact />}
                    {key.state === 'skipped' && (
                      <p className={s.small}>
                        {t('welcome.keySkipped')}
                        <button type="button" className={s.inlineLink} onClick={() => setKey((k) => ({ ...k, state: 'ask' }))}>{t('welcome.createKey')}</button>
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            {name === 'done' && (
              <>
                <h2 className={s.heading}>{t('welcome.doneTitle')}</h2>
                <p className={s.lead}>{t('welcome.doneBody')}</p>
                <ul className={s.summary}>
                  <Summary icon="lock" label={t('password.title')} on={choice.password} state={choice.password ? t('welcome.state.on') : t('welcome.state.off')} onEdit={() => go(1)} />
                  <Summary icon="broadcast" label={t('server.title')} on={choice.server} state={choice.server ? t('welcome.state.restart') : t('welcome.state.off')} onEdit={() => go(2)} />
                  <Summary icon="mcp" label={t('mcp.title')} on={choice.mcp} onEdit={() => go(3)}
                    state={choice.mcp ? (key.state === 'made' ? t('welcome.state.keys', { n: 1 }) : t('welcome.state.on')) : t('welcome.state.off')} />
                </ul>
              </>
            )}
          </div>

          <footer className={s.foot}>
            {step === 0
              ? <Button variant="quiet" onClick={() => finish(true)} disabled={finishing}>{t('welcome.skipAll')}</Button>
              : <Button variant="ghost" icon="arrow-left" onClick={() => go(step - 1)} disabled={finishing}>{t('common.stepBack')}</Button>}
            <span className={s.progress} aria-label={`${step + 1} / ${STEPS.length}`}>{STEPS.map((x, i) => <i key={x} data-on={i <= step} />)}</span>
            {name === 'done'
              ? <Button variant="primary" icon="check" loading={finishing} onClick={() => finish(false)} data-autofocus>{t('welcome.finish')}</Button>
              : <Button variant="primary" iconRight="arrow-right" onClick={next} data-autofocus>{step === 0 ? t('welcome.start') : t('common.stepNext')}</Button>}
          </footer>
        </div>
      </div>
    </Dialog>
  );
}

function Toggle({ icon, label, on, onChange }) {
  return (
    <label className={s.toggle} data-on={on}>
      <span className={s.toggleIcon}><Icon name={icon} size={18} /></span>
      <span className={s.toggleLabel}>{label}</span>
      <Switch checked={on} label={label} onChange={onChange} />
    </label>
  );
}

function Summary({ icon, label, on, state, onEdit }) {
  const t = useT();
  return (
    <li className={s.sumRow} data-on={on}>
      <span className={s.sumIcon}><Icon name={icon} size={17} /></span>
      <span className={s.sumLabel}>{label}</span>
      <span className={s.sumState}><i />{state}</span>
      <button type="button" className={s.sumEdit} onClick={onEdit}>{t('common.edit')}</button>
    </li>
  );
}

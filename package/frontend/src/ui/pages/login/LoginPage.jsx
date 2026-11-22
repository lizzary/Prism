// The login page is the home page's hero with its doors closed: the same painting, the same greeting, and a
// password field where the cards will be. Signing in settles the painting into the home page's frame, so the
// library opens underneath without a cut.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { accessActions, preloadHome } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { StarryNight } from '../../art/starry/StarryNight.jsx';
import { Icon } from '../../icons/Icon.jsx';
import { LogoMark } from '../../icons/Logo.jsx';
import { Spinner } from '../../components/feedback.jsx';
import { greetingKey, useFontReady } from '../home/HomeHero.jsx';
import hero from '../home/HomeHero.module.css';
import bar from '../../layout/TopBar.module.css';
import s from './LoginPage.module.css';

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const routeIsHome = () => !/^#\/group\//.test(location.hash);

export function LoginPage({ opening, onOpened }) {
  const t = useT();
  const greeting = t(`home.greeting.${greetingKey(new Date().getHours())}`);
  const fontReady = useFontReady('Prism WenKai', greeting);
  const [value, setValue] = useState('');
  const [status, setStatus] = useState('idle');        // idle | checking | wrong | wait | ok
  const [retryAt, setRetryAt] = useState(0);
  const [stage, setStage] = useState('closed');        // closed | settle (into the home page) | leave (to another page)
  const [help, setHelp] = useState(false);
  const [shake, setShake] = useState(0);
  const input = useRef(null);
  const opened = useRef(onOpened);
  opened.current = onOpened;

  // signed in: the stars light up, the painting settles into the home page's frame, then the library takes over
  useEffect(() => {
    if (!opening) return undefined;
    let alive = true;
    const home = routeIsHome();
    const quick = reducedMotion();
    const settle = setTimeout(() => setStage(home ? 'settle' : 'leave'), quick ? 0 : 280);
    Promise.all([home ? preloadHome() : null, new Promise((r) => setTimeout(r, quick ? 0 : 1040))]).then(() => {
      if (!alive) return;
      const root = document.documentElement;
      root.dataset.arrive = '';
      setTimeout(() => { delete root.dataset.arrive; }, 1400);
      opened.current();
    });
    return () => { alive = false; clearTimeout(settle); };
  }, [opening]);

  const waiting = status === 'wait';
  useEffect(() => {
    if (!waiting) return undefined;
    const id = setInterval(() => { if (Date.now() >= retryAt) { setStatus('idle'); requestAnimationFrame(() => input.current?.focus()); } }, 250);
    return () => clearInterval(id);
  }, [waiting, retryAt]);

  const submit = async (e) => {
    e.preventDefault();
    if (!value || status === 'checking' || status === 'ok' || waiting) return;
    setStatus('checking');
    const res = await accessActions.login(value);
    if (res.ok) { setStatus('ok'); return; }
    setValue('');
    setShake((n) => n + 1);
    if (res.retryIn) { setRetryAt(Date.now() + res.retryIn * 1000); setStatus('wait'); } else setStatus('wrong');
    requestAnimationFrame(() => input.current?.focus());
  };

  return (
    <div className={s.page} data-stage={stage}>
      <section className={s.hero}>
        <div className={s.art}><StarryNight /></div>
        <div className={hero.veil} aria-hidden="true" />
        <div className={s.dusk} aria-hidden="true" />
        <div className={s.fade} aria-hidden="true" />
        <div className={hero.content}>
          <div className={`${hero.greeting} ${fontReady ? hero.in : ''}`}>
            <h1 className={`${hero.hello} kai`}>{greeting}</h1>
            <p className={`${hero.prompt} ${s.prompts}`}>
              <span className={s.askPrompt}>{t('login.prompt')}</span>
              <span className={s.homePrompt} aria-hidden="true">{t('home.prompt')}</span>
            </p>
          </div>
          <form className={s.form} onSubmit={submit}>
            <StarField value={value} onChange={(v) => { setValue(v); if (status === 'wrong') setStatus('idle'); }}
              inputRef={input} disabled={waiting || status === 'ok'} status={status} shake={shake}
              action={(
                <button type="submit" className={s.go} disabled={!value || waiting} aria-label={t('login.enter')} data-status={status}>
                  {status === 'checking' ? <DelayedSpinner /> : <Icon name={status === 'ok' ? 'check' : 'arrow-right'} size={19} />}
                </button>
              )} />
            <div className={s.note} role="alert" aria-live="polite">
              {status === 'wrong' && <><Icon name="alert" size={14} />{t('login.wrong')}</>}
              {waiting && <><Icon name="clock" size={14} /><Countdown until={retryAt} render={(n) => t('login.retryIn', { n })} /></>}
            </div>
            <button type="button" className={s.forgot} aria-expanded={help} onClick={() => setHelp((v) => !v)}>{t('login.forgot')}</button>
            {help && (
              <div className={s.help}>
                <p><Rich text={t('login.forgotTerminal', { cmd: '\u0000' })} code="/reset_pwd" /></p>
                <p><Rich text={t('login.forgotConfig', { file: '\u0000' })} code="config.toml" /></p>
              </div>
            )}
          </form>
        </div>
      </section>
      <header className={`${bar.bar} ${bar.onArt}`}>
        <div className={bar.inner}>
          <div className={bar.left}>
            <span className={bar.brand}><LogoMark size={28} className={bar.mark} /><span className={bar.word}>Prism</span></span>
          </div>
        </div>
      </header>
    </div>
  );
}

/**
 * A real password input (password managers and screen readers keep working) whose characters are drawn as a row of
 * small stars on the painting. The caret is drawn too, so it follows the stars rather than hidden bullets.
 */
function StarField({ value, onChange, inputRef, disabled, status, shake, action }) {
  const t = useT();
  const [reveal, setReveal] = useState(false);
  const [caret, setCaret] = useState(0);
  const [focused, setFocused] = useState(false);
  const box = useRef(null);
  const [offset, setOffset] = useState(0);
  const STEP = 18;                                  // one star and its gap, in px
  const sync = () => { const el = inputRef.current; if (el) setCaret(el.selectionDirection === 'backward' ? el.selectionStart : el.selectionEnd ?? value.length); };
  useEffect(() => { inputRef.current?.focus(); }, [inputRef]);
  // keep the caret in view when the row of stars grows longer than the field
  useLayoutEffect(() => {
    const w = box.current?.clientWidth ?? 0;
    const x = caret * STEP;
    setOffset((o) => (x - o > w - 8 ? x - w + 8 : x < o ? x : o));
  }, [caret, value]);

  return (
    <div className={s.field} data-status={status} data-reveal={reveal} data-shake={shake ? shake % 2 : undefined} onClick={() => inputRef.current?.focus()}>
      <Icon name={status === 'ok' ? 'unlock' : 'lock'} size={18} className={s.lock} />
      <div ref={box} className={s.stars} aria-hidden="true">
        {!value && !reveal && <span className={s.placeholder}>{t('login.password')}</span>}
        <span className={s.track} style={{ transform: `translateX(${-offset}px)` }}>
          {[...value].map((_, i) => (
            <svg key={i} className={s.star} viewBox="0 0 12 12" style={{ '--i': i }}><path d="M6 .4c.4 3.1 1.9 4.6 5.6 5.6-3.7 1-5.2 2.5-5.6 5.6C5.6 8.5 4.1 7 .4 6 4.1 5 5.6 3.5 6 .4Z" /></svg>
          ))}
          {focused && !disabled && <span className={s.caret} style={{ left: 2 + caret * STEP }} />}
        </span>
      </div>
      <input ref={inputRef} type={reveal ? 'text' : 'password'} className={s.input} value={value} disabled={disabled}
        autoComplete="current-password" aria-label={t('login.password')} spellCheck={false}
        onChange={(e) => { onChange(e.target.value); requestAnimationFrame(sync); }}
        onSelect={sync} onKeyUp={sync} onFocus={() => { setFocused(true); requestAnimationFrame(sync); }} onBlur={() => setFocused(false)} />
      <button type="button" className={s.eye} onClick={(e) => { e.stopPropagation(); setReveal((v) => !v); inputRef.current?.focus(); }}
        aria-label={reveal ? t('login.hide') : t('login.show')} aria-pressed={reveal}>
        <Icon name={reveal ? 'eye-off' : 'eye'} size={17} />
      </button>
      {action}
    </div>
  );
}

/** A sentence with one command or file name in it, set apart as code. */
function Rich({ text, code }) {
  const [a, b] = text.split('\u0000');
  return <>{a}<code className={s.code}>{code}</code>{b}</>;
}

/** Checking a password is usually instant; only show that it's working if it isn't. */
function DelayedSpinner() {
  const [show, setShow] = useState(false);
  useEffect(() => { const id = setTimeout(() => setShow(true), 260); return () => clearTimeout(id); }, []);
  return show ? <Spinner size={17} /> : <Icon name="arrow-right" size={19} />;
}

function Countdown({ until, render }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(id); }, []);
  return render(Math.max(1, Math.ceil((until - now) / 1000)));
}

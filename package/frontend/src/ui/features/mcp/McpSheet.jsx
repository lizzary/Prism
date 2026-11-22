// MCP keys: the service switch, every key (what it may reach and do, when it was last used), and editing them.
// A key's secret is shown once, when it is created or regenerated.
import { useEffect, useMemo, useRef, useState } from 'react';
import { accessActions, mcpActions, useAccess, useGroupList, useMcpKeys } from '../../../bridge/index.js';
import { useT } from '../../../i18n/index.jsx';
import { useFormat } from '../../lib/format.js';
import { Icon } from '../../icons/Icon.jsx';
import { Button, IconButton, Switch } from '../../components/controls.jsx';
import { Dialog, Sheet } from '../../components/overlay.jsx';
import { Empty, toast } from '../../components/feedback.jsx';
import { CopyButton } from '../../components/share.jsx';
import { PermissionMatrix, permissionLabel } from './PermissionMatrix.jsx';
import { ScopeField, scopeText } from './ScopeField.jsx';
import { KeyReveal } from './KeyReveal.jsx';
import { anyPermission, emptyPermissions, presetOf } from './permissions.js';
import { useOptimisticToggle } from '../../lib/useOptimisticToggle.js';
import s from './McpSheet.module.css';

const NEW = 'new';
const blank = () => ({ name: '', scope: { groupIds: [], future: false }, permissions: emptyPermissions() });
const draftOf = (k) => ({ name: k.name, scope: { groupIds: [...k.scope.groupIds], future: k.scope.future }, permissions: structuredClone(k.permissions) });
const sameDraft = (a, b) => JSON.stringify({ ...a, scope: { ...a.scope, groupIds: [...a.scope.groupIds].sort() } })
  === JSON.stringify({ ...b, scope: { ...b.scope, groupIds: [...b.scope.groupIds].sort() } });

export default function McpSheet({ open, onClose, nonce, handoff }) {
  const t = useT();
  const { mcp } = useAccess();
  const [serviceOn, setServiceOn] = useOptimisticToggle(mcp.enabled, accessActions.setMcp);
  const { data: keys } = useMcpKeys();
  const { data: groupList } = useGroupList();
  const groups = useMemo(() => groupList ?? [], [groupList]);
  const [selected, setSelected] = useState(null);
  const [drafts, setDrafts] = useState(() => new Map());   // unsaved edits, per key, while the sheet is open
  const [query, setQuery] = useState('');
  const [reveal, setReveal] = useState(null);              // { id, secret, regenerated }
  const [confirm, setConfirm] = useState(null);            // { kind: 'delete' | 'regenerate', key }
  const inited = useRef(null);

  useEffect(() => {
    if (!open || !keys || inited.current === nonce) return;
    inited.current = nonce;
    setSelected(keys[0]?.id ?? null); setDrafts(new Map()); setQuery(''); setReveal(null);
  }, [open, keys, nonce]);

  const total = groups.length;
  const nameOf = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);
  const q = query.trim().toLowerCase();
  const shown = (keys ?? []).filter((k) => !q || k.name.toLowerCase().includes(q) || k.last4.includes(q)
    || k.scope.groupIds.some((id) => nameOf.get(id)?.toLowerCase().includes(q)));
  const key = keys?.find((k) => k.id === selected) ?? null;
  const base = selected === NEW ? blank() : key ? draftOf(key) : null;
  const draft = drafts.get(selected) ?? base;
  const setDraft = (next) => setDrafts((m) => new Map(m).set(selected, next));
  const dropDraft = (id) => setDrafts((m) => { const n = new Map(m); n.delete(id); return n; });
  const startNew = () => { setSelected(NEW); setReveal(null); };

  const removeKey = async (k) => {
    await mcpActions.remove(k.id);
    dropDraft(k.id);
    const rest = (keys ?? []).filter((x) => x.id !== k.id);
    setSelected(rest[0]?.id ?? null);
    toast(t('mcp.deleted'), { tone: 'ok', icon: 'trash' });
  };
  const regenerate = async (k) => {
    const res = await mcpActions.regenerate(k.id);
    if (res.ok) setReveal({ id: k.id, secret: res.secret, regenerated: true });
  };

  return (
    <Sheet open={open} onClose={onClose} label={t('mcp.sheet')} className={s.sheetFrame} handoff={handoff}>
      <div className={s.sheet}>
        <header className={s.head}>
          <span className={s.mark}><Icon name="mcp" size={19} /></span>
          <h2 className={s.title}>{t('mcp.sheet')}</h2>
          <label className={s.service}>
            <span>{t('mcp.service')}</span>
            <Switch checked={serviceOn} label={t('mcp.service')} onChange={setServiceOn} />
          </label>
          <IconButton icon="close" label={t('common.close')} onClick={onClose} />
        </header>
        {!mcp.enabled && (
          <div className={s.offBar}>
            <Icon name="info" size={15} />
            <span>{t('mcp.off')}</span>
            <button type="button" onClick={() => setServiceOn(true)}>{t('mcp.turnOn')}</button>
          </div>
        )}
        <div className={s.main}>
          <aside className={s.list}>
            <div className={s.listTop}>
              <label className={s.find}>
                <Icon name="search" size={15} />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('mcp.search')} spellCheck={false} />
                {query && <button type="button" onClick={() => setQuery('')} aria-label={t('common.clear')}><Icon name="close" size={12} /></button>}
              </label>
              <Button size="sm" icon="plus" onClick={startNew} disabled={selected === NEW}>{t('mcp.newKey')}</Button>
            </div>
            <ul className={s.keys}>
              {selected === NEW && (
                <li><button type="button" className={s.keyItem} data-on="true" data-new="true">
                  <span className={s.keyMark}><Icon name="plus" size={15} /></span>
                  <span className={s.keyText}><span className={s.keyName}>{draft?.name.trim() || t('mcp.newKey')}</span></span>
                </button></li>
              )}
              {shown.map((k, i) => (
                <li key={k.id} style={{ '--i': i }}>
                  <KeyItem k={k} on={selected === k.id} unsaved={drafts.has(k.id) && !sameDraft(drafts.get(k.id), draftOf(k))} total={total}
                    onClick={() => { setSelected(k.id); setReveal(null); }} />
                </li>
              ))}
              {keys && !shown.length && q && <li className={s.noMatch}>{t('mcp.noMatch')}</li>}
            </ul>
            <div className={s.endpoint}>
              <span>{t('mcp.endpoint')}</span>
              <code className="num">{mcp.endpoint}</code>
              <CopyButton text={mcp.endpoint} iconOnly size="sm" />
            </div>
          </aside>

          <section className={s.detail}>
            {keys && !keys.length && selected !== NEW ? (
              <div className={s.emptyWrap}>
                <Empty title={t('mcp.noKeys')} action={<Button variant="primary" icon="plus" onClick={startNew}>{t('mcp.newKey')}</Button>}>{t('mcp.noKeysBody')}</Empty>
              </div>
            ) : draft && (
              <KeyEditor key={selected} isNew={selected === NEW} k={key} draft={draft} base={base} groups={groups} total={total}
                endpoint={mcp.endpoint} reveal={reveal?.id === selected ? reveal : null} onRevealDone={() => setReveal(null)}
                onChange={setDraft} onDiscard={() => dropDraft(selected)}
                onSaved={(saved, secret) => {
                  dropDraft(selected);
                  if (secret) { dropDraft(NEW); setSelected(saved.id); setReveal({ id: saved.id, secret }); }
                }}
                onCancelNew={() => { dropDraft(NEW); setSelected(keys?.[0]?.id ?? null); }}
                onDelete={() => setConfirm({ kind: 'delete', key })} onRegenerate={() => setConfirm({ kind: 'regenerate', key })} />
            )}
          </section>
        </div>
      </div>

      <Dialog open={!!confirm} onClose={() => setConfirm(null)} size="sm"
        title={confirm?.kind === 'delete' ? t('mcp.deleteKey') : t('mcp.regenerateTitle')}
        footer={<>
          <Button variant="ghost" onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
          <Button variant={confirm?.kind === 'delete' ? 'danger' : 'primary'} icon={confirm?.kind === 'delete' ? 'trash' : 'refresh'} data-autofocus
            onClick={() => { const c = confirm; setConfirm(null); if (c.kind === 'delete') removeKey(c.key); else regenerate(c.key); }}>
            {confirm?.kind === 'delete' ? t('common.delete') : t('mcp.regenerate')}
          </Button>
        </>}>
        <p className={s.confirmText}>{confirm?.kind === 'delete' ? t('mcp.deleteBody', { name: confirm?.key?.name }) : t('mcp.regenerateBody')}</p>
      </Dialog>
    </Sheet>
  );
}

function KeyItem({ k, on, unsaved, total, onClick }) {
  const t = useT();
  const fmt = useFormat();
  return (
    <button type="button" className={s.keyItem} data-on={on} onClick={onClick}>
      <span className={s.keyMark} data-preset={presetOf(k.permissions)}><Icon name="key" size={16} /></span>
      <span className={s.keyText}>
        <span className={s.keyName}>{k.name}{unsaved && <i className={s.unsaved} />}</span>
        <span className={s.keyMeta}>{permissionLabel(t, k.permissions)} · {scopeText(t, k.scope, total)}</span>
        <span className={s.keyUsed}>
          <span className="num">prism_••••{k.last4}</span>
          <span>{k.lastUsedAt ? t('mcp.lastUsed', { date: fmt.relative(k.lastUsedAt) }) : t('mcp.neverUsed')}</span>
        </span>
      </span>
    </button>
  );
}

function KeyEditor({ isNew, k, draft, base, groups, total, endpoint, reveal, onRevealDone, onChange, onDiscard, onSaved, onCancelNew, onDelete, onRegenerate }) {
  const t = useT();
  const fmt = useFormat();
  const [tried, setTried] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);
  useEffect(() => { if (isNew) nameRef.current?.focus(); }, [isNew]);
  const dirty = isNew || !sameDraft(draft, base);
  const problems = [
    !draft.name.trim() && t('mcp.nameRequired'),
    !draft.scope.groupIds.length && !draft.scope.future && t('mcp.needScope'),
    !anyPermission(draft.permissions) && t('mcp.needPermission'),
  ].filter(Boolean);

  const save = async () => {
    setTried(true);
    if (problems.length) return;
    setSaving(true);
    const res = isNew ? await mcpActions.create(draft) : await mcpActions.update(k.id, draft);
    setSaving(false);
    if (!res.ok) return;
    toast(isNew ? t('mcp.createdToast', { name: res.key.name }) : t('mcp.saved'), { tone: 'ok', icon: 'key' });
    onSaved(res.key, res.secret);
  };

  return (
    <div className={s.editor}>
      <div className={s.editorBody}>
        {reveal && <KeyReveal secret={reveal.secret} endpoint={endpoint} regenerated={reveal.regenerated} onDone={onRevealDone} />}
        <div className={s.identity}>
          <input ref={nameRef} className={s.nameInput} value={draft.name} placeholder={t('mcp.namePlaceholder')} aria-label={t('mcp.name')} spellCheck={false}
            data-invalid={tried && !draft.name.trim()} onChange={(e) => onChange({ ...draft, name: e.target.value })} />
          {!isNew && k && (
            <div className={s.fingerprint}>
              <span className={`${s.keyCode} num`}><Icon name="key" size={13} />prism_••••••••{k.last4}</span>
              <span>{t('mcp.created', { date: fmt.date(k.createdAt) })}</span>
              <span>{k.lastUsedAt ? t('mcp.lastUsed', { date: fmt.relative(k.lastUsedAt) }) : t('mcp.neverUsed')}</span>
              <button type="button" className={s.regen} onClick={onRegenerate}><Icon name="refresh" size={13} />{t('mcp.regenerate')}</button>
            </div>
          )}
        </div>

        <section className={s.part}>
          <h3 className={s.partTitle}><Icon name="gallery" size={16} />{t('mcp.scope')}</h3>
          <ScopeField value={draft.scope} groups={groups} onChange={(scope) => onChange({ ...draft, scope })} />
          <p className={s.scopeSentence}>{scopeText(t, draft.scope, total)}</p>
        </section>

        <section className={s.part}>
          <h3 className={s.partTitle}><Icon name="shield" size={16} />{t('mcp.permissions')}</h3>
          <PermissionMatrix value={draft.permissions} onChange={(permissions) => onChange({ ...draft, permissions })} />
        </section>
      </div>

      <footer className={s.foot}>
        {!isNew && <Button variant="ghost" size="sm" icon="trash" className={s.deleteBtn} onClick={onDelete}>{t('mcp.deleteKey')}</Button>}
        <span className={s.footNote}>{tried && problems[0] && <><Icon name="alert" size={14} />{problems[0]}</>}</span>
        {isNew
          ? <Button variant="ghost" onClick={onCancelNew}>{t('common.cancel')}</Button>
          : dirty && <Button variant="ghost" onClick={onDiscard}>{t('mcp.discard')}</Button>}
        <Button variant="primary" icon={isNew ? 'plus' : 'check'} loading={saving} disabled={!dirty} onClick={save}>
          {isNew ? t('welcome.createKey') : t('common.save')}
        </Button>
      </footer>
    </div>
  );
}

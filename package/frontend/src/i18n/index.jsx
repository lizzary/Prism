import { createContext, useContext, useMemo } from 'react';
import zh from './zh-CN.js';
import en from './en.js';

const DICTS = { 'zh-CN': zh, en };
const Ctx = createContext(null);

function lookup(dict, key) {
  let v = dict;
  for (const k of key.split('.')) { v = v?.[k]; if (v == null) return null; }
  return v;
}

export function makeT(lang) {
  const dict = DICTS[lang] ?? en;
  const plural = new Intl.PluralRules(lang === 'zh-CN' ? 'zh' : 'en');
  return (key, params) => {
    let v = lookup(dict, key) ?? lookup(zh, key) ?? key;
    if (v && typeof v === 'object') {
      const n = params?.n ?? params?.count;
      v = v[n != null ? plural.select(n) : 'other'] ?? v.other ?? key;
    }
    return params ? String(v).replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? `{${k}}`)) : v;
  };
}

export function I18nProvider({ lang, children }) {
  const value = useMemo(() => ({ lang, t: makeT(lang) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
export const useLang = () => useContext(Ctx).lang;

import { createContext, useContext, useMemo, useState } from 'react'
import en from './locales/en.js'
import el from './locales/el.js'
import de from './locales/de.js'
import en2 from './locales/v2/en.js'
import el2 from './locales/v2/el.js'
import de2 from './locales/v2/de.js'

// v2 strings are kept in their own files and merged over the base dictionaries
function merge(a, b) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === 'object' && !Array.isArray(v) ? merge(a[k] || {}, v) : v
  return out
}

export const LANGS = [
  { code: 'en', label: 'English', short: 'EN', locale: 'en-GB' },
  { code: 'el', label: 'Ελληνικά', short: 'ΕΛ', locale: 'el-GR' },
  { code: 'de', label: 'Deutsch', short: 'DE', locale: 'de-DE' },
]
export const DICTS = { en: merge(en, en2), el: merge(el, el2), de: merge(de, de2) }
const KEY = 'coach-lang'

function lookup(dict, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), dict)
}

export function initialLang() {
  try { const s = localStorage.getItem(KEY); if (DICTS[s]) return s } catch {}
  const nav = (navigator.language || 'en').slice(0, 2)
  return DICTS[nav] ? nav : 'en'
}

const Ctx = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(initialLang)
  const value = useMemo(() => {
    const dict = DICTS[lang]
    const t = (path, vars) => {
      let s = lookup(dict, path)
      if (s == null) s = lookup(DICTS.en, path)
      if (s == null) return path
      if (typeof s !== 'string') return s
      if (vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`))
      return s
    }
    const setLang = (l) => {
      if (!DICTS[l]) return
      try { localStorage.setItem(KEY, l) } catch {}
      document.documentElement.lang = l
      setLangState(l)
    }
    const locale = LANGS.find((l) => l.code === lang).locale
    return { lang, setLang, t, locale }
  }, [lang])
  document.documentElement.lang = lang
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useI18n = () => useContext(Ctx)

import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'

// Automatic translation (DeepL via the Supabase function "translate").
// Texts are translated line by line, once per language, and kept in the database (tr_cache),
// so DeepL is only asked for text it has never seen. If translation isn't set up, the original is shown.
const mem = new Map()        // `${lang}|${text}` → translation
const pending = new Set()
const listeners = new Set()
let queue = []
let timer = null
let off = false              // function missing / failing → stop asking for this visit

const k = (lang, text) => `${lang}|${text}`

async function sha(text) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function request(text, lang) {
  const key = k(lang, text)
  if (off || mem.has(key) || pending.has(key)) return
  pending.add(key)
  queue.push({ text, lang })
  if (!timer) timer = setTimeout(flush, 30)
}

async function flush() {
  timer = null
  const batch = queue
  queue = []
  const byLang = new Map()
  for (const { text, lang } of batch) byLang.set(lang, [...(byLang.get(lang) || []), text])
  for (const [lang, texts] of byLang) {
    try {
      const hashes = await Promise.all(texts.map(sha))
      const { data } = await supabase.rpc('tr_get', { p_hashes: hashes, p_lang: lang })
      const hit = new Map((data || []).map((r) => [r.hash, r.result]))
      const miss = []
      texts.forEach((tx, i) => (hit.has(hashes[i]) ? mem.set(k(lang, tx), hit.get(hashes[i])) : miss.push(tx)))
      for (let i = 0; i < miss.length && !off; i += 40) {
        const chunk = miss.slice(i, i + 40)
        const { data: r, error } = await supabase.functions.invoke('translate', { body: { texts: chunk, target: lang } })
        if (error || !Array.isArray(r?.translations)) { off = true; break }
        chunk.forEach((tx, j) => mem.set(k(lang, tx), r.translations[j] || tx))
      }
    } catch { off = true }
    texts.forEach((tx) => pending.delete(k(lang, tx)))
  }
  listeners.forEach((fn) => fn())
}

// Split into lines and keep bullets / numbering / spacing out of the translation.
const LINE = /^(\s*(?:[•·\-–—*]|\d+[.)])?\s*)(.*?)(\s*)$/
function split(text) {
  return String(text).split('\n').map((raw) => {
    const [, pre, core, post] = raw.match(LINE)
    return /\p{L}/u.test(core) ? { pre, core, post } : { raw }
  })
}

export function useTr(text, on = true) {
  const { lang } = useI18n()
  const [, bump] = useState(0)
  useEffect(() => {
    const fn = () => bump((x) => x + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  const active = on && !!text && String(text).trim() !== ''
  useEffect(() => {
    if (active) split(text).forEach((l) => l.core && request(l.core, lang))
  }, [text, lang, active])
  if (!active) return { text, translated: false }
  let translated = false
  const out = split(text).map((l) => {
    if (l.raw != null) return l.raw
    const tr = mem.get(k(lang, l.core))
    if (tr && tr !== l.core) translated = true
    return l.pre + (tr || l.core) + l.post
  }).join('\n')
  return { text: out, translated }
}

// <Tx text={…} /> shows the text in the viewer's language.
// With `orig`, a small button lets the viewer switch to the original wording.
export function Tx({ text, on = true, orig = false }) {
  const { t } = useI18n()
  const r = useTr(text, on)
  const [showOrig, setShowOrig] = useState(false)
  if (!orig || !r.translated) return <>{r.text}</>
  return (
    <>
      {showOrig ? text : r.text}
      {' '}<button type="button" className="tr-toggle" onClick={(e) => { e.stopPropagation(); setShowOrig(!showOrig) }}>
        {showOrig ? t('tr.showTranslation') : t('tr.showOriginal')}
      </button>
    </>
  )
}

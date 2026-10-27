import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { LANGS, useI18n } from '../i18n.jsx'

/* ---------- Toast ---------- */
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null)
  const timer = useRef()
  const show = useCallback((text, kind = 'ok') => {
    setMsg({ text, kind }); clearTimeout(timer.current)
    timer.current = setTimeout(() => setMsg(null), kind === 'err' ? 5000 : 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className={`toast ${msg.kind === 'err' ? 'err' : ''}`} role="status">{msg.text}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

// Wraps a Supabase call: shows a translated error toast and returns null on failure.
export function useRun() {
  const toast = useToast()
  const { t } = useI18n()
  return useCallback(async (promise) => {
    const { data, error } = await promise
    if (error) { toast(t('common.errorGeneric', { msg: error.message }), 'err'); return { ok: false } }
    return { ok: true, data }
  }, [toast, t])
}

/* ---------- Modal ---------- */
export function Modal({ open, title, onClose, children, wide }) {
  const ref = useRef()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} className={wide ? 'wide' : ''} onCancel={(e) => { e.preventDefault(); onClose() }}>
      {open && (
        <>
          <div className="modal-h"><h2>{title}</h2><button className="chip" onClick={onClose} aria-label="Close"><X size={14} /></button></div>
          {children}
        </>
      )}
    </dialog>
  )
}

/* ---------- Bits ---------- */
export function Logo({ trainer, big }) {
  const src = trainer?.logo_url || '/logo.png'
  return <div className={`mark ${big ? 'big' : ''}`}><img src={src} alt={trainer?.brand_name || 'Logo'} /></div>
}

// Brand name as a wordmark: "TRAINWITH" + last word in the accent colour ("KYRI")
export function Wordmark({ trainer, size }) {
  const words = String(trainer?.brand_name || '').toUpperCase().split(/\s+/).filter(Boolean)
  const last = words.pop() || ''
  return <span className={`wordmark ${size || ''}`}>{words.join('')}<em>{last}</em></span>
}

export function LangSwitch({ onChange }) {
  const { lang, setLang } = useI18n()
  return (
    <div className="seg" role="group" aria-label="Language">
      {LANGS.map((l) => (
        <button key={l.code} aria-pressed={lang === l.code} title={l.label}
          onClick={() => { setLang(l.code); onChange?.(l.code) }}>{l.short}</button>
      ))}
    </div>
  )
}

// true on phone-sized screens; updates when the window is resized
export function useIsMobile(query = '(max-width: 760px)') {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false)
  const [m, setM] = useState(get)
  useEffect(() => {
    if (!window.matchMedia) return
    const mq = window.matchMedia(query)
    const on = () => setM(mq.matches)
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on)
    return () => (mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on))
  }, [query])
  return m
}

export function Spinner() { return <div className="spin" aria-label="Loading" /> }

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

// Online session length for the trainer: "52:23 · planned ~40" — orange when it's way off the plan (±25 %)
export function Duration({ w }) {
  const { t } = useI18n()
  const sec = w.seconds ?? (w.minutes || 0) * 60
  const min = Math.round(sec / 60)
  const txt = w.seconds ? `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` : `${min} ${t('common.minutes')}`
  const off = w.planned_minutes && Math.abs(min - w.planned_minutes) > w.planned_minutes * 0.25
  return (
    <span className={off ? 'dur-off' : ''}>{txt}{w.planned_minutes ? ` (${t('overview.planned', { n: w.planned_minutes })})` : ''}</span>
  )
}

// Time as two dropdowns (hour 00–23, minute in 5-min steps). The browser's own time field shows
// AM/PM in some languages (e.g. Greek "πμ/μμ") and is hard to change on a Mac – this always works.
export function TimeSelect({ id, value, onChange }) {
  const [h = '18', m = '00'] = String(value || '18:00').split(':')
  const mins = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
  if (!mins.includes(m)) mins.push(m)
  mins.sort()
  return (
    <span className="time-select">
      <select id={id} aria-label="hh" value={h} onChange={(e) => onChange(`${e.target.value}:${m}`)}>
        {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')).map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <b>:</b>
      <select aria-label="mm" value={m} onChange={(e) => onChange(`${h}:${e.target.value}`)}>
        {mins.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  )
}

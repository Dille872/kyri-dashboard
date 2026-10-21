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

export function Spinner() { return <div className="spin" aria-label="Loading" /> }

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true } catch { return false }
}

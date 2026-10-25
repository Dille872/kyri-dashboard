import { useState } from 'react'
import { Eye, EyeOff, KeyRound } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { LangSwitch, Logo, Wordmark, useToast } from './ui.jsx'

export const MIN_PW = 8
const FLAG = 'coach-want-pw'   // set when the user asked for a link to (re)set the password

export const wantPw = {
  set: () => { try { localStorage.setItem(FLAG, '1') } catch {} },
  get: () => { try { return localStorage.getItem(FLAG) === '1' } catch { return false } },
  clear: () => { try { localStorage.removeItem(FLAG) } catch {} },
}

// How the current session was opened: 'password', 'otp', 'magiclink', …  (from the access token)
export function signInMethod(session) {
  try {
    const p = JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    const amr = Array.isArray(p.amr) ? p.amr : []
    return amr.length ? amr[amr.length - 1].method : null
  } catch { return null }
}

// Ask for a password after signing in with the email link – the first time, or after "forgot password".
export function needsPassword(session) {
  const m = signInMethod(session)
  if (!m || m === 'password') return false
  return !session.user?.user_metadata?.pw_set || wantPw.get()
}

export function PasswordForm({ onDone, submitLabel }) {
  const { t } = useI18n()
  const toast = useToast()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const tooShort = pw.length > 0 && pw.length < MIN_PW
  const mismatch = pw2.length > 0 && pw !== pw2

  async function save(e) {
    e.preventDefault()
    if (pw.length < MIN_PW || pw !== pw2) return
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw, data: { pw_set: true } })
    setBusy(false)
    if (error) return toast(t('pw.error', { msg: error.message }), 'err')
    wantPw.clear()
    toast(t('pw.saved'))
    onDone?.()
  }

  return (
    <form className="form" onSubmit={save}>
      <label className="f" htmlFor="pw-new">{t('pw.new')}
        <span className="pw-wrap">
          <input id="pw-new" type={show ? 'text' : 'password'} autoComplete="new-password" required minLength={MIN_PW} value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? t('pw.hide') : t('pw.show')}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </span>
        <small style={tooShort ? { color: 'var(--bad)' } : undefined}>{t('pw.rule', { n: MIN_PW })}</small>
      </label>
      <label className="f" htmlFor="pw-new2">{t('pw.repeat')}
        <input id="pw-new2" type={show ? 'text' : 'password'} autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
        {mismatch && <small style={{ color: 'var(--bad)' }}>{t('pw.mismatch')}</small>}
      </label>
      <button className="btn block" disabled={busy || pw.length < MIN_PW || pw !== pw2}><KeyRound />{submitLabel || t('pw.save')}</button>
    </form>
  )
}

// Full screen right after the first sign-in with the email link.
export function SetPasswordScreen({ onDone, onLater }) {
  const { t } = useI18n()
  return (
    <div className="mobile login">
      <div className="topbar" style={{ justifyContent: 'flex-end' }}><LangSwitch /></div>
      <Logo big />
      <div className="center"><Wordmark trainer={{ brand_name: import.meta.env.VITE_BRAND_NAME || 'Train with Kyri' }} size="xl" /></div>
      <div className="hello center">{t('pw.title')}</div>
      <p className="meta center" style={{ margin: 0 }}>{t('pw.why')}</p>
      <PasswordForm onDone={onDone} />
      <button type="button" className="btn ghost block" onClick={onLater}>{t('pw.later')}</button>
    </div>
  )
}

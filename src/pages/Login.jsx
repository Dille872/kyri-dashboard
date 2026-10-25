import { useState } from 'react'
import { Mail, LogIn, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { LangSwitch, Logo, Wordmark, useToast } from '../components/ui.jsx'
import { wantPw } from '../components/SetPassword.jsx'

// Sign in with email + password. First time / forgot password: a link (or 6-digit code) by email,
// after which the app asks for a password.
export default function Login() {
  const { t } = useI18n()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [mode, setMode] = useState('pw')        // 'pw' | 'link' | 'sent'
  const [why, setWhy] = useState('first')       // 'first' | 'forgot'
  const [code, setCode] = useState('')
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  async function signInPw(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) toast(t('login.wrongPassword2'), 'err')
  }

  function toLink(kind) { setWhy(kind); setMode('link') }

  async function send(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    setBusy(false)
    if (error) return toast(t('common.errorGeneric', { msg: error.message }), 'err')
    if (why === 'forgot') wantPw.set()
    setMode('sent')
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) toast(t('login.invalidCode'), 'err')
  }

  const emailField = (id) => (
    <label className="f" htmlFor={id}>{t('login.email')}
      <input id={id} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
    </label>
  )

  return (
    <div className="mobile login">
      <div className="topbar" style={{ justifyContent: 'flex-end' }}><LangSwitch /></div>
      <Logo big />
      {/* before sign-in the trainer isn't known yet: brand from .env (VITE_BRAND_NAME), default Train with Kyri */}
      <div className="center"><Wordmark trainer={{ brand_name: import.meta.env.VITE_BRAND_NAME || 'Train with Kyri' }} size="xl" /></div>

      {mode === 'pw' && (
        <form className="form" onSubmit={signInPw}>
          <div className="hello center">{t('login.welcome')}</div>
          {emailField('pw-email')}
          <label className="f" htmlFor="pw-pass">{t('login.password')}
            <span className="pw-wrap">
              <input id="pw-pass" type={show ? 'text' : 'password'} autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
              <button type="button" className="pw-eye" onClick={() => setShow(!show)} aria-label={show ? t('pw.hide') : t('pw.show')}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
          <button className="btn block" disabled={busy}><LogIn />{t('login.signIn')}</button>
          <div className="login-links">
            <button type="button" className="linkish" onClick={() => toLink('first')}>{t('login.firstTime')}</button>
            <button type="button" className="linkish" onClick={() => toLink('forgot')}>{t('login.forgot')}</button>
          </div>
        </form>
      )}

      {mode === 'link' && (
        <form className="form" onSubmit={send}>
          <div className="hello center">{why === 'forgot' ? t('login.forgotTitle') : t('login.firstTitle')}</div>
          <p className="meta center" style={{ margin: 0 }}>{why === 'forgot' ? t('login.forgotBody') : t('login.firstBody')}</p>
          {emailField('login-email')}
          <button className="btn block" disabled={busy}><Mail />{t('login.send')}</button>
          <button type="button" className="btn ghost block" onClick={() => setMode('pw')}>{t('login.backToPw')}</button>
        </form>
      )}

      {mode === 'sent' && (
        <form className="form" onSubmit={verify}>
          <div className="circle"><Mail /></div>
          <div className="hello center">{t('login.sentTitle')}</div>
          <p className="meta center" style={{ margin: 0 }}>{t('login.sentBody', { email })}</p>
          <label className="f" htmlFor="login-code">{t('login.codeLabel')}
            <input id="login-code" className="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button className="btn block" disabled={busy || code.length < 6}>{t('login.verify')}</button>
          <button type="button" className="btn ghost block" onClick={() => { setMode('link'); setCode('') }}>{t('login.otherEmail')}</button>
        </form>
      )}
    </div>
  )
}

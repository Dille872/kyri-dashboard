import { useState } from 'react'
import { Mail } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { LangSwitch, Logo, useToast } from '../components/ui.jsx'

export default function Login() {
  const { t } = useI18n()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [usePw, setUsePw] = useState(false)
  const [pw, setPw] = useState('')
  const pwAllowed = import.meta.env.VITE_PASSWORD_LOGIN === 'true'

  async function send(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin, shouldCreateUser: true },
    })
    setBusy(false)
    if (error) return toast(t('common.errorGeneric', { msg: error.message }), 'err')
    setSent(true)
  }

  async function signInPw(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) toast(t('login.wrongPassword'), 'err')
  }

  async function verify(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) toast(t('login.invalidCode'), 'err')
  }

  return (
    <div className="mobile login">
      <div className="topbar" style={{ justifyContent: 'flex-end' }}><LangSwitch /></div>
      <Logo big />
      {usePw ? (
        <form className="form" onSubmit={signInPw}>
          <div className="hello center">{t('login.welcome')}</div>
          <label className="f" htmlFor="pw-email">{t('login.email')}
            <input id="pw-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="f" htmlFor="pw-pass">{t('login.password')}
            <input id="pw-pass" type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
          </label>
          <button className="btn block" disabled={busy}>{t('login.signIn')}</button>
          <button type="button" className="btn ghost block" onClick={() => setUsePw(false)}>{t('login.withLink')}</button>
        </form>
      ) : !sent ? (
        <form className="form" onSubmit={send}>
          <div className="hello center">{t('login.welcome')}</div>
          <p className="meta center" style={{ margin: 0 }}>{t('login.subtitle')}</p>
          <label className="f" htmlFor="login-email">{t('login.email')}
            <input id="login-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="btn block" disabled={busy}><Mail />{t('login.send')}</button>
          {pwAllowed && <button type="button" className="btn ghost block" onClick={() => setUsePw(true)}>{t('login.withPassword')}</button>}
        </form>
      ) : (
        <form className="form" onSubmit={verify}>
          <div className="circle"><Mail /></div>
          <div className="hello center">{t('login.sentTitle')}</div>
          <p className="meta center" style={{ margin: 0 }}>{t('login.sentBody', { email })}</p>
          <label className="f" htmlFor="login-code">{t('login.codeLabel')}
            <input id="login-code" className="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <button className="btn block" disabled={busy || code.length < 6}>{t('login.verify')}</button>
          <button type="button" className="btn ghost block" onClick={() => { setSent(false); setCode('') }}>{t('login.otherEmail')}</button>
        </form>
      )}
    </div>
  )
}

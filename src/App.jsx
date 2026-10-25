import { useEffect, useState } from 'react'
import { supabase, configured } from './supabase.js'
import { useI18n } from './i18n.jsx'
import { Spinner } from './components/ui.jsx'
import Login from './pages/Login.jsx'
import NoAccess from './pages/NoAccess.jsx'
import AdminApp from './pages/admin/AdminApp.jsx'
import ClientApp from './pages/client/ClientApp.jsx'
import { SetPasswordScreen, needsPassword, wantPw } from './components/SetPassword.jsx'

export default function App() {
  const [session, setSession] = useState(undefined)   // undefined = still checking
  const [access, setAccess] = useState(null)
  const [pwLater, setPwLater] = useState(false)

  useEffect(() => {
    if (!configured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) { setAccess(null); return }
    let alive = true
    supabase.rpc('claim_access').then(({ data, error }) => {
      if (!alive) return
      setAccess(error ? { admin_of: [], client_of: [], error: error.message } : data)
    })
    return () => { alive = false }
  }, [session?.user?.id])

  if (!configured) return <SetupHint />
  if (session === undefined || (session && !access)) return <Spinner />
  if (!session) return <Login />

  const signOut = () => supabase.auth.signOut()
  const hasAccess = access.admin_of?.length || access.client_of?.length
  if (hasAccess && !pwLater && needsPassword(session))
    return <SetPasswordScreen onDone={() => setPwLater(true)} onLater={() => { wantPw.clear(); setPwLater(true) }} />
  if (access.admin_of?.length) return <AdminApp trainerId={access.admin_of[0]} user={session.user} signOut={signOut} />
  if (access.client_of?.length) return <ClientApp clientId={access.client_of[0].client_id} trainerId={access.client_of[0].trainer_id} signOut={signOut} />
  return <NoAccess email={session.user.email} signOut={signOut} />
}

function SetupHint() {
  const { t } = useI18n()
  return (
    <div className="mobile login">
      <div className="notice">
        <b>Setup needed.</b> Copy <code>.env.example</code> to <code>.env.local</code> and add your Supabase URL and anon key, then restart <code>npm run dev</code>.
      </div>
      <p className="meta center">{t('common.loading')}</p>
    </div>
  )
}

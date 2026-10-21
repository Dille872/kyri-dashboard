import { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, CalendarDays, Users, Dumbbell, CreditCard, Settings as Cog, LogOut } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { LangSwitch, Logo, Spinner, useRun } from '../../components/ui.jsx'
import Overview from './Overview.jsx'
import Calendar from './Calendar.jsx'
import Clients from './Clients.jsx'
import Payments from './Payments.jsx'
import Programs from './Programs.jsx'
import Settings from './Settings.jsx'

const VIEWS = ['overview', 'calendar', 'clients', 'programs', 'payments', 'settings']
const ICONS = { overview: LayoutGrid, calendar: CalendarDays, clients: Users, programs: Dumbbell, payments: CreditCard, settings: Cog }
const PAGES = { overview: Overview, calendar: Calendar, clients: Clients, programs: Programs, payments: Payments, settings: Settings }

function viewFromHash() {
  const h = window.location.hash.replace('#', '')
  return VIEWS.includes(h) ? h : 'overview'
}

export default function AdminApp({ trainerId, user, signOut }) {
  const { t } = useI18n()
  const run = useRun()
  const [view, setView] = useState(viewFromHash)
  const [data, setData] = useState(null)

  const reload = useCallback(async () => {
    const [tr, pk, cl, pend] = await Promise.all([
      run(supabase.from('trainers').select('*').eq('id', trainerId).single()),
      run(supabase.from('packages').select('*').eq('trainer_id', trainerId).order('sort').order('name')),
      run(supabase.from('clients').select('*').eq('trainer_id', trainerId).order('name')),
      run(supabase.from('payments').select('*').eq('trainer_id', trainerId).eq('status', 'reported').order('reported_at', { ascending: false })),
    ])
    if (tr.ok) setData({ trainer: tr.data, packages: pk.data || [], clients: cl.data || [], pending: pend.data || [] })
  }, [trainerId, run])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => { if (data?.trainer) document.title = data.trainer.brand_name }, [data?.trainer])

  const go = (v, opts) => {
    if (opts?.client) { try { sessionStorage.setItem('programs-client', opts.client) } catch {} }
    window.location.hash = v; setView(v); window.scrollTo(0, 0)
  }

  if (!data) return <Spinner />
  const Page = PAGES[view]
  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <Logo trainer={data.trainer} />
          <div><b>{data.trainer.brand_name}</b><small>{t('nav.coachDashboard')}</small></div>
        </div>
        <nav className="nav">
          {VIEWS.map((v) => {
            const Icon = ICONS[v]
            return (
              <button key={v} aria-current={view === v} onClick={() => go(v)}>
                <Icon /><span>{t(`nav.${v}`)}</span>
                {v === 'payments' && data.pending.length > 0 && <span className="badge">{data.pending.length}</span>}
              </button>
            )
          })}
        </nav>
        <div className="side-foot">
          {data.trainer.tagline && <div className="motto">{data.trainer.tagline}</div>}
          <LangSwitch />
          <div className="who meta" style={{ overflowWrap: 'anywhere' }}>{user.email}</div>
          <button className="chip" onClick={signOut} title={t('common.signOut')}><LogOut size={14} style={{ verticalAlign: '-2px' }} /> <span className="who">{t('common.signOut')}</span></button>
        </div>
      </aside>
      <main>
        <Page data={data} reload={reload} go={go} trainerId={trainerId} />
      </main>
    </div>
  )
}

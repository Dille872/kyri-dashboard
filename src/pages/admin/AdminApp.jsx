import { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, CalendarDays, Users, Dumbbell, CreditCard, Settings as Cog, LogOut, Menu, ChevronRight } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { LANGS, useI18n } from '../../i18n.jsx'
import { LangSwitch, Logo, Spinner, Wordmark, useIsMobile, useRun } from '../../components/ui.jsx'
import Overview from './Overview.jsx'
import Calendar from './Calendar.jsx'
import Clients from './Clients.jsx'
import Payments from './Payments.jsx'
import Programs from './Programs.jsx'
import Settings from './Settings.jsx'

// v2: weekly planning and online plans are replaced by Programs
const VIEWS = ['overview', 'calendar', 'clients', 'programs', 'payments', 'settings', 'more']
const SIDE = ['overview', 'calendar', 'clients', 'programs', 'payments', 'settings']
const TABS = ['overview', 'calendar', 'clients', 'payments', 'more']       // bottom bar on phones
const ICONS = { overview: LayoutGrid, calendar: CalendarDays, clients: Users, programs: Dumbbell, payments: CreditCard, settings: Cog, more: Menu }
const PAGES = { overview: Overview, calendar: Calendar, clients: Clients, programs: Programs, payments: Payments, settings: Settings }

function viewFromHash() {
  const h = window.location.hash.replace('#', '')
  return VIEWS.includes(h) ? h : 'overview'
}

export default function AdminApp({ trainerId, user, signOut }) {
  const { t } = useI18n()
  const run = useRun()
  const mobile = useIsMobile()
  const [view, setView] = useState(viewFromHash)
  const [data, setData] = useState(null)

  const reload = useCallback(async () => {
    const [tr, pk, cl, pend, ren] = await Promise.all([
      run(supabase.from('trainers').select('*').eq('id', trainerId).single()),
      run(supabase.from('packages').select('*').eq('trainer_id', trainerId).order('sort').order('name')),
      run(supabase.from('clients').select('*').eq('trainer_id', trainerId).order('name')),
      run(supabase.from('payments').select('*').eq('trainer_id', trainerId).eq('status', 'reported').order('reported_at', { ascending: false })),
      run(supabase.from('renewal_requests').select('*').eq('trainer_id', trainerId).eq('status', 'pending').order('created_at')),
    ])
    if (tr.ok) setData({ trainer: tr.data, packages: pk.data || [], clients: cl.data || [], pending: pend.data || [], renewals: ren.data || [] })
  }, [trainerId, run])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => { if (data?.trainer) document.title = data.trainer.brand_name }, [data?.trainer])
  // "More" only exists on phones
  useEffect(() => { if (!mobile && view === 'more') setView('overview') }, [mobile, view])

  const go = (v, opts) => {
    if (opts?.client) { try { sessionStorage.setItem('programs-client', opts.client) } catch {} }
    if (opts?.profile) { try { sessionStorage.setItem('clients-profile', opts.profile) } catch {} }
    window.location.hash = v; setView(v); window.scrollTo(0, 0)
  }

  if (!data) return <Spinner />
  const badge = (v) => v === 'payments' && data.pending.length > 0 && <span className="badge">{data.pending.length}</span>
  const Page = PAGES[view]
  const tabActive = (v) => view === v || (v === 'more' && ['programs', 'settings', 'more'].includes(view))

  if (mobile) return (
    <div className="mapp">
      <header className="mtop">
        <Logo trainer={data.trainer} />
        <div className="mtop-txt"><b><Wordmark trainer={data.trainer} /></b><small>{t(`nav.${view}`)}</small></div>
      </header>
      <main className="mmain">
        {view === 'more'
          ? <More data={data} user={user} go={go} signOut={signOut} />
          : <Page data={data} reload={reload} go={go} trainerId={trainerId} />}
      </main>
      <nav className="tabbar">
        {TABS.map((v) => {
          const Icon = ICONS[v]
          return (
            <button key={v} aria-current={tabActive(v)} onClick={() => go(v)}>
              <span className="tab-ic"><Icon />{badge(v)}</span>
              <span>{t(`nav.${v}`)}</span>
            </button>
          )
        })}
      </nav>
    </div>
  )

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <Logo trainer={data.trainer} />
          <div><b><Wordmark trainer={data.trainer} /></b><small>{t('nav.coachDashboard')}</small></div>
        </div>
        <nav className="nav">
          {SIDE.map((v) => {
            const Icon = ICONS[v]
            return (
              <button key={v} aria-current={view === v} onClick={() => go(v)}>
                <Icon /><span>{t(`nav.${v}`)}</span>{badge(v)}
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

// Phone-only menu: the pages that don't fit in the bottom bar, plus language and sign-out
function More({ data, user, go, signOut }) {
  const { t, lang, setLang } = useI18n()
  return (
    <div className="grid" style={{ gap: 14 }}>
      <section className="panel" style={{ padding: 6 }}>
        {['programs', 'settings'].map((v) => {
          const Icon = ICONS[v]
          return (
            <button key={v} className="menu-row" onClick={() => go(v)}>
              <Icon /><span>{t(`nav.${v}`)}</span><ChevronRight className="chev" />
            </button>
          )
        })}
      </section>
      <section className="panel">
        <h2 style={{ marginBottom: 12 }}>{t('common.language')}</h2>
        <div className="grid" style={{ gap: 8 }}>
          {LANGS.map((l) => (
            <button key={l.code} className="choice" aria-pressed={lang === l.code} onClick={() => setLang(l.code)}>
              <b>{l.label}</b>{lang === l.code && <span className="pill ok">✓</span>}
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <div className="meta" style={{ overflowWrap: 'anywhere', marginBottom: 12 }}>{user.email}</div>
        <button className="btn ghost block" onClick={signOut}><LogOut />{t('common.signOut')}</button>
      </section>
      {data.trainer.tagline && <div className="motto center">{data.trainer.tagline}</div>}
    </div>
  )
}

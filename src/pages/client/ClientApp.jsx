import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, Copy, LogOut, Video, CalendarPlus, X, MessageCircle, PackagePlus, ScrollText, Bell, Home, CalendarDays, CreditCard, User, ChevronRight, ShieldCheck } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { LANGS } from '../../i18n.jsx'
import { Logo, Modal, Spinner, Wordmark, copyText, useRun, useToast } from '../../components/ui.jsx'
import { calendarEvent, downloadIcs, googleCalendarUrl, whatsappUrl } from '../../lib/calendar.js'
import { fmtDate, fmtDateTime, money, payState, sessionsLeft, ymd } from '../../lib/format.js'
import { packStatus } from '../../lib/pack.js'
import { ParqScreen, RulesScreen } from './Onboarding.jsx'
import OnlineSession, { TodayCard } from './OnlineSession.jsx'
import { MethodTag } from '../admin/Payments.jsx'
import PrivacyText from '../../components/Privacy.jsx'

export default function ClientApp({ clientId, trainerId, signOut }) {
  const { t, locale, lang, setLang } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [d, setD] = useState(null)
  const [screen, setScreen] = useState('home')   // home | pay | sent | session
  const [rulesOpen, setRulesOpen] = useState(false)
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [tab, setTab] = useState('home')          // home | sessions | money | profile
  const [busy, setBusy] = useState(false)
  const [cancelFor, setCancelFor] = useState(null)    // session to cancel
  const [calFor, setCalFor] = useState(null)          // session to add to calendar
  const [renewOpen, setRenewOpen] = useState(false)
  const [pickPkg, setPickPkg] = useState(null)

  const load = useCallback(async () => {
    const now = new Date().toISOString()
    const [tr, cl, se, pa, past, pk, rn, prep, st] = await Promise.all([
      run(supabase.from('trainers').select('*').eq('id', trainerId).single()),
      run(supabase.from('clients').select('*').eq('id', clientId).single()),
      run(supabase.from('sessions').select('*').eq('client_id', clientId).eq('status', 'planned').gte('starts_at', now).order('starts_at').limit(30)),
      run(supabase.from('payments').select('*').eq('client_id', clientId).order('reported_at', { ascending: false }).limit(20)),
      // past sessions Kyri hasn't ticked yet still count against the pack
      run(supabase.from('sessions').select('id').eq('client_id', clientId).eq('status', 'planned').lt('starts_at', now).limit(50)),
      run(supabase.from('packages').select('*').eq('trainer_id', trainerId).eq('active', true).order('sort')),
      run(supabase.from('renewal_requests').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).limit(1)),
      supabase.rpc('workout_prep', { p_client: clientId }),
      supabase.rpc('my_stats', { p_client: clientId }),
    ])
    if (tr.ok && cl.ok) setD({ trainer: tr.data, client: cl.data, upcoming: se.data || [], payments: pa.data || [],
      pastPlanned: (past.data || []).length, packages: pk.data || [], renewal: (rn.data || [])[0] || null, prep: prep.data || null, stats: st.data || null })
  }, [clientId, trainerId, run])
  useEffect(() => { load() }, [load])

  // first visit: use the language the trainer set for this client
  useEffect(() => {
    if (!d) return
    let chosen = null
    try { chosen = localStorage.getItem('coach-lang') } catch {}
    if (!chosen && d.client.lang) setLang(d.client.lang)
    document.title = d.trainer.brand_name
  }, [d?.client?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!d) return <Spinner />
  const { trainer, client, upcoming, payments, packages, renewal, prep } = d
  const sessions = upcoming.slice(0, 5)
  const online = client.mode && client.mode !== 'gym'
  const wa = whatsappUrl(trainer.phone)
  const cancelHours = trainer.cancel_hours ?? 24
  const isLate = (s) => new Date(s.starts_at).getTime() - Date.now() < cancelHours * 3600000
  const placeOf = (s) => (s.format === 'online' ? (s.meeting_url || t('formats.online')) : s.location || '')
  async function cancelSession() {
    setBusy(true)
    const r = await run(supabase.rpc('client_cancel_session', { p_session: cancelFor.id }))
    setBusy(false)
    if (r.ok) { toast(r.data === 'late_cancel' ? t('client.cancelledLate') : t('client.cancelledFree')); setCancelFor(null); load() }
  }
  async function requestRenewal() {
    if (!pickPkg) return
    setBusy(true)
    const r = await run(supabase.rpc('request_renewal', { p_client: client.id, p_package: pickPkg }))
    setBusy(false)
    if (r.ok) { toast(t('client.renewSent', { trainer: (trainer.owner_name || trainer.brand_name).split(' ')[0] })); setRenewOpen(false); load() }
  }
  const trainerName = (trainer.owner_name || trainer.brand_name).split(' ')[0]
  const first = client.name.split(' ')[0]
  const pending = payments.find((p) => p.status === 'reported')
  const lastDecided = payments.find((p) => p.status !== 'reported')
  const state = payState(client, pending ? new Set([client.id]) : null, ymd())
  // past sessions Kyri hasn't ticked yet will still count, so the client sees what's really left
  const left = sessionsLeft(client) == null ? null : Math.max(sessionsLeft(client) - d.pastPlanned, 0)
  const pack = packStatus(client, { pastPlanned: d.pastPlanned, upcoming, reminderDays: trainer.reminder_days ?? 2 })
  const reference = `${client.name}`

  async function report(method) {
    setBusy(true)
    const r = await run(supabase.rpc('report_payment', { p_client: client.id, p_method: method }))
    setBusy(false)
    if (r.ok) { setScreen('sent'); load() }
  }
  const copy = async (v) => toast((await copyText(v)) ? t('common.copied') : v)

  const pickLang = (l) => { setLang(l); supabase.rpc('set_my_lang', { p_lang: l }).then(() => {}) }
  const top = (
    <div className="topbar">
      <button className="brand home-link" onClick={() => { setScreen('home'); setTab('home'); window.scrollTo(0, 0) }} aria-label={t('app.home')}>
        <img className="brand-mark" src={trainer.logo_url || '/logo.png'} alt="" /><Wordmark trainer={trainer} /></button>
      <div className="seg lang-mini" role="group" aria-label={t('common.language')}>
        {LANGS.map((l) => <button key={l.code} aria-pressed={lang === l.code} onClick={() => pickLang(l.code)}>{l.short}</button>)}
      </div>
    </div>
  )

  // first sign-in: health questions, then the rules
  if (!client.parq_at && (trainer.parq_questions || []).length) return <ParqScreen client={client} trainer={trainer} top={top} onDone={load} />
  if (!client.rules_accepted_at && trainer.rules_text) return <RulesScreen client={client} trainer={trainer} top={top} onDone={load} />

  if (screen === 'session' && online && prep) return (
    <OnlineSession client={client} trainer={trainer} prep={prep} onExit={() => setScreen('home')} onSent={() => { setScreen('home'); load() }} />
  )

  if (screen === 'pay') return (
    <div className="mobile">
      {top}
      <button className="chip" style={{ alignSelf: 'flex-start' }} onClick={() => setScreen('home')}>{t('common.back')}</button>
      <div className="card"><div className="lab">{t('client.amountDue')}</div><div className="huge">{money(client.price, locale)}</div>
        <div className="meta">{client.next_due_date ? t('payState.dueOn', { date: fmtDate(client.next_due_date, locale) }) : ''}</div></div>
      {trainer.revolut_url && (
        <a className="btn block rev" href={trainer.revolut_url} target="_blank" rel="noopener noreferrer">{t('client.payRevolut')}</a>
      )}
      {trainer.iban && (
        <>
          <div className="or">{t('client.orBank')}</div>
          <div className="card bank">
            {trainer.account_name && <><span className="k">{t('client.accountName')}</span><span className="v">{trainer.account_name}</span><button className="chip" onClick={() => copy(trainer.account_name)}><Copy size={12} /></button></>}
            <span className="k">{t('client.iban')}</span><span className="v">{trainer.iban}</span><button className="chip" onClick={() => copy(trainer.iban.replace(/\s/g, ''))}><Copy size={12} /></button>
            {trainer.bic && <><span className="k">{t('client.bic')}</span><span className="v">{trainer.bic}</span><button className="chip" onClick={() => copy(trainer.bic)}><Copy size={12} /></button></>}
            <span className="k">{t('client.reference')}</span><span className="v">{reference}</span><button className="chip" onClick={() => copy(reference)}><Copy size={12} /></button>
          </div>
        </>
      )}
      {trainer.revolut_url && <button className="btn block ghost" disabled={busy} onClick={() => report('revolut')}><Check />{t('client.iPaid')} · Revolut</button>}
      {trainer.iban && <button className="btn block ghost" disabled={busy} onClick={() => report('bank')}><Check />{t('client.iPaid')} · {t('methods.bank')}</button>}
      <p className="meta center" style={{ margin: 0 }}>{t('client.cashHint')}</p>
    </div>
  )

  if (screen === 'sent') return (
    <div className="mobile">
      {top}
      <div className="circle"><Clock /></div>
      <div className="hello center">{t('client.sentTitle', { name: first })}</div>
      <p className="meta center" style={{ margin: 0 }}>{t('client.sentBody', { trainer: trainerName })}</p>
      <button className="btn block ghost" onClick={() => setScreen('home')}>{t('client.home')}</button>
    </div>
  )

  const renew = () => { setPickPkg(client.package_id || packages[0].id); setRenewOpen(true) }
  const st = d.stats || {}
  const go = (x) => { setTab(x); window.scrollTo(0, 0) }
  const sessionRow = (s) => (
    <div className="row" key={s.id} style={{ padding: '10px 0' }}>
      <div style={{ minWidth: 0 }}><div className="name">{fmtDateTime(s.starts_at, locale)}</div>
        <div className="meta">{s.format === 'online' ? t('formats.online') : t(`kinds.${s.kind}`)}{s.location ? ` · ${s.location}` : ''}</div></div>
      <div className="acts" style={{ flexWrap: 'nowrap' }}>
        <button className="icon-btn" style={{ width: 38, height: 38 }} onClick={() => setCalFor(s)} aria-label={t('client.addCal')} title={t('client.addCal')}><CalendarPlus /></button>
        <button className="icon-btn" style={{ width: 38, height: 38 }} onClick={() => setCancelFor(s)} aria-label={t('client.cancel')} title={t('client.cancel')}><X /></button>
      </div>
    </div>
  )
  const packCard = (
    <div className="card">
      <div className="lab">{t('client.package')}</div>
      {left == null ? <div className="big">{t('client.unlimited')}</div> : (
        <><div className="big">{t('client.left', { left, total: client.sessions_total })}</div>
          <div className="bar full"><i style={{ width: `${Math.min(100, (left / Math.max(client.sessions_total, 1)) * 100)}%` }} /></div></>
      )}
      {renewal?.status === 'pending' ? (
        <div className="pill info" style={{ marginTop: 12 }}>{t('client.renewPending', { trainer: trainerName })}</div>
      ) : ((left != null && left <= 2) || pack) && packages.length > 0 ? (
        <button className="btn block" style={{ marginTop: 12 }} onClick={renew}><PackagePlus />{t('client.renew')}</button>
      ) : null}
    </div>
  )
  const payCard = (
    <div className="card">
      <div className="lab">{t('client.nextPayment')}</div>
      {pending ? (
        <><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <div className="big">{money(pending.amount, locale)}</div><span className="pill info">{t('client.waiting')}</span></div>
          <p className="meta" style={{ margin: '8px 0 0' }}>{t('client.waitingBody', { trainer: trainerName })}</p></>
      ) : client.next_due_date ? (
        <><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            <div className="big">{money(client.price, locale)}</div>
            <span className={`pill ${state.cls}`}>{t(`payState.${state.key}`, { n: state.n, date: fmtDate(state.date, locale) })}</span></div>
          {lastDecided?.status === 'rejected' && <p className="meta" style={{ margin: '8px 0 0' }}>{t('client.rejected', { trainer: trainerName })}</p>}
          {(trainer.revolut_url || trainer.iban) && <button className="btn block" style={{ marginTop: 12 }} onClick={() => setScreen('pay')}>{t('client.payNow')}</button>}</>
      ) : <div className="meta" style={{ marginTop: 6 }}>{t('client.nothingDue')}</div>}
    </div>
  )

  return (
    <div className="mobile capp">
      {top}

      {tab === 'home' && (
        <>
          <div className="welcome">
            <div><div className="meta">{t('app.welcome')}</div><div className="hello">{first}</div></div>
            {st.week_target != null && (
              <div className="week-bars" aria-label={`${t('app.thisWeek')}: ${st.week_done} / ${st.week_target}`}>
                <div className="meta">{t('app.thisWeek')}</div>
                <div className="wb" aria-hidden="true">{Array.from({ length: Math.min(st.week_target, 7) }, (_, i) => <i key={i} className={i < st.week_done ? 'on' : ''} />)}</div>
                <b>{st.week_done} / {st.week_target}</b>
              </div>
            )}
          </div>

          {pack && (pack.remind || pack.kind === 'used') && renewal?.status !== 'pending' && (
            <div className="card pack-alert">
              <Bell size={18} style={{ flex: 'none', marginTop: 2 }} />
              <div style={{ minWidth: 0 }}>
                <div className="name">{pack.kind === 'last' ? t('pack.lastTitle') : pack.kind === 'used' ? t('pack.used') : pack.left === 1 ? t('pack.oneLeft') : t('pack.fewLeft', { n: pack.left })}</div>
                {pack.kind === 'last' && <div className="meta">{t('pack.lastBody', { when: fmtDateTime(pack.session.starts_at, locale) })}</div>}
                {packages.length > 0 && <button className="btn small" style={{ marginTop: 10 }} onClick={renew}><PackagePlus />{t('client.renew')}</button>}
              </div>
            </div>
          )}

          {online && <TodayCard prep={prep} trainer={trainer} onStart={() => { setScreen('session'); window.scrollTo(0, 0) }} />}

          <div className="card next-card">
            <div className="lab">{t('client.nextSession')}</div>
            {sessions[0] ? (
              <><div className="big">{fmtDateTime(sessions[0].starts_at, locale)}</div>
                <div className="meta">{sessions[0].format === 'online' ? t('formats.online') : t(`kinds.${sessions[0].kind}`)}{sessions[0].location ? ` · ${sessions[0].location}` : ''}</div>
                {sessions[0].format === 'online' && sessions[0].meeting_url && (
                  <a className="btn block" style={{ marginTop: 12 }} href={sessions[0].meeting_url} target="_blank" rel="noopener noreferrer"><Video />{t('client.joinCall')}</a>
                )}
                <div className="two-btn">
                  <button className="btn ghost" onClick={() => setCalFor(sessions[0])}><CalendarPlus />{t('client.addCal')}</button>
                  <button className="btn ghost" onClick={() => setCancelFor(sessions[0])}><X />{t('client.cancel')}</button>
                </div></>
            ) : <div className="meta" style={{ marginTop: 6 }}>{t('client.noSession')}</div>}
          </div>

          <div className="tiles">
            <button className="tile" onClick={() => go('sessions')}><CalendarDays /><span>{t('app.tileSessions')}</span></button>
            <button className="tile" onClick={() => go('money')}><CreditCard /><span>{t('app.tilePay')}</span></button>
            {wa ? <a className="tile" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle /><span>{t('app.tileChat')}</span></a>
              : <button className="tile" onClick={() => setRulesOpen(true)}><ScrollText /><span>{t('app.tileRules')}</span></button>}
          </div>

          <div className="sec-h"><h2>{t('app.yourProgress')}</h2></div>
          <div className="stat-tiles">
            <div className="stat"><div className="meta">{t('app.statSessions')}</div><b>{st.month_done ?? 0}</b><span className="meta">{t('app.thisMonth')}</span></div>
            {left != null
              ? <div className="stat"><div className="meta">{t('app.statPack')}</div><b>{left} / {client.sessions_total}</b><span className={left <= 2 ? 'hot' : 'meta'}>{t('app.stillLeft')}</span></div>
              : <div className="stat"><div className="meta">{t('app.thisWeek')}</div><b>{st.week_done ?? 0}</b><span className="meta">{t('app.statSessions')}</span></div>}
            <div className="stat ring">
              <div className="meta">{t('app.attendance')}</div>
              {st.attendance != null ? (
                <svg width="56" height="56" viewBox="0 0 56 56" role="img" aria-label={`${t('app.attendance')} ${st.attendance} %`}>
                  <circle cx="28" cy="28" r="22" fill="none" stroke="var(--line)" strokeWidth="5" />
                  <circle cx="28" cy="28" r="22" fill="none" stroke="var(--accent)" strokeWidth="5" strokeLinecap="round"
                    strokeDasharray={`${(st.attendance / 100) * 138.2} 138.2`} transform="rotate(-90 28 28)" />
                  <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--ink)">{st.attendance}%</text>
                </svg>
              ) : <b>–</b>}
            </div>
          </div>
        </>
      )}

      {tab === 'sessions' && (
        <>
          <div className="hello">{t('app.sessions')}</div>
          <div className="card">
            {upcoming.length === 0 ? <div className="meta">{t('app.noUpcoming')}</div> : (
              <div className="list">{upcoming.slice(0, 20).map(sessionRow)}</div>
            )}
          </div>
          {wa && <a className="btn block ghost" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle />{t('client.writeTrainer', { trainer: trainerName })}</a>}
        </>
      )}

      {tab === 'money' && (
        <>
          <div className="hello">{t('app.money')}</div>
          {packCard}
          {payCard}
          {payments.filter((p) => p.status === 'confirmed').length > 0 && (
            <div className="card">
              <div className="lab">{t('client.history')}</div>
              <div className="list" style={{ marginTop: 6 }}>
                {payments.filter((p) => p.status === 'confirmed').slice(0, 6).map((p) => (
                  <div className="row" key={p.id} style={{ padding: '9px 0' }}>
                    <div><div className="name">{money(p.amount, locale)}</div><div className="meta">{fmtDate(p.paid_on, locale, { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
                    <MethodTag method={p.method} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'profile' && (
        <>
          <div className="hello">{client.name}</div>
          <div className="card" style={{ padding: 6 }}>
            {trainer.rules_text && <button className="menu-row" onClick={() => setRulesOpen(true)}><ScrollText /><span>{t('onboard.myRules')}</span><ChevronRight className="chev" /></button>}
            {wa && <a className="menu-row" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle /><span>{t('client.writeTrainer', { trainer: trainerName })}</span><ChevronRight className="chev" /></a>}
            <button className="menu-row" onClick={() => setPrivacyOpen(true)}><ShieldCheck /><span>{t('privacy.menu')}</span><ChevronRight className="chev" /></button>
          </div>
          <div className="card">
            <div className="lab" style={{ marginBottom: 10 }}>{t('common.language')}</div>
            <div className="grid" style={{ gap: 8 }}>
              {LANGS.map((l) => (
                <button key={l.code} className="choice" aria-pressed={lang === l.code} onClick={() => pickLang(l.code)}>
                  <b>{l.label}</b>{lang === l.code && <Check size={16} />}
                </button>
              ))}
            </div>
          </div>
          <button className="btn block ghost" onClick={signOut}><LogOut />{t('common.signOut')}</button>
          <p className="meta center">{t('client.installHint')}</p>
        </>
      )}

      <nav className="tabbar ctab" aria-label={t('nav.more')}>
        {[['home', Home], ['sessions', CalendarDays], ['money', CreditCard], ['profile', User]].map(([k, Icon]) => (
          <button key={k} aria-current={tab === k} onClick={() => go(k)}>
            <span className="tab-ic"><Icon /></span><span>{t(`app.${k}`)}</span>
          </button>
        ))}
      </nav>

      <Modal open={privacyOpen} title={t('privacy.title')} onClose={() => setPrivacyOpen(false)}>
        {privacyOpen && <PrivacyText trainer={trainer} />}
      </Modal>

      <Modal open={rulesOpen} title={t('onboard.myRules')} onClose={() => setRulesOpen(false)}>
        {rulesOpen && (
          <div className="form">
            <div className="rules-text">{trainer.rules_text}</div>
            {client.rules_accepted_at && <div className="meta">{t('onboard.acceptedOn', { date: fmtDate(ymd(new Date(client.rules_accepted_at)), locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}</div>}
          </div>
        )}
      </Modal>

      <Modal open={!!cancelFor} title={t('client.cancelTitle')} onClose={() => setCancelFor(null)}>
        {cancelFor && (
          <div className="form">
            <div className="big">{fmtDateTime(cancelFor.starts_at, locale)}</div>
            {isLate(cancelFor)
              ? <div className="notice warn-box">{t('client.cancelLate', { hours: cancelHours })}</div>
              : <div className="notice">{t('client.cancelFree', { hours: cancelHours })}</div>}
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setCancelFor(null)}>{t('common.back')}</button>
              <button className="btn" disabled={busy} onClick={cancelSession}>{t('client.cancelConfirm')}</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!calFor} title={t('client.addCal')} onClose={() => setCalFor(null)}>
        {calFor && (() => {
          const ev = calendarEvent(calFor, `${trainer.brand_name} · ${t(`kinds.${calFor.kind}`)}`, placeOf(calFor))
          return (
            <div className="grid" style={{ gap: 10 }}>
              <div className="meta">{fmtDateTime(calFor.starts_at, locale)}</div>
              <button className="choice" onClick={() => { downloadIcs(ev, calFor.id); setCalFor(null) }}><b>{t('client.calApple')}</b><CalendarPlus size={18} /></button>
              <a className="choice" href={googleCalendarUrl(ev)} target="_blank" rel="noopener noreferrer" onClick={() => setCalFor(null)}><b>{t('client.calGoogle')}</b><CalendarPlus size={18} /></a>
            </div>
          )
        })()}
      </Modal>

      <Modal open={renewOpen} title={t('client.renewTitle')} onClose={() => setRenewOpen(false)}>
        {renewOpen && (
          <div className="form">
            <div className="meta">{t('client.renewHelp', { trainer: trainerName })}</div>
            <div className="grid" style={{ gap: 8 }}>
              {packages.map((p) => (
                <button key={p.id} className="choice" aria-pressed={pickPkg === p.id} onClick={() => setPickPkg(p.id)}>
                  <span><b>{p.name}</b><span className="meta" style={{ display: 'block' }}>{p.sessions ? `${p.sessions} ${t('common.sessions')} · ` : ''}{t(`billing.${p.billing}`)}</span></span>
                  <span className="num">{money(p.price, locale)}</span>
                </button>
              ))}
            </div>
            <div className="modal-foot">
              <button className="btn ghost" onClick={() => setRenewOpen(false)}>{t('common.cancel')}</button>
              <button className="btn" disabled={busy || !pickPkg} onClick={requestRenewal}>{t('client.renewSend')}</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

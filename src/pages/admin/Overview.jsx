import { useCallback, useEffect, useState } from 'react'
import { Plus, Check, X, RotateCcw, Video, AlertTriangle } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { Modal, useIsMobile, useRun, useToast } from '../../components/ui.jsx'
import ProgramLog from '../../components/ProgramLog.jsx'
import { packStatuses } from '../../lib/pack.js'
import { fmtKg } from '../../lib/program.js'
import { addDays, daysBetween, fmtDate, fmtRelative, hm, money, mondayOf, payState, toIso, ymd } from '../../lib/format.js'

export default function Overview({ data, reload, go, trainerId }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [sessions, setSessions] = useState([])
  const [feed, setFeed] = useState([])           // online clients' finished sessions
  const [packSessions, setPackSessions] = useState([])
  const [parqNew, setParqNew] = useState([])
  const [withProgram, setWithProgram] = useState(new Set())
  const [askFor, setAskFor] = useState(null)
  const mobile = useIsMobile()
  const [logFor, setLogFor] = useState(null)   // session whose training log is open
  const [clientCancels, setClientCancels] = useState([])   // session for the "what happened?" dialog
  const today = ymd()
  const monday = mondayOf(today)

  const load = useCallback(async () => {
    const from = toIso(addDays(today, -14), '00:00')
    const to = toIso(addDays(monday, 7), '00:00')
    const r = await run(supabase.from('sessions').select('*').eq('trainer_id', trainerId).gte('starts_at', from).lt('starts_at', to).order('starts_at'))
    if (r.ok) setSessions(r.data)
    const cc = await run(supabase.from('sessions').select('*').eq('trainer_id', trainerId).eq('cancelled_by', 'client')
      .gte('cancelled_at', new Date(Date.now() - 3 * 864e5).toISOString()).order('cancelled_at', { ascending: false }))
    if (cc.ok) setClientCancels(cc.data)
    const [wl, ps, pq, pr] = await Promise.all([
      supabase.from('workout_logs').select('*, exercise_logs(exercise, kg)').eq('trainer_id', trainerId)
        .gte('finished_at', new Date(Date.now() - 7 * 864e5).toISOString()).order('finished_at', { ascending: false }).limit(10),
      supabase.from('sessions').select('id, client_id, starts_at, status').eq('trainer_id', trainerId).eq('status', 'planned')
        .not('client_id', 'is', null).gte('starts_at', new Date(Date.now() - 60 * 864e5).toISOString()).order('starts_at').limit(1000),
      supabase.from('parq_responses').select('*').eq('trainer_id', trainerId).eq('flagged', true).is('reviewed_at', null).order('created_at', { ascending: false }),
      supabase.from('programs').select('client_id').eq('trainer_id', trainerId),
    ])
    setFeed(wl.data || []); setPackSessions(ps.data || []); setParqNew(pq.data || [])
    setWithProgram(new Set((pr.data || []).map((x) => x.client_id)))
  }, [trainerId, today, monday, run])
  useEffect(() => { load() }, [load])

  const { clients, pending, trainer } = data
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]))
  const active = clients.filter((c) => c.active)
  const pendingIds = new Set(pending.map((p) => p.client_id))
  const open = active.filter((c) => c.next_due_date && !pendingIds.has(c.id))
  const overdue = open.filter((c) => daysBetween(today, c.next_due_date) < 0)
  const soon = open.filter((c) => { const n = daysBetween(today, c.next_due_date); return n >= 0 && n <= 14 })
  const due = [...overdue, ...soon].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
  const packs = packStatuses(active, packSessions, trainer.reminder_days ?? 2)
  const ending = active.filter((c) => packs[c.id]?.remind || packs[c.id]?.kind === 'used')
  const lastIds = new Set(Object.values(packs).filter((p) => p.kind === 'last').map((p) => p.session.id))
  const canLog = (s) => s.client_id && withProgram.has(s.client_id) && byId[s.client_id]?.mode !== 'online'

  const todays = sessions.filter((s) => ymd(new Date(s.starts_at)) === today)
  const weekCount = sessions.filter((s) => s.client_id && ymd(new Date(s.starts_at)) >= monday && s.status !== 'cancelled').length
  const nowIso = new Date().toISOString()
  const past = sessions.filter((s) => s.client_id && s.status === 'planned' && ymd(new Date(s.starts_at)) < today && s.starts_at < nowIso)
  const hour = Number(hm(new Date()).slice(0, 2))
  const greet = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening'
  const first = (trainer.owner_name || '').split(' ')[0] || trainer.brand_name

  // One tap: done / didn't happen / undo. Updates the list right away.
  async function setStatus(s, status) {
    setSessions((list) => list.map((x) => (x.id === s.id ? { ...x, status } : x)))
    const r = await run(supabase.from('sessions').update({ status }).eq('id', s.id))
    if (!r.ok) return load()
    if (status !== 'planned') toast(`${byId[s.client_id]?.name || t('kinds.own')}: ${t(`statuses.${status}`)}`)
    reload()
  }
  function QuickActions({ s }) {
    if (!s.client_id) return <span />
    if (s.status !== 'planned') return (
      <div className="acts">
        <span className={`pill ${s.status === 'done' ? 'ok' : s.status === 'cancelled' ? 'mute' : 'warn'}`}>{t(`statuses.${s.status}`)}</span>
        <button className="icon-btn" onClick={() => setStatus(s, 'planned')} aria-label={t('overview.undo')} title={t('overview.undo')}><RotateCcw /></button>
      </div>
    )
    return (
      <div className="acts">
        <button className="icon-btn" onClick={() => setAskFor(s)} aria-label={t('overview.didntHappen')} title={t('overview.didntHappen')}><X /></button>
        <button className="icon-btn yes" onClick={() => { setStatus(s, 'done'); if (canLog(s)) setLogFor({ ...s, status: 'done' }) }} aria-label={t('statuses.done')} title={t('statuses.done')}><Check /></button>
      </div>
    )
  }
  async function decideRenewal(r, accept) {
    const res = await run(supabase.rpc('decide_renewal', { p_request: r.id, p_accept: accept }))
    if (res.ok) { toast(accept ? t('overview.renewalAccepted', { name: byId[r.client_id]?.name }) : t('overview.renewalDeclined')); reload() }
  }
  async function decide(p, confirm) {
    const r = await run(supabase.rpc('decide_payment', { p_payment: p.id, p_confirm: confirm }))
    if (r.ok) {
      const name = byId[p.client_id]?.name
      toast(confirm ? t('payments.confirmedToast', { name, amount: money(p.amount, locale) }) : t('payments.rejectedToast', { name }))
      reload()
    }
  }

  const kpis = (
    <div className="grid kpis">
        <div className="panel kpi"><div className="lab">{t('overview.kpiClients')}</div><div className="val">{active.length}</div>
          <div className="meta">{t('overview.kpiClientsHint', { n: active.filter((c) => c.billing === 'monthly').length })}</div></div>
        <div className="panel kpi"><div className="lab">{t('overview.kpiWeek')}</div><div className="val">{weekCount}</div>
          <div className="meta">{fmtDate(monday, locale)} – {fmtDate(addDays(monday, 6), locale)}</div></div>
        <div className="panel kpi"><div className="lab">{t('overview.kpiOutstanding')}</div><div className="val">{money(open.filter((c) => daysBetween(today, c.next_due_date) <= 7).reduce((a, c) => a + Number(c.price), 0), locale)}</div>
          <div className="meta">{t('overview.kpiOutstandingHint', { n: open.filter((c) => daysBetween(today, c.next_due_date) <= 7).length })}</div></div>
        <div className={`panel kpi ${pending.length ? 'hl' : ''}`}><div className="lab">{t('overview.kpiConfirm')}</div><div className="val">{pending.length}</div>
          <div className="meta">{t('overview.kpiConfirmHint')}</div></div>
      </div>
  )

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{fmtDate(today, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          <h1>{t(`overview.${greet}`, { name: first })}</h1>
          <p className="sub">{t('overview.summary', { sessions: todays.filter((s) => s.client_id && s.status !== 'cancelled').length, confirm: pending.length, overdue: overdue.length })}</p>
        </div>
        <button className="btn" onClick={() => go('calendar')}><Plus />{t('calendar.newSession')}</button>
      </div>

      {!mobile && kpis}
      <div className="grid two" style={{ marginTop: 14 }}>
        <div className="grid" style={{ alignContent: 'start' }}>
          <section className="panel">
            <div className="panel-h"><h2>{t('overview.today')}</h2><button className="btn ghost small" onClick={() => go('calendar')}>{t('overview.openCalendar')}</button></div>
            <div className="list">
              {todays.length === 0 && <div className="empty">{t('overview.noToday')}</div>}
              {todays.map((s) => (
                <div className={`row t today-row st-${s.status}`} key={s.id}>
                  <span className="time">{hm(new Date(s.starts_at))}</span>
                  <div style={{ minWidth: 0 }}>
                    {s.client_id
                      ? <button className="name linkish" onClick={() => setLogFor(s)}>{byId[s.client_id]?.name}</button>
                      : <div className="name">{s.notes || t('kinds.own')}</div>}
                    <div className="meta">{s.format === 'online' ? <span className="fmt"><Video />{t('formats.online')}</span> : t(`kinds.${s.kind}`)}{s.location ? ` · ${s.location}` : ''}
                      {canLog(s) && s.status === 'planned' ? ` · ${t('overview.tapToLog')}` : ''}</div>
                    {lastIds.has(s.id) && <span className="pill warn" style={{ marginTop: 4 }}>{t('overview.lastTag')}</span>}</div>
                  <QuickActions s={s} />
                </div>
              ))}
            </div>
          </section>
          {past.length > 0 && (
            <section className="panel">
              <div className="panel-h"><h2>{t('overview.past')}</h2></div>
              <div className="list">
                {past.map((s) => (
                  <div className="row" key={s.id}>
                    <div><button className="name linkish" onClick={() => setLogFor(s)}>{byId[s.client_id]?.name}</button><div className="meta">{fmtRelative(s.starts_at, locale)} · {t(`kinds.${s.kind}`)}</div></div>
                    <QuickActions s={s} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="panel" style={{ alignSelf: 'start' }}>
          {(data.renewals?.length > 0 || clientCancels.length > 0) && (
            <>
              <div className="panel-h"><h2>{t('overview.requests')}</h2><span className="pill info">{(data.renewals?.length || 0) + clientCancels.length}</span></div>
              <div className="list" style={{ marginBottom: 18 }}>
                {(data.renewals || []).map((r) => {
                  const pk = data.packages.find((x) => x.id === r.package_id)
                  return (
                    <div className="row" key={r.id}>
                      <div><div className="name">{byId[r.client_id]?.name}</div>
                        <div className="meta">{t('overview.wantsPack', { pack: pk?.name || '', price: money(pk?.price || 0, locale) })} · {fmtRelative(r.created_at, locale)}</div></div>
                      <div className="acts"><button className="chip" onClick={() => decideRenewal(r, false)}>{t('overview.decline')}</button>
                        <button className="chip solid" onClick={() => decideRenewal(r, true)}>{t('overview.accept')}</button></div>
                    </div>
                  )
                })}
                {clientCancels.map((s) => (
                  <div className="row" key={s.id}>
                    <div><div className="name">{byId[s.client_id]?.name}</div>
                      <div className="meta">{t('overview.cancelledSession', { when: `${fmtDate(ymd(new Date(s.starts_at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })} ${hm(new Date(s.starts_at))}` })} · {fmtRelative(s.cancelled_at, locale)}</div></div>
                    <span className={`pill ${s.status === 'late_cancel' ? 'warn' : 'mute'}`}>{s.status === 'late_cancel' ? t('overview.counted') : t('overview.notCounted')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {parqNew.length > 0 && (
            <>
              <div className="panel-h"><h2>{t('overview.newParq')}</h2><span className="pill bad">{parqNew.length}</span></div>
              <div className="list" style={{ marginBottom: 18 }}>
                {parqNew.map((r) => (
                  <div className="row" key={r.id}>
                    <div style={{ minWidth: 0 }}><div className="name"><AlertTriangle size={14} style={{ verticalAlign: '-2px', color: 'var(--bad)' }} /> {byId[r.client_id]?.name}</div>
                      <div className="meta">{t('overview.parqYes', { n: r.answers.filter((a) => a.type === 'yn' && a.answer === true).length })}{r.explanation ? ` · ${r.explanation}` : ''}</div></div>
                    <button className="chip solid" onClick={() => go('clients', { profile: r.client_id })}>{t('common.open')}</button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="panel-h"><h2>{t('overview.online')}</h2>{feed.length > 0 && <span className="pill info">{feed.length}</span>}</div>
          <div className="list" style={{ marginBottom: 18 }}>
            {feed.length === 0 && <div className="empty">{t('overview.noOnline')}</div>}
            {feed.map((w) => (
              <div className="row" key={w.id}>
                <div style={{ minWidth: 0 }}>
                  <button className="name linkish" onClick={() => go('clients', { profile: w.client_id })}>{t('overview.finished', { name: byId[w.client_id]?.name || '', day: w.day_title || '' })}</button>
                  <div className="meta">{fmtRelative(w.finished_at, locale)} · {w.minutes} {t('common.minutes')}{w.exercise_logs?.length ? ` · ${w.exercise_logs.filter((x) => x.kg != null).slice(0, 3).map((x) => `${x.exercise} ${fmtKg(x.kg)} kg`).join(' · ')}` : ''}</div>
                  {w.note && <div className="feed-note">“{w.note}”</div>}
                </div>
                <span className="pill ok">{t('common.done')}</span>
              </div>
            ))}
          </div>
          {pending.length > 0 && (
            <>
              <div className="panel-h"><h2>{t('overview.confirmPayments')}</h2><span className="pill info">{pending.length}</span></div>
              <div className="list" style={{ marginBottom: 18 }}>
                {pending.map((p) => (
                  <div className="row" key={p.id}>
                    <div><div className="name">{byId[p.client_id]?.name}</div>
                      <div className="meta">{t('payments.reported', { amount: money(p.amount, locale), method: t(`methods.${p.method}`), when: fmtRelative(p.reported_at, locale) })}</div></div>
                    <div className="acts"><button className="chip" onClick={() => decide(p, false)}>{t('payments.reject')}</button>
                      <button className="chip solid" onClick={() => decide(p, true)}>{t('payments.confirm')}</button></div>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="panel-h"><h2>{t('overview.dueOverdue')}</h2><button className="btn ghost small" onClick={() => go('payments')}>{t('overview.allPayments')}</button></div>
          <div className="list">
            {due.length === 0 && <div className="empty">{t('overview.nothingDue')}</div>}
            {due.map((c) => { const p = payState(c, pendingIds, today); return (
              <div className="row" key={c.id}>
                <div><div className="name">{c.name}</div><div className="meta">{money(c.price, locale)} · {t(`billing.${c.billing}`)}</div></div>
                <span className={`pill ${p.cls}`}>{t(`payState.${p.key}`, { n: p.n, date: fmtDate(p.date, locale) })}</span>
              </div>) })}
          </div>
          {ending.length > 0 && (
            <>
              <div className="panel-h" style={{ marginTop: 18 }}><h2>{t('overview.packEnds')}</h2><span className="pill warn">{ending.length}</span></div>
              <div className="list">
                {ending.map((c) => { const st = packs[c.id]; return (
                  <div className="row" key={c.id}>
                    <div style={{ minWidth: 0 }}><button className="name linkish" onClick={() => go('clients', { profile: c.id })}>{c.name}</button>
                      <div className="meta">{st.kind === 'last'
                        ? t('overview.lastOfPack', { when: `${fmtDate(ymd(new Date(st.session.starts_at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })}, ${hm(new Date(st.session.starts_at))}` })
                        : st.kind === 'used' ? t('overview.packUsed') : t('overview.fewLeft', { n: st.left })}</div></div>
                    <span className="pill info">{t('overview.reminderOn')}</span>
                  </div>) })}
              </div>
            </>
          )}
        </section>
      </div>
      {mobile && <div style={{ marginTop: 14 }}>{kpis}</div>}
      <ProgramLog session={logFor} client={logFor ? byId[logFor.client_id] : null} trainerId={trainerId} go={go}
        onClose={() => setLogFor(null)} onSaved={() => { setLogFor(null); load(); reload() }} />
      <Modal open={!!askFor} title={t('overview.whatHappened')} onClose={() => setAskFor(null)}>
        {askFor && (
          <div className="grid" style={{ gap: 10 }}>
            <p className="meta" style={{ margin: 0 }}>{byId[askFor.client_id]?.name} · {hm(new Date(askFor.starts_at))}</p>
            {[['cancelled', 'notCounted'], ['late_cancel', 'counted'], ['no_show', 'counted']].map(([st, hint]) => (
              <button key={st} className="choice" onClick={() => { setStatus(askFor, st); setAskFor(null) }}>
                <b>{t(`statuses.${st}`)}</b>
                <span className={`pill ${hint === 'counted' ? 'warn' : 'mute'}`}>{t(`overview.${hint}`)}</span>
              </button>
            ))}
          </div>
        )}
      </Modal>
    </>
  )
}

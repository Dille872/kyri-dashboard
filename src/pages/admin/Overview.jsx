import { useCallback, useEffect, useState } from 'react'
import { Plus, Check, X, RotateCcw, Video } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { Modal, useIsMobile, useRun, useToast } from '../../components/ui.jsx'
import SessionLog from '../../components/SessionLog.jsx'
import { addDays, daysBetween, fmtDate, fmtRelative, hm, isoDow, money, mondayOf, payState, sessionsLeft, toIso, ymd } from '../../lib/format.js'

export default function Overview({ data, reload, go, trainerId }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [sessions, setSessions] = useState([])
  const [plans, setPlans] = useState([])
  const [askFor, setAskFor] = useState(null)
  const mobile = useIsMobile()
  const [logFor, setLogFor] = useState(null)   // session whose training log is open
  const [nextWeek, setNextWeek] = useState(null)   // session for the "what happened?" dialog
  const today = ymd()
  const monday = mondayOf(today)
  const checkinClients = data.clients.filter((c) => c.active && c.mode !== 'gym' && c.checkin_weekday === isoDow(today))

  const load = useCallback(async () => {
    const from = toIso(addDays(today, -14), '00:00')
    const to = toIso(addDays(monday, 7), '00:00')
    const r = await run(supabase.from('sessions').select('*').eq('trainer_id', trainerId).gte('starts_at', from).lt('starts_at', to).order('starts_at'))
    if (r.ok) setSessions(r.data)
    const nw = await run(supabase.from('sessions').select('id, exercise_rows(id)').eq('trainer_id', trainerId).not('client_id', 'is', null).eq('status', 'planned')
      .gte('starts_at', toIso(addDays(monday, 7), '00:00')).lt('starts_at', toIso(addDays(monday, 14), '00:00')))
    if (nw.ok) setNextWeek({ total: nw.data.length, planned: nw.data.filter((x) => x.exercise_rows?.length).length })
    if (checkinClients.length) {
      const p = await run(supabase.from('plan_workouts').select('client_id, completed_at').in('client_id', checkinClients.map((c) => c.id)).eq('week_start', monday))
      if (p.ok) setPlans(p.data)
    }
  }, [trainerId, today, monday, run, checkinClients.map((c) => c.id).join()]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])

  const { clients, pending, trainer } = data
  const byId = Object.fromEntries(clients.map((c) => [c.id, c]))
  const active = clients.filter((c) => c.active)
  const pendingIds = new Set(pending.map((p) => p.client_id))
  const open = active.filter((c) => c.next_due_date && !pendingIds.has(c.id))
  const overdue = open.filter((c) => daysBetween(today, c.next_due_date) < 0)
  const soon = open.filter((c) => { const n = daysBetween(today, c.next_due_date); return n >= 0 && n <= 14 })
  const due = [...overdue, ...soon].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
  const low = active.filter((c) => { const l = sessionsLeft(c); return l != null && l <= 2 })

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
        <button className="icon-btn yes" onClick={() => { setStatus(s, 'done'); setLogFor(s) }} aria-label={t('statuses.done')} title={t('statuses.done')}><Check /></button>
      </div>
    )
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
                    <div className="meta">{s.format === 'online' ? <span className="fmt"><Video />{t('formats.online')}</span> : t(`kinds.${s.kind}`)}{s.location ? ` · ${s.location}` : ''}</div></div>
                  <QuickActions s={s} />
                </div>
              ))}
            </div>
          </section>
          {nextWeek && nextWeek.total > 0 && (
            <section className="panel">
              <div className="row" style={{ borderTop: 0, padding: 0 }}>
                <div><div className="name">{t('overview.planNext')}</div>
                  <div className="meta">{t('planning.progress', { done: nextWeek.planned, total: nextWeek.total })}</div>
                  <div className="bar" style={{ width: 160 }}><i style={{ width: `${(nextWeek.planned / nextWeek.total) * 100}%` }} /></div></div>
                <button className="chip solid" onClick={() => go('planning')}>{t('overview.openPlanning')}</button>
              </div>
            </section>
          )}
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
          {checkinClients.length > 0 && (
            <>
              <div className="panel-h"><h2>{t('overview.checkins')}</h2><span className="pill info">{checkinClients.length}</span></div>
              <div className="list" style={{ marginBottom: 18 }}>
                {checkinClients.map((c) => {
                  const mine = plans.filter((p) => p.client_id === c.id)
                  return (
                    <div className="row" key={c.id}>
                      <div><div className="name">{c.name}</div>
                        <div className="meta">{mine.length ? t('overview.weekDone', { done: mine.filter((p) => p.completed_at).length, total: mine.length }) : t('overview.noPlan')}</div></div>
                      <button className="chip solid" onClick={() => go('programs', { client: c.id })}>{t('overview.openPlan')}</button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
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
          {low.length > 0 && (
            <>
              <div className="panel-h" style={{ marginTop: 18 }}><h2>{t('overview.packsLow')}</h2></div>
              <div className="list">
                {low.map((c) => (
                  <div className="row" key={c.id}>
                    <div><div className="name">{c.name}</div><div className="meta">{t('overview.left', { left: sessionsLeft(c), total: c.sessions_total })}</div></div>
                    <span className="pill warn">{t('overview.renewal')}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
      {mobile && <div style={{ marginTop: 14 }}>{kpis}</div>}
      <SessionLog session={logFor} clientName={logFor ? byId[logFor.client_id]?.name : ''} trainerId={trainerId}
        onClose={() => setLogFor(null)} onSaved={() => setLogFor(null)} />
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

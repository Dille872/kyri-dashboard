import { useCallback, useEffect, useState } from 'react'
import { Check, Clock, Copy, LogOut, Video, ChevronRight, Lock } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { LangSwitch, Logo, Spinner, copyText, useRun, useToast } from '../../components/ui.jsx'
import { fmtDate, fmtDateTime, money, mondayOf, payState, sessionsLeft, ymd } from '../../lib/format.js'
import { rowText } from '../../components/ExerciseRows.jsx'
import { MethodTag } from '../admin/Payments.jsx'

export default function ClientApp({ clientId, trainerId, signOut }) {
  const { t, locale, setLang } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [d, setD] = useState(null)
  const [screen, setScreen] = useState('home')   // home | pay | sent | workout
  const [openWorkout, setOpenWorkout] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const monday = mondayOf(ymd())
    const [tr, cl, se, pa, st, pw, lg] = await Promise.all([
      run(supabase.from('trainers').select('*').eq('id', trainerId).single()),
      run(supabase.from('clients').select('*').eq('id', clientId).single()),
      run(supabase.from('sessions').select('*').eq('client_id', clientId).eq('status', 'planned').gte('starts_at', new Date().toISOString()).order('starts_at').limit(5)),
      run(supabase.from('payments').select('*').eq('client_id', clientId).order('reported_at', { ascending: false }).limit(20)),
      run(supabase.rpc('my_training_status', { p_client: clientId })),
      run(supabase.from('plan_workouts').select('*, exercise_rows(*)').eq('client_id', clientId).eq('week_start', monday).order('position')),
      run(supabase.from('sessions').select('id, starts_at, kind, exercise_rows(*)').eq('client_id', clientId).eq('status', 'done').order('starts_at', { ascending: false }).limit(10)),
    ])
    const sortRows = (x) => ({ ...x, exercise_rows: (x.exercise_rows || []).sort((a, b) => a.position - b.position) })
    if (tr.ok && cl.ok) setD({ trainer: tr.data, client: cl.data, sessions: se.data || [], payments: pa.data || [],
      training: st.data || 'off', plan: (pw.data || []).map(sortRows), recent: (lg.data || []).filter((x) => x.exercise_rows?.length).slice(0, 3).map(sortRows) })
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
  const { trainer, client, sessions, payments, training, plan, recent } = d
  const trainerName = (trainer.owner_name || trainer.brand_name).split(' ')[0]
  const first = client.name.split(' ')[0]
  const pending = payments.find((p) => p.status === 'reported')
  const lastDecided = payments.find((p) => p.status !== 'reported')
  const state = payState(client, pending ? new Set([client.id]) : null, ymd())
  const left = sessionsLeft(client)
  const reference = `${client.name}`

  async function report(method) {
    setBusy(true)
    const r = await run(supabase.rpc('report_payment', { p_client: client.id, p_method: method }))
    setBusy(false)
    if (r.ok) { setScreen('sent'); load() }
  }
  const copy = async (v) => toast((await copyText(v)) ? t('common.copied') : v)

  const top = (
    <div className="topbar">
      <div className="brand"><Logo trainer={trainer} /><div className="eyebrow">{trainer.brand_name}</div></div>
      <div className="acts"><LangSwitch onChange={(l) => supabase.rpc('set_my_lang', { p_lang: l })} />
        <button className="chip" onClick={signOut} aria-label={t('common.signOut')} title={t('common.signOut')}><LogOut size={14} style={{ verticalAlign: '-2px' }} /></button></div>
    </div>
  )

  if (screen === 'workout' && openWorkout) {
    const w = plan.find((x) => x.id === openWorkout)
    if (w) return <WorkoutScreen w={w} top={top} onBack={() => { setScreen('home'); setOpenWorkout(null) }} onSaved={load} />
  }

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

  return (
    <div className="mobile">
      {top}
      <div className="hello">{t('client.hello', { name: first })}</div>

      <div className="card">
        <div className="lab">{t('client.nextSession')}</div>
        {sessions[0] ? (
          <><div className="big">{fmtDateTime(sessions[0].starts_at, locale)}</div>
            <div className="meta">{sessions[0].format === 'online' ? t('formats.online') : t(`kinds.${sessions[0].kind}`)}{sessions[0].location ? ` · ${sessions[0].location}` : ''}</div>
            {sessions[0].format === 'online' && sessions[0].meeting_url && (
              <a className="btn block" style={{ marginTop: 12 }} href={sessions[0].meeting_url} target="_blank" rel="noopener noreferrer"><Video />{t('client.joinCall')}</a>
            )}</>
        ) : <div className="meta" style={{ marginTop: 6 }}>{t('client.noSession')}</div>}
        {sessions.length > 1 && (
          <div className="list" style={{ marginTop: 10 }}>
            {sessions.slice(1).map((s) => (
              <div className="row" key={s.id} style={{ padding: '9px 0' }}><span>{fmtDateTime(s.starts_at, locale)}</span><span className="meta">{s.format === 'online' ? t('formats.online') : t(`kinds.${s.kind}`)}</span></div>
            ))}
          </div>
        )}
      </div>

      {training === 'locked' && (
        <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><Lock size={18} style={{ flex: 'none', marginTop: 2 }} /><div className="meta">{t('client.locked')}</div></div>
      )}
      {training === 'visible' && plan.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <div className="lab">{t('client.plan')}</div>
            <span className="meta">{t('client.workoutsDone', { done: plan.filter((w) => w.completed_at).length, total: plan.length })}</span>
          </div>
          <div className="list" style={{ marginTop: 6 }}>
            {plan.map((w) => (
              <button key={w.id} className="row" style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderTop: '1px solid var(--line)' }}
                onClick={() => { setOpenWorkout(w.id); setScreen('workout'); window.scrollTo(0, 0) }}>
                <div><div className="name">{w.title}</div><div className="meta">{w.exercise_rows.map((r) => r.exercise).join(' · ')}</div></div>
                {w.completed_at ? <span className="pill ok">{t('client.done')}</span> : <ChevronRight size={18} />}
              </button>
            ))}
          </div>
        </div>
      )}
      {training === 'visible' && recent.length > 0 && (
        <div className="card">
          <div className="lab">{t('client.recent')}</div>
          <div className="log-list" style={{ marginTop: 8 }}>
            {recent.map((s) => (
              <div key={s.id} className="log-item">
                <div className="name">{fmtDate(ymd(new Date(s.starts_at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                <ul>{s.exercise_rows.map((r) => <li key={r.id}>{r.exercise} · {rowText(r)}</li>)}</ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="lab">{t('client.package')}</div>
        {left == null ? <div className="big">{t('client.unlimited')}</div> : (
          <><div className="big">{t('client.left', { left, total: client.sessions_total })}</div>
            <div className="bar full"><i style={{ width: `${Math.min(100, (left / Math.max(client.sessions_total, 1)) * 100)}%` }} /></div></>
        )}
      </div>

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
      <p className="meta center">{t('client.installHint')}</p>
    </div>
  )
}

function WorkoutScreen({ w, top, onBack, onSaved }) {
  const { t } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [rows, setRows] = useState(w.exercise_rows.map((r) => ({ ...r, actual_kg: r.actual_kg ?? '', actual_reps: r.actual_reps ?? '' })))
  const [note, setNote] = useState(w.client_note || '')
  const [busy, setBusy] = useState(false)
  const set = (i, k, v) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)))

  async function saveAll(complete) {
    setBusy(true)
    for (const r of rows) {
      const res = await run(supabase.rpc('log_exercise', { p_row: r.id, p_actual_kg: String(r.actual_kg ?? ''), p_actual_reps: String(r.actual_reps ?? ''), p_done: !!r.done }))
      if (!res.ok) { setBusy(false); return }
    }
    if (complete !== undefined || note !== (w.client_note || '')) {
      const res = await run(supabase.rpc('complete_workout', { p_workout: w.id, p_done: complete ?? !!w.completed_at, p_note: note }))
      if (!res.ok) { setBusy(false); return }
    }
    setBusy(false)
    toast(t('common.saved'))
    await onSaved()
    if (complete) onBack()
  }

  return (
    <div className="mobile">
      {top}
      <button className="chip" style={{ alignSelf: 'flex-start' }} onClick={onBack}>{t('common.back')}</button>
      <div><div className="hello">{w.title}</div>{w.notes && <p className="meta" style={{ margin: '6px 0 0' }}>{w.notes}</p>}</div>
      <div className="card">
        <div className="set-row ex-head" aria-hidden="true"><span>{t('calendar.exercise')}</span><span>{t('client.yourKg')}</span><span>{t('client.yourReps')}</span><span /></div>
        {rows.map((r, i) => (
          <div key={r.id} className="set-row">
            <div style={{ minWidth: 0 }}><div className="name">{r.exercise}</div><div className="meta">{t('client.target')}: {rowText(r)}</div></div>
            <input id={`a-kg-${r.id}`} aria-label={`${r.exercise} ${t('client.yourKg')}`} inputMode="decimal" placeholder={r.kg || ''} value={r.actual_kg} onChange={(e) => set(i, 'actual_kg', e.target.value)} />
            <input id={`a-rp-${r.id}`} aria-label={`${r.exercise} ${t('client.yourReps')}`} placeholder={r.reps || ''} value={r.actual_reps} onChange={(e) => set(i, 'actual_reps', e.target.value)} />
            <button type="button" className="tick" aria-pressed={!!r.done} aria-label={t('client.done')} onClick={() => set(i, 'done', !r.done)}><Check size={16} /></button>
          </div>
        ))}
      </div>
      <label className="f" htmlFor={`w-note-${w.id}`}>{t('client.notePlaceholder')}<textarea id={`w-note-${w.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {w.completed_at
        ? <button className="btn block ghost" disabled={busy} onClick={() => saveAll(false)}>{t('client.undo')}</button>
        : <button className="btn block" disabled={busy} onClick={() => saveAll(true)}><Check />{t('client.markDone')}</button>}
      <button className="btn block ghost" disabled={busy} onClick={() => saveAll()}>{t('client.save')}</button>
    </div>
  )
}

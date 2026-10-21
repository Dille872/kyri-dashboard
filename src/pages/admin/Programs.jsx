import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Copy, Check } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { useRun, useToast } from '../../components/ui.jsx'
import { ExerciseRows, fromDb, rowText, saveRows } from '../../components/ExerciseRows.jsx'
import { addDays, fmtDate, fmtRelative, isoWeek, mondayOf, weekdayName, ymd } from '../../lib/format.js'

const KEY = 'programs-client'

export default function Programs({ data, trainerId }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const online = data.clients.filter((c) => c.active && c.mode && c.mode !== 'gym').sort((a, b) => (a.mode === 'online' ? 0 : 1) - (b.mode === 'online' ? 0 : 1) || a.name.localeCompare(b.name))
  const [clientId, setClientId] = useState(() => {
    let s = null; try { s = sessionStorage.getItem(KEY) } catch {}
    return online.find((c) => c.id === s)?.id || online[0]?.id || ''
  })
  const [monday, setMonday] = useState(mondayOf(ymd()))
  const [workouts, setWorkouts] = useState(null)
  const [log, setLog] = useState([])
  const [suggest, setSuggest] = useState([])
  const client = data.clients.find((c) => c.id === clientId)

  const load = useCallback(async () => {
    if (!clientId) return
    const [w, s, names] = await Promise.all([
      run(supabase.from('plan_workouts').select('*, exercise_rows(*)').eq('client_id', clientId).eq('week_start', monday).order('position')),
      run(supabase.from('sessions').select('id, starts_at, kind, exercise_rows(*)').eq('client_id', clientId).eq('status', 'done').order('starts_at', { ascending: false }).limit(15)),
      supabase.from('exercise_rows').select('exercise').eq('trainer_id', trainerId).limit(500),
    ])
    if (w.ok) setWorkouts(w.data.map((x) => ({ ...x, rows: (x.exercise_rows || []).sort((a, b) => a.position - b.position).map(fromDb) })))
    if (s.ok) setLog(s.data.filter((x) => x.exercise_rows?.length).slice(0, 6))
    setSuggest([...new Set((names.data || []).map((x) => x.exercise))].sort())
  }, [clientId, monday, run, trainerId])
  useEffect(() => { load() }, [load])
  useEffect(() => { try { sessionStorage.setItem(KEY, clientId) } catch {} }, [clientId])

  async function addWorkout() {
    const n = (workouts?.length || 0)
    const r = await run(supabase.from('plan_workouts').insert({ trainer_id: trainerId, client_id: clientId, week_start: monday,
      title: `${t('programs.newWorkout').slice(0, -1)}${String.fromCharCode(65 + n)}`, position: n + 1 }))
    if (r.ok) load()
  }
  async function copyNext() {
    const r = await run(supabase.rpc('copy_plan_week', { p_client: clientId, p_from: monday, p_to: addDays(monday, 7) }))
    if (r.ok) { toast(t('programs.copied', { n: r.data })); setMonday(addDays(monday, 7)) }
  }

  if (!online.length) return (
    <>
      <div className="head"><div><div className="eyebrow">{t('modes.online')}</div><h1>{t('programs.title')}</h1><p className="sub">{t('programs.subtitle')}</p></div></div>
      <div className="panel"><div className="empty">{t('programs.noOnline')}</div></div>
    </>
  )

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{t('programs.week', { n: isoWeek(monday) })} · {fmtDate(monday, locale)} – {fmtDate(addDays(monday, 6), locale)}</div>
          <h1>{t('programs.title')}</h1><p className="sub">{t('programs.subtitle')}</p></div>
        <div className="acts">
          <label className="f" htmlFor="p-client" style={{ minWidth: 200 }}>{t('programs.client')}
            <select id="p-client" value={clientId} onChange={(e) => setClientId(e.target.value)}>{online.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        </div>
      </div>

      <div className="grid two">
        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="panel-h">
            <div><h2>{client?.name}</h2>
              <div className="meta">{t(`modes.${client?.mode}`)} · {client?.checkin_weekday ? t('programs.checkin', { day: weekdayName(client.checkin_weekday, locale) }) : t('programs.noCheckin')}</div></div>
            <div className="acts">
              <button className="btn ghost small" onClick={() => setMonday(addDays(monday, -7))} aria-label={t('calendar.prev')}><ChevronLeft /></button>
              <button className="btn ghost small" onClick={() => setMonday(mondayOf(ymd()))}>{t('calendar.today')}</button>
              <button className="btn ghost small" onClick={() => setMonday(addDays(monday, 7))} aria-label={t('calendar.next')}><ChevronRight /></button>
            </div>
          </div>
          <div className="wk">
            {workouts && workouts.length === 0 && <div className="empty">{t('programs.emptyWeek')}</div>}
            {(workouts || []).map((w) => <WorkoutCard key={w.id} w={w} trainerId={trainerId} suggest={suggest} onChanged={load} />)}
          </div>
          <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 14 }}>
            <button className="btn small" onClick={addWorkout}><Plus />{t('programs.addWorkout')}</button>
            {workouts?.length > 0 && <button className="btn ghost small" onClick={copyNext} title={t('programs.copyHelp')}><Copy />{t('programs.copyNext')}</button>}
          </div>
          {workouts?.length > 0 && <div className="meta" style={{ marginTop: 6 }}>{t('programs.copyHelp')}</div>}
        </section>

        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="panel-h"><h2>{t('programs.history')}</h2></div>
          {log.length === 0 ? <div className="empty">{t('programs.noHistory')}</div> : (
            <div className="log-list">
              {log.map((s) => (
                <div key={s.id} className="log-item">
                  <div className="name">{fmtDate(ymd(new Date(s.starts_at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })} <span className="meta">· {t(`kinds.${s.kind}`)}</span></div>
                  <ul>{s.exercise_rows.sort((a, b) => a.position - b.position).map((r) => <li key={r.id}>{r.exercise} · {rowText(r, true)}</li>)}</ul>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  )
}

function WorkoutCard({ w, trainerId, suggest, onChanged }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [title, setTitle] = useState(w.title)
  const [notes, setNotes] = useState(w.notes || '')
  const [rows, setRows] = useState(w.rows)
  const [confirmDel, setConfirmDel] = useState(false)

  async function save() {
    const a = await run(supabase.from('plan_workouts').update({ title: title.trim() || w.title, notes: notes || null }).eq('id', w.id))
    if (!a.ok) return
    const res = await saveRows({ original: w.rows, rows, base: { trainer_id: trainerId, client_id: w.client_id, plan_workout_id: w.id } })
    if (res.error) return toast(t('common.errorGeneric', { msg: res.error.message }), 'err')
    toast(t('common.saved')); onChanged()
  }
  async function del() {
    if (!confirmDel) return setConfirmDel(true)
    const r = await run(supabase.from('plan_workouts').delete().eq('id', w.id))
    if (r.ok) onChanged()
  }

  return (
    <div className={`wk-card ${w.completed_at ? 'done' : ''}`}>
      <div className="row2">
        <label className="f" htmlFor={`w-t-${w.id}`}>{t('programs.workoutTitle')}<input id={`w-t-${w.id}`} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <div style={{ alignSelf: 'end' }}>
          {w.completed_at
            ? <span className="pill ok"><Check size={12} /> {t('programs.completed', { when: fmtRelative(w.completed_at, locale) })}</span>
            : <span className="pill mute">{t('programs.notDone')}</span>}
        </div>
      </div>
      {w.client_note && <div className="meta">{t('programs.clientNote', { note: w.client_note })}</div>}
      <ExerciseRows rows={rows} setRows={setRows} showActual idPrefix={`w-${w.id}`} suggestions={suggest} />
      <label className="f" htmlFor={`w-n-${w.id}`}>{t('programs.notesForClient')}<input id={`w-n-${w.id}`} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
      <div className="acts">
        <button className="btn danger small" onClick={del}>{confirmDel ? t('programs.confirmDelete') : t('programs.deleteWorkout')}</button>
        <button className="btn small" onClick={save}>{t('common.save')}</button>
      </div>
    </div>
  )
}

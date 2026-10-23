import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { Modal, Spinner, useRun, useToast } from './ui.jsx'
import ProgramDay from './ProgramDay.jsx'
import { dayExercises, exKey, historyByExercise } from '../lib/program.js'
import { hm, ymd } from '../lib/format.js'

// Kyri logs a gym session: pick the day (next in rotation is preselected), type kg only where it changed.
// Saving writes the kg history and marks the session done (the ✓ stays Kyri's call).
export default function ProgramLog({ session, client, trainerId, onClose, onSaved, go }) {
  const { t } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [st, setSt] = useState(null)   // { days, history, dayId, logs }
  const [vals, setVals] = useState({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setSt(null); setVals({}); setNote('')
    if (!session || !client) return
    let alive = true
    ;(async () => {
      const [prog, logs, next, sn] = await Promise.all([
        supabase.from('programs').select('id, title, program_days(*)').eq('client_id', client.id).maybeSingle(),
        supabase.from('exercise_logs').select('*').eq('client_id', client.id).order('logged_on'),
        supabase.rpc('next_day_for', { p_client: client.id }),
        supabase.from('session_notes').select('note').eq('session_id', session.id).maybeSingle(),
      ])
      if (!alive) return
      const days = (prog.data?.program_days || []).sort((a, b) => a.position - b.position)
      const mine = (logs.data || []).filter((l) => l.session_id === session.id)
      const others = (logs.data || []).filter((l) => l.session_id !== session.id)
      // editing an already logged session: open its day with its values
      // a logged session keeps its day; otherwise the day Kyri assigned to this session; otherwise the next in the rotation
      const assigned = days.some((d) => d.id === session.program_day_id) ? session.program_day_id : null
      const dayId = mine[0]?.day_id || assigned || next.data || days[0]?.id
      setVals(Object.fromEntries(mine.map((l) => [exKey(l.exercise), l.kg == null ? '' : String(Number(l.kg))])))
      setNote(sn.data?.note || '')
      setSt({ program: prog.data, days, history: historyByExercise(others), dayId, nextId: next.data, mine })
    })()
    return () => { alive = false }
  }, [session?.id, client?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!session || !client) return <Modal open={false} onClose={onClose} />
  const day = st?.days.find((d) => d.id === st.dayId)
  const nextDay = st?.days.find((d) => d.id === st.nextId)

  async function save() {
    if (!day) return
    setBusy(true)
    const names = dayExercises(day.blocks)
    const on = ymd(new Date(session.starts_at))
    // kg: typed value, or the last value (= same as last time)
    const rows = names.map((name) => {
      const k = exKey(name)
      const typed = String(vals[k] ?? '').replace(',', '.').trim()
      const h = st.history[k] || []
      const kg = typed !== '' && !Number.isNaN(Number(typed)) ? Number(typed) : h.length ? h[h.length - 1].kg : null
      return { trainer_id: trainerId, client_id: client.id, day_id: day.id, session_id: session.id, exercise: name, kg, source: 'trainer', logged_on: on }
    }).filter((r, i, a) => r.kg != null && a.findIndex((x) => exKey(x.exercise) === exKey(r.exercise)) === i)
    if (st.mine.length) {
      const d = await run(supabase.from('exercise_logs').delete().eq('session_id', session.id))
      if (!d.ok) return setBusy(false)
    }
    if (rows.length) {
      const r = await run(supabase.from('exercise_logs').insert(rows))
      if (!r.ok) return setBusy(false)
    }
    if (note.trim() || st.mine.length) {
      await run(supabase.from('session_notes').upsert({ session_id: session.id, trainer_id: trainerId, note: note.trim(), updated_at: new Date().toISOString() }))
    }
    if (session.status === 'planned') await run(supabase.from('sessions').update({ status: 'done' }).eq('id', session.id))
    setBusy(false)
    toast(t('plog.saved'))
    onSaved?.()
  }

  return (
    <Modal open wide title={t('plog.title', { name: `${client.name} · ${hm(new Date(session.starts_at))}` })} onClose={onClose}>
      {!st ? <Spinner /> : !st.days.length ? (
        <div className="form">
          <div className="empty">{t('plog.noProgram', { name: client.name })}</div>
          {go && <div className="modal-foot"><button className="btn ghost" onClick={onClose}>{t('common.close')}</button>
            <button className="btn" onClick={() => { onClose(); go('programs', { client: client.id }) }}>{t('plog.createProgram')}</button></div>}
        </div>
      ) : (
        <div className="form">
          <div>
            <div className="meta" style={{ marginBottom: 8 }}>{t('plog.whichDay')}{nextDay && <> <b style={{ color: 'var(--ink)' }}>{t('plog.nextInRotation', { day: nextDay.title })}</b></>}</div>
            <div className="days">
              {st.days.map((d) => <button type="button" key={d.id} className="chip" aria-pressed={d.id === st.dayId} onClick={() => setSt({ ...st, dayId: d.id })}>{d.title}{d.focus ? ` · ${d.focus}` : ''}</button>)}
            </div>
          </div>
          <ProgramDay day={day} history={st.history} log={{ values: vals, setValue: (k, v) => setVals((o) => ({ ...o, [k]: v })) }} />
          <div className="meta">{t('plog.hint')}</div>
          <label className="f" htmlFor="pl-note">{t('calendar.privateNote')}<textarea id="pl-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>{t('plog.skip')}</button>
            <button type="button" className="btn" disabled={busy} onClick={save}>{session.status === 'planned' ? t('plog.saveDone') : t('plog.save')}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

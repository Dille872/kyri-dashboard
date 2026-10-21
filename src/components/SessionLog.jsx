import { useEffect, useState } from 'react'
import { Plus, X } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { Modal, useToast } from './ui.jsx'
import { emptyRow, fromDb, rowText, saveRows } from './ExerciseRows.jsx'
import { fmtDate, hm, ymd } from '../lib/format.js'

// Training log during / after a session.
// Shows Kyri's plan (or last time) as grey hints; he only types what was different.
export default function SessionLog({ session, clientName, trainerId, onClose, onSaved }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [orig, setOrig] = useState([])
  const [note, setNote] = useState('')
  const [source, setSource] = useState(null)    // 'plan' | { last: date } | null
  const [suggest, setSuggest] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) return
    let alive = true
    setRows(null); setSource(null); setNote('')
    ;(async () => {
      const [mine, n, prev, names] = await Promise.all([
        supabase.from('exercise_rows').select('*').eq('session_id', session.id).order('position'),
        supabase.from('session_notes').select('note').eq('session_id', session.id).maybeSingle(),
        supabase.from('sessions').select('id, starts_at').eq('client_id', session.client_id).lt('starts_at', session.starts_at).order('starts_at', { ascending: false }).limit(12),
        supabase.from('exercise_rows').select('exercise').eq('trainer_id', trainerId).limit(500),
      ])
      if (!alive) return
      const existing = (mine.data || []).map((r) => ({ ...fromDb(r), actual_kg: r.actual_kg ?? '', actual_reps: r.actual_reps ?? '' }))
      setOrig(existing); setNote(n.data?.note || '')
      setSuggest([...new Set((names.data || []).map((x) => x.exercise))].sort())
      if (existing.length) { setSource(existing.some((r) => r.done) ? null : 'plan'); return setRows(existing) }
      const ids = (prev.data || []).map((x) => x.id)
      if (!ids.length) return setRows([emptyRow()])
      const { data: prevRows } = await supabase.from('exercise_rows').select('*').in('session_id', ids).order('position')
      if (!alive) return
      const last = (prev.data || []).find((p) => (prevRows || []).some((r) => r.session_id === p.id))
      if (!last) return setRows([emptyRow()])
      setSource({ last: last.starts_at })
      // last time's numbers become the hint for today
      setRows(prevRows.filter((r) => r.session_id === last.id).map((r) => ({
        key: Math.random().toString(36).slice(2), exercise: r.exercise, sets: r.sets ?? '',
        reps: r.actual_reps || r.reps || '', kg: r.actual_kg || r.kg || '', actual_kg: '', actual_reps: '',
      })))
    })()
    return () => { alive = false }
  }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (i, k) => (e) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)))

  async function save() {
    setBusy(true)
    const res = await saveRows({ original: orig, rows, actual: true, base: { trainer_id: trainerId, client_id: session.client_id, session_id: session.id } })
    if (!res.error && (note.trim() !== '' || orig.length)) {
      const n = await supabase.from('session_notes').upsert({ session_id: session.id, trainer_id: trainerId, note, updated_at: new Date().toISOString() })
      if (n.error) res.error = n.error
    }
    setBusy(false)
    if (res.error) return toast(t('common.errorGeneric', { msg: res.error.message }), 'err')
    toast(t('log.saved')); onSaved?.()
  }

  const id = session?.id
  return (
    <Modal open={!!session} wide title={t('log.title')} onClose={onClose}>
      {session && (
        <div className="form">
          <div className="meta" style={{ marginTop: -8 }}>
            <b style={{ color: 'var(--ink)' }}>{clientName}</b> · {fmtDate(ymd(new Date(session.starts_at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })} · {hm(new Date(session.starts_at))}
          </div>
          {rows === null ? <div className="spin" style={{ margin: '20px auto' }} /> : (
            <>
              {source === 'plan' && <div className="last">{t('log.fromPlan')}</div>}
              {source?.last && <div className="last">{t('log.prefilled', { date: fmtDate(ymd(new Date(source.last)), locale) })}</div>}
              <datalist id={`log-ex-${id}`}>{suggest.map((s) => <option key={s} value={s} />)}</datalist>
              <div className="lg">
                <div className="lg-row ex-head" aria-hidden="true"><span>{t('calendar.exercise')}</span><span>{t('calendar.kg')}</span><span>{t('calendar.reps')}</span><span /></div>
                {rows.map((r, i) => (
                  <div className="lg-row" key={r.key}>
                    <div style={{ minWidth: 0 }}>
                      <input id={`lg-e-${id}-${i}`} aria-label={t('calendar.exercise')} list={`log-ex-${id}`} value={r.exercise} onChange={set(i, 'exercise')} placeholder={t('calendar.exercise')} className="lg-name" />
                      {(r.sets || r.reps || r.kg) && <div className="lg-plan">{t('log.plan')}: {rowText(r)}</div>}
                    </div>
                    <input id={`lg-k-${id}-${i}`} aria-label={`${r.exercise} ${t('calendar.kg')}`} inputMode="decimal" placeholder={r.kg || '–'} value={r.actual_kg} onChange={set(i, 'actual_kg')} />
                    <input id={`lg-r-${id}-${i}`} aria-label={`${r.exercise} ${t('calendar.reps')}`} placeholder={r.reps || '–'} value={r.actual_reps} onChange={set(i, 'actual_reps')} />
                    <button type="button" className="chip" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t('calendar.remove')}><X size={13} /></button>
                  </div>
                ))}
              </div>
              <button type="button" className="btn ghost small" style={{ justifySelf: 'start' }} onClick={() => setRows([...rows, emptyRow()])}><Plus />{t('calendar.addRow')}</button>
              <div className="meta">{t('log.hint')}</div>
              <label className="f" htmlFor={`log-note-${id}`}>{t('calendar.privateNote')}
                <textarea id={`log-note-${id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
            </>
          )}
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>{t('log.skip')}</button>
            <button type="button" className="btn" disabled={busy || rows === null} onClick={save}>{t('log.save')}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

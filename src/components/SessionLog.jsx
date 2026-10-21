import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { Modal, useToast } from './ui.jsx'
import { ExerciseRows, fromDb, saveRows } from './ExerciseRows.jsx'
import { fmtDate, hm, ymd } from '../lib/format.js'

// Quick training log for one session: opens prefilled with last time's exercises.
export default function SessionLog({ session, clientName, trainerId, onClose, onSaved }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [orig, setOrig] = useState([])
  const [note, setNote] = useState('')
  const [prefillDate, setPrefillDate] = useState(null)
  const [suggest, setSuggest] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!session) return
    let alive = true
    setRows(null); setPrefillDate(null); setNote('')
    ;(async () => {
      const [mine, n, prev, names] = await Promise.all([
        supabase.from('exercise_rows').select('*').eq('session_id', session.id).order('position'),
        supabase.from('session_notes').select('note').eq('session_id', session.id).maybeSingle(),
        supabase.from('sessions').select('id, starts_at').eq('client_id', session.client_id).lt('starts_at', session.starts_at).order('starts_at', { ascending: false }).limit(12),
        supabase.from('exercise_rows').select('exercise').eq('trainer_id', trainerId).limit(500),
      ])
      if (!alive) return
      const existing = (mine.data || []).map(fromDb)
      setOrig(existing); setNote(n.data?.note || '')
      setSuggest([...new Set((names.data || []).map((x) => x.exercise))].sort())
      if (existing.length) return setRows(existing)
      const ids = (prev.data || []).map((x) => x.id)
      if (!ids.length) return setRows([])
      const { data: prevRows } = await supabase.from('exercise_rows').select('*').in('session_id', ids).order('position')
      if (!alive) return
      const last = (prev.data || []).find((p) => (prevRows || []).some((r) => r.session_id === p.id))
      if (!last) return setRows([])
      setPrefillDate(last.starts_at)
      setRows(prevRows.filter((r) => r.session_id === last.id).map((r) => ({ ...fromDb(r), id: undefined, key: Math.random().toString(36).slice(2) })))
    })()
    return () => { alive = false }
  }, [session?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true)
    const res = await saveRows({ original: orig, rows, base: { trainer_id: trainerId, client_id: session.client_id, session_id: session.id } })
    if (!res.error && note.trim() !== '') {
      const n = await supabase.from('session_notes').upsert({ session_id: session.id, trainer_id: trainerId, note, updated_at: new Date().toISOString() })
      if (n.error) res.error = n.error
    }
    setBusy(false)
    if (res.error) return toast(t('common.errorGeneric', { msg: res.error.message }), 'err')
    toast(t('log.saved')); onSaved?.()
  }

  return (
    <Modal open={!!session} wide title={t('log.title')} onClose={onClose}>
      {session && (
        <div className="form">
          <div className="meta" style={{ marginTop: -8 }}>
            <b style={{ color: 'var(--ink)' }}>{clientName}</b> · {fmtDate(ymd(new Date(session.starts_at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })} · {hm(new Date(session.starts_at))}
          </div>
          {rows === null ? <div className="spin" style={{ margin: '20px auto' }} /> : (
            <>
              {prefillDate && <div className="last">{t('log.prefilled', { date: fmtDate(ymd(new Date(prefillDate)), locale) })}</div>}
              {rows.length === 0 && !prefillDate && <div className="meta">{t('log.empty')}</div>}
              <ExerciseRows rows={rows} setRows={setRows} idPrefix={`log-${session.id}`} suggestions={suggest} />
              <label className="f" htmlFor={`log-note-${session.id}`}>{t('calendar.privateNote')}
                <textarea id={`log-note-${session.id}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
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

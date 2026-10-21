import { Plus, X, Check } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'

export const emptyRow = () => ({ key: Math.random().toString(36).slice(2), exercise: '', sets: '', reps: '', kg: '' })
export const fromDb = (r) => ({ ...r, key: r.id, sets: r.sets ?? '', reps: r.reps ?? '', kg: r.kg ?? '' })

// Editable table of exercises. `showActual` adds the client's own numbers (online plans).
export function ExerciseRows({ rows, setRows, showActual, idPrefix, suggestions = [] }) {
  const { t } = useI18n()
  const set = (i, k) => (e) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)))
  const listId = `${idPrefix}-ex-list`
  return (
    <div className="ex">
      <datalist id={listId}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
      {rows.length > 0 && (
        <div className="ex-row ex-head" aria-hidden="true">
          <span>{t('calendar.exercise')}</span><span>{t('calendar.sets')}</span><span>{t('calendar.reps')}</span><span>{t('calendar.kg')}</span><span />
        </div>
      )}
      {rows.map((r, i) => (
        <div key={r.key} className="ex-item">
          <div className="ex-row">
            <input id={`${idPrefix}-e-${i}`} aria-label={t('calendar.exercise')} list={listId} value={r.exercise} onChange={set(i, 'exercise')} placeholder={t('calendar.exercise')} />
            <input id={`${idPrefix}-s-${i}`} aria-label={t('calendar.sets')} inputMode="numeric" value={r.sets} onChange={set(i, 'sets')} />
            <input id={`${idPrefix}-r-${i}`} aria-label={t('calendar.reps')} value={r.reps} onChange={set(i, 'reps')} />
            <input id={`${idPrefix}-k-${i}`} aria-label={t('calendar.kg')} value={r.kg} onChange={set(i, 'kg')} />
            <button type="button" className="chip" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={t('calendar.remove')}><X size={13} /></button>
          </div>
          {showActual && (r.actual_kg || r.actual_reps || r.done) && (
            <div className="ex-actual">
              {r.done && <Check size={13} />} {t('programs.actual')}: {r.actual_reps || r.reps || '–'} × {r.actual_kg || '–'} kg
            </div>
          )}
        </div>
      ))}
      <button type="button" className="btn ghost small" onClick={() => setRows([...rows, emptyRow()])}><Plus />{t('calendar.addRow')}</button>
    </div>
  )
}

// Writes the edited rows: updates existing, inserts new, deletes removed.
export async function saveRows({ original, rows, base }) {
  const clean = rows.filter((r) => r.exercise.trim())
  const keepIds = new Set(clean.filter((r) => r.id).map((r) => r.id))
  const removed = original.filter((r) => !keepIds.has(r.id)).map((r) => r.id)
  const toRow = (r, i) => ({
    ...base, position: i + 1, exercise: r.exercise.trim(),
    sets: r.sets === '' || r.sets == null ? null : parseInt(r.sets, 10) || null,
    reps: r.reps === '' ? null : String(r.reps), kg: r.kg === '' ? null : String(r.kg),
  })
  const ops = []
  if (removed.length) ops.push(supabase.from('exercise_rows').delete().in('id', removed))
  clean.forEach((r, i) => {
    if (r.id) ops.push(supabase.from('exercise_rows').update(toRow(r, i)).eq('id', r.id))
    else ops.push(supabase.from('exercise_rows').insert(toRow(r, i)))
  })
  const res = await Promise.all(ops)
  const err = res.find((x) => x.error)
  return err ? { error: err.error } : { error: null }
}

export function rowText(r) {
  const parts = [r.sets && r.reps ? `${r.sets} × ${r.reps}` : r.reps || (r.sets ? `${r.sets}×` : '')]
  if (r.kg) parts.push(/^[\d.,]+$/.test(r.kg) ? `${r.kg} kg` : r.kg)
  return parts.filter(Boolean).join(' · ')
}

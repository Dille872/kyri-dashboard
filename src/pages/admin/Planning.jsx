import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, ChevronDown, Check, History, LayoutTemplate, Trash2, Video } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { useRun, useToast } from '../../components/ui.jsx'
import { ExerciseRows, fromDb, saveRows } from '../../components/ExerciseRows.jsx'
import { addDays, fmtDate, hm, isoDow, isoWeek, mondayOf, toIso, ymd } from '../../lib/format.js'

// Sunday desk work: write the plan for every session of the coming week.
export default function Planning({ data, trainerId }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const today = ymd()
  // Fri–Sun: plan next week; otherwise this week
  const [monday, setMonday] = useState(addDays(mondayOf(today), isoDow(today) >= 5 ? 7 : 0))
  const [sessions, setSessions] = useState(null)
  const [templates, setTemplates] = useState([])
  const [open, setOpen] = useState(null)
  const [suggest, setSuggest] = useState([])
  const byId = Object.fromEntries(data.clients.map((c) => [c.id, c]))

  const load = useCallback(async () => {
    const [s, tp, names] = await Promise.all([
      run(supabase.from('sessions').select('*, exercise_rows(*)').eq('trainer_id', trainerId).not('client_id', 'is', null).eq('status', 'planned')
        .gte('starts_at', toIso(monday, '00:00')).lt('starts_at', toIso(addDays(monday, 7), '00:00')).order('starts_at')),
      run(supabase.from('workout_templates').select('*').eq('trainer_id', trainerId).order('name')),
      supabase.from('exercise_rows').select('exercise').eq('trainer_id', trainerId).limit(800),
    ])
    if (s.ok) setSessions(s.data.map((x) => ({ ...x, exercise_rows: (x.exercise_rows || []).sort((a, b) => a.position - b.position) })))
    if (tp.ok) setTemplates(tp.data)
    setSuggest([...new Set((names.data || []).map((x) => x.exercise))].sort())
  }, [monday, trainerId, run])
  useEffect(() => { load() }, [load])

  const planned = (sessions || []).filter((s) => s.exercise_rows.length).length
  const total = (sessions || []).length
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))

  async function deleteTemplate(tp) {
    const r = await run(supabase.from('workout_templates').delete().eq('id', tp.id))
    if (r.ok) setTemplates(templates.filter((x) => x.id !== tp.id))
  }

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{t('calendar.week', { n: isoWeek(monday) })} · {fmtDate(monday, locale)} – {fmtDate(addDays(monday, 6), locale)}</div>
          <h1>{t('planning.title')}</h1>
          <p className="sub">{t('planning.subtitle')}</p>
        </div>
        <div className="acts">
          <button className="btn ghost small" onClick={() => setMonday(addDays(monday, -7))} aria-label={t('calendar.prev')}><ChevronLeft /></button>
          <button className="btn ghost small" onClick={() => setMonday(addDays(mondayOf(today), 7))}>{t('planning.nextWeek')}</button>
          <button className="btn ghost small" onClick={() => setMonday(addDays(monday, 7))} aria-label={t('calendar.next')}><ChevronRight /></button>
        </div>
      </div>

      {sessions && (
        <div className="panel plan-progress">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <b>{t('planning.progress', { done: planned, total })}</b>
            {total > 0 && planned === total && <span className="pill ok">{t('planning.allDone')}</span>}
          </div>
          <div className="bar full" style={{ marginTop: 10 }}><i style={{ width: `${total ? (planned / total) * 100 : 0}%` }} /></div>
        </div>
      )}

      <div className="grid" style={{ gap: 18, marginTop: 14 }}>
        {sessions && total === 0 && <div className="panel"><div className="empty">{t('planning.empty')}</div></div>}
        {days.map((d) => {
          const list = (sessions || []).filter((s) => ymd(new Date(s.starts_at)) === d)
          if (!list.length) return null
          return (
            <section key={d}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>{fmtDate(d, locale, { weekday: 'long', day: 'numeric', month: 'short' })}</div>
              <div className="grid" style={{ gap: 8 }}>
                {list.map((s) => (
                  <PlanCard key={s.id} s={s} client={byId[s.client_id]} isOpen={open === s.id} onToggle={() => setOpen(open === s.id ? null : s.id)}
                    templates={templates} suggest={suggest} trainerId={trainerId}
                    onSaved={() => { setOpen(null); load() }} onTemplateSaved={(tp) => setTemplates([...templates, tp].sort((a, b) => a.name.localeCompare(b.name)))} />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-h"><h2>{t('planning.templates')}</h2></div>
        {templates.length === 0 ? <div className="empty">{t('planning.noTemplates')}</div> : (
          <div className="list">
            {templates.map((tp) => (
              <div className="row" key={tp.id}>
                <div style={{ minWidth: 0 }}><div className="name">{tp.name}</div><div className="meta">{tp.rows.map((r) => r.exercise).join(' · ')}</div></div>
                <button className="icon-btn" onClick={() => deleteTemplate(tp)} aria-label={t('common.delete')} title={t('common.delete')}><Trash2 /></button>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  )
}

function PlanCard({ s, client, isOpen, onToggle, templates, suggest, trainerId, onSaved, onTemplateSaved }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [rows, setRows] = useState(s.exercise_rows.map(fromDb))
  const [tplName, setTplName] = useState('')
  const [askTpl, setAskTpl] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => { setRows(s.exercise_rows.map(fromDb)) }, [s])

  async function likeLastTime() {
    const { data: prev } = await supabase.from('sessions').select('id, starts_at').eq('client_id', s.client_id).lt('starts_at', s.starts_at).order('starts_at', { ascending: false }).limit(12)
    const ids = (prev || []).map((x) => x.id)
    if (!ids.length) return toast(t('calendar.noLast'))
    const { data: pr } = await supabase.from('exercise_rows').select('*').in('session_id', ids).order('position')
    const last = prev.find((p) => (pr || []).some((r) => r.session_id === p.id))
    if (!last) return toast(t('calendar.noLast'))
    setRows(pr.filter((r) => r.session_id === last.id).map((r) => ({
      key: Math.random().toString(36).slice(2), exercise: r.exercise, sets: r.sets ?? '', reps: r.actual_reps || r.reps || '', kg: r.actual_kg || r.kg || '',
    })))
    toast(t('planning.copiedLast', { date: fmtDate(ymd(new Date(last.starts_at)), locale) }))
  }
  function applyTemplate(id) {
    const tp = templates.find((x) => x.id === id)
    if (!tp) return
    setRows(tp.rows.map((r) => ({ key: Math.random().toString(36).slice(2), exercise: r.exercise, sets: r.sets ?? '', reps: r.reps ?? '', kg: r.kg ?? '' })))
  }
  async function save() {
    setBusy(true)
    const res = await saveRows({ original: s.exercise_rows, rows, base: { trainer_id: trainerId, client_id: s.client_id, session_id: s.id } })
    setBusy(false)
    if (res.error) return toast(t('common.errorGeneric', { msg: res.error.message }), 'err')
    toast(t('planning.saved', { name: client?.name })); onSaved()
  }
  async function saveTemplate() {
    const clean = rows.filter((r) => r.exercise.trim()).map((r) => ({ exercise: r.exercise.trim(), sets: r.sets === '' ? null : Number(r.sets) || null, reps: r.reps || null, kg: r.kg || null }))
    if (!tplName.trim() || !clean.length) return
    const r = await run(supabase.from('workout_templates').insert({ trainer_id: trainerId, name: tplName.trim(), rows: clean }).select().single())
    if (r.ok) { onTemplateSaved(r.data); setAskTpl(false); setTplName(''); toast(t('planning.templateSaved')) }
  }

  const has = s.exercise_rows.length > 0
  return (
    <div className={`plan-card ${has ? 'has' : ''} ${isOpen ? 'open' : ''}`}>
      <button className="plan-head" onClick={onToggle} aria-expanded={isOpen}>
        <span className="time">{hm(new Date(s.starts_at))}</span>
        <span style={{ minWidth: 0, textAlign: 'left' }}>
          <span className="name" style={{ display: 'block' }}>{client?.name}</span>
          <span className="meta">
            {s.format === 'online' ? <span className="fmt"><Video />{t('formats.online')}</span> : t(`kinds.${s.kind}`)}
            {has ? ` · ${s.exercise_rows.map((r) => r.exercise).slice(0, 3).join(', ')}${s.exercise_rows.length > 3 ? ' …' : ''}` : ''}
          </span>
        </span>
        {has ? <span className="pill ok"><Check size={12} /> {t('planning.planned')}</span> : <span className="pill mute">{t('planning.noPlan')}</span>}
        <ChevronDown className="chev" />
      </button>
      {isOpen && (
        <div className="plan-body">
          <div className="acts" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="chip" onClick={likeLastTime}><History size={13} style={{ verticalAlign: '-2px' }} /> {t('planning.likeLast')}</button>
            {templates.length > 0 && (
              <select aria-label={t('planning.useTemplate')} value="" onChange={(e) => applyTemplate(e.target.value)} className="tpl-select">
                <option value="">{t('planning.useTemplate')}</option>
                {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
              </select>
            )}
          </div>
          <ExerciseRows rows={rows} setRows={setRows} idPrefix={`plan-${s.id}`} suggestions={suggest} />
          <div className="meta">{t('planning.kgOptional')}</div>
          {askTpl ? (
            <div className="acts" style={{ justifyContent: 'flex-start' }}>
              <input id={`tpl-${s.id}`} aria-label={t('planning.templateName')} placeholder={t('planning.templateName')} value={tplName} onChange={(e) => setTplName(e.target.value)} style={{ maxWidth: 240 }} />
              <button type="button" className="chip solid" onClick={saveTemplate}>{t('common.save')}</button>
              <button type="button" className="chip" onClick={() => setAskTpl(false)}>{t('common.cancel')}</button>
            </div>
          ) : null}
          <div className="modal-foot">
            {!askTpl && <button type="button" className="btn ghost small" onClick={() => setAskTpl(true)}><LayoutTemplate />{t('planning.saveTemplate')}</button>}
            <span className="spacer" />
            <button type="button" className="btn" disabled={busy} onClick={save}>{t('planning.savePlan')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

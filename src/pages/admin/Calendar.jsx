import { useCallback, useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Video, Repeat } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { Modal, useIsMobile, useRun, useToast } from '../../components/ui.jsx'
import { ExerciseRows, fromDb, rowText, saveRows } from '../../components/ExerciseRows.jsx'
import { addDays, fmtDate, hm, isoDow, isoWeek, money, mondayOf, toIso, weekdayName, ymd } from '../../lib/format.js'

export const KINDS = ['strength', 'mobility', 'conditioning', 'own']

export default function Calendar({ data, reload, trainerId }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const today = ymd()
  const [monday, setMonday] = useState(mondayOf(today))
  const [sessions, setSessions] = useState([])
  const [edit, setEdit] = useState(null)   // session object or {isNew:true,date}
  const mobile = useIsMobile()
  const [day, setDay] = useState(today)      // selected day in the phone view

  const load = useCallback(async () => {
    const r = await run(supabase.from('sessions').select('*').eq('trainer_id', trainerId)
      .gte('starts_at', toIso(monday, '00:00')).lt('starts_at', toIso(addDays(monday, 7), '00:00')).order('starts_at'))
    if (r.ok) setSessions(r.data)
  }, [monday, trainerId, run])
  useEffect(() => { load() }, [load])

  const byId = Object.fromEntries(data.clients.map((c) => [c.id, c]))
  const pendingIds = new Set(data.pending.map((p) => p.client_id))
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i))
  const dues = data.clients.filter((c) => c.active && c.next_due_date && !pendingIds.has(c.id))
  const shiftWeek = (n) => { setMonday(addDays(monday, n * 7)); setDay(addDays(day, n * 7)) }
  const sessionsOn = (d) => sessions.filter((s) => ymd(new Date(s.starts_at)) === d)

  if (mobile) {
    const list = sessionsOn(day)
    return (
      <>
        <div className="head" style={{ marginBottom: 14 }}>
          <div><div className="eyebrow">{t('calendar.week', { n: isoWeek(monday) })}</div>
            <h1>{fmtDate(day, locale, { weekday: 'long', day: 'numeric', month: 'long' })}</h1></div>
        </div>
        <div className="daystrip">
          <button className="icon-btn" onClick={() => shiftWeek(-1)} aria-label={t('calendar.prev')}><ChevronLeft /></button>
          {days.map((d) => (
            <button key={d} className={`ds-day ${d === today ? 'is-today' : ''}`} aria-pressed={d === day} onClick={() => setDay(d)}>
              <span>{fmtDate(d, locale, { weekday: 'narrow' })}</span>
              <b>{Number(d.slice(8))}</b>
              <i className={sessionsOn(d).some((s) => s.client_id) ? 'dot' : 'dot off'} />
            </button>
          ))}
          <button className="icon-btn" onClick={() => shiftWeek(1)} aria-label={t('calendar.next')}><ChevronRight /></button>
        </div>
        <section className="panel" style={{ marginTop: 12 }}>
          <div className="list">
            {list.length === 0 && dues.filter((c) => c.next_due_date === day).length === 0 && <div className="empty">{t('overview.noToday')}</div>}
            {list.map((s) => (
              <button key={s.id} className={`row t today-row mrow st-${s.status}`} onClick={() => setEdit(s)}>
                <span className="time">{hm(new Date(s.starts_at))}</span>
                <div style={{ minWidth: 0, textAlign: 'left' }}>
                  <div className="name">{s.client_id ? byId[s.client_id]?.name : (s.notes || t('kinds.own'))}</div>
                  <div className="meta">{s.format === 'online' ? <span className="fmt"><Video />{t('formats.online')}</span> : t(`kinds.${s.kind}`)} · {s.duration_min}′{s.series_id ? ' ↻' : ''}</div>
                </div>
                {s.status !== 'planned' ? <span className={`pill ${s.status === 'done' ? 'ok' : s.status === 'cancelled' ? 'mute' : 'warn'}`}>{t(`statuses.${s.status}`)}</span> : <ChevronRight size={18} style={{ color: 'var(--muted)' }} />}
              </button>
            ))}
            {dues.filter((c) => c.next_due_date === day).map((c) => (
              <div key={c.id} className="row"><div><div className="name">{c.name}</div><div className="meta">{t('calendar.paymentDue')}</div></div><span className="pill warn">{money(c.price, locale)}</span></div>
            ))}
          </div>
        </section>
        <button className="fab" onClick={() => setEdit({ isNew: true, date: day })} aria-label={t('calendar.newSession')}><Plus /></button>
        <SessionModal edit={edit} onClose={() => setEdit(null)} clients={data.clients} trainerId={trainerId}
          onSaved={() => { setEdit(null); load(); reload() }} />
      </>
    )
  }

  return (
    <>
      <div className="head">
        <div>
          <div className="eyebrow">{t('calendar.week', { n: isoWeek(monday) })}</div>
          <h1>{t('calendar.title')}</h1>
          <p className="sub">{fmtDate(monday, locale, { day: 'numeric', month: 'long' })} – {fmtDate(addDays(monday, 6), locale, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="acts">
          <button className="btn ghost small" onClick={() => setMonday(addDays(monday, -7))} aria-label={t('calendar.prev')}><ChevronLeft /></button>
          <button className="btn ghost small" onClick={() => setMonday(mondayOf(today))}>{t('calendar.today')}</button>
          <button className="btn ghost small" onClick={() => setMonday(addDays(monday, 7))} aria-label={t('calendar.next')}><ChevronRight /></button>
          <button className="btn small" onClick={() => setEdit({ isNew: true, date: days.includes(today) ? today : monday })}><Plus />{t('calendar.newSession')}</button>
        </div>
      </div>

      <div className="week">
        {days.map((d) => {
          const list = sessions.filter((s) => ymd(new Date(s.starts_at)) === d)
          return (
            <div key={d} className={`day ${d === today ? 'today' : ''}`}>
              <div className="day-h"><b>{fmtDate(d, locale, { weekday: 'short' })}</b><span>{fmtDate(d, locale, { day: 'numeric', month: 'numeric' })}</span></div>
              {list.map((s) => (
                <button key={s.id} className={`ev st-${s.status}`} style={{ '--c': `var(--c-${s.kind})` }} onClick={() => setEdit(s)}
                  title={`${hm(new Date(s.starts_at))} · ${s.duration_min}′ · ${t(`kinds.${s.kind}`)}`}>
                  <span className="t">{hm(new Date(s.starts_at))}{s.series_id ? ' ↻' : ''}</span>{' '}
                  {s.client_id ? byId[s.client_id]?.name : (s.notes || t('kinds.own'))}
                  {(s.format === 'online' || s.status !== 'planned') && (
                    <div className="meta">
                      {s.format === 'online' && <span className="fmt"><Video />{t('formats.online')}</span>}
                      {s.status !== 'planned' ? `${s.format === 'online' ? ' · ' : ''}${t(`statuses.${s.status}`)}` : ''}
                    </div>
                  )}
                </button>
              ))}
              {dues.filter((c) => c.next_due_date === d).map((c) => (
                <div key={c.id} className="ev pay"><div className="t">{t('calendar.paymentDue')}</div>{c.name}<div className="meta">{money(c.price, locale)}</div></div>
              ))}
              <button className="day-add" onClick={() => setEdit({ isNew: true, date: d })} aria-label={t('calendar.newSession')}>+</button>
            </div>
          )
        })}
      </div>
      <div className="legend">
        {KINDS.map((k) => <span key={k} style={{ '--c': `var(--c-${k})` }}><i />{t(`kinds.${k}`)}</span>)}
        <span style={{ '--c': 'var(--warn)' }}><i />{t('calendar.paymentDue')}</span>
      </div>

      <SessionModal edit={edit} onClose={() => setEdit(null)} clients={data.clients} trainerId={trainerId}
        onSaved={() => { setEdit(null); load(); reload() }} />
    </>
  )
}

function SessionModal({ edit, onClose, clients, trainerId, onSaved }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [f, setF] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)       // 'one' | 'series'
  const [rows, setRows] = useState([])
  const [origRows, setOrigRows] = useState([])
  const [note, setNote] = useState('')
  const [last, setLast] = useState(undefined)              // undefined = loading, null = none
  const [suggest, setSuggest] = useState([])

  useEffect(() => {
    setConfirmDel(null); setRows([]); setOrigRows([]); setNote(''); setLast(undefined)
    if (!edit) return setF(null)
    if (edit.isNew) {
      setF({ client_id: '', date: edit.date, time: '18:00', duration_min: 60, kind: 'strength', format: 'gym', meeting_url: '', location: '', notes: '',
        status: 'planned', repeat: false, repeatDays: [isoDow(edit.date)], repeatWeeks: 8 })
    } else {
      const d = new Date(edit.starts_at)
      setF({ ...edit, client_id: edit.client_id || '', date: ymd(d), time: hm(d), location: edit.location || '', notes: edit.notes || '', meeting_url: edit.meeting_url || '' })
      if (edit.client_id) loadLog(edit)
    }
  }, [edit]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadLog(s) {
    const [mine, note, prev, names] = await Promise.all([
      supabase.from('exercise_rows').select('*').eq('session_id', s.id).order('position'),
      supabase.from('session_notes').select('note').eq('session_id', s.id).maybeSingle(),
      supabase.from('sessions').select('id, starts_at').eq('client_id', s.client_id).lt('starts_at', s.starts_at).order('starts_at', { ascending: false }).limit(12),
      supabase.from('exercise_rows').select('exercise').eq('trainer_id', trainerId).limit(500),
    ])
    const r = (mine.data || []).map(fromDb)
    setRows(r); setOrigRows(r); setNote(note.data?.note || '')
    setSuggest([...new Set((names.data || []).map((x) => x.exercise))].sort())
    const ids = (prev.data || []).map((x) => x.id)
    if (!ids.length) return setLast(null)
    const { data: prevRows } = await supabase.from('exercise_rows').select('*').in('session_id', ids).order('position')
    const firstWith = (prev.data || []).find((p) => (prevRows || []).some((r) => r.session_id === p.id))
    setLast(firstWith ? { date: firstWith.starts_at, rows: prevRows.filter((r) => r.session_id === firstWith.id) } : null)
  }

  if (!f || !edit) return <Modal open={false} onClose={onClose} />
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const active = clients.filter((c) => c.active || c.id === f.client_id)
  function pickClient(e) {
    const c = clients.find((x) => x.id === e.target.value)
    setF({ ...f, client_id: e.target.value, format: c?.mode === 'online' ? 'online' : f.format })
  }
  const toggleDay = (n) => setF({ ...f, repeatDays: f.repeatDays.includes(n) ? f.repeatDays.filter((x) => x !== n) : [...f.repeatDays, n].sort() })

  function baseRow(status) {
    return {
      trainer_id: trainerId, client_id: f.client_id || null, duration_min: Number(f.duration_min) || 60,
      kind: f.client_id ? (f.kind === 'own' ? 'strength' : f.kind) : 'own', format: f.format,
      meeting_url: f.format === 'online' ? (f.meeting_url || null) : null,
      location: f.format === 'gym' ? (f.location || null) : null, notes: f.notes || null, status: status || f.status,
    }
  }

  async function save(e, status) {
    e?.preventDefault()
    if (edit.isNew && f.repeat && f.repeatDays.length) {
      const series = crypto.randomUUID()
      const mon = mondayOf(f.date)
      const list = []
      for (let w = 0; w < Math.min(Number(f.repeatWeeks) || 1, 52); w++) {
        for (const d of f.repeatDays) {
          const date = addDays(mon, w * 7 + d - 1)
          if (date >= f.date) list.push({ ...baseRow(), starts_at: toIso(date, f.time), series_id: series })
        }
      }
      const r = await run(supabase.from('sessions').insert(list))
      if (r.ok) { toast(t('calendar.seriesCreated', { n: list.length })); onSaved() }
      return
    }
    const row = { ...baseRow(status), starts_at: toIso(f.date, f.time) }
    const r = edit.isNew ? await run(supabase.from('sessions').insert(row)) : await run(supabase.from('sessions').update(row).eq('id', edit.id))
    if (!r.ok) return
    if (!edit.isNew && f.client_id) {
      const res = await saveRows({ original: origRows, rows, base: { trainer_id: trainerId, client_id: f.client_id, session_id: edit.id } })
      if (res.error) return toast(t('common.errorGeneric', { msg: res.error.message }), 'err')
      const n = await run(supabase.from('session_notes').upsert({ session_id: edit.id, trainer_id: trainerId, note, updated_at: new Date().toISOString() }))
      if (!n.ok) return
    }
    toast(t('common.saved')); onSaved()
  }
  async function del(scope) {
    if (confirmDel !== scope) return setConfirmDel(scope)
    const q = scope === 'series'
      ? supabase.from('sessions').delete().eq('series_id', edit.series_id).gte('starts_at', edit.starts_at)
      : supabase.from('sessions').delete().eq('id', edit.id)
    const r = await run(q)
    if (r.ok) onSaved()
  }

  return (
    <Modal open={!!edit} wide={!edit.isNew && !!f.client_id} title={edit.isNew ? t('calendar.newSession') : t('calendar.editSession')} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="row2">
          <label className="f" htmlFor="s-client">{t('calendar.client')}
            <select id="s-client" value={f.client_id} onChange={pickClient}>
              <option value="">{t('calendar.ownTime')}</option>
              {active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div className="f" style={{ display: 'grid', gap: 5, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{t('calendar.format')}
            <div className="seg" role="group" aria-label={t('calendar.format')} style={{ justifySelf: 'start' }}>
              {['gym', 'online'].map((x) => <button type="button" key={x} aria-pressed={f.format === x} onClick={() => setF({ ...f, format: x })}>{t(`formats.${x}`)}</button>)}
            </div>
          </div>
        </div>
        <div className="row3">
          <label className="f" htmlFor="s-date">{t('calendar.date')}<input id="s-date" type="date" required value={f.date} onChange={set('date')} /></label>
          <label className="f" htmlFor="s-time">{t('calendar.time')}<input id="s-time" type="time" required step="300" value={f.time} onChange={set('time')} /></label>
          <label className="f" htmlFor="s-dur">{t('calendar.duration')}<input id="s-dur" type="number" min="5" max="600" step="5" value={f.duration_min} onChange={set('duration_min')} /></label>
        </div>
        <div className="row2">
          <label className="f" htmlFor="s-kind">{t('calendar.kind')}
            <select id="s-kind" value={f.client_id ? f.kind : 'own'} onChange={set('kind')} disabled={!f.client_id}>
              {(f.client_id ? KINDS.filter((k) => k !== 'own') : ['own']).map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
            </select>
          </label>
          {f.format === 'online'
            ? <label className="f" htmlFor="s-url">{t('calendar.meetingUrl')}<input id="s-url" type="url" value={f.meeting_url} onChange={set('meeting_url')} placeholder="https://" /></label>
            : <label className="f" htmlFor="s-loc">{t('calendar.location')}<input id="s-loc" value={f.location} onChange={set('location')} placeholder="Studio" /></label>}
        </div>
        {f.format === 'online' && <div className="meta" style={{ marginTop: -8 }}>{t('calendar.meetingHelp')}</div>}
        <label className="f" htmlFor="s-notes">{t('calendar.notes')}<input id="s-notes" value={f.notes} onChange={set('notes')} /></label>

        {edit.isNew && (
          <div className="section">
            <label className="check-row" htmlFor="s-rep"><input id="s-rep" type="checkbox" checked={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.checked })} /><Repeat size={16} />{t('calendar.repeat')}</label>
            {f.repeat && (
              <>
                <div className="meta">{t('calendar.repeatDays')}</div>
                <div className="days">{[1, 2, 3, 4, 5, 6, 7].map((n) => <button type="button" key={n} className="chip" aria-pressed={f.repeatDays.includes(n)} onClick={() => toggleDay(n)}>{weekdayName(n, locale, 'short')}</button>)}</div>
                <label className="f" htmlFor="s-weeks" style={{ maxWidth: 200 }}>{t('calendar.repeatWeeks')}<input id="s-weeks" type="number" min="1" max="52" value={f.repeatWeeks} onChange={set('repeatWeeks')} /></label>
              </>
            )}
          </div>
        )}

        {!edit.isNew && f.client_id && (
          <>
            <div className="section">
              <div className="meta">{t('calendar.status')}: <b style={{ color: 'var(--ink)' }}>{t(`statuses.${edit.status}`)}</b> · {t('calendar.doneHint')}</div>
              <div className="acts" style={{ justifyContent: 'flex-start' }}>
                {edit.status !== 'done' && <button type="button" className="chip solid" onClick={() => save(null, 'done')}>{t('calendar.markDone')}</button>}
                {edit.status !== 'no_show' && <button type="button" className="chip" onClick={() => save(null, 'no_show')}>{t('calendar.noShow')}</button>}
                {edit.status !== 'late_cancel' && <button type="button" className="chip" onClick={() => save(null, 'late_cancel')}>{t('statuses.late_cancel')}</button>}
                {edit.status !== 'cancelled' && <button type="button" className="chip" onClick={() => save(null, 'cancelled')}>{t('calendar.cancelSession')}</button>}
                {edit.status !== 'planned' && <button type="button" className="chip" onClick={() => save(null, 'planned')}>{t('calendar.reopen')}</button>}
              </div>
            </div>
            <div className="section">
              <h2>{t('calendar.log')}</h2>
              {last === undefined ? null : last === null ? <div className="meta">{t('calendar.noLast')}</div> : (
                <div className="last">
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    <b>{t('calendar.lastTime', { date: fmtDate(ymd(new Date(last.date)), locale) })}</b>
                    {rows.length === 0 && <button type="button" className="chip" onClick={() => setRows(last.rows.map((r) => ({ ...fromDb(r), kg: r.actual_kg || r.kg || '', reps: r.actual_reps || r.reps || '', actual_kg: null, actual_reps: null, done: false, id: undefined, key: Math.random().toString(36).slice(2) })))}>{t('calendar.copyLast')}</button>}
                  </div>
                  <ul>{last.rows.map((r) => <li key={r.id}>{r.exercise} · {rowText(r, true)}</li>)}</ul>
                </div>
              )}
              <ExerciseRows rows={rows} setRows={setRows} showActual idPrefix="sess" suggestions={suggest} />
              <label className="f" htmlFor="s-private">{t('calendar.privateNote')}<textarea id="s-private" rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></label>
            </div>
          </>
        )}

        <div className="modal-foot">
          {!edit.isNew && <button type="button" className="btn danger small" onClick={() => del('one')}>{confirmDel === 'one' ? t('calendar.confirmDelete') : t('calendar.deleteSession')}</button>}
          {!edit.isNew && edit.series_id && <button type="button" className="btn danger small" onClick={() => del('series')}>{confirmDel === 'series' ? t('calendar.confirmDelete') : t('calendar.deleteSeries')}</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn">{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

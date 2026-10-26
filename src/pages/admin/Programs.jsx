import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarPlus, ClipboardPaste, Copy, Pencil, Plus, Trash2, Video, X } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { Modal, Spinner, useIsMobile, useRun, useToast } from '../../components/ui.jsx'
import ProgramDay from '../../components/ProgramDay.jsx'
import { MediaModal, useLibrary } from '../../components/ExerciseMedia.jsx'
import { blocksToText, exKey, historyByExercise, parseDayText, parseNotes } from '../../lib/program.js'
import { addDays, fmtDate, hm, toIso, ymd } from '../../lib/format.js'

const KEY = 'programs-client'
const toIsoStartOfToday = () => toIso(ymd(), '00:00')

// Programs replace the weekly planning: days that repeat, like Kyri's notes.
export default function Programs({ data, trainerId, go, reload }) {
  const { t } = useI18n()
  const mobile = useIsMobile()
  const [list, setList] = useState(null)       // programs of all clients (light)
  const [clientId, setClientId] = useState(() => { try { return sessionStorage.getItem(KEY) || '' } catch { return '' } })
  const [lib, reloadLib] = useLibrary(trainerId)

  const loadList = useCallback(async () => {
    const { data: p } = await supabase.from('programs').select('id, client_id, title, program_days(id)').eq('trainer_id', trainerId)
    setList(p || [])
  }, [trainerId])
  useEffect(() => { loadList() }, [loadList])
  useEffect(() => { try { clientId ? sessionStorage.setItem(KEY, clientId) : sessionStorage.removeItem(KEY) } catch {} }, [clientId])
  // desktop: open the first program right away
  useEffect(() => { if (!mobile && list && !clientId && list[0]) setClientId(list[0].client_id) }, [mobile, list, clientId])

  if (!list) return <Spinner />
  const byClient = Object.fromEntries(list.map((p) => [p.client_id, p]))
  const withProg = data.clients.filter((c) => byClient[c.id]).sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  const need = data.clients.filter((c) => c.active && !byClient[c.id])
  const client = data.clients.find((c) => c.id === clientId)

  async function create(c) {
    const first = c.name.split(' ')[0]
    const { data: p, error } = await supabase.from('programs').insert({ trainer_id: trainerId, client_id: c.id, title: t('prog.newTitle', { name: first }) }).select().single()
    if (error) return
    await supabase.from('program_days').insert({ program_id: p.id, trainer_id: trainerId, position: 1, title: 'Day 1', blocks: [] })
    await loadList(); setClientId(c.id)
  }

  const listPanel = (
    <section className="panel prog-list-panel" style={{ alignSelf: 'start' }}>
      <div className="panel-h"><h2>{t('prog.withProgram')}</h2><span className="tag">{withProg.length}</span></div>
      <div className="list">
        {withProg.length === 0 && <div className="empty">{t('prog.none')}</div>}
        {withProg.map((c) => (
          <button key={c.id} className="row mrow pick" aria-current={c.id === clientId} onClick={() => { setClientId(c.id); window.scrollTo(0, 0) }}>
            <div style={{ minWidth: 0, textAlign: 'left' }}><div className="name">{c.name}</div>
              <div className="meta">{c.mode !== 'gym' ? <span className="fmt"><Video />{t('formats.online')}</span> : t('formats.gym')} · {t(byClient[c.id].program_days.length === 1 ? 'prog.dayCount1' : 'prog.dayCount', { n: byClient[c.id].program_days.length })}{!c.active ? ` · ${t('clients.inactive')}` : ''}</div></div>
          </button>
        ))}
      </div>
      {need.length > 0 && (
        <>
          <div className="panel-h" style={{ marginTop: 18 }}><h2>{t('prog.need')}</h2><span className="pill warn">{need.length}</span></div>
          <div className="list">
            {need.map((c) => (
              <div className="row" key={c.id}>
                <div style={{ minWidth: 0 }}><div className="name">{c.name}</div><div className="meta">{t(`modes.${c.mode || 'gym'}`)}</div></div>
                <button className="chip solid" onClick={() => create(c)}><Plus size={12} style={{ verticalAlign: '-2px' }} /> {t('prog.create')}</button>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  )

  const editor = client && byClient[client.id]
    ? <Editor key={client.id} client={client} data={data} trainerId={trainerId} lib={lib} reloadLib={reloadLib}
        onChanged={loadList} onBack={mobile ? () => setClientId('') : null} onOpen={(id) => setClientId(id)} go={go} reload={reload} />
    : null

  return (
    <>
      {(!mobile || !editor) && (
        <div className="head"><div><div className="eyebrow">{data.trainer.brand_name}</div><h1>{t('prog.title')}</h1><p className="sub">{t('prog.subtitle')}</p></div></div>
      )}
      {mobile ? (editor || listPanel) : (
        <div className="prog-layout">
          {listPanel}
          <div style={{ minWidth: 0 }}>{editor || <div className="panel empty">{t('prog.noClient')}</div>}</div>
        </div>
      )}
    </>
  )
}

function Editor({ client, data, trainerId, lib, reloadLib, onChanged, onBack, onOpen, reload }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [prog, setProg] = useState(null)
  const [logs, setLogs] = useState([])
  const [dayIdx, setDayIdx] = useState(0)
  const [edit, setEdit] = useState(null)        // { title, focus, note, text }
  const [media, setMedia] = useState(null)      // exercise name
  const [importOpen, setImportOpen] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [nextId, setNextId] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [titleEdit, setTitleEdit] = useState(null)
  const [upcoming, setUpcoming] = useState([])      // booked sessions of this client
  const [assignOpen, setAssignOpen] = useState(false)

  const load = useCallback(async () => {
    const [p, l, n, u] = await Promise.all([
      supabase.from('programs').select('*, program_days(*)').eq('client_id', client.id).maybeSingle(),
      supabase.from('exercise_logs').select('exercise, kg, reps, logged_on, created_at, day_id, source').eq('client_id', client.id).order('logged_on'),
      supabase.rpc('next_day_for', { p_client: client.id }),
      supabase.from('sessions').select('id, starts_at, program_day_id, format').eq('client_id', client.id).eq('status', 'planned')
        .gte('starts_at', toIsoStartOfToday()).order('starts_at').limit(40),
    ])
    setUpcoming(u.data || [])
    if (p.data) p.data.program_days.sort((a, b) => a.position - b.position)
    setProg(p.data); setLogs(l.data || []); setNextId(n.data || null)
  }, [client.id])
  useEffect(() => { load() }, [load])

  const history = useMemo(() => historyByExercise(logs), [logs])
  if (!prog) return <Spinner />
  const days = prog.program_days
  const day = days[Math.min(dayIdx, days.length - 1)]
  const lastLog = [...logs].filter((l) => l.day_id).sort((a, b) => (b.logged_on + b.created_at).localeCompare(a.logged_on + a.created_at))[0]
  const lastDay = lastLog && days.find((d) => d.id === lastLog.day_id)
  const nextDay = days.find((d) => d.id === nextId)
  const when = (iso) => `${fmtDate(ymd(new Date(iso)), locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hm(new Date(iso))}`
  async function assign(sessionId, dayId) {
    const r = await run(supabase.from('sessions').update({ program_day_id: dayId }).eq('id', sessionId))
    if (!r.ok) return
    const se = upcoming.find((x) => x.id === sessionId)
    if (dayId) toast(t('prog.assignedToast', { day: day.title, when: when(se.starts_at) }))
    setUpcoming(upcoming.map((x) => (x.id === sessionId ? { ...x, program_day_id: dayId } : x)))
  }

  // kg found in pasted / typed text → history entries, one week apart, ending today
  async function addImportLogs(kgs) {
    const today = ymd()
    const rows = kgs.flatMap(({ exercise, kg }) => kg.map((v, i) => ({
      trainer_id: trainerId, client_id: client.id, exercise, kg: v, source: 'import', logged_on: addDays(today, -7 * (kg.length - 1 - i)),
    })))
    if (rows.length) await run(supabase.from('exercise_logs').insert(rows))
    return rows.length
  }

  function startEdit(d) {
    setEdit({ id: d.id, title: d.title, focus: d.focus || '', note: d.note || '', text: blocksToText(d.blocks) })
  }
  async function saveDay() {
    const parsed = parseDayText(edit.text)
    const r = await run(supabase.from('program_days').update({ title: edit.title.trim() || day.title, focus: edit.focus.trim() || null, note: edit.note.trim() || null, blocks: parsed.blocks }).eq('id', edit.id))
    if (!r.ok) return
    await addImportLogs(parsed.kg)
    setEdit(null); toast(t('prog.saved')); load(); onChanged()
  }
  async function addDay() {
    const pos = (days[days.length - 1]?.position || 0) + 1
    const r = await run(supabase.from('program_days').insert({ program_id: prog.id, trainer_id: trainerId, position: pos, title: `Day ${days.length + 1}`, blocks: [] }).select().single())
    if (!r.ok) return
    await load(); onChanged(); setDayIdx(days.length); startEdit(r.data)
  }
  async function deleteDay() {
    if (confirm !== 'day') return setConfirm('day')
    const r = await run(supabase.from('program_days').delete().eq('id', day.id))
    if (r.ok) { setConfirm(null); setEdit(null); setDayIdx(0); load(); onChanged() }
  }
  async function deleteProgram() {
    if (confirm !== 'program') return setConfirm('program')
    const r = await run(supabase.from('programs').delete().eq('id', prog.id))
    if (r.ok) { setConfirm(null); onChanged(); onBack?.() }
  }
  async function saveTitle() {
    const r = await run(supabase.from('programs').update({ title: titleEdit.trim() || prog.title }).eq('id', prog.id))
    if (r.ok) { setTitleEdit(null); load(); onChanged() }
  }

  return (
    <>
      {onBack && <button className="chip" onClick={onBack} style={{ marginBottom: 14 }}><ArrowLeft size={13} style={{ verticalAlign: '-2px' }} /> {t('prog.backToList')}</button>}
      {client.mode === 'gym' && (
        <div className="notice" style={{ marginBottom: 14 }}>
          {t('prog.gymHint', { name: client.name.split(' ')[0] })}
          <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <button className="chip solid" onClick={async () => {
              const { error } = await supabase.from('clients').update({ mode: 'hybrid' }).eq('id', client.id)
              if (!error) reload?.()
            }}>{t('prog.makeHybrid')}</button>
          </div>
        </div>
      )}
      <div className="head" style={{ marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">{t('prog.onlyYou', { name: client.name })}</div>
          {titleEdit != null ? (
            <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
              <input aria-label={t('prog.programTitle')} value={titleEdit} onChange={(e) => setTitleEdit(e.target.value)} style={{ maxWidth: 340 }} />
              <button className="chip solid" onClick={saveTitle}>{t('common.save')}</button><button className="chip" onClick={() => setTitleEdit(null)}>{t('common.cancel')}</button>
            </div>
          ) : <h1 className="prog-title"><button className="linkish" onClick={() => setTitleEdit(prog.title)} title={t('prog.rename')}>{prog.title}</button></h1>}
          <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <span className="tag">{client.mode !== 'gym' ? t('prog.online') : t('prog.gym')}</span>
            {lastDay && <span className="tag">{t('prog.last', { day: lastDay.title, date: fmtDate(lastLog.logged_on, locale) })}</span>}
            {nextDay && <span className="pill info">{t('prog.next', { day: nextDay.title })}</span>}
          </div>
        </div>
        <div className="acts">
          <button className="btn ghost small" onClick={() => setImportOpen(true)}><ClipboardPaste />{t('prog.importNotes')}</button>
          <button className="btn small" onClick={() => setCopyOpen(true)}><Copy />{t('prog.copyTo')}</button>
        </div>
      </div>

      <div className="days" style={{ marginBottom: 12 }}>
        {days.map((d, i) => <button key={d.id} className="chip" aria-pressed={d.id === day?.id} onClick={() => { setDayIdx(i); setEdit(null); setConfirm(null) }}>{d.title}</button>)}
        <button className="chip" onClick={addDay}><Plus size={12} style={{ verticalAlign: '-2px' }} /> {t('prog.addDay')}</button>
      </div>

      {day && (edit ? (
        <section className="panel form">
          <div className="row2">
            <label className="f" htmlFor="d-title">{t('prog.dayTitle')}<input id="d-title" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
            <label className="f" htmlFor="d-focus">{t('prog.focus')}<input id="d-focus" value={edit.focus} placeholder="Strength + Power" onChange={(e) => setEdit({ ...edit, focus: e.target.value })} /></label>
          </div>
          <label className="f" htmlFor="d-text">{t('prog.dayText')}
            <textarea id="d-text" className="notes-text" rows={14} value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })}
              placeholder={'1. Deadlift — 3×10\n2. DB Shoulder Press — 3×8–10\n\nSuperset ×3\n• Push Ups ×10\n• Smash Ball Wall Throw ×8\n\nFinisher\n• Assault Bike — 30 sec\n• Rest — 30 sec\n• ×5'} />
            <small>{t('prog.dayTextHelp')}</small></label>
          {client.mode !== 'gym' && <label className="f" htmlFor="d-note">{t('prog.dayNote')}<textarea id="d-note" rows={2} value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>}
          <div className="modal-foot">
            {days.length > 1 && <button type="button" className="btn danger small" onClick={deleteDay}><Trash2 />{confirm === 'day' ? t('prog.confirm') : t('prog.deleteDay')}</button>}
            <span className="spacer" />
            <button type="button" className="btn ghost" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
            <button type="button" className="btn" onClick={saveDay}>{t('common.save')}</button>
          </div>
        </section>
      ) : (
        <section className="panel day-card">
          <div className="panel-h">
            <h2>{day.title}{day.focus ? ` · ${day.focus}` : ''}</h2>
            <button className="btn ghost small" onClick={() => startEdit(day)}><Pencil />{t('prog.editDay')}</button>
          </div>
          <div className="planned-for">
            <span className="meta">{t('prog.scheduled')}:</span>
            {upcoming.filter((x) => x.program_day_id === day.id).map((x) => (
              <span key={x.id} className="chip-static">{when(x.starts_at)}
                <button className="x-btn" onClick={() => assign(x.id, null)} aria-label={t('prog.unassign')} title={t('prog.unassign')}><X size={12} /></button></span>
            ))}
            {!upcoming.some((x) => x.program_day_id === day.id) && <span className="meta">{t('prog.notScheduled')}</span>}
            <button className="chip" onClick={() => setAssignOpen(true)}><CalendarPlus size={12} style={{ verticalAlign: '-2px' }} /> {t('prog.assign')}</button>
          </div>
          {day.note && <div className="day-note">{day.note}</div>}
          <ProgramDay day={day} history={history} lib={lib} onMedia={setMedia} />
        </section>
      ))}

      <div style={{ marginTop: 18 }}>
        <button className="btn danger small" onClick={deleteProgram}><Trash2 />{confirm === 'program' ? t('prog.confirm') : t('prog.deleteProgram')}</button>
      </div>

      <Modal open={assignOpen} title={day ? t('prog.assignTitle', { day: day.title }) : ''} onClose={() => setAssignOpen(false)}>
        {assignOpen && day && (
          <div className="form">
            <div className="meta">{t('prog.assignHelp', { name: client.name.split(' ')[0] })}</div>
            {upcoming.length === 0 && <div className="empty">{t('prog.noUpcoming')}</div>}
            <div className="grid" style={{ gap: 8, maxHeight: '55vh', overflow: 'auto' }}>
              {upcoming.map((x) => {
                const other = days.find((d) => d.id === x.program_day_id)
                return (
                  <button key={x.id} type="button" className="choice" aria-pressed={x.program_day_id === day.id}
                    onClick={() => { assign(x.id, x.program_day_id === day.id ? null : day.id) }}>
                    <span><b>{when(x.starts_at)}</b>{x.format === 'online' && <span className="meta"> · {t('formats.online')}</span>}
                      {other && other.id !== day.id && <span className="meta" style={{ display: 'block' }}>{t('prog.alreadyDay', { day: other.title })}</span>}</span>
                    {x.program_day_id === day.id ? <span className="pill ok">{day.title}</span> : <CalendarPlus size={18} />}
                  </button>
                )
              })}
            </div>
            <div className="modal-foot"><button type="button" className="btn" onClick={() => setAssignOpen(false)}>{t('common.done')}</button></div>
          </div>
        )}
      </Modal>
      <MediaModal name={media} entry={media ? lib[exKey(media)] : null} trainerId={trainerId}
        onClose={() => setMedia(null)} onSaved={(keepOpen) => { reloadLib(); if (!keepOpen) setMedia(null) }} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} hasDays={days.some((d) => d.blocks.length)}
        onUse={async (parsed) => {
          await run(supabase.from('program_days').delete().eq('program_id', prog.id))
          const r = await run(supabase.from('program_days').insert(parsed.days.map((d, i) => ({ program_id: prog.id, trainer_id: trainerId, position: i + 1, title: d.title, focus: d.focus || null, blocks: d.blocks }))))
          if (!r.ok) return
          if (parsed.title) await run(supabase.from('programs').update({ title: parsed.title }).eq('id', prog.id))
          const n = await addImportLogs(parsed.days.flatMap((d) => d.kg))
          setImportOpen(false); setDayIdx(0); setEdit(null); toast(t('prog.imported', { n })); load(); onChanged()
        }} />
      <CopyModal open={copyOpen} onClose={() => setCopyOpen(false)} prog={prog} client={client} data={data} trainerId={trainerId}
        onDone={(target) => { setCopyOpen(false); onChanged(); onOpen(target.id) }} />
    </>
  )
}

function ImportModal({ open, onClose, onUse, hasDays }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setText('') }, [open])
  const parsed = useMemo(() => parseNotes(text), [text])
  return (
    <Modal open={open} wide title={t('prog.importTitle')} onClose={onClose}>
      {open && (
        <div className="form">
          <div className="parse">
            <label className="f" htmlFor="imp">{t('prog.importHelp')}
              <textarea id="imp" className="notes-text" rows={16} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={'MARIOS PROGRAM\n\nDAY 1 — STRENGTH + POWER\n\n1. Smith Squat — 3×8  30kg-35kg -40kg\n2. DB Bench Press — 3×8–10 15kg\n\nSuperset ×3\n• TRX Row ×10\n• Medicine Ball Chest Throw ×8\n\nDAY 2 — …'} /></label>
            <div style={{ minWidth: 0 }}>
              <div className="meta" style={{ marginBottom: 6 }}>{t('prog.understood')}</div>
              <div className="parse-out">
                {parsed.days.length === 0 && <div className="meta">{t('prog.noDays')}</div>}
                {parsed.days.map((d, i) => (
                  <div className="blk" key={i}>
                    <div className="name">{d.title}{d.focus ? ` · ${d.focus}` : ''}</div>
                    <div className="meta">{d.blocks.map((b, j) => (
                      <div key={j}>{b.type === 'single'
                        ? <>{b.items[0].exercise} <span className="rx">{b.items[0].rx}</span>{(() => { const k = d.kg.find((x) => x.exercise === b.items[0].exercise); return k ? <span className="hist inline">{k.kg.map((v, x) => <span key={x}>{v}</span>)}</span> : null })()}</>
                        : b.type === 'superset' ? <>{t('prog.superset', { n: b.rounds })}: {b.items.map((x) => x.exercise).join(' + ')}</>
                          : <>{b.rounds ? t('prog.finisherN', { n: b.rounds }) : t('prog.finisher')}: {b.lines.join(', ')}</>}</div>
                    ))}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {hasDays && <div className="notice warn-box">{t('prog.importReplace')}</div>}
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="button" className="btn" disabled={busy || !parsed.days.length} onClick={async () => { setBusy(true); await onUse(parsed); setBusy(false) }}>{t('prog.useImport')}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

function CopyModal({ open, onClose, prog, client, data, trainerId, onDone }) {
  const { t } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [target, setTarget] = useState('')
  const [has, setHas] = useState({})
  const options = data.clients.filter((c) => c.active && c.id !== client.id)
  useEffect(() => {
    if (!open) return
    setTarget('')
    supabase.from('programs').select('client_id').eq('trainer_id', trainerId).then(({ data: d }) => setHas(Object.fromEntries((d || []).map((x) => [x.client_id, true]))))
  }, [open, trainerId])
  async function copy() {
    const c = data.clients.find((x) => x.id === target)
    if (!c) return
    const title = prog.title.replace(client.name.split(' ')[0], c.name.split(' ')[0]).replace(client.name, c.name)
    let pid
    const ex = await supabase.from('programs').select('id').eq('client_id', c.id).maybeSingle()
    if (ex.data) {
      pid = ex.data.id
      await run(supabase.from('programs').update({ title }).eq('id', pid))
      await run(supabase.from('program_days').delete().eq('program_id', pid))
    } else {
      const r = await run(supabase.from('programs').insert({ trainer_id: trainerId, client_id: c.id, title }).select().single())
      if (!r.ok) return
      pid = r.data.id
    }
    const r = await run(supabase.from('program_days').insert(prog.program_days.map((d) => ({ program_id: pid, trainer_id: trainerId, position: d.position, title: d.title, focus: d.focus, note: d.note, blocks: d.blocks }))))
    if (r.ok) { toast(t('prog.copied', { name: c.name })); onDone(c) }
  }
  return (
    <Modal open={open} title={t('prog.copyTitle')} onClose={onClose}>
      {open && (
        <div className="form">
          <div className="meta">{t('prog.copyHelp')}</div>
          <div className="grid" style={{ gap: 8, maxHeight: '50vh', overflow: 'auto' }}>
            {options.map((c) => (
              <button key={c.id} type="button" className="choice" aria-pressed={target === c.id} onClick={() => setTarget(c.id)}>
                <span><b>{c.name}</b><span className="meta" style={{ display: 'block' }}>{t(`modes.${c.mode || 'gym'}`)}{has[c.id] ? ` · ${t('prog.copyReplace')}` : ''}</span></span>
                {target === c.id && <span className="pill ok">✓</span>}
              </button>
            ))}
          </div>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="button" className="btn" disabled={!target} onClick={copy}>{t('prog.copyTo')}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

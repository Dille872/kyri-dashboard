import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Pause, Play, Timer, X, Send, Dumbbell } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { Spinner, useRun } from '../../components/ui.jsx'
import { HowTo } from '../../components/ExerciseMedia.jsx'
import { fmtKg, repsOf, secondsOf, setsOf } from '../../lib/program.js'
import { fmtDate, ymd } from '../../lib/format.js'

const REST_SINGLE = 90, REST_SUPERSET = 60
export const estMinutes = (steps) => Math.max(15, Math.round((steps * 7 + 10) / 5) * 5)
const mmss = (s) => { const c = Math.max(0, Math.ceil(s)); return `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}` }

// Home card: only what to prepare. No exercise names before the session starts.
export function TodayCard({ prep, trainer, onStart }) {
  const { t, locale } = useI18n()
  const tr = (trainer.owner_name || trainer.brand_name).split(' ')[0]
  if (!prep) return <div className="card"><div className="lab">{t('online.today')}</div><div className="meta" style={{ marginTop: 6 }}>{t('online.noProgram')}</div></div>
  return (
    <div className="card today-card">
      <div className="lab">{t('online.today')}</div>
      <div className="big">{prep.title}{prep.focus ? ` · ${prep.focus}` : ''}</div>
      <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
        <span className="tag">{t('online.duration', { n: estMinutes(prep.steps) })}</span>
        <span className="tag">{t('online.steps', { n: prep.steps })}</span>
      </div>
      <div className="lab" style={{ marginTop: 14 }}>{t('online.need')}</div>
      <div className="equip">
        {prep.equipment?.length ? prep.equipment.map((k) => <span key={k} className="chip-static"><Dumbbell size={13} />{t(`online.equipment.${k}`)}</span>)
          : <span className="meta">{t('online.bodyweight')}</span>}
      </div>
      {prep.note && <div className="from-trainer"><b>{t('online.fromTrainer', { trainer: tr })}</b>{prep.note}</div>}
      {prep.done_today ? (
        <>
          <div className="prog-cheer" style={{ marginTop: 14 }}><Check size={15} style={{ verticalAlign: '-3px' }} /> {t('online.doneToday')} · {t('online.doneTodayBody', { trainer: tr })}</div>
          <button className="btn block ghost" style={{ marginTop: 10 }} onClick={onStart}><Play />{t('online.again')}</button>
        </>
      ) : <button className="btn block" style={{ marginTop: 14 }} onClick={onStart}><Play />{t('online.start')}</button>}
      {prep.week?.length > 0 && (
        <div className="meta" style={{ marginTop: 12 }}>{t('online.week')}: {prep.week.map((w) => `${w.title} (${fmtDate(ymd(new Date(w.at)), locale, { weekday: 'short' })})`).join(' · ')}</div>
      )}
    </div>
  )
}

// The session itself: one block at a time, kg/reps per set, rest + interval timers, watermark.
export default function OnlineSession({ client, trainer, prep, onExit, onSent }) {
  const { t } = useI18n()
  const run = useRun()
  const KEY = `kyri-session-${client.id}`
  const tr = (trainer.owner_name || trainer.brand_name).split(' ')[0]
  const [s, setS] = useState(() => {
    try { const v = JSON.parse(sessionStorage.getItem(KEY)); if (v?.dayId === prep.day_id) return v } catch {}
    return { dayId: prep.day_id, step: 0, entries: {}, startedAt: Date.now(), phase: 'run', note: '' }
  })
  const [steps, setSteps] = useState({})
  const [rest, setRest] = useState(null)        // { until, total }
  const [iv, setIv] = useState(null)            // finisher interval { idx, left, running }
  const [confirmEnd, setConfirmEnd] = useState(false)
  const [busy, setBusy] = useState(false)
  const [, tick] = useState(0)
  const topRef = useRef()

  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch {} }, [s, KEY])
  const loadStep = useCallback(async (i) => {
    if (steps[i] || i >= prep.steps) return
    const r = await supabase.rpc('workout_step', { p_client: client.id, p_day: prep.day_id, p_step: i })
    if (!r.error && r.data) setSteps((o) => ({ ...o, [i]: r.data }))
  }, [steps, prep, client.id])
  useEffect(() => { loadStep(s.step); loadStep(s.step + 1) }, [s.step, loadStep])
  useEffect(() => { topRef.current?.scrollIntoView?.({ block: 'start' }); window.scrollTo(0, 0) }, [s.step, s.phase])

  // timers
  useEffect(() => {
    if (!rest && !iv?.running) return
    const h = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(h)
  }, [rest, iv?.running])
  const restLeft = rest ? (rest.until - Date.now()) / 1000 : 0
  useEffect(() => { if (rest && restLeft <= 0) { setRest(null); navigator.vibrate?.(250) } })

  const cur = steps[s.step]
  const set = (key, patch) => setS((o) => ({ ...o, entries: { ...o.entries, [s.step]: { ...(o.entries[s.step] || {}), [key]: { ...(o.entries[s.step]?.[key] || {}), ...patch } } } }))
  const entry = (key) => s.entries[s.step]?.[key] || {}

  // interval timer for the finisher: rounds × timed lines
  const phases = cur?.type === 'finisher'
    ? Array.from({ length: cur.rounds || 1 }, (_, r) => (cur.lines || []).map((l) => ({ label: l, sec: secondsOf(l), round: r + 1 })).filter((p) => p.sec)).flat()
    : []
  useEffect(() => {
    if (!iv?.running) return
    const now = Date.now()
    const left = iv.left - (now - iv.at) / 1000
    if (left <= 0) {
      navigator.vibrate?.(150)
      if (iv.idx + 1 >= phases.length) { setIv({ ...iv, running: false, done: true, left: 0, at: now }); set('fin', { done: true, rounds: cur.rounds || 1 }) }
      else setIv({ idx: iv.idx + 1, left: phases[iv.idx + 1].sec, at: now, running: true })
    }
  })
  useEffect(() => { setIv(null); setRest(null) }, [s.step])

  function tickSet(key, isSuperset, lastInRound) {
    const was = entry(key).done
    set(key, { done: !was })
    if (!was && (!isSuperset || lastInRound)) setRest({ until: Date.now() + (isSuperset ? REST_SUPERSET : REST_SINGLE) * 1000, total: isSuperset ? REST_SUPERSET : REST_SINGLE })
  }

  function collectLogs() {
    const out = []
    for (const [i, st] of Object.entries(steps)) {
      const e = s.entries[i] || {}
      ;(st.items || []).forEach((it, idx) => {
        const mine = Object.entries(e).filter(([k]) => k.endsWith(`-${idx}`)).map(([, v]) => v).filter((v) => v.done || v.kg)
        if (!mine.length) return
        const withKg = mine.map((v) => ({ ...v, n: Number(String(v.kg ?? '').replace(',', '.')) })).map((v) => ({ ...v, n: v.kg !== undefined && v.kg !== '' && !Number.isNaN(v.n) ? v.n : it.last_kg != null ? Number(it.last_kg) : null }))
        const best = withKg.reduce((a, b) => ((b.n ?? -1) > (a.n ?? -1) ? b : a), withKg[0])
        out.push({ exercise: it.exercise, kg: best.n == null ? '' : String(best.n), reps: best.reps || '' })
      })
    }
    return out
  }
  const setsDone = Object.values(s.entries).reduce((a, e) => a + Object.entries(e).filter(([k, v]) => k !== 'fin' && v.done).length + (e.fin?.done ? e.fin.rounds : 0), 0)
  const minutes = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000))

  async function send() {
    setBusy(true)
    const r = await run(supabase.rpc('finish_workout', { p_client: client.id, p_day: prep.day_id, p_logs: collectLogs(), p_note: s.note, p_minutes: minutes }))
    setBusy(false)
    if (!r.ok) return
    try { sessionStorage.removeItem(KEY) } catch {}
    setS((o) => ({ ...o, phase: 'sent' }))
  }
  function end() { try { sessionStorage.removeItem(KEY) } catch {} ; onExit() }

  const wm = `${client.name} · ${client.email}`
  const shell = (body) => (
    <div className="mobile session" ref={topRef} onContextMenu={(e) => e.preventDefault()}>
      <div className="wm" aria-hidden="true">{Array.from({ length: 14 }, (_, i) => <span key={i}>{wm}</span>)}</div>
      {body}
    </div>
  )

  if (s.phase === 'sent') return shell(
    <>
      <div className="circle ok-circle"><Check /></div>
      <div className="hello center">{t('online.sent', { trainer: tr })}</div>
      <p className="meta center" style={{ margin: 0 }}>{t('online.doneTodayBody', { trainer: tr })}</p>
      <button className="btn block" onClick={onSent}>{t('client.home')}</button>
    </>
  )

  if (s.phase === 'summary') return shell(
    <>
      <div className="circle ok-circle"><Check /></div>
      <div className="hello center">{t('online.summary', { name: client.name.split(' ')[0] })}</div>
      <p className="meta center" style={{ margin: 0 }}>{prep.title}{prep.focus ? ` · ${prep.focus}` : ''} · {t('online.summaryBody', { min: minutes, sets: setsDone })}</p>
      <div className="card">
        <div className="list">
          {collectLogs().filter((l) => l.kg || l.reps).map((l, i) => (
            <div className="row" key={i} style={{ padding: '8px 0' }}><span>{l.exercise}</span><span className="num">{l.kg ? `${fmtKg(l.kg)} kg` : ''}{l.reps ? ` × ${l.reps}` : ''}</span></div>
          ))}
        </div>
      </div>
      <label className="f" htmlFor="ses-note">{t('online.noteTo', { trainer: tr })}<textarea id="ses-note" rows={3} placeholder={t('online.notePh')} value={s.note} onChange={(e) => setS({ ...s, note: e.target.value })} /></label>
      <button className="btn block" disabled={busy} onClick={send}><Send />{t('online.send', { trainer: tr })}</button>
      <button className="btn block ghost" onClick={() => setS({ ...s, phase: 'run' })}><ChevronLeft />{t('online.back')}</button>
    </>
  )

  const total = prep.steps
  const last = s.step >= total - 1
  return shell(
    <>
      <div className="ses-top">
        <div style={{ minWidth: 0 }}><div className="eyebrow">{prep.title}{prep.focus ? ` · ${prep.focus}` : ''}</div>
          <div className="ses-count">{t('online.step', { n: s.step + 1, total })}</div></div>
        <button className="chip" onClick={() => setConfirmEnd(true)}><X size={13} style={{ verticalAlign: '-2px' }} /> {t('online.end')}</button>
      </div>
      <div className="bar full"><i style={{ width: `${((s.step + 1) / total) * 100}%` }} /></div>

      {confirmEnd && (
        <div className="notice warn-box">
          {t('online.endConfirm', { trainer: tr })}
          <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <button className="chip solid" onClick={end}>{t('online.endYes')}</button>
            <button className="chip" onClick={() => setConfirmEnd(false)}>{t('online.keepGoing')}</button>
          </div>
        </div>
      )}

      {!cur ? <Spinner /> : cur.type === 'finisher' ? (
        <div className="card step-card">
          <div className="lab">{cur.rounds ? `${t('prog.finisher')} · ${t('online.rounds', { n: cur.rounds })}` : t('prog.finisher')}</div>
          <ul className="fin-lines">{(cur.lines || []).map((l, i) => <li key={i} className={iv && phases[iv.idx]?.label === l && !iv.done ? 'on' : ''}>{l}</li>)}</ul>
          {phases.length > 0 ? (
            <div className="interval">
              <div className="iv-time">{mmss(iv ? (iv.running ? iv.left - (Date.now() - iv.at) / 1000 : iv.left) : phases[0].sec)}</div>
              <div className="meta">{iv?.done ? `✓ ${t('online.rounds', { n: cur.rounds || 1 })}` : `${phases[iv?.idx || 0].label} · ${t('online.round', { n: phases[iv?.idx || 0].round })}`}</div>
              {!iv?.done && (iv?.running
                ? <button className="btn ghost" onClick={() => setIv({ ...iv, running: false, left: iv.left - (Date.now() - iv.at) / 1000 })}><Pause />{t('online.pause')}</button>
                : <button className="btn" onClick={() => setIv(iv ? { ...iv, running: true, at: Date.now() } : { idx: 0, left: phases[0].sec, at: Date.now(), running: true })}><Timer />{iv ? t('online.resume') : t('online.timer')}</button>)}
            </div>
          ) : (
            <button type="button" className="tick big-tick" aria-pressed={!!entry('fin').done} onClick={() => set('fin', { done: !entry('fin').done, rounds: cur.rounds || 1 })}><Check size={18} /></button>
          )}
        </div>
      ) : (
        <div className="card step-card">
          {cur.type === 'superset' && <div className="lab">{t('prog.superset', { n: cur.rounds || 3 })}</div>}
          {cur.items.map((it, idx) => (
            <div key={idx} className="step-ex">
              <div className="step-name">{it.exercise} <span className="rx">{it.rx}</span></div>
              {it.last_kg != null && <div className="meta">{t('online.lastKg', { kg: fmtKg(it.last_kg) })}</div>}
              <HowTo note={it.note} videoType={it.video_type} videoUrl={it.video_url} />
            </div>
          ))}
          <div className="set-head" aria-hidden="true"><span /><span>{t('online.kg')}</span><span>{t('online.reps')}</span><span /></div>
          {cur.type === 'single'
            ? Array.from({ length: setsOf(cur.items[0].rx) || 1 }, (_, r) => <SetRow key={r} label={t('online.set', { n: r + 1 })} it={cur.items[0]} e={entry(`${r}-0`)}
                onChange={(p) => set(`${r}-0`, p)} onTick={() => tickSet(`${r}-0`, false)} />)
            : Array.from({ length: cur.rounds || 3 }, (_, r) => (
              <div key={r} className="round">
                <div className="round-h">{t('online.round', { n: r + 1 })}</div>
                {cur.items.map((it, idx) => <SetRow key={idx} label={it.exercise} it={it} e={entry(`${r}-${idx}`)}
                  onChange={(p) => set(`${r}-${idx}`, p)} onTick={() => tickSet(`${r}-${idx}`, true, idx === cur.items.length - 1)} />)}
              </div>
            ))}
        </div>
      )}

      {rest && (
        <div className="rest-bar" role="timer" aria-live="polite">
          <Timer size={18} /><b>{t('online.rest')} {mmss(restLeft)}</b>
          <div className="bar" style={{ flex: 1, width: 'auto', marginTop: 0 }}><i style={{ width: `${(restLeft / rest.total) * 100}%` }} /></div>
          <button className="chip" onClick={() => setRest(null)}>{t('online.skip')}</button>
        </div>
      )}

      <div className="ses-nav">
        <button className="btn ghost" disabled={s.step === 0} onClick={() => setS({ ...s, step: s.step - 1 })}><ChevronLeft />{t('online.back')}</button>
        {last
          ? <button className="btn" onClick={() => setS({ ...s, phase: 'summary' })}><Check />{t('online.finish')}</button>
          : <button className="btn" onClick={() => setS({ ...s, step: s.step + 1 })}>{t('common.next')}<ChevronRight /></button>}
      </div>
      <p className="meta center wm-note">{t('online.private', { name: client.name })}</p>
    </>
  )
}

function SetRow({ label, it, e, onChange, onTick }) {
  const { t } = useI18n()
  return (
    <div className={`set-row ${e.done ? 'is-done' : ''}`}>
      <div className="set-l">{label}</div>
      <input inputMode="decimal" aria-label={`${label} ${t('online.kg')}`} placeholder={it.last_kg != null ? fmtKg(it.last_kg) : '–'} value={e.kg ?? ''} onChange={(x) => onChange({ kg: x.target.value })} />
      <input inputMode="numeric" aria-label={`${label} ${t('online.reps')}`} placeholder={repsOf(it.rx) || ''} value={e.reps ?? ''} onChange={(x) => onChange({ reps: x.target.value })} />
      <button type="button" className="tick" aria-pressed={!!e.done} aria-label={t('common.done')} onClick={onTick}><Check size={16} /></button>
    </div>
  )
}

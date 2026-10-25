import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Copy, Dumbbell, Video, Archive, RotateCcw, AlertTriangle } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { useRun, useToast } from '../../components/ui.jsx'
import { Duration } from '../../components/ui.jsx'
import Progress from '../../components/Progress.jsx'
import ProgramLog from '../../components/ProgramLog.jsx'
import { packStatus } from '../../lib/pack.js'
import { fmtKg } from '../../lib/program.js'
import { fmtDate, hm, money, payState, sessionsLeft, ymd } from '../../lib/format.js'

// Everything about one client: health & rules, pack, program, progress, upcoming and history.
export default function ClientProfile({ client, data, trainerId, onBack, onEdit, onInvite, onArchive, go, reload }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [d, setD] = useState(null)
  const [logFor, setLogFor] = useState(null)
  const [showParq, setShowParq] = useState(false)
  const [refresh, setRefresh] = useState(0)

  const load = useCallback(async () => {
    const now = new Date().toISOString()
    const [planned, hist, logs, wl, pq, prog] = await Promise.all([
      supabase.from('sessions').select('*').eq('client_id', client.id).eq('status', 'planned').order('starts_at').limit(60),
      supabase.from('sessions').select('*').eq('client_id', client.id).lt('starts_at', now).order('starts_at', { ascending: false }).limit(20),
      supabase.from('exercise_logs').select('*').eq('client_id', client.id).not('session_id', 'is', null),
      supabase.from('workout_logs').select('*, exercise_logs(exercise, kg, reps, note)').eq('client_id', client.id).order('finished_at', { ascending: false }).limit(20),
      supabase.from('parq_responses').select('*').eq('client_id', client.id).order('created_at', { ascending: false }).limit(1),
      supabase.from('programs').select('id, title, program_days(id, title)').eq('client_id', client.id).maybeSingle(),
    ])
    const p = planned.data || []
    setD({
      upcoming: p.filter((s) => s.starts_at >= now), pastPlanned: p.filter((s) => s.starts_at < now).length,
      history: hist.data || [], logs: logs.data || [], workouts: wl.data || [], parq: (pq.data || [])[0] || null, program: prog.data,
    })
  }, [client.id])
  useEffect(() => { load() }, [load, refresh])

  const pendingIds = new Set(data.pending.map((p) => p.client_id))
  const p = payState(client, pendingIds, ymd())
  const left = sessionsLeft(client)
  const pkg = data.packages.find((x) => x.id === client.package_id)
  if (!d) return null
  const pack = packStatus(client, { pastPlanned: d.pastPlanned, upcoming: d.upcoming, reminderDays: data.trainer.reminder_days ?? 2 })
  const when = (iso) => `${fmtDate(ymd(new Date(iso)), locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${hm(new Date(iso))}`

  async function reviewed() {
    const r = await run(supabase.from('parq_responses').update({ reviewed_at: new Date().toISOString() }).eq('id', d.parq.id))
    if (r.ok) { toast(t('profile.parqReviewedToast')); setRefresh((n) => n + 1) }
  }
  async function resetParq() {
    const r = await run(supabase.from('clients').update({ parq_at: null }).eq('id', client.id))
    if (r.ok) { toast(t('profile.parqResetDone', { name: client.name.split(' ')[0] })); reload?.() }
  }

  // history: gym sessions and online workouts, newest first
  const items = [
    ...d.history.filter((s) => s.status !== 'planned' || d.logs.some((l) => l.session_id === s.id)).map((s) => ({ kind: 'session', at: s.starts_at, s, logs: d.logs.filter((l) => l.session_id === s.id) })),
    ...d.workouts.map((w) => ({ kind: 'online', at: w.finished_at, w })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 14)

  const flagged = d.parq?.flagged
  return (
    <>
      <button className="chip" onClick={onBack} style={{ marginBottom: 14 }}><ArrowLeft size={13} style={{ verticalAlign: '-2px' }} /> {t('clients.title')}</button>
      <div className="head">
        <div>
          <div className="eyebrow">{t(`modes.${client.mode || 'gym'}`)} · {pkg?.name || t('clients.noPackage')}{!client.active ? ` · ${t('clients.inactive')}` : ''}</div>
          <h1>{client.name}</h1>
          <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <span className="tag">{left == null ? t('clients.unlimited') : t('overview.left', { left, total: client.sessions_total })}</span>
            {client.active && <span className={`pill ${p.cls}`}>{t(`payState.${p.key}`, { n: p.n, date: fmtDate(p.date, locale) })}</span>}
            <span className="tag">{money(client.price, locale)} · {t(`billing.${client.billing}`)}</span>
          </div>
        </div>
        <div className="acts">
          {client.active && <button className="btn ghost small" onClick={() => onInvite(client)}><Copy />{t('clients.copyInvite')}</button>}
          <button className="btn ghost small" onClick={() => onArchive(client, client.active)}>{client.active ? <><Archive />{t('clients.archive')}</> : <><RotateCcw />{t('clients.reactivate')}</>}</button>
          <button className="btn small" onClick={() => onEdit(client)}><Pencil />{t('common.edit')}</button>
        </div>
      </div>

      <div className="grid two">
        <section className={`panel ${flagged && !d.parq.reviewed_at ? 'flag-panel' : ''}`} style={{ alignSelf: 'start' }}>
          <div className="panel-h"><h2>{t('profile.health')}</h2></div>
          <div className="list">
            <div className="row">
              <div style={{ minWidth: 0 }}><div className="name">{t('profile.parq')}</div>
                <div className="meta">{!client.parq_at || !d.parq ? t('profile.parqMissing')
                  : flagged ? <span style={{ color: 'var(--bad)' }}><AlertTriangle size={13} style={{ verticalAlign: '-2px' }} /> {t('overview.parqYes', { n: d.parq.answers.filter((a) => a.type === 'yn' && a.answer === true).length })}{d.parq.explanation ? ` · ${d.parq.explanation}` : ''}</span>
                    : t('profile.parqAllNo')}</div></div>
              {!client.parq_at || !d.parq ? <span className="pill mute">{t('profile.parqMissing')}</span>
                : flagged && !d.parq.reviewed_at ? <span className="pill bad">{t('profile.parqCheck')}</span> : <span className="pill ok">{t('profile.parqOkPill')}</span>}
            </div>
            {d.parq && (
              <div className="acts" style={{ justifyContent: 'flex-start', paddingBottom: 10 }}>
                <button className="chip" onClick={() => setShowParq(!showParq)}>{showParq ? t('profile.parqHide') : t('profile.parqShow')}</button>
                {flagged && !d.parq.reviewed_at && <button className="chip solid" onClick={reviewed}>{t('profile.parqReviewed')}</button>}
                {client.parq_at && <button className="chip" onClick={resetParq}>{t('profile.parqReset')}</button>}
              </div>
            )}
            {showParq && d.parq && (
              <div className="parq-answers">
                {d.parq.answers.map((a, i) => {
                  const bad = a.type === 'yn' && a.flag && a.answer === true
                  return (
                    <div key={i} className={`qa ${bad ? 'bad' : ''}`}>
                      <div>{i + 1}. {a.q}</div>
                      <b>{a.type === 'yn' ? (a.answer ? t('common.yes') : t('common.no')) : a.text || '—'}</b>
                    </div>
                  )
                })}
                {d.parq.explanation && <div className="qa bad"><div>{t('profile.explanation')}</div><b>{d.parq.explanation}</b></div>}
                <div className="meta">{t('profile.signed', { name: d.parq.signed_name, date: fmtDate(ymd(new Date(d.parq.created_at)), locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}</div>
              </div>
            )}
            <div className="row">
              <div><div className="name">{t('profile.rules')}</div><div className="meta">{(data.trainer.rules_text || '').split('\n')[0]?.replace(/^•\s*/, '')}</div></div>
              <span className={`pill ${client.rules_accepted_at ? 'ok' : 'mute'}`}>{client.rules_accepted_at ? fmtDate(ymd(new Date(client.rules_accepted_at)), locale) : t('profile.rulesNo')}</span>
            </div>
          </div>
        </section>

        <div className="grid" style={{ alignContent: 'start' }}>
          <section className="panel">
            <div className="panel-h"><h2>{t('profile.pack')}</h2></div>
            <div className="big" style={{ marginTop: 0 }}>{left == null ? t('client.unlimited') : t('overview.left', { left, total: client.sessions_total })}</div>
            {pack && <div className="meta" style={{ marginTop: 6 }}>
              {pack.kind === 'last' ? <>{t('overview.lastOfPack', { when: '' })}<b style={{ color: 'var(--ink)' }}>{when(pack.session.starts_at)}</b> · {t('settings.reminder')}: {data.trainer.reminder_days ?? 2} d</>
                : pack.kind === 'used' ? t('overview.packUsed') : t('overview.fewLeft', { n: pack.left })}</div>}
          </section>
          <section className="panel">
            <div className="panel-h"><h2>{t('profile.program')}</h2>
              <button className="btn ghost small" onClick={() => go('programs', { client: client.id })}><Dumbbell />{d.program ? t('profile.openProgram') : t('prog.create')}</button></div>
            <div className="meta">{d.program ? `${d.program.title} · ${t(d.program.program_days.length === 1 ? 'prog.dayCount1' : 'prog.dayCount', { n: d.program.program_days.length })}` : t('profile.noProgram')}</div>
          </section>
        </div>
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="panel-h"><h2>{t('progress.title')}</h2></div>
          <Progress key={refresh} clientId={client.id} />
        </section>
        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="panel-h"><h2>{t('profile.upcoming')}</h2></div>
          <div className="list">
            {d.upcoming.length === 0 && <div className="empty">{t('client.noSession')}</div>}
            {d.upcoming.slice(0, 6).map((s) => (
              <div className="row" key={s.id}>
                <div style={{ minWidth: 0 }}><div className="name">{when(s.starts_at)}</div>
                  <div className="meta">{s.format === 'online' ? <span className="fmt"><Video />{t('formats.online')}</span> : t(`kinds.${s.kind}`)}</div>
                  {d.program?.program_days.find((x) => x.id === s.program_day_id) && <span className="day-tag">{d.program.program_days.find((x) => x.id === s.program_day_id).title}</span>}</div>
                {pack?.kind === 'last' && pack.session.id === s.id && <span className="pill warn">{t('overview.lastTag')}</span>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><h2>{t('profile.history')}</h2></div>
        {items.length === 0 && <div className="empty">{t('clients.noHistory')}</div>}
        <div className="log-list">
          {items.map((it) => it.kind === 'online' ? (
            <div key={it.w.id} className="log-item hist">
              <div className="hist-h">
                <div className="name">{fmtDate(ymd(new Date(it.at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  <span className="meta"> · <span className="fmt"><Video />{t('profile.onlineWorkout', { day: it.w.day_title || '' })}</span> · <Duration w={it.w} /></span></div>
                <span className="pill ok">{t('common.done')}</span>
              </div>
              {it.w.note && <div className="feed-note">“{it.w.note}”</div>}
              {it.w.exercise_logs?.length > 0 && <ul>{it.w.exercise_logs.map((l, i) => <li key={i}>{l.exercise}{l.kg != null ? ` · ${fmtKg(l.kg)} kg` : ''}{l.reps ? ` × ${l.reps}` : ''}{l.note && <div className="ex-comment">“{l.note}”</div>}</li>)}</ul>}
            </div>
          ) : (
            <div key={it.s.id} className="log-item hist">
              <div className="hist-h">
                <div className="name">{fmtDate(ymd(new Date(it.at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  <span className="meta"> · {t(`kinds.${it.s.kind}`)}</span></div>
                <div className="acts">
                  {it.s.status !== 'done' && <span className={`pill ${it.s.status === 'cancelled' ? 'mute' : 'warn'}`}>{t(`statuses.${it.s.status}`)}</span>}
                  {['done', 'planned'].includes(it.s.status) && <button className="chip" onClick={() => setLogFor(it.s)}>{it.logs.length ? t('common.edit') : t('profile.log')}</button>}
                </div>
              </div>
              {it.logs.length > 0
                ? <ul>{it.logs.map((l) => <li key={l.id}>{l.exercise}{l.kg != null ? ` · ${fmtKg(l.kg)} kg` : ''}</li>)}</ul>
                : it.s.status === 'done' && <div className="meta">{t('profile.noLogs')}</div>}
            </div>
          ))}
        </div>
      </section>

      <ProgramLog session={logFor} client={logFor ? client : null} trainerId={trainerId} go={go}
        onClose={() => setLogFor(null)} onSaved={() => { setLogFor(null); setRefresh((n) => n + 1); reload?.() }} />
    </>
  )
}

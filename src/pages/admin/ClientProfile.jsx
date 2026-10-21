import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Copy, ClipboardList, Check, Video } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import Progress from '../../components/Progress.jsx'
import SessionLog from '../../components/SessionLog.jsx'
import { rowText } from '../../components/ExerciseRows.jsx'
import { fmtDate, hm, money, payState, sessionsLeft, ymd } from '../../lib/format.js'

// Everything about one client on one page: progress, upcoming sessions (with plan status), training history.
export default function ClientProfile({ client, data, trainerId, onBack, onEdit, onInvite, go }) {
  const { t, locale } = useI18n()
  const [upcoming, setUpcoming] = useState(null)
  const [history, setHistory] = useState(null)
  const [logFor, setLogFor] = useState(null)
  const [refresh, setRefresh] = useState(0)

  const load = useCallback(async () => {
    const now = new Date().toISOString()
    const [u, h] = await Promise.all([
      supabase.from('sessions').select('*, exercise_rows(id, exercise)').eq('client_id', client.id).eq('status', 'planned').gte('starts_at', now).order('starts_at').limit(6),
      supabase.from('sessions').select('*, exercise_rows(*)').eq('client_id', client.id).lt('starts_at', now).order('starts_at', { ascending: false }).limit(25),
    ])
    setUpcoming(u.data || [])
    setHistory((h.data || []).filter((s) => s.status !== 'planned' || s.exercise_rows?.length).slice(0, 12))
  }, [client.id])
  useEffect(() => { load() }, [load, refresh])

  const pendingIds = new Set(data.pending.map((p) => p.client_id))
  const p = payState(client, pendingIds, ymd())
  const left = sessionsLeft(client)
  const pkg = data.packages.find((x) => x.id === client.package_id)

  return (
    <>
      <button className="chip" onClick={onBack} style={{ marginBottom: 14 }}><ArrowLeft size={13} style={{ verticalAlign: '-2px' }} /> {t('clients.title')}</button>
      <div className="head">
        <div>
          <div className="eyebrow">{t(`modes.${client.mode || 'gym'}`)} · {pkg?.name || t('clients.noPackage')}</div>
          <h1>{client.name}</h1>
          <div className="acts" style={{ justifyContent: 'flex-start', marginTop: 10 }}>
            <span className="tag">{left == null ? t('clients.unlimited') : t('overview.left', { left, total: client.sessions_total })}</span>
            <span className={`pill ${p.cls}`}>{t(`payState.${p.key}`, { n: p.n, date: fmtDate(p.date, locale) })}</span>
            <span className="tag">{money(client.price, locale)} · {t(`billing.${client.billing}`)}</span>
          </div>
        </div>
        <div className="acts">
          <button className="btn ghost small" onClick={() => onInvite(client)}><Copy />{t('clients.copyInvite')}</button>
          <button className="btn small" onClick={() => onEdit(client)}><Pencil />{t('common.edit')}</button>
        </div>
      </div>

      <div className="grid two">
        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="panel-h"><h2>{t('progress.title')}</h2></div>
          <Progress key={refresh} clientId={client.id} />
        </section>

        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="panel-h"><h2>{t('profile.upcoming')}</h2>
            <button className="btn ghost small" onClick={() => go('planning')}><ClipboardList />{t('nav.planning')}</button></div>
          <div className="list">
            {upcoming && upcoming.length === 0 && <div className="empty">{t('client.noSession')}</div>}
            {(upcoming || []).map((s) => (
              <div className="row" key={s.id}>
                <div style={{ minWidth: 0 }}>
                  <div className="name">{fmtDate(ymd(new Date(s.starts_at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })} · {hm(new Date(s.starts_at))}</div>
                  <div className="meta">
                    {s.format === 'online' ? <span className="fmt"><Video />{t('formats.online')}</span> : t(`kinds.${s.kind}`)}
                    {s.exercise_rows?.length ? ` · ${s.exercise_rows.map((r) => r.exercise).slice(0, 3).join(', ')}` : ''}
                  </div>
                </div>
                {s.exercise_rows?.length
                  ? <span className="pill ok"><Check size={12} /> {t('planning.planned')}</span>
                  : <span className="pill mute">{t('planning.noPlan')}</span>}
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><h2>{t('clients.history')}</h2></div>
        {history && history.length === 0 && <div className="empty">{t('clients.noHistory')}</div>}
        <div className="log-list">
          {(history || []).map((s) => (
            <div key={s.id} className="log-item hist">
              <div className="hist-h">
                <div className="name">{fmtDate(ymd(new Date(s.starts_at)), locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  <span className="meta"> · {t(`kinds.${s.kind}`)}</span></div>
                <div className="acts">
                  {s.status !== 'done' && <span className={`pill ${s.status === 'cancelled' ? 'mute' : 'warn'}`}>{t(`statuses.${s.status}`)}</span>}
                  {['done', 'planned'].includes(s.status) && <button className="chip" onClick={() => setLogFor(s)}>{s.exercise_rows?.length ? t('common.edit') : t('profile.addLog')}</button>}
                </div>
              </div>
              {s.exercise_rows?.length > 0 && (
                <ul>{s.exercise_rows.sort((a, b) => a.position - b.position).map((r) => <li key={r.id}>{r.exercise} · {rowText(r, true)}</li>)}</ul>
              )}
            </div>
          ))}
        </div>
      </section>

      <SessionLog session={logFor} clientName={client.name} trainerId={trainerId}
        onClose={() => setLogFor(null)} onSaved={() => { setLogFor(null); setRefresh((n) => n + 1) }} />
    </>
  )
}

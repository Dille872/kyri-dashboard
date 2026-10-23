import { useEffect, useState } from 'react'
import { TrendingUp, Trophy, CalendarCheck } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { fmtDate, ymd } from '../lib/format.js'

const WEEKS = 8

// Builds the progress summary from logged sessions: top exercises, attendance, latest record.
export function useProgress(clientId) {
  const [p, setP] = useState(null)
  useEffect(() => {
    if (!clientId) return
    let alive = true
    const since = new Date(Date.now() - WEEKS * 7 * 864e5)
    Promise.all([
      supabase.from('sessions').select('id, starts_at, status').eq('client_id', clientId)
        .gte('starts_at', since.toISOString()).lte('starts_at', new Date().toISOString()).order('starts_at'),
      supabase.from('workout_logs').select('id, finished_at').eq('client_id', clientId).gte('finished_at', since.toISOString()),
      // kg history: gym logs by Kyri, online sessions by the client (imports from the notes count too)
      supabase.from('exercise_logs').select('exercise, kg, logged_on, created_at').eq('client_id', clientId).not('kg', 'is', null).order('logged_on'),
    ]).then(([{ data: ss }, { data: wl }, { data: logs }]) => {
      if (!alive) return
      const list = ss || []
      const counted = list.filter((s) => ['done', 'no_show', 'late_cancel'].includes(s.status))
      const done = list.filter((s) => s.status === 'done').length + (wl || []).length
      const series = {}
      for (const l of logs || []) {
        const key = l.exercise.trim()
        const arr = (series[key.toLowerCase()] ||= { name: key, pts: [] }).pts
        const last = arr[arr.length - 1]
        const v = Number(l.kg)
        if (last && last.date === l.logged_on) last.v = Math.max(last.v, v)
        else arr.push({ date: l.logged_on, v })
      }
      const exercises = Object.values(series)
        .filter((e) => e.pts.length >= 2 && e.pts.some((x) => x.v > 0))
        .map(({ name, pts: a }) => {
          const first = a[0].v, last = a[a.length - 1].v, max = Math.max(...a.map((x) => x.v))
          const prevMax = Math.max(...a.slice(0, -1).map((x) => x.v))
          return { name, points: a, first, last, delta: last - first, pct: first > 0 ? Math.round(((last - first) / first) * 100) : null,
            record: last === max && last > prevMax, recordDate: a[a.length - 1].date }
        })
        .sort((x, y) => y.delta - x.delta || y.points.length - x.points.length)
        .slice(0, 5)
      const record = exercises.filter((e) => e.record).sort((a, b) => b.recordDate.localeCompare(a.recordDate))[0] || null
      const firstDone = list.find((s) => s.status === 'done')
      const weeks = firstDone ? Math.max(1, Math.round((Date.now() - new Date(firstDone.starts_at)) / (7 * 864e5))) : WEEKS
      setP({ exercises, record, done, counted: counted.length + (wl || []).length, weeks,
        attendance: counted.length ? Math.round((list.filter((s) => s.status === 'done').length / counted.length) * 100) : null })
    })
    return () => { alive = false }
  }, [clientId])
  return p
}

function Spark({ points }) {
  const w = 96, h = 30, pad = 3
  const vs = points.map((p) => p.v)
  const lo = Math.min(...vs), hi = Math.max(...vs)
  const x = (i) => pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1)
  const y = (v) => (hi === lo ? h / 2 : h - pad - ((v - lo) / (hi - lo)) * (h - pad * 2))
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')
  const last = points.length - 1
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden="true">
      <path d={`${d} L${x(last)} ${h} L${x(0)} ${h} Z`} fill="var(--ink)" fillOpacity=".08" />
      <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(points[last].v)} r="2.8" fill="var(--ink)" />
    </svg>
  )
}

const kg = (v) => `${String(Math.round(v * 10) / 10).replace(/\.0$/, '')} kg`

export default function Progress({ clientId, forClient = false }) {
  const { t, locale } = useI18n()
  const p = useProgress(clientId)
  if (!p) return null
  if (!p.exercises.length && !p.counted) return forClient ? null : <div className="meta">{t('progress.none')}</div>
  return (
    <div className="prog">
      <div className="prog-stats">
        <div className="prog-stat"><CalendarCheck /><div><b>{p.done}</b><span>{t('progress.sessions', { weeks: p.weeks || WEEKS })}</span></div></div>
        {p.attendance != null && <div className="prog-stat"><TrendingUp /><div><b>{p.attendance} %</b><span>{t('progress.attendance')}</span></div></div>}
        {p.record && <div className="prog-stat rec"><Trophy /><div><b>{p.record.name}</b><span>{t('progress.record', { kg: kg(p.record.last), date: fmtDate(p.record.recordDate, locale) })}</span></div></div>}
      </div>
      {p.exercises.length > 0 && (
        <div className="prog-list">
          {p.exercises.map((e) => (
            <div key={e.name} className="prog-row">
              <div style={{ minWidth: 0 }}>
                <div className="name">{e.name}</div>
                <div className="meta">
                  {kg(e.first)} → {kg(e.last)}
                </div>
              </div>
              <Spark points={e.points} />
              <span className={`pill ${e.delta > 0 ? 'ok' : 'mute'}`}>{e.delta > 0 ? '+' : ''}{e.pct != null ? `${e.pct} %` : kg(e.delta)}</span>
            </div>
          ))}
        </div>
      )}
      {forClient && p.exercises[0] && p.exercises[0].delta > 0 && (
        <div className="prog-cheer">{t('progress.cheer', { exercise: p.exercises[0].name, kg: kg(p.exercises[0].delta), weeks: p.weeks || WEEKS })}</div>
      )}
    </div>
  )
}

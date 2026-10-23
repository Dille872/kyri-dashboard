import { daysBetween, ymd } from './format.js'

// Which booked session is the last one of the client's pack?
//   left       = sessions_total − sessions_used  (ticked sessions are already counted)
//   effective  = left − past sessions that are still "planned" (Kyri hasn't ticked them yet, they will count)
//   last       = the effective-th upcoming planned session
// Returns null when there is nothing to say (monthly without limit, plenty left, …).
//   { kind: 'last', session, days }   last session is booked, `days` from today
//   { kind: 'few', left }             ≤ 2 left but nothing (or not enough) booked
//   { kind: 'used' }                  nothing left
export function packStatus(client, { pastPlanned = 0, upcoming = [], reminderDays = 2, today = ymd() } = {}) {
  if (client.sessions_total == null || client.billing === 'monthly' || client.billing === 'weekly') return null
  const left = Math.max(client.sessions_total - client.sessions_used, 0)
  const effective = left - pastPlanned
  if (effective <= 0) return { kind: 'used', left: 0 }
  const sorted = [...upcoming].sort((a, b) => a.starts_at.localeCompare(b.starts_at))
  const last = sorted[effective - 1]
  if (last) {
    const days = daysBetween(today, ymd(new Date(last.starts_at)))
    return { kind: 'last', session: last, days, remind: days <= reminderDays, left: effective }
  }
  if (effective <= 2) return { kind: 'few', left: effective, remind: true }
  return null
}

// For many clients at once: sessions = planned sessions of these clients (past and future)
export function packStatuses(clients, sessions, reminderDays, now = new Date()) {
  const nowIso = now.toISOString()
  const out = {}
  for (const c of clients) {
    const mine = sessions.filter((s) => s.client_id === c.id && s.status === 'planned')
    const st = packStatus(c, {
      pastPlanned: mine.filter((s) => s.starts_at < nowIso).length,
      upcoming: mine.filter((s) => s.starts_at >= nowIso),
      reminderDays,
    })
    if (st) out[c.id] = st
  }
  return out
}

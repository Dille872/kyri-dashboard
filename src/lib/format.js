// Dates are handled in the trainer's time zone (Cyprus).
export const TZ = 'Asia/Nicosia'

export function money(n, locale, currency = 'EUR') {
  const v = Number(n || 0)
  return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: v % 1 ? 2 : 0 }).format(v)
}

// 'YYYY-MM-DD' of a Date in the trainer's time zone
export function ymd(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}
export function hm(d) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
}
// Convert a Cyprus local date + time to a UTC ISO string
export function toIso(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const offset = tzOffsetMin(new Date(guess))
  return new Date(guess - offset * 60000).toISOString()
}
function tzOffsetMin(date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date).map((p) => [p.type, p.value]))
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute)
  return Math.round((asUtc - date.getTime()) / 60000)
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}
export function daysBetween(a, b) { // b - a in days, both 'YYYY-MM-DD'
  const pa = a.split('-').map(Number), pb = b.split('-').map(Number)
  return Math.round((Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 864e5)
}
export function mondayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const wd = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
  return addDays(dateStr, -wd)
}
export function isoWeek(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  const day = (dt.getUTCDay() + 6) % 7
  dt.setUTCDate(dt.getUTCDate() - day + 3)
  const first = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4))
  return 1 + Math.round(((dt - first) / 864e5 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)
}
export function fmtDate(dateStr, locale, opts = { day: 'numeric', month: 'short' }) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, d)))
}
export function fmtDateTime(iso, locale) {
  return new Intl.DateTimeFormat(locale, { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}
export function fmtRelative(iso, locale) {
  const diff = (new Date(iso) - new Date()) / 1000
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  const abs = Math.abs(diff)
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

// Payment state of a client, for pills
export function payState(client, pendingIds, today) {
  if (pendingIds?.has(client.id)) return { cls: 'info', key: 'toConfirm' }
  if (!client.next_due_date) return { cls: 'ok', key: 'nothing' }
  const n = daysBetween(today, client.next_due_date)
  if (n < 0) return { cls: 'bad', key: n === -1 ? 'overdue1' : 'overdue', n: -n }
  if (n === 0) return { cls: 'warn', key: 'dueToday' }
  if (n <= 7) return { cls: 'warn', key: n === 1 ? 'dueIn1' : 'dueIn', n }
  return { cls: 'ok', key: 'dueOn', date: client.next_due_date }
}

export function sessionsLeft(c) {
  if (c.sessions_total == null) return null
  return Math.max(c.sessions_total - c.sessions_used, 0)
}

// ISO weekday 1 = Monday … 7 = Sunday, for a 'YYYY-MM-DD'
export function isoDow(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1
}
// Localised weekday name for ISO weekday n (1–7)
export function weekdayName(n, locale, style = 'long') {
  return new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, n))) // 1 Jan 2024 = Monday
}

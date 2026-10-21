// "Add to my calendar": an .ics file (Apple / Outlook) or a Google Calendar link.
const stamp = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

export function calendarEvent(session, title, place) {
  const start = new Date(session.starts_at)
  const end = new Date(start.getTime() + (session.duration_min || 60) * 60000)
  return { start, end, title, place: place || '', url: session.meeting_url || '' }
}

export function downloadIcs(ev, uid) {
  const esc = (s) => String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Coach Dashboard//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${uid}@coach-dashboard`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(ev.start)}`, `DTEND:${stamp(ev.end)}`, `SUMMARY:${esc(ev.title)}`,
    ev.place ? `LOCATION:${esc(ev.place)}` : null, ev.url ? `URL:${ev.url}` : null,
    'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', `DESCRIPTION:${esc(ev.title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n')
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'training.ics'
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 4000)
}

export function googleCalendarUrl(ev) {
  const p = new URLSearchParams({ action: 'TEMPLATE', text: ev.title, dates: `${stamp(ev.start)}/${stamp(ev.end)}`, location: ev.place || ev.url || '' })
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

export function whatsappUrl(phone, text = '') {
  const digits = String(phone || '').replace(/[^\d]/g, '')
  if (!digits) return null
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}

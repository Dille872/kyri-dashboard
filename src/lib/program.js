// Programs work like Kyri's notes app: days that repeat, blocks of exercises,
// supersets and finishers. Stored per day as blocks:
//   { type: 'single' | 'superset', rounds?, items: [{ exercise, rx, target? }] }
//   { type: 'finisher', rounds?, lines: ['Assault Bike — 30 sec', …] }
// The kg history is not part of the program, it lives in exercise_logs.

const DASH = /\s+[—–-]\s+/

// "30kg-35kg -40kg", "17,50-20kg ,22kg", "60kg 70kg ,80,90kg. /110"
export function kgList(s = '') {
  const tm = s.match(/\/\s*(\d+(?:[.,]\d+)?)/)
  const body = s.replace(/\/\s*\d+(?:[.,]\d+)?/, '')
  // "12,50" / "17,5" = decimal (plate steps .25/.5/.75); "80,90" = two weights
  const kg = [...body.matchAll(/(\d+)(?:[.,](25|50|5|75))?(?!\d)/g)]
    .map((m) => parseFloat(m[2] ? `${m[1]}.${m[2]}` : m[1]))
    .filter((n) => n > 0 && n < 400)
  return { kg, target: tm ? parseFloat(tm[1].replace(',', '.')) : null }
}

// One exercise line → { exercise, rx, target, kg[] }
export function splitExercise(line) {
  const clean = line.replace(/^\s*(\d+[.)]|[•\-–*])\s*/, '').trim()
  const parts = clean.split(DASH)
  const name = parts[0]
  const rest = parts.slice(1).join(' — ')
  let rx = '', tail = rest
  const m = rest.match(/^(\d+\s*[×x]\s*[\d–\-]+\s*(?:m|sec|s|min)?(?:\/(?:leg|side|arm))?)(.*)$/i)
  if (m) { rx = m[1].replace(/\s+/g, '').replace(/x/i, '×'); tail = m[2] }
  else if (/^\d+\s*(sec|s|min|m)\b/i.test(rest)) { rx = rest.trim(); tail = '' }
  const inline = name.match(/^(.*?)\s*[×x]\s*(\d+)$/)   // "TRX Row ×10"
  if (inline && !rx) return { exercise: inline[1].trim(), rx: `×${inline[2]}`, ...kgList(tail) }
  return { exercise: name.trim(), rx, ...kgList(tail) }
}

// Text of one day (without the DAY line) → blocks + kg found in the text
export function parseDayText(text) {
  const blocks = []
  const kg = []          // [{ exercise, kg: [] }]
  let block = null
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line || /^[—–\-_=]{2,}$/.test(line)) continue
    const ss = line.match(/^superset\s*(?:[×x]\s*(\d+))?/i)
    if (ss) { block = { type: 'superset', rounds: ss[1] ? +ss[1] : 3, items: [] }; blocks.push(block); continue }
    const fin = line.match(/^finisher\s*(?:[×x]\s*(\d+))?/i)
    if (fin) { block = { type: 'finisher', rounds: fin[1] ? +fin[1] : null, lines: [] }; blocks.push(block); continue }
    const bullet = /^[•\-*]\s*/.test(line)
    if (bullet && block && block.type !== 'single') {
      const txt = line.replace(/^[•\-*]\s*/, '')
      if (block.type === 'finisher') {
        const r = txt.match(/^[×x]\s*(\d+)$/)
        if (r) block.rounds = +r[1]; else block.lines.push(txt)
      } else {
        const e = splitExercise(txt)
        block.items.push(item(e)); if (e.kg.length) kg.push({ exercise: e.exercise, kg: e.kg })
      }
      continue
    }
    const e = splitExercise(line)
    if (!e.exercise) continue
    block = { type: 'single', items: [item(e)] }
    blocks.push(block)
    if (e.kg.length) kg.push({ exercise: e.exercise, kg: e.kg })
  }
  return { blocks: blocks.filter((b) => (b.items?.length || b.lines?.length)), kg }
}
const item = (e) => (e.target ? { exercise: e.exercise, rx: e.rx, target: e.target } : { exercise: e.exercise, rx: e.rx })

// Whole note (title + "DAY 1 — …" sections) → { title, days: [{ title, focus, text }] }
export function parseNotes(text) {
  const out = { title: '', days: [] }
  let day = null
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    const dm = line.match(/^DAY\s*(\d+)\s*(?:[—–\-:]\s*(.*))?$/i)
    if (dm) { day = { title: `Day ${dm[1]}`, focus: (dm[2] || '').trim(), text: '' }; out.days.push(day); continue }
    if (!day) { if (line && !out.title) out.title = line; continue }
    day.text += raw + '\n'
  }
  out.title = titleCase(out.title.replace(/\s+program$/i, '').trim())
  return {
    title: out.title ? `${out.title} Program` : '',
    days: out.days.map((d) => ({ title: d.title, focus: titleCase(d.focus), ...parseDayText(d.text) })),
  }
}
function titleCase(s) {
  if (!s || s !== s.toUpperCase()) return s
  return s.toLowerCase().replace(/(^|[\s+/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
}

// blocks → text in the notes style (for editing). kg history is not written back.
export function blocksToText(blocks = []) {
  let n = 0
  const ex = (i) => `${i.exercise}${i.rx ? ` — ${i.rx}` : ''}${i.target ? ` /${i.target}` : ''}`
  const inl = (i) => (i.rx && i.rx.startsWith('×') ? `${i.exercise} ${i.rx}` : ex(i))
  return blocks.map((b) => {
    if (b.type === 'single') return `${++n}. ${ex(b.items[0])}`
    if (b.type === 'superset') return [`Superset ×${b.rounds || 3}`, ...b.items.map((i) => `• ${inl(i)}`)].join('\n')
    return [`Finisher`, ...(b.lines || []).map((l) => `• ${l}`), ...(b.rounds ? [`• ×${b.rounds}`] : [])].join('\n')
  }).join('\n\n')
}

// all exercise names of a day / program
export function dayExercises(blocks = []) {
  return blocks.flatMap((b) => (b.items || []).map((i) => i.exercise)).filter(Boolean)
}

// "3×8" → 3 sets, "4×20m" → 4, "×10" → null
export function setsOf(rx) { const m = String(rx || '').match(/^(\d+)\s*×/); return m ? +m[1] : null }
// "3×8–10" → "8–10", "×10" → "10", "4×20m" → "20m", "30 sec" → "30 sec"
export function repsOf(rx) {
  const s = String(rx || '')
  const m = s.match(/×\s*(.+)$/)
  return m ? m[1] : s
}
// seconds in "Assault Bike — 30 sec", "Rest — 1 min", "45 sec" → 30 / 60 / 45 ("20m" = metres, not time)
export function secondsOf(s) {
  const m = String(s || '').match(/(\d+)\s*(sec|s|min)\b/i)
  if (!m) return null
  return /^min$/i.test(m[2]) ? +m[1] * 60 : +m[1]
}

export function fmtKg(v) {
  if (v == null || v === '') return ''
  const n = Number(v)
  return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(v)
}

// Equipment for the "what you need" screen (same list as day_equipment() in SQL)
const EQUIP = [
  [/smith/i, 'smith'], [/^(?!db ).*deadlift|barbell/i, 'barbell'], [/\bdb\b|dumbbell/i, 'dumbbells'], [/\bkb\b|kettlebell/i, 'kettlebell'],
  [/sled/i, 'sled'], [/^row\b|rower|rowing/i, 'rower'], [/bike/i, 'bike'], [/ball/i, 'ball'], [/trx/i, 'trx'], [/step up|box/i, 'box'],
]
export function equipmentOf(blocks = []) {
  const names = blocks.flatMap((b) => [...(b.items || []).map((i) => i.exercise), ...(b.lines || [])])
  return EQUIP.filter(([re]) => names.some((n) => re.test(n))).map(([, k]) => k)
}

// group exercise_logs → { 'deadlift': [{kg, reps, date}, …] } in time order
export function historyByExercise(logs = []) {
  const out = {}
  const sorted = [...logs].sort((a, b) => (a.logged_on + a.created_at).localeCompare(b.logged_on + b.created_at))
  for (const l of sorted) {
    if (l.kg == null) continue
    const k = l.exercise.trim().toLowerCase()
    ;(out[k] ||= []).push({ kg: Number(l.kg), reps: l.reps, date: l.logged_on, source: l.source })
  }
  return out
}
export const exKey = (name) => String(name || '').trim().toLowerCase()

// YouTube link → video id (watch?v=, youtu.be/, shorts/, embed/; null for search links / other sites)
export function youtubeId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/)
  return m ? m[1] : null
}
// Plays inside the app: privacy mode, no related videos from other channels, inline on iPhone
export function youtubeEmbed(url, autoplay = false) {
  const id = youtubeId(url)
  return id ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1${autoplay ? '&autoplay=1' : ''}` : null
}
export const youtubeThumb = (url) => { const id = youtubeId(url); return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null }

import { useI18n } from '../i18n.jsx'
import { exKey, fmtKg } from '../lib/program.js'
import { MediaLine } from './ExerciseMedia.jsx'

// One program day as Kyri knows it from his notes: numbered exercises, supersets, finisher,
// with the kg history under each exercise ("60 · 70 · 80 · 90").
//   history: { exKey: [{kg}] }, lib: { exKey: entry }, onMedia(name) opens the note/video editor
//   log: { values, setValue } turns the right side into "kg today" inputs
export default function ProgramDay({ day, history = {}, lib = {}, onMedia, log }) {
  const { t } = useI18n()
  let n = 0
  const hist = (name) => {
    // like in the notes: only the changes ("60 · 70 · 80"), not every repeat
    const h = (history[exKey(name)] || []).filter((x, i, a) => i === 0 || x.kg !== a[i - 1].kg)
    return h.length ? <div className="hist" aria-label={t('prog.kgHistory')}>{h.slice(-6).map((x, i) => <span key={i}>{fmtKg(x.kg)}</span>)}</div> : null
  }
  const right = (it) => {
    if (!log) return <span className="rx">{it.rx}</span>
    const h = history[exKey(it.exercise)] || []
    const last = h.length ? fmtKg(h[h.length - 1].kg) : ''
    const k = exKey(it.exercise)
    return (
      <div className="log-in">
        {it.rx && <span className="rx">{it.rx}</span>}
        <input inputMode="decimal" aria-label={`${it.exercise} ${t('plog.today')}`} placeholder={last || 'kg'}
          value={log.values[k] ?? ''} onChange={(e) => log.setValue(k, e.target.value)} />
      </div>
    )
  }
  const ex = (it, num) => (
    <div className="pex" key={`${num}-${it.exercise}`}>
      <span className="n">{num}</span>
      <div style={{ minWidth: 0 }}>
        <div className="name">{it.exercise}</div>
        {hist(it.exercise)}
        {it.target ? <div className="meta">{t('prog.goal', { kg: it.target })}</div> : null}
        {!log && onMedia && <MediaLine entry={lib[exKey(it.exercise)]} onEdit={() => onMedia(it.exercise)} />}
      </div>
      {right(it)}
    </div>
  )
  if (!day?.blocks?.length) return <div className="empty">{t('prog.emptyDay')}</div>
  return (
    <div className="pday">
      {day.blocks.map((b, i) => {
        if (b.type === 'single') return <div className="blk" key={i}>{ex(b.items[0], ++n)}</div>
        if (b.type === 'superset') return (
          <div className="blk ss" key={i}>
            <div className="blk-h">{t('prog.superset', { n: b.rounds || 3 })}</div>
            {b.items.map((it) => ex(it, '•'))}
          </div>
        )
        return (
          <div className="blk fin" key={i}>
            <div className="blk-h">{b.rounds ? t('prog.finisherN', { n: b.rounds }) : t('prog.finisher')}</div>
            {(b.lines || []).map((l, j) => <div className="pex" key={j}><span className="n">•</span><div>{l}</div><span /></div>)}
          </div>
        )
      })}
    </div>
  )
}

import { useState } from 'react'
import { ShieldCheck, ScrollText } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { useRun } from '../../components/ui.jsx'

// First sign-in: 1. PAR-Q health questions (Kyri's own list), 2. Kyri's rules. The app opens after both.
export function ParqScreen({ client, trainer, top, onDone }) {
  const { t } = useI18n()
  const run = useRun()
  const qs = trainer.parq_questions || []
  const [ans, setAns] = useState({})      // i → true/false or text
  const [why, setWhy] = useState('')
  const [name, setName] = useState(client.name)
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const tr = (trainer.owner_name || trainer.brand_name).split(' ')[0]
  const answered = qs.every((q, i) => q.type !== 'yn' || typeof ans[i] === 'boolean')
  const anyYes = qs.some((q, i) => q.type === 'yn' && q.flag && ans[i] === true)
  const ready = answered && (!anyYes || why.trim()) && name.trim() && ok

  async function submit() {
    setBusy(true)
    const answers = qs.map((q, i) => (q.type === 'yn' ? { ...q, answer: ans[i] } : { ...q, text: String(ans[i] || '').trim() }))
    const r = await run(supabase.rpc('submit_parq', { p_client: client.id, p_answers: answers, p_explanation: anyYes ? why : '', p_name: name }))
    setBusy(false)
    if (r.ok) { window.scrollTo(0, 0); onDone() }
  }

  return (
    <div className="mobile">
      {top}
      <div className="steps" aria-label={t('onboard.step', { n: 1 })}><i className="on" /><i /></div>
      <div><div className="hello">{t('onboard.parqTitle')}</div><p className="meta" style={{ margin: '6px 0 0' }}>{t('onboard.parqSub', { trainer: tr })}</p></div>
      <div className="card">
        {qs.map((q, i) => (
          <div className="q" key={i}>
            <div id={`pq-${i}`} className="q-text">{i + 1}. {q.q}</div>
            {q.type === 'yn' ? (
              <div className="yn" role="group" aria-labelledby={`pq-${i}`}>
                <button type="button" className="y" aria-pressed={ans[i] === true} onClick={() => setAns({ ...ans, [i]: true })}>{t('common.yes')}</button>
                <button type="button" aria-pressed={ans[i] === false} onClick={() => setAns({ ...ans, [i]: false })}>{t('common.no')}</button>
              </div>
            ) : (
              <textarea rows={2} aria-labelledby={`pq-${i}`} placeholder={t('onboard.typeHere')} value={ans[i] || ''} onChange={(e) => setAns({ ...ans, [i]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
      {anyYes && (
        <label className="f" htmlFor="pq-why">{t('onboard.explain', { trainer: tr })}<textarea id="pq-why" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} /></label>
      )}
      <label className="f" htmlFor="pq-name">{t('onboard.name')}<input id="pq-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <label className="check-row" htmlFor="pq-ok" style={{ alignItems: 'flex-start' }}><input id="pq-ok" type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} style={{ marginTop: 2 }} />
        <span style={{ fontWeight: 500 }}>{t('onboard.confirm', { trainer: tr })}</span></label>
      <button className="btn block" disabled={!ready || busy} onClick={submit}><ShieldCheck />{t('onboard.continue')}</button>
    </div>
  )
}

export function RulesScreen({ client, trainer, top, onDone }) {
  const { t } = useI18n()
  const run = useRun()
  const [ok, setOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const tr = (trainer.owner_name || trainer.brand_name).split(' ')[0]
  async function accept() {
    setBusy(true)
    const r = await run(supabase.rpc('accept_rules', { p_client: client.id }))
    setBusy(false)
    if (r.ok) { window.scrollTo(0, 0); onDone() }
  }
  return (
    <div className="mobile">
      {top}
      <div className="steps" aria-label={t('onboard.step', { n: 2 })}><i className="on" /><i className="on" /></div>
      <div><div className="hello">{t('onboard.rulesTitle', { trainer: tr })}</div><p className="meta" style={{ margin: '6px 0 0' }}>{t('onboard.rulesSub')}</p></div>
      <div className="card rules-text">{trainer.rules_text}</div>
      <label className="check-row" htmlFor="r-ok"><input id="r-ok" type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />{t('onboard.accept')}</label>
      <button className="btn block" disabled={!ok || busy} onClick={accept}><ScrollText />{t('onboard.start')}</button>
    </div>
  )
}

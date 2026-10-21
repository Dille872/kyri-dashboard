import { useCallback, useEffect, useState } from 'react'
import { Banknote, Landmark, Plus } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { useI18n } from '../../i18n.jsx'
import { Modal, useIsMobile, useRun, useToast } from '../../components/ui.jsx'
import { daysBetween, fmtDate, fmtRelative, money, payState, ymd } from '../../lib/format.js'

const RevIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M7 20V4h6.5a4.5 4.5 0 0 1 0 9H7M12 13l5 7" /></svg>
export function MethodTag({ method }) {
  const { t } = useI18n()
  const Icon = method === 'revolut' ? RevIcon : method === 'cash' ? Banknote : Landmark
  return <span className="method"><Icon />{t(`methods.${method}`)}</span>
}

export default function Payments({ data, reload, trainerId }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [history, setHistory] = useState([])
  const [rec, setRec] = useState(null)
  const mobile = useIsMobile()
  const today = ymd()

  const load = useCallback(async () => {
    const r = await run(supabase.from('payments').select('*').eq('trainer_id', trainerId).neq('status', 'reported').order('paid_on', { ascending: false }).order('reported_at', { ascending: false }).limit(100))
    if (r.ok) setHistory(r.data)
  }, [trainerId, run])
  useEffect(() => { load() }, [load])

  const byId = Object.fromEntries(data.clients.map((c) => [c.id, c]))
  const pendingIds = new Set(data.pending.map((p) => p.client_id))
  const open = data.clients.filter((c) => c.active && c.next_due_date && !pendingIds.has(c.id) && daysBetween(today, c.next_due_date) <= 14)
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
  const month = today.slice(0, 7)
  const thisMonth = history.filter((h) => h.status === 'confirmed' && h.paid_on.startsWith(month))

  async function decide(p, confirm) {
    const r = await run(supabase.rpc('decide_payment', { p_payment: p.id, p_confirm: confirm }))
    if (r.ok) {
      const name = byId[p.client_id]?.name
      toast(confirm ? t('payments.confirmedToast', { name, amount: money(p.amount, locale) }) : t('payments.rejectedToast', { name }))
      reload(); load()
    }
  }

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">Revolut · {t('methods.bank')} · {t('methods.cash')}</div><h1>{t('payments.title')}</h1><p className="sub">{t('payments.subtitle')}</p></div>
        <button className="btn" onClick={() => setRec({})}><Plus />{t('payments.record')}</button>
      </div>
      <div className="grid kpis three">
        <div className={`panel kpi ${data.pending.length ? 'hl' : ''}`}><div className="lab">{t('payments.kpiConfirm')}</div><div className="val">{data.pending.length}</div>
          <div className="meta">{money(data.pending.reduce((a, p) => a + Number(p.amount), 0), locale)}</div></div>
        <div className="panel kpi"><div className="lab">{t('payments.kpiOpen')}</div><div className="val">{money(open.reduce((a, c) => a + Number(c.price), 0), locale)}</div>
          <div className="meta">{t('overview.kpiOutstandingHint', { n: open.length })}</div></div>
        <div className="panel kpi"><div className="lab">{t('payments.kpiMonth')}</div><div className="val">{money(thisMonth.reduce((a, p) => a + Number(p.amount), 0), locale)}</div>
          <div className="meta">{t('payments.kpiMonthHint', { n: thisMonth.length })}</div></div>
      </div>

      <div className="grid two" style={{ marginTop: 14 }}>
        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="panel-h"><h2>{t('payments.toConfirm')}</h2></div>
          <div className="list">
            {data.pending.length === 0 && <div className="empty">{t('payments.allCaught')}</div>}
            {data.pending.map((p) => (
              <div className="row" key={p.id}>
                <div><div className="name">{byId[p.client_id]?.name}</div>
                  <div className="meta">{t('payments.reported', { amount: money(p.amount, locale), method: t(`methods.${p.method}`), when: fmtRelative(p.reported_at, locale) })}</div></div>
                <div className="acts"><button className="chip" onClick={() => decide(p, false)}>{t('payments.reject')}</button>
                  <button className="chip solid" onClick={() => decide(p, true)}>{t('payments.confirm')}</button></div>
              </div>
            ))}
          </div>
        </section>
        <section className="panel" style={{ alignSelf: 'start' }}>
          <div className="panel-h"><h2>{t('payments.open')}</h2></div>
          <div className="list">
            {open.length === 0 && <div className="empty">{t('payments.nothingOpen')}</div>}
            {open.map((c) => { const p = payState(c, pendingIds, today); return (
              <div className="row" key={c.id}>
                <div><div className="name">{c.name}</div><div className="meta">{money(c.price, locale)} · {fmtDate(c.next_due_date, locale)}</div></div>
                <div className="acts"><span className={`pill ${p.cls}`}>{t(`payState.${p.key}`, { n: p.n, date: fmtDate(p.date, locale) })}</span>
                  <button className="chip" onClick={() => setRec({ client_id: c.id, method: 'cash' })}>{t('payments.received')}</button></div>
              </div>) })}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 14 }}>
        <div className="panel-h"><h2>{t('payments.history')}</h2></div>
        {history.length === 0 ? <div className="empty">{t('payments.noHistory')}</div> : mobile ? (
          <div className="list">
            {history.map((h) => (
              <div className="row" key={h.id}>
                <div><div className="name">{byId[h.client_id]?.name}</div><div className="meta">{fmtDate(h.paid_on, locale)} · {t(`methods.${h.method}`)}</div></div>
                <div style={{ textAlign: 'right' }}><div className="num">{money(h.amount, locale)}</div>
                  {h.status !== 'confirmed' && <span className="pill mute">{t(`payments.st.${h.status}`)}</span>}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="tbl-wrap"><table>
            <thead><tr><th>{t('payments.date')}</th><th>{t('payments.client')}</th><th>{t('payments.amount')}</th><th>{t('payments.method')}</th><th>{t('clients.status')}</th></tr></thead>
            <tbody>{history.map((h) => (
              <tr key={h.id}><td className="num">{fmtDate(h.paid_on, locale)}</td><td className="name">{byId[h.client_id]?.name}</td>
                <td className="num">{money(h.amount, locale)}</td><td><MethodTag method={h.method} /></td>
                <td><span className={`pill ${h.status === 'confirmed' ? 'ok' : 'mute'}`}>{t(`payments.st.${h.status}`)}</span></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <RecordModal rec={rec} onClose={() => setRec(null)} clients={data.clients} onSaved={() => { setRec(null); reload(); load() }} />
    </>
  )
}

function RecordModal({ rec, onClose, clients, onSaved }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [f, setF] = useState(null)
  const active = clients.filter((c) => c.active)

  useEffect(() => {
    if (!rec) return setF(null)
    const c = clients.find((x) => x.id === rec.client_id) || active[0]
    setF({ client_id: c?.id || '', amount: c?.price ?? '', method: rec.method || 'cash', paid_on: ymd(), advance: true })
  }, [rec]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!f || !rec) return <Modal open={false} onClose={onClose} />
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  function pickClient(e) { const c = clients.find((x) => x.id === e.target.value); setF({ ...f, client_id: e.target.value, amount: c?.price ?? f.amount }) }

  async function save(e) {
    e.preventDefault()
    const r = await run(supabase.rpc('record_payment', { p_client: f.client_id, p_amount: Number(f.amount) || 0, p_method: f.method, p_paid_on: f.paid_on, p_advance: f.advance }))
    if (r.ok) { toast(t('payments.recordedToast', { name: clients.find((c) => c.id === f.client_id)?.name, amount: money(f.amount, locale) })); onSaved() }
  }

  return (
    <Modal open={!!rec} title={t('payments.record')} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="f" htmlFor="r-client">{t('payments.client')}
          <select id="r-client" required value={f.client_id} onChange={pickClient}>{active.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="row3">
          <label className="f" htmlFor="r-amount">{t('payments.amount')} (€)<input id="r-amount" type="number" min="0" step="0.01" required value={f.amount} onChange={set('amount')} /></label>
          <label className="f" htmlFor="r-method">{t('payments.method')}
            <select id="r-method" value={f.method} onChange={set('method')}>{['cash', 'revolut', 'bank'].map((m) => <option key={m} value={m}>{t(`methods.${m}`)}</option>)}</select></label>
          <label className="f" htmlFor="r-date">{t('payments.date')}<input id="r-date" type="date" required value={f.paid_on} onChange={set('paid_on')} /></label>
        </div>
        <label className="check-row" htmlFor="r-adv"><input id="r-adv" type="checkbox" checked={f.advance} onChange={set('advance')} />{t('payments.advance')}</label>
        <div className="meta" style={{ marginTop: -8 }}>{t('payments.advanceHelp')}</div>
        <div className="modal-foot">
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn">{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

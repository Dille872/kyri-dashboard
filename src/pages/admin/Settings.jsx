import { useEffect, useState } from 'react'
import { Plus, Trash2, Copy } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { LANGS, useI18n } from '../../i18n.jsx'
import { copyText, useRun, useToast } from '../../components/ui.jsx'

const FIELDS = ['brand_name', 'owner_name', 'tagline', 'account_name', 'iban', 'bic', 'revolut_url', 'default_lang', 'lock_overdue_days', 'client_history_weeks', 'phone', 'cancel_hours']
const NUMBERS = ['lock_overdue_days', 'client_history_weeks', 'cancel_hours']

export default function Settings({ data, reload, trainerId }) {
  const { t } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [f, setF] = useState(() => Object.fromEntries(FIELDS.map((k) => [k, data.trainer[k] ?? ''])))
  const [pkgs, setPkgs] = useState(data.packages)
  useEffect(() => setPkgs(data.packages), [data.packages])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function saveTrainer(e) {
    e.preventDefault()
    const row = Object.fromEntries(FIELDS.map((k) => [k, f[k] === '' ? null : NUMBERS.includes(k) ? Math.max(0, parseInt(f[k], 10) || 0) : f[k]]))
    row.brand_name = row.brand_name || data.trainer.brand_name
    row.default_lang = row.default_lang || 'en'
    if (row.cancel_hours == null) row.cancel_hours = 24
    const r = await run(supabase.from('trainers').update(row).eq('id', trainerId))
    if (r.ok) { toast(t('common.saved')); reload() }
  }

  const setPkg = (i, k) => (e) => setPkgs(pkgs.map((p, j) => (j === i ? { ...p, [k]: e.target.value } : p)))
  async function savePkg(p) {
    const row = { trainer_id: trainerId, name: p.name.trim() || '—', sessions: p.sessions === '' || p.sessions == null ? null : Number(p.sessions),
      price: Number(p.price) || 0, billing: p.billing, sort: p.sort ?? 0 }
    const r = p.id ? await run(supabase.from('packages').update(row).eq('id', p.id)) : await run(supabase.from('packages').insert(row))
    if (r.ok) { toast(t('common.saved')); reload() }
  }
  async function removePkg(p) {
    if (!p.id) return setPkgs(pkgs.filter((x) => x !== p))
    // keep history intact: archive instead of hard delete
    const r = await run(supabase.from('packages').update({ active: false }).eq('id', p.id))
    if (r.ok) reload()
  }
  const appUrl = window.location.origin

  return (
    <>
      <div className="head"><div><div className="eyebrow">{data.trainer.brand_name}</div><h1>{t('settings.title')}</h1></div></div>
      <div className="grid two">
        <form className="panel form" onSubmit={saveTrainer} style={{ alignSelf: 'start' }}>
          <h2>{t('settings.brand')}</h2>
          <label className="f" htmlFor="t-brand">{t('settings.brandName')}<input id="t-brand" value={f.brand_name} onChange={set('brand_name')} required /></label>
          <div className="row2">
            <label className="f" htmlFor="t-owner">{t('settings.ownerName')}<input id="t-owner" value={f.owner_name} onChange={set('owner_name')} /></label>
            <label className="f" htmlFor="t-tag">{t('settings.tagline')}<input id="t-tag" value={f.tagline} onChange={set('tagline')} /></label>
          </div>
          <div className="row2">
            <label className="f" htmlFor="t-phone">{t('settings.phone')}<input id="t-phone" type="tel" value={f.phone} onChange={set('phone')} placeholder="+357 99 123456" /><small>{t('settings.phoneHelp')}</small></label>
            <label className="f" htmlFor="t-cancel">{t('settings.cancelHours')}<input id="t-cancel" type="number" min="0" max="168" value={f.cancel_hours} onChange={set('cancel_hours')} /><small>{t('settings.cancelHelp')}</small></label>
          </div>
          <label className="f" htmlFor="t-lang">{t('settings.defaultLang')}
            <select id="t-lang" value={f.default_lang} onChange={set('default_lang')}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
          <h2 style={{ marginTop: 10 }}>{t('settings.bank')}</h2>
          <div className="meta" style={{ marginTop: -8 }}>{t('settings.bankHelp')}</div>
          <label className="f" htmlFor="t-acc">{t('settings.accountName')}<input id="t-acc" value={f.account_name} onChange={set('account_name')} /></label>
          <div className="row2">
            <label className="f" htmlFor="t-iban">{t('settings.iban')}<input id="t-iban" value={f.iban} onChange={set('iban')} /></label>
            <label className="f" htmlFor="t-bic">{t('settings.bic')}<input id="t-bic" value={f.bic} onChange={set('bic')} /></label>
          </div>
          <label className="f" htmlFor="t-rev">{t('settings.revolut')}<input id="t-rev" type="url" value={f.revolut_url} onChange={set('revolut_url')} placeholder="https://revolut.me/…" /><small>{t('settings.revolutHelp')}</small></label>
          <h2 style={{ marginTop: 10 }}>{t('settings.protection')}</h2>
          <div className="row2">
            <label className="f" htmlFor="t-lock">{t('settings.lockDays')}<input id="t-lock" type="number" min="0" value={f.lock_overdue_days} onChange={set('lock_overdue_days')} /><small>{t('settings.lockHelp')}</small></label>
            <label className="f" htmlFor="t-hist">{t('settings.historyWeeks')}<input id="t-hist" type="number" min="1" value={f.client_history_weeks} onChange={set('client_history_weeks')} /><small>{t('settings.historyHelp')}</small></label>
          </div>
          <div className="modal-foot"><button className="btn">{t('common.save')}</button></div>
        </form>

        <div className="grid" style={{ alignContent: 'start' }}>
          <section className="panel">
            <div className="panel-h"><h2>{t('settings.appLink')}</h2></div>
            <div className="row" style={{ borderTop: 0, paddingTop: 0 }}>
              <div><div className="num" style={{ overflowWrap: 'anywhere' }}>{appUrl}</div><div className="meta">{t('settings.appLinkHelp')}</div></div>
              <button className="chip" onClick={async () => toast((await copyText(appUrl)) ? t('common.copied') : appUrl)}><Copy size={13} style={{ verticalAlign: '-2px' }} /> {t('common.copy')}</button>
            </div>
          </section>
          <section className="panel">
            <div className="panel-h"><h2>{t('settings.packages')}</h2>
              <button className="btn ghost small" onClick={() => setPkgs([...pkgs, { name: '', sessions: '', price: 0, billing: 'monthly', active: true, sort: pkgs.length + 1 }])}><Plus />{t('settings.addPackage')}</button></div>
            <div className="list">
              {pkgs.filter((p) => p.active !== false).map((p) => { const i = pkgs.indexOf(p); return (
                <div key={p.id || `new-${i}`} className="form" style={{ borderTop: '1px solid var(--line)', padding: '14px 0', gap: 10 }}>
                  <label className="f" htmlFor={`p-name-${i}`}>{t('settings.packageName')}<input id={`p-name-${i}`} value={p.name} onChange={setPkg(i, 'name')} /></label>
                  <div className="row3">
                    <label className="f" htmlFor={`p-s-${i}`}>{t('settings.sessions')}<input id={`p-s-${i}`} type="number" min="0" placeholder={t('settings.sessionsHelp')} value={p.sessions ?? ''} onChange={setPkg(i, 'sessions')} /></label>
                    <label className="f" htmlFor={`p-p-${i}`}>{t('clients.price')} (€)<input id={`p-p-${i}`} type="number" min="0" value={p.price} onChange={setPkg(i, 'price')} /></label>
                    <label className="f" htmlFor={`p-b-${i}`}>{t('clients.billing')}
                      <select id={`p-b-${i}`} value={p.billing} onChange={setPkg(i, 'billing')}>{['pack', 'monthly', 'weekly'].map((b) => <option key={b} value={b}>{t(`billing.${b}`)}</option>)}</select></label>
                  </div>
                  <div className="acts">
                    <button type="button" className="chip" onClick={() => removePkg(p)} aria-label={t('common.delete')}><Trash2 size={13} style={{ verticalAlign: '-2px' }} /> {t('common.delete')}</button>
                    <button type="button" className="chip solid" onClick={() => savePkg(p)}>{t('common.save')}</button>
                  </div>
                </div>) })}
            </div>
          </section>
        </div>
      </div>
    </>
  )
}

import { useEffect, useState } from 'react'
import { Plus, Trash2, Copy, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { DICTS, LANGS, useI18n } from '../../i18n.jsx'
import { copyText, useRun, useToast } from '../../components/ui.jsx'

const FIELDS = ['brand_name', 'owner_name', 'tagline', 'account_name', 'iban', 'bic', 'revolut_url', 'default_lang', 'phone', 'cancel_hours', 'rules_text', 'reminder_days', 'contact_email', 'privacy_text']
const NUMBERS = ['cancel_hours', 'reminder_days']

export default function Settings({ data, reload, trainerId }) {
  const { t } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [f, setF] = useState(() => Object.fromEntries(FIELDS.map((k) => [k, data.trainer[k] ?? ''])))
  const [pkgs, setPkgs] = useState(data.packages)
  useEffect(() => setPkgs(data.packages), [data.packages])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const [trc, setTrc] = useState(!!data.trainer.translate_comments)

  async function saveTrainer(e) {
    e.preventDefault()
    const row = Object.fromEntries(FIELDS.map((k) => [k, f[k] === '' ? null : NUMBERS.includes(k) ? Math.max(0, parseInt(f[k], 10) || 0) : f[k]]))
    row.brand_name = row.brand_name || data.trainer.brand_name
    row.default_lang = row.default_lang || 'en'
    if (row.cancel_hours == null) row.cancel_hours = 24
    row.translate_comments = trc
    row.reminder_days = Math.min(Math.max(row.reminder_days ?? 2, 1), 14)
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
          <h2 style={{ marginTop: 10 }}>{t('settings.rules')}</h2>
          <div className="meta" style={{ marginTop: -8 }}>{t('settings.rulesHelp')}</div>
          <textarea id="t-rules" aria-label={t('settings.rules')} rows={6} value={f.rules_text} onChange={set('rules_text')} />
          <h2 style={{ marginTop: 10 }}>{t('privacy.title')}</h2>
          <label className="f" htmlFor="t-pmail">{t('privacy.contactEmail')}<input id="t-pmail" type="email" value={f.contact_email} onChange={set('contact_email')} placeholder="you@example.com" /></label>
          <label className="f" htmlFor="t-ptext">{t('privacy.privacyText')}<textarea id="t-ptext" rows={4} value={f.privacy_text} onChange={set('privacy_text')} /><small>{t('privacy.privacyHelp')}</small></label>
          <h2 style={{ marginTop: 10 }}>{t('tr.title')}</h2>
          <div className="meta" style={{ marginTop: -8 }}>{t('tr.help')}</div>
          <label className="check-row" htmlFor="t-trc" style={{ alignItems: 'flex-start' }}><input id="t-trc" type="checkbox" checked={trc} onChange={(e) => setTrc(e.target.checked)} style={{ marginTop: 2 }} />
            <span><span style={{ fontWeight: 500 }}>{t('tr.comments')}</span><small className="meta" style={{ display: 'block' }}>{t('tr.commentsHelp')}</small></span></label>
          <h2 style={{ marginTop: 10 }}>{t('settings.reminder')}</h2>
          <label className="f" htmlFor="t-remind">{t('settings.reminderDays')}<input id="t-remind" type="number" min="1" max="14" value={f.reminder_days} onChange={set('reminder_days')} style={{ maxWidth: 120 }} /><small>{t('settings.reminderHelp')}</small></label>
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
      <ParqEditor trainer={data.trainer} trainerId={trainerId} reload={reload} />
    </>
  )
}

// Health questions: collapsible, Yes/No or text, flag "Yes", reorder, delete, reset to the standard 7
function ParqEditor({ trainer, trainerId, reload }) {
  const { t, lang } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [qs, setQs] = useState(trainer.parq_questions || [])
  const [dirty, setDirty] = useState(false)
  useEffect(() => { setQs(trainer.parq_questions || []); setDirty(false) }, [trainer.parq_questions])
  const upd = (next) => { setQs(next); setDirty(true) }
  const setQ = (i, patch) => upd(qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  const move = (i, d) => { const n = [...qs]; [n[i], n[i + d]] = [n[i + d], n[i]]; upd(n) }
  async function save() {
    const clean = qs.filter((q) => q.q.trim()).map((q) => ({ q: q.q.trim(), type: q.type, flag: q.type === 'yn' && !!q.flag }))
    const r = await run(supabase.from('trainers').update({ parq_questions: clean }).eq('id', trainerId))
    if (r.ok) { toast(t('common.saved')); setDirty(false); reload() }
  }
  const flagged = qs.filter((q) => q.type === 'yn' && q.flag).length
  return (
    <section className="panel" style={{ marginTop: 14 }}>
      <button className="fold" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span><h2>{t('settings.parqTitle')}</h2><span className="meta">{t('settings.parqCount', { n: qs.length, f: flagged })}</span></span>
        <ChevronDown className="chev" />
      </button>
      {open && (
        <div className="form" style={{ marginTop: 14 }}>
          <div className="meta">{t('settings.parqHelp')}</div>
          <div className="acts" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="chip solid" onClick={() => upd([...qs, { q: '', type: 'yn', flag: true }])}><Plus size={12} style={{ verticalAlign: '-2px' }} /> {t('settings.addQ')}</button>
            <button type="button" className="chip" onClick={() => { upd((DICTS[lang] || DICTS.en).parqStd.map((q) => ({ q, type: 'yn', flag: true }))); toast(t('settings.resetDone')) }}>{t('settings.resetQ')}</button>
          </div>
          <div className="list">
            {qs.map((q, i) => (
              <div className="qrow" key={i}>
                <span className="n">{i + 1}</span>
                <textarea rows={2} aria-label={t('settings.question', { n: i + 1 })} placeholder={t('settings.newQ')} value={q.q} onChange={(e) => setQ(i, { q: e.target.value })} />
                <select aria-label={t('settings.question', { n: i + 1 })} value={q.type} onChange={(e) => setQ(i, { type: e.target.value })}>
                  <option value="yn">{t('settings.yn')}</option><option value="text">{t('settings.text')}</option>
                </select>
                <label className="check-row qflag" style={{ visibility: q.type === 'yn' ? 'visible' : 'hidden' }}>
                  <input type="checkbox" checked={!!q.flag} onChange={(e) => setQ(i, { flag: e.target.checked })} />{t('settings.flag')}</label>
                <div className="acts" style={{ flexWrap: 'nowrap' }}>
                  <button type="button" className="icon-btn sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('common.moveUp')}><ArrowUp /></button>
                  <button type="button" className="icon-btn sm" disabled={i === qs.length - 1} onClick={() => move(i, 1)} aria-label={t('common.moveDown')}><ArrowDown /></button>
                  <button type="button" className="icon-btn sm" onClick={() => upd(qs.filter((_, j) => j !== i))} aria-label={t('settings.delQ')}><Trash2 /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="modal-foot"><button type="button" className="btn" disabled={!dirty} onClick={save}>{t('settings.saveQ')}</button></div>
        </div>
      )}
    </section>
  )
}

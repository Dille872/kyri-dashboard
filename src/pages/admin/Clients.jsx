import { useEffect, useState } from 'react'
import { Plus, Copy, Archive, RotateCcw } from 'lucide-react'
import { supabase } from '../../supabase.js'
import { DICTS, LANGS, useI18n } from '../../i18n.jsx'
import { Modal, copyText, useIsMobile, useRun, useToast } from '../../components/ui.jsx'
import { fmtDate, money, payState, sessionsLeft, weekdayName, ymd } from '../../lib/format.js'
import ClientProfile from './ClientProfile.jsx'

export default function Clients({ data, reload, trainerId, go }) {
  const { t, locale } = useI18n()
  const toast = useToast()
  const [edit, setEdit] = useState(null)
  const [tab, setTab] = useState('active')
  const [q, setQ] = useState('')
  const [parq, setParq] = useState({})        // client_id → latest PAR-Q answer
  const [profileId, setProfileId] = useState(() => {
    try { const id = sessionStorage.getItem('clients-profile'); sessionStorage.removeItem('clients-profile'); return id } catch { return null }
  })
  const run = useRun()
  const mobile = useIsMobile()
  const today = ymd()
  const pendingIds = new Set(data.pending.map((p) => p.client_id))
  const pkById = Object.fromEntries(data.packages.map((p) => [p.id, p]))
  const act = data.clients.filter((c) => c.active), arc = data.clients.filter((c) => !c.active)
  const list = (tab === 'active' ? act : arc).filter((c) => !q.trim() || `${c.name} ${c.email}`.toLowerCase().includes(q.trim().toLowerCase()))
  useEffect(() => {
    supabase.from('parq_responses').select('client_id, flagged, reviewed_at, created_at').eq('trainer_id', trainerId).order('created_at')
      .then(({ data: d }) => setParq(Object.fromEntries((d || []).map((r) => [r.client_id, r]))))
  }, [trainerId, data.clients])
  const parqPill = (c) => {
    const r = parq[c.id]
    if (!c.parq_at || !r) return <span className="pill mute">{t('clients.parqNone')}</span>
    return r.flagged && !r.reviewed_at ? <span className="pill bad">{t('clients.parqCheck')}</span> : <span className="pill ok">{t('clients.parqOk')}</span>
  }
  async function setArchived(c, archived) {
    const r = await run(supabase.from('clients').update({ active: !archived, archived_at: archived ? new Date().toISOString() : null }).eq('id', c.id))
    if (r.ok) { toast(t(archived ? 'clients.archivedToast' : 'clients.reactivatedToast', { name: c.name })); reload() }
  }

  async function invite(c) {
    const dict = { name: c.name.split(' ')[0], brand: data.trainer.brand_name, url: window.location.origin, email: c.email }
    // invite text in the client's own language
    const text = (DICTS[c.lang] || DICTS.en).clients.invite.replace(/\{(\w+)\}/g, (_, k) => dict[k] ?? '')
    const ok = await copyText(text)
    toast(ok ? t('clients.inviteCopied') : text)
  }

  const modal = <ClientModal edit={edit} onClose={() => setEdit(null)} data={data} trainerId={trainerId} onSaved={() => { setEdit(null); reload() }} onInvite={invite} />
  const profileClient = data.clients.find((c) => c.id === profileId)
  if (profileClient) return (
    <>
      <ClientProfile client={profileClient} data={data} trainerId={trainerId} go={go} reload={reload}
        onBack={() => setProfileId(null)} onEdit={setEdit} onInvite={invite} onArchive={setArchived} />
      {modal}
    </>
  )

  return (
    <>
      <div className="head">
        <div><div className="eyebrow">{data.trainer.brand_name}</div><h1>{t('clients.title')}</h1>
          <p className="sub">{t('clients.subtitle2')}</p></div>
        <div className="acts">
          <button className="btn" onClick={() => setEdit({ isNew: true })}><Plus />{t('clients.add')}</button>
        </div>
      </div>
      <div className="tabs">
        <div className="seg" role="group" aria-label={t('clients.title')}>
          <button aria-pressed={tab === 'active'} onClick={() => setTab('active')}>{t('clients.tabActive', { n: act.length })}</button>
          <button aria-pressed={tab === 'archived'} onClick={() => setTab('archived')}>{t('clients.tabArchived', { n: arc.length })}</button>
        </div>
        <input className="search" type="search" placeholder={t('clients.search')} aria-label={t('clients.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="panel">
        {list.length === 0 ? <div className="empty">{q ? t('clients.noMatch') : tab === 'archived' ? t('clients.emptyArchived') : t('clients.empty')}</div> : mobile ? (
          <div className="list">
            {list.map((c) => {
              const p = payState(c, pendingIds, today); const left = sessionsLeft(c)
              return (
                <button key={c.id} className="row mrow" onClick={() => { setProfileId(c.id); window.scrollTo(0, 0) }}>
                  <div style={{ minWidth: 0, textAlign: 'left' }}>
                    <div className="name">{c.name}</div>
                    <div className="meta">{t(`modes.${c.mode || 'gym'}`)} · {left == null ? t('clients.unlimited') : `${left}/${c.sessions_total}`} · {money(c.price, locale)}</div>
                    {!c.active && c.archived_at && <div className="meta">{t('clients.archivedOn', { date: fmtDate(ymd(new Date(c.archived_at)), locale) })}</div>}
                  </div>
                  <div className="stack-pills">{c.active && <span className={`pill ${p.cls}`}>{t(`payState.${p.key}`, { n: p.n, date: fmtDate(p.date, locale) })}</span>}{parqPill(c)}</div>
                </button>
              )
            })}
          </div>
        ) : (
          <div className="tbl-wrap"><table>
            <thead><tr><th>{t('clients.name')}</th><th>{t('clients.package')}</th><th>{t('clients.sessionsLeft')}</th><th>{t('clients.price')}</th><th>{t('clients.status')}</th><th>PAR-Q</th><th /></tr></thead>
            <tbody>
              {list.map((c) => {
                const p = payState(c, pendingIds, today); const left = sessionsLeft(c)
                return (
                  <tr key={c.id} className="click" onClick={() => { setProfileId(c.id); window.scrollTo(0, 0) }}>
                    <td><div className="name">{c.name}</div><div className="meta">{!c.active && c.archived_at ? t('clients.archivedOn', { date: fmtDate(ymd(new Date(c.archived_at)), locale) }) : c.email}</div></td>
                    <td>{pkById[c.package_id]?.name || t('clients.noPackage')}<div className="meta">{t(`modes.${c.mode || 'gym'}`)} · {t(`billing.${c.billing}`)}</div></td>
                    <td className="num">{left == null ? t('clients.unlimited') : <>{left} / {c.sessions_total}<div className="bar"><i style={{ width: `${Math.min(100, (left / Math.max(c.sessions_total, 1)) * 100)}%` }} /></div></>}</td>
                    <td className="num">{money(c.price, locale)}</td>
                    <td>{c.active ? <span className={`pill ${p.cls}`}>{t(`payState.${p.key}`, { n: p.n, date: fmtDate(p.date, locale) })}</span> : <span className="pill mute">{t('clients.inactive')}</span>}</td>
                    <td>{parqPill(c)}</td>
                    <td onClick={(e) => e.stopPropagation()}><div className="acts" style={{ flexWrap: 'nowrap' }}>
                      {c.active && <button className="chip" onClick={() => invite(c)} title={t('clients.copyInvite')}><Copy size={13} style={{ verticalAlign: '-2px' }} /> {t('clients.copyInvite')}</button>}
                      <button className="chip" onClick={() => setArchived(c, c.active)}>{c.active ? <><Archive size={13} style={{ verticalAlign: '-2px' }} /> {t('clients.archive')}</> : <><RotateCcw size={13} style={{ verticalAlign: '-2px' }} /> {t('clients.reactivate')}</>}</button>
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table></div>
        )}
      </div>
      {modal}
    </>
  )
}

function ClientModal({ edit, onClose, data, trainerId, onSaved, onInvite }) {
  const { t, locale } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [f, setF] = useState(null)

  useEffect(() => {
    if (!edit) return setF(null)
    if (edit.isNew) {
      const pk = data.packages.find((p) => p.active)
      setF({ name: '', email: '', phone: '', lang: data.trainer.default_lang || 'en', package_id: pk?.id || '', price: pk?.price ?? 0,
        billing: pk?.billing || 'monthly', sessions_total: pk?.sessions ?? '', sessions_used: 0, next_due_date: ymd(), active: true,
        mode: 'gym', checkin_weekday: '', show_training: true })
    } else {
      setF({ ...edit, phone: edit.phone || '', package_id: edit.package_id || '', sessions_total: edit.sessions_total ?? '', next_due_date: edit.next_due_date || '',
        mode: edit.mode || 'gym', checkin_weekday: edit.checkin_weekday ?? '', show_training: edit.show_training !== false })
    }
  }, [edit, data])

  if (!f || !edit) return <Modal open={false} onClose={onClose} />
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  function pickPackage(e) {
    const pk = data.packages.find((p) => p.id === e.target.value)
    setF(pk ? { ...f, package_id: pk.id, price: pk.price, billing: pk.billing, sessions_total: pk.sessions ?? '' } : { ...f, package_id: '' })
  }

  async function save(e) {
    e.preventDefault()
    const row = {
      trainer_id: trainerId, name: f.name.trim(), email: f.email.trim().toLowerCase(), phone: f.phone || null, lang: f.lang,
      package_id: f.package_id || null, price: Number(f.price) || 0, billing: f.billing,
      sessions_total: f.sessions_total === '' ? null : Number(f.sessions_total), sessions_used: Number(f.sessions_used) || 0,
      next_due_date: f.next_due_date || null,
      mode: f.mode,
    }
    const r = edit.isNew ? await run(supabase.from('clients').insert(row)) : await run(supabase.from('clients').update(row).eq('id', edit.id))
    if (r.ok) { toast(t('common.saved')); onSaved() }
  }

  return (
    <Modal open={!!edit} title={edit.isNew ? t('clients.add') : t('clients.edit')} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <label className="f" htmlFor="c-name">{t('clients.name')}<input id="c-name" required value={f.name} onChange={set('name')} /></label>
        <label className="f" htmlFor="c-email">{t('clients.email')}<input id="c-email" type="email" required value={f.email} onChange={set('email')} /><small>{t('clients.emailHelp')}</small></label>
        <div className="row2">
          <label className="f" htmlFor="c-phone">{t('clients.phone')}<input id="c-phone" type="tel" value={f.phone} onChange={set('phone')} /></label>
          <label className="f" htmlFor="c-lang">{t('clients.language')}
            <select id="c-lang" value={f.lang} onChange={set('lang')}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}</select></label>
        </div>
        <div className="row2">
          <label className="f" htmlFor="c-mode">{t('clients.mode')}
            <select id="c-mode" value={f.mode} onChange={set('mode')}>{['gym', 'online', 'hybrid'].map((m) => <option key={m} value={m}>{t(`modes.${m}`)}</option>)}</select></label>
          <span />
        </div>
        <div className="row2">
          <label className="f" htmlFor="c-pkg">{t('clients.package')}
            <select id="c-pkg" value={f.package_id} onChange={pickPackage}>
              <option value="">{t('clients.noPackage')}</option>
              {data.packages.filter((p) => p.active || p.id === f.package_id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></label>
          <label className="f" htmlFor="c-bill">{t('clients.billing')}
            <select id="c-bill" value={f.billing} onChange={set('billing')}>{['pack', 'monthly', 'weekly'].map((b) => <option key={b} value={b}>{t(`billing.${b}`)}</option>)}</select></label>
        </div>
        <div className="row3">
          <label className="f" htmlFor="c-price">{t('clients.price')} (€)<input id="c-price" type="number" min="0" step="1" value={f.price} onChange={set('price')} /></label>
          <label className="f" htmlFor="c-tot">{t('clients.sessionsTotal')}<input id="c-tot" type="number" min="0" placeholder={t('clients.unlimited')} value={f.sessions_total} onChange={set('sessions_total')} /></label>
          <label className="f" htmlFor="c-used">{t('clients.sessionsUsed')}<input id="c-used" type="number" min="0" value={f.sessions_used} onChange={set('sessions_used')} /></label>
        </div>
        <label className="f" htmlFor="c-due">{t('clients.nextDue')}<input id="c-due" type="date" value={f.next_due_date} onChange={set('next_due_date')} /><small>{t('clients.nextDueHelp')}</small></label>
        <div className="modal-foot">
          {!edit.isNew && onInvite && <button type="button" className="btn ghost small" onClick={() => onInvite(edit)}>{t('clients.copyInvite')}</button>}
          <span className="spacer" />
          <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
          <button className="btn">{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

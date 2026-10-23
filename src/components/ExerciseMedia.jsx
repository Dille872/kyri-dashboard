import { useCallback, useEffect, useState } from 'react'
import { Play, Upload, Trash2 } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { Modal, useRun, useToast } from './ui.jsx'
import { exKey, youtubeEmbed } from '../lib/program.js'

// Exercise library: one note + video per exercise name, reused in every program.
export function useLibrary(trainerId) {
  const [lib, setLib] = useState({})
  const load = useCallback(async () => {
    const { data } = await supabase.from('exercise_library').select('*').eq('trainer_id', trainerId)
    setLib(Object.fromEntries((data || []).map((l) => [exKey(l.name), l])))
  }, [trainerId])
  useEffect(() => { load() }, [load])
  return [lib, load]
}

// Small line under an exercise: “note” · ▶ video · edit button
export function MediaLine({ entry, onEdit }) {
  const { t } = useI18n()
  const has = entry && (entry.note || entry.video_url)
  return (
    <div className="ex-extra">
      {entry?.note && <span className="ex-note">“{entry.note}”</span>}
      {entry?.video_url && <span className="pill info"><Play size={11} /> {entry.video_type === 'file' ? 'Video' : 'YouTube'}</span>}
      {onEdit && <button type="button" className="chip" onClick={onEdit}>{has ? t('prog.editNote') : `+ ${t('prog.addNote')}`}</button>}
    </div>
  )
}

// The client-facing "How to" block: note + playable video
export function HowTo({ note, videoType, videoUrl }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!note && !videoUrl) return null
  const embed = videoType === 'yt' ? youtubeEmbed(videoUrl) : null
  return (
    <div className="howto">
      {note && <div className="howto-note">{note}</div>}
      {videoUrl && (videoType === 'file'
        ? (open ? <video src={videoUrl} controls playsInline controlsList="nodownload" disablePictureInPicture onContextMenu={(e) => e.preventDefault()} />
          : <button type="button" className="chip" onClick={() => setOpen(true)}><Play size={12} style={{ verticalAlign: '-2px' }} /> {t('media.howTo')}</button>)
        : embed
          ? (open ? <iframe src={embed} title={t('media.howTo')} allow="encrypted-media; picture-in-picture" allowFullScreen />
            : <button type="button" className="chip" onClick={() => setOpen(true)}><Play size={12} style={{ verticalAlign: '-2px' }} /> {t('media.howTo')}</button>)
          : <a className="chip" href={videoUrl} target="_blank" rel="noopener noreferrer"><Play size={12} style={{ verticalAlign: '-2px' }} /> {t('media.howTo')}</a>)}
    </div>
  )
}

export function MediaModal({ name, entry, trainerId, onClose, onSaved }) {
  const { t } = useI18n()
  const run = useRun()
  const toast = useToast()
  const [note, setNote] = useState('')
  const [type, setType] = useState('yt')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!name) return
    setNote(entry?.note || ''); setType(entry?.video_type || 'yt'); setFile(null)
    setUrl(entry?.video_type === 'yt' ? entry.video_url || '' : '')
  }, [name, entry])

  async function save() {
    setBusy(true)
    let video_type = null, video_url = null
    if (type === 'yt' && url.trim()) { video_type = 'yt'; video_url = url.trim() }
    if (type === 'file') {
      if (file) {
        const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '')
        const path = `${trainerId}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('exercise-videos').upload(path, file, { contentType: file.type || 'video/mp4' })
        if (up.error) { setBusy(false); return toast(t('media.noStorage'), 'err') }
        video_type = 'file'; video_url = supabase.storage.from('exercise-videos').getPublicUrl(path).data.publicUrl
      } else if (entry?.video_type === 'file') { video_type = 'file'; video_url = entry.video_url }
    }
    const row = { trainer_id: trainerId, name, note: note.trim() || null, video_type, video_url }
    const r = entry?.id
      ? await run(supabase.from('exercise_library').update(row).eq('id', entry.id))
      : await run(supabase.from('exercise_library').insert(row))
    setBusy(false)
    if (r.ok) { toast(t('common.saved')); onSaved() }
  }
  async function removeVideo() {
    if (!entry?.id) { setUrl(''); setFile(null); return }
    const r = await run(supabase.from('exercise_library').update({ video_type: null, video_url: null }).eq('id', entry.id))
    if (r.ok) { setUrl(''); setFile(null); onSaved(true) }
  }

  return (
    <Modal open={!!name} title={name || ''} onClose={onClose}>
      {name && (
        <div className="form">
          <label className="f" htmlFor="m-note">{t('media.note')}<textarea id="m-note" rows={3} value={note} placeholder={t('media.notePh')} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="f" style={{ display: 'grid', gap: 8, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{t('media.video')}
            <div className="seg" role="group" aria-label={t('media.video')} style={{ justifySelf: 'start' }}>
              <button type="button" aria-pressed={type === 'yt'} onClick={() => setType('yt')}>{t('media.yt')}</button>
              <button type="button" aria-pressed={type === 'file'} onClick={() => setType('file')}>{t('media.file')}</button>
            </div>
            {type === 'yt'
              ? <input id="m-yt" type="url" aria-label={t('media.yt')} placeholder="https://youtube.com/…" value={url} onChange={(e) => setUrl(e.target.value)} />
              : <>
                  <label className="btn ghost small" htmlFor="m-file" style={{ justifySelf: 'start' }}><Upload />{file ? file.name : t('media.file')}</label>
                  <input id="m-file" type="file" accept="video/mp4,video/quicktime,video/webm" style={{ display: 'none' }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
                  <small style={{ fontWeight: 500 }}>{t('media.fileHelp')}</small>
                </>}
            {entry?.video_url && <div className="acts" style={{ justifyContent: 'flex-start' }}>
              <HowTo videoType={entry.video_type} videoUrl={entry.video_url} />
              <button type="button" className="chip" onClick={removeVideo}><Trash2 size={12} style={{ verticalAlign: '-2px' }} /> {t('media.remove')}</button></div>}
          </div>
          <div className="meta">{t('media.help')}</div>
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={onClose}>{t('common.cancel')}</button>
            <button type="button" className="btn" disabled={busy} onClick={save}>{busy ? t('media.uploading') : t('common.save')}</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

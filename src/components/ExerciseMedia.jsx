import { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Upload, Trash2 } from 'lucide-react'
import { supabase } from '../supabase.js'
import { useI18n } from '../i18n.jsx'
import { Modal, useRun, useToast } from './ui.jsx'
import { exKey, youtubeEmbed, youtubeThumb } from '../lib/program.js'

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

// Video right inside the exercise: preview image + big play button; tapping plays it here, never leaves the app.
// YouTube (privacy mode) now, own uploaded videos later.
export function VideoPlayer({ videoType, videoUrl, title }) {
  const { t } = useI18n()
  const [playing, setPlaying] = useState(false)
  const ref = useRef()
  useEffect(() => setPlaying(false), [videoUrl])
  if (!videoUrl) return null
  if (videoType === 'file') return (
    <div className="vplayer">
      <video ref={ref} src={`${videoUrl}#t=0.1`} preload="metadata" playsInline controls={playing} controlsList="nodownload noplaybackrate" disablePictureInPicture
        onContextMenu={(e) => e.preventDefault()} onPause={() => {}} onEnded={() => setPlaying(false)} />
      {!playing && <button type="button" className="vplay" aria-label={`${t('media.howTo')}: ${title || ''}`} onClick={() => { setPlaying(true); ref.current?.play() }}><span className="vplay-btn" aria-hidden="true" /></button>}
    </div>
  )
  const embed = youtubeEmbed(videoUrl, true)
  if (!embed) return null   // not a playable link (e.g. a search page) → show nothing rather than send the client away
  return (
    <div className="vplayer">
      {playing
        ? <iframe src={embed} title={title || t('media.howTo')} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        : <button type="button" className="vplay" aria-label={`${t('media.howTo')}: ${title || ''}`} onClick={() => setPlaying(true)}
            style={{ backgroundImage: `url(${youtubeThumb(videoUrl)})` }}><span className="vplay-btn" aria-hidden="true" /></button>}
    </div>
  )
}

// Kyri's note for the exercise, one line under the name
export function HowTo({ note }) {
  if (!note) return null
  return <div className="howto-note">{note}</div>
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
              <div style={{ width: '100%' }}><VideoPlayer videoType={entry.video_type} videoUrl={entry.video_url} title={name} /></div>
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

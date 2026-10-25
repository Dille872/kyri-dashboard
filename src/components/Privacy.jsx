import { useI18n } from '../i18n.jsx'

// Privacy notice: the trainer's own text, or the app's standard text with his name and contact e-mail.
// Paragraphs are separated by an empty line; the first line of each paragraph is its heading.
export default function PrivacyText({ trainer }) {
  const { t } = useI18n()
  const owner = trainer?.owner_name || trainer?.brand_name || ''
  const text = trainer?.privacy_text?.trim()
    || t('privacy.text', { owner, brand: trainer?.brand_name || '', email: trainer?.contact_email || '—' })
  return (
    <div className="privacy-text">
      {text.split(/\n\s*\n/).map((p, i) => {
        const [head, ...rest] = p.split('\n')
        return rest.length
          ? <section key={i}><h3>{head}</h3><p>{rest.join('\n')}</p></section>
          : <p key={i}>{head}</p>
      })}
    </div>
  )
}

import { useI18n } from '../i18n.jsx'
import { LangSwitch, Logo } from '../components/ui.jsx'

export default function NoAccess({ email, signOut }) {
  const { t } = useI18n()
  return (
    <div className="mobile login">
      <div className="topbar" style={{ justifyContent: 'flex-end' }}><LangSwitch /></div>
      <Logo big />
      <div className="hello center">{t('noAccess.title')}</div>
      <p className="meta center">{t('noAccess.body', { email })}</p>
      <button className="btn ghost block" onClick={signOut}>{t('common.signOut')}</button>
    </div>
  )
}

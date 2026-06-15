import { useState, useEffect } from 'react'
import { useClientsStore } from '@/store/clientsStore'
import { useToast } from '@/components/admin/Toast'
import { useAuth } from '@/context/AuthContext'
import { affectionate } from '@/lib/affection'
import api from '@/lib/api'
import { TelegramIcon, MaxIcon } from '@/components/admin/PhoneMessengerField'
import { MessengerGuide } from '@/components/admin/MessengerGuide'

// Название компании-оператора грузим один раз за сессию (settings.org.company_name).
let companyCache = null
async function fetchCompany() {
  if (companyCache !== null) return companyCache
  try { const { data } = await api.get('/settings/org'); companyCache = data?.company_name || '' }
  catch { companyCache = '' }
  return companyCache
}

// Готовый текст приглашения для отправки лицу (имя и ссылка подставлены).
function inviteMessage(name, link, company) {
  const hello = name?.trim() ? `${name.trim()}, приветствуем!` : 'Здравствуйте!'
  const org = company?.trim() || '[название вашей компании]'
  return `${hello}

Компания «${org}» приглашает вас подключиться к сервису автоматических отчётов о выполнении заявок вашего предприятия. Просто перейдите по ссылке ниже — и отчёты начнут приходить вам в личные сообщения:

${link}

С надеждой на долгое и плодотворное сотрудничество!`
}

// Карточка одного канала доставки (Telegram или MAX). Онбординг идентичен: «Пригласить» выдаёт
// deep-link ссылку (payload p<code>), лицо открывает её → бот узнаёт chat_id → статус active →
// отчёты уходят автоматически. channel: 'telegram' | 'max'.
function ChannelCard({ channel, label, Icon, status, personId, personName, company, onChanged }) {
  const { invitePerson, revokePerson } = useClientsStore()
  const { user } = useAuth()
  const aff = affectionate(user?.first_name)
  const toast = useToast()
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)

  const invite = async () => {
    setBusy(true)
    try {
      const r = await invitePerson(personId, channel)
      setLink(r.invite_link)
      if (!r.invite_link) toast.error(`${label}-бот не запущен — впишите токен в Настройках`)
      onChanged?.()
    } catch { toast.error('Не удалось создать ссылку') }
    finally { setBusy(false) }
  }
  const revoke = async () => {
    if (!(await toast.confirm(`Отвязать ${label} у этого лица? Отчёты перестанут приходить.`))) return
    try { setLink(null); await revokePerson(personId, channel); onChanged?.() } catch { toast.error('Не удалось отвязать') }
  }
  const copyMessage = () => navigator.clipboard.writeText(inviteMessage(personName, link, company))
    .then(() => toast.success('Сообщение скопировано')).catch(() => {})

  return (
    <div className="a-msgr-card">
      <div className="a-msgr-card-head">
        <span className="a-msgr-card-title"><Icon size={15} /><span>{label}</span></span>
        {personId && status === 'active' && <span className="a-msgr-badge a-msgr-badge--ok">✅ привязан</span>}
        {personId && status === 'pending' && <span className="a-msgr-badge a-msgr-badge--wait">⏳ ожидает</span>}
      </div>
      <div className="a-msgr-card-body">
        {!personId ? (
          <span className="a-muted" style={{ fontSize: '0.8rem' }}>Сохраните лицо, чтобы пригласить в {label}</span>
        ) : status === 'active' ? (
          <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={revoke}>Отвязать</button>
        ) : (
          <>
            {!link && (
              <span className="a-muted" style={{ fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>
                {aff}, всё просто: жми «Пригласить» → «Копировать сообщение» → отправь его лицу любым способом
                (СМС, почта, мессенджер). Человек откроет ссылку, нажмёт «Старт» — и тут загорится ✅ привязан.
                С этого момента отчёты по его объектам летят ему в личку сами.
              </span>
            )}
            <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={invite} disabled={busy}>
              {busy ? '…' : 'Пригласить'}
            </button>
            {link && (
              <>
                <div className="a-msgr-invite">
                  <input className="a-input" readOnly value={link} onFocus={(e) => e.target.select()} style={{ fontSize: '0.78rem' }} />
                  <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={copyMessage}>Копировать сообщение</button>
                </div>
                <span className="a-muted" style={{ fontSize: '0.76rem' }}>
                  {aff}, ссылка готова. Жми «Копировать сообщение» — в буфер ляжет тёплый текст со ссылкой,
                  останется отправить лицу (СМС, почта, любой мессенджер). Как откроет и нажмёт «Старт» —
                  статус сменится на ✅ привязан, и отчёты пойдут ему сами.
                </span>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Каналы доставки отчёта доверенному лицу — карточкой на мессенджер (Telegram и/или MAX),
// каждая показывается под выбранным у лица мессенджером.
export function TrustedPersonChannels({ personId, personName, tgStatus, maxStatus, hasTg, hasMax, onChanged }) {
  const [company, setCompany] = useState(companyCache || '')
  useEffect(() => { fetchCompany().then(setCompany) }, [])

  if (!hasTg && !hasMax) return null
  const channels = [hasTg && 'telegram', hasMax && 'max'].filter(Boolean)
  return (
    <>
      <div className="a-msgr-cards">
        {hasTg && (
          <ChannelCard channel="telegram" label="Telegram" Icon={TelegramIcon} status={tgStatus}
            personId={personId} personName={personName} company={company} onChanged={onChanged} />
        )}
        {hasMax && (
          <ChannelCard channel="max" label="MAX" Icon={MaxIcon} status={maxStatus}
            personId={personId} personName={personName} company={company} onChanged={onChanged} />
        )}
      </div>
      <MessengerGuide scenarios={['dm']} channels={channels} />
    </>
  )
}

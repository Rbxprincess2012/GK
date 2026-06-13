import { useState } from 'react'
import { useClientsStore } from '@/store/clientsStore'
import { useToast } from '@/components/admin/Toast'
import { TelegramIcon, MaxIcon } from '@/components/admin/PhoneMessengerField'

// Каналы доставки отчёта доверенному лицу — отдельной карточкой на мессенджер
// (Telegram сверху, MAX ниже), каждая показывается под выбранным мессенджером:
//  • Telegram — онбординг: «Пригласить» выдаёт ссылку /start p<code>, лицо открывает
//    её → бот узнаёт chat_id → статус active → отчёты уходят автоматически.
//  • MAX — ручной адрес (бота у MAX пока нет): поле, хранится в chats.max.
export function TrustedPersonChannels({ personId, tgStatus, hasTg, hasMax, onChanged }) {
  const { invitePerson, revokePerson } = useClientsStore()
  const toast = useToast()
  const [link, setLink] = useState(null)
  const [busy, setBusy] = useState(false)

  const invite = async () => {
    setBusy(true)
    try {
      const r = await invitePerson(personId)
      setLink(r.invite_link)
      if (!r.invite_link) toast.error('Клиентский бот не запущен — впишите токен в Настройках')
      onChanged?.()
    } catch { toast.error('Не удалось создать ссылку') }
    finally { setBusy(false) }
  }
  const revoke = async () => {
    if (!(await toast.confirm('Отвязать Telegram у этого лица? Отчёты перестанут приходить.'))) return
    try { setLink(null); await revokePerson(personId); onChanged?.() } catch { toast.error('Не удалось отвязать') }
  }
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast.success('Скопировано')).catch(() => {})

  if (!hasTg && !hasMax) return null
  return (
    <div className="a-msgr-cards">
      {hasTg && (
        <div className="a-msgr-card">
          <div className="a-msgr-card-head">
            <span className="a-msgr-card-title"><TelegramIcon size={15} /><span>Telegram</span></span>
            {personId && tgStatus === 'active' && <span className="a-msgr-badge a-msgr-badge--ok">✅ привязан</span>}
            {personId && tgStatus === 'pending' && <span className="a-msgr-badge a-msgr-badge--wait">⏳ ожидает</span>}
          </div>
          <div className="a-msgr-card-body">
            {!personId ? (
              <span className="a-muted" style={{ fontSize: '0.8rem' }}>Сохраните лицо, чтобы пригласить в Telegram</span>
            ) : tgStatus === 'active' ? (
              <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={revoke}>Отвязать</button>
            ) : (
              <>
                <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={invite} disabled={busy}>
                  {busy ? '…' : 'Пригласить'}
                </button>
                {link && (
                  <div className="a-msgr-invite">
                    <input className="a-input" readOnly value={link} onFocus={(e) => e.target.select()} style={{ fontSize: '0.78rem' }} />
                    <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={() => copy(link)}>Копировать</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {hasMax && (
        <div className="a-msgr-card">
          <div className="a-msgr-card-head">
            <span className="a-msgr-card-title"><MaxIcon size={16} /><span>MAX</span></span>
            <span className="a-msgr-badge a-msgr-badge--wait">скоро</span>
          </div>
          {/* Бот MAX в разработке: поля те же, что у Telegram, но приглашение пока
              не работает — кнопка отключена. Когда бот появится, включаем onClick. */}
          <div className="a-msgr-card-body">
            <button type="button" className="a-btn a-btn--primary a-btn--sm" disabled
              title="Бот MAX в разработке — приглашение заработает позже">Пригласить</button>
            <span className="a-muted" style={{ fontSize: '0.78rem' }}>Бот MAX скоро — кнопка заработает позже.</span>
          </div>
        </div>
      )}
    </div>
  )
}

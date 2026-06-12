import { useState } from 'react'
import { useClientsStore } from '@/store/clientsStore'
import { useToast } from '@/components/admin/Toast'
import { MessengerChatInputs, TelegramIcon } from '@/components/admin/PhoneMessengerField'

// Каналы доставки отчёта доверенному лицу:
//  • Telegram — онбординг (личный chat_id): «Пригласить» выдаёт ссылку /start p<code>,
//    лицо открывает её → бот узнаёт chat_id → статус active → отчёты уходят автоматически.
//  • MAX — ручной адрес (бота у MAX пока нет): обычное поле, хранится в chats.max.
// Блоки показываются под выбранными мессенджерами (hasTg/hasMax).
export function TrustedPersonChannels({ personId, tgStatus, hasTg, hasMax, maxAddr, onMaxChange, onChanged }) {
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
    <div className="a-chataddr">
      {hasTg && (
        <div className="a-chataddr-row">
          <span className="a-chataddr-label"><TelegramIcon /><span>Telegram</span></span>
          {!personId ? (
            <span className="a-muted" style={{ fontSize: '0.8rem' }}>Сохраните лицо, чтобы пригласить в Telegram</span>
          ) : tgStatus === 'active' ? (
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: '#2ecc71', fontSize: '0.82rem' }}>✅ привязан</span>
              <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={revoke}>Отвязать</button>
            </span>
          ) : (
            <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {tgStatus === 'pending' && <span style={{ color: '#f4a840', fontSize: '0.82rem' }}>⏳ ожидает</span>}
              <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={invite} disabled={busy}>{busy ? '…' : 'Пригласить'}</button>
            </span>
          )}
        </div>
      )}
      {hasTg && link && (
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="a-input" readOnly value={link} style={{ fontSize: '0.78rem' }} />
          <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={() => copy(link)}>Копировать</button>
        </div>
      )}
      {hasMax && (
        <MessengerChatInputs messengers={['max']} chats={{ max: maxAddr }} onChange={(c) => onMaxChange(c.max || '')} />
      )}
    </div>
  )
}

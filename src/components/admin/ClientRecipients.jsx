import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/admin/Toast'
import { useAuth } from '@/context/AuthContext'
import { affectionate } from '@/lib/affection'
import { MessengerGuide } from '@/components/admin/MessengerGuide'
import { TelegramIcon, MaxIcon } from '@/components/admin/PhoneMessengerField'

// Групповой чат заказчика для отчётов — отдельная карточка на мессенджер (MAX сверху, Telegram
// ниже). Чекбокс «Использовать» подключает/отключает канал; при подключении показываем имя бота
// и команду /bind (обе с «Копировать») и пошаговую инструкцию. Привязка — через одноразовый код.

function GroupCard({ clientId, channel, label, Icon }) {
  const toast = useToast()
  const { user } = useAuth()
  const aff = affectionate(user?.first_name)
  const [info, setInfo] = useState(null) // { id, status, title, bot_username, bind_command }
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => {
    api.get(`/clients/${clientId}/recipients/group`, { params: { channel } })
      .then(({ data }) => setInfo(data)).catch(() => {})
  }, [clientId, channel])
  useEffect(() => { load() }, [load])

  const status = info?.status ?? null
  const used = status !== null
  const bot = info?.bot_username
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast.success('Скопировано')).catch(() => {})

  const toggle = async (on) => {
    if (busy) return
    if (on) {
      setBusy(true)
      try { const { data } = await api.post(`/clients/${clientId}/recipients/group`, null, { params: { channel } }); setInfo(data) }
      catch { toast.error('Не удалось подключить') } finally { setBusy(false) }
    } else {
      if (status === 'active' && !(await toast.confirm(`Отключить ${label}-группу? Отчёты перестанут приходить.`))) return
      if (!info?.id) { setInfo({ ...info, status: null }); return }
      setBusy(true)
      try { await api.delete(`/recipients/${info.id}`); setInfo({ ...info, id: null, status: null, title: null, bind_command: null }) }
      catch { toast.error('Не удалось отключить') } finally { setBusy(false) }
    }
  }

  return (
    <div className={`a-msgr-card a-grpcard a-grpcard--${channel}${used ? '' : ' a-grpcard--off'}`}>
      <div className="a-msgr-card-head">
        <span className="a-msgr-card-title"><Icon size={16} /><span>{label}</span></span>
        <span className="a-grpcard-head-right">
          {status === 'active' && <span className="a-msgr-badge a-msgr-badge--ok">✅ активен</span>}
          {status === 'pending' && <span className="a-msgr-badge a-msgr-badge--wait">⏳ ожидает</span>}
          <label className="a-grpcard-use">
            <input type="checkbox" checked={used} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
            <span>Использовать</span>
          </label>
        </span>
      </div>

      {!used ? (
        <div className="a-grpcard-off-hint">Выключено — отчёты в {label} не уходят. Включите, чтобы привязать группу заказчика.</div>
      ) : (
        <div className="a-msgr-card-body">
          {!bot && (
            <span className="a-grpcard-warn">{label}-бот не настроен — впишите токен в Настройках.</span>
          )}

          {bot && (
            <label className="a-grpcard-field">
              <span className="a-grpcard-field-label">Бот</span>
              <div className="a-fieldrow">
                <input className="a-input" readOnly value={`@${bot}`} onFocus={(e) => e.target.select()} />
                <button type="button" className="a-btn a-btn--ghost" onClick={() => copy(`@${bot}`)}>Копировать</button>
              </div>
            </label>
          )}

          {status === 'active' ? (
            <span className="a-grpcard-bound">✅ Привязано к группе «{info.title || 'без названия'}». Отчёты по заявкам заказчика уходят туда.</span>
          ) : (
            <>
              {info?.bind_command && (
                <label className="a-grpcard-field">
                  <span className="a-grpcard-field-label">Команда привязки</span>
                  <div className="a-fieldrow">
                    <input className="a-input" readOnly value={info.bind_command} onFocus={(e) => e.target.select()} />
                    <button type="button" className="a-btn a-btn--primary" onClick={() => copy(info.bind_command)}>Копировать</button>
                    <button type="button" className="a-iconbtn" onClick={load} title="Обновить статус привязки">⟳</button>
                  </div>
                </label>
              )}
              {channel === 'max' && (
                <div className="a-grpcard-warn">
                  ⚠️ В MAX сначала сделай бота администратором группы — иначе он не видит команду /bind.
                </div>
              )}
              <span className="a-muted" style={{ fontSize: '0.78rem' }}>
                {aff}, добавь бота{bot ? ` @${bot}` : ''} в группу заказчика и отправь там эту команду — бот ответит «✅ Привязано».
              </span>
            </>
          )}

          <MessengerGuide scenarios={['group']} channels={[channel]} />
        </div>
      )}
    </div>
  )
}

// Раздел «Групповой чат для отчётов»: по карточке на мессенджер (MAX, затем Telegram).
export function ClientRecipients({ clientId }) {
  const { user } = useAuth()
  const aff = affectionate(user?.first_name)
  return (
    <>
      <div className="a-section-title">Групповой чат для отчётов</div>
      <div className="a-muted" style={{ fontSize: '0.78rem', marginBottom: 8 }}>
        {aff}, здесь подключается групповой чат заказчика — туда уходит отчёт, когда подтверждаешь
        заявку. Включи нужный мессенджер галочкой «Использовать» и привяжи группу. Если отчёты должны
        приходить конкретным лицам — это в «Доверенных лицах».
      </div>
      <div className="a-msgr-cards">
        <GroupCard clientId={clientId} channel="max" label="MAX" Icon={MaxIcon} />
        <GroupCard clientId={clientId} channel="telegram" label="Telegram" Icon={TelegramIcon} />
      </div>
    </>
  )
}

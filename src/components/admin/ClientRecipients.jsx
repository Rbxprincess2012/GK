import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/admin/Toast'
import { useAuth } from '@/context/AuthContext'
import { affectionate } from '@/lib/affection'
import { TelegramIcon, MaxIcon } from '@/components/admin/PhoneMessengerField'

// Групповой чат заказчика для отчётов — отдельная карточка на мессенджер (MAX сверху, Telegram
// ниже). Чекбокс «Использовать» подключает/отключает канал; при подключении показываем имя бота
// и команду /bind (обе с «Копировать») и пошаговую инструкцию. Привязка — через одноразовый код.

function GroupCard({ clientId, channel, label, Icon }) {
  const toast = useToast()
  const { user } = useAuth()
  const managerName = user?.first_name
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
            <>
              <label className="a-grpcard-field">
                <span className="a-grpcard-field-label">Имя нашего бота</span>
                <div className="a-fieldrow">
                  <input className="a-input" readOnly value={`@${bot}`} onFocus={(e) => e.target.select()} />
                  <button type="button" className="a-btn a-btn--ghost" onClick={() => copy(`@${bot}`)}>Копировать</button>
                </div>
              </label>
              {channel === 'max' ? (
                <div className="a-grpcard-guide">
                  <div className="a-grpcard-subhead">Менеджер единоразово сохраняет наш бот себе в контакты MAX:</div>
                  <ol className="a-grpcard-steps">
                    <li>Нажми возле имени бота кнопку «Копировать».</li>
                    <li>Отправь себе{managerName ? `, ${managerName},` : ''} в MAX то, что скопировал(а).</li>
                    <li>Нажми «Начать». После этого бот появится в твоих контактах.</li>
                  </ol>
                  <div className="a-grpcard-subhead">Чтобы в группу с клиентом начали приходить отчёты:</div>
                  <ol className="a-grpcard-steps">
                    <li>Перейди в группу с нашим клиентом.</li>
                    <li>Нажми на название группы сверху, ниже выбери «Добавить участников».</li>
                    <li>В поле сверху «Найти по имени» снова вставь скопированное ранее имя бота.</li>
                    <li>Нажми на него, потом кнопку «Добавить».</li>
                    <li>Жми «Администраторы» → «Добавить администратора» → «Putevo_CLIENT».</li>
                    <li>Кнопка «Назначить администратором». Назад – Назад.</li>
                    <li>Скопируй «Команду привязки» ниже и отправь её сообщением в эту группу — бот ответит «✅ Привязано».</li>
                    <li>Готово! Теперь наш бот будет отправлять отчёты по заказам в эту группу.</li>
                  </ol>
                </div>
              ) : (
                <div className="a-grpcard-guide">
                  <ol className="a-grpcard-steps">
                  <li>Нажми возле имени бота кнопку «Копировать».</li>
                  <li>Открой Telegram и зайди в группу с нашим клиентом (или создай её и добавь людей заказчика).</li>
                  <li>Нажми на название группы сверху, выбери «Добавить участников».</li>
                  <li>В поиске вставь скопированное имя бота, выбери его и нажми «Добавить».</li>
                  <li>Если Telegram предупредит, что это бот — подтверди. Права администратора не нужны.</li>
                  <li>Скопируй «Команду привязки» ниже и отправь её сообщением в эту группу — бот ответит «✅ Привязано».</li>
                  <li>Готово! Теперь наш бот будет отправлять отчёты по заказам в эту группу.</li>
                  </ol>
                </div>
              )}
            </>
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
                    <button type="button" className="a-btn a-btn--ghost" onClick={() => copy(info.bind_command)}>Копировать</button>
                    <button type="button" className="a-iconbtn" onClick={load} title="Обновить статус привязки">⟳</button>
                  </div>
                  <span className="a-grpcard-hint">
                    Отправь эту команду обычным сообщением в самой группе (где уже добавлен бот) — он ответит «✅ Привязано».
                  </span>
                </label>
              )}
            </>
          )}
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

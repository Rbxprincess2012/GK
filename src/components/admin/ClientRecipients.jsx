import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/admin/Toast'

// Telegram-получатели отчётов клиента: личные чаты + группы. Онбординг — через
// ссылку (личка) или команду /bind (группа). Показывается только для сохранённого клиента.
const KIND_ICON = { dm: '👤', group: '👥' }
const STATUS = { pending: ['⏳ ожидает', '#f4a840'], active: ['✅ активен', '#2ecc71'] }

export function ClientRecipients({ clientId }) {
  const toast = useToast()
  const [list, setList] = useState([])
  const [invite, setInvite] = useState(null) // { kind:'dm', link } | { kind:'group', command, bot }

  const load = useCallback(() => {
    api.get(`/clients/${clientId}/recipients`).then(({ data }) => setList(data || [])).catch(() => {})
  }, [clientId])
  useEffect(() => { load() }, [load])

  const addDm = () => api.post(`/clients/${clientId}/recipients/dm`)
    .then(({ data }) => { setInvite({ kind: 'dm', link: data.invite_link }); load() }).catch(() => toast.error('Не удалось'))
  const addGroup = () => api.post(`/clients/${clientId}/recipients/group`)
    .then(({ data }) => { setInvite({ kind: 'group', command: data.bind_command, bot: data.bot_username }); load() }).catch(() => toast.error('Не удалось'))
  const remove = (id) => api.delete(`/recipients/${id}`).then(() => load()).catch(() => toast.error('Не удалось'))
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast.success('Скопировано')).catch(() => {})

  const visible = list.filter((r) => r.status !== 'revoked')
  return (
    <>
      <div className="a-section-title">Telegram-получатели отчётов</div>
      <div className="a-muted" style={{ fontSize: '0.76rem', marginBottom: 8 }}>
        Кому уходит отчёт при подтверждении заявки. Личные чаты и группы заказчика.
      </div>
      {visible.length === 0 && (
        <div className="a-muted" style={{ fontSize: '0.82rem', marginBottom: 8 }}>Пока никого — добавьте получателя ниже.</div>
      )}
      {visible.map((r) => {
        const [label, color] = STATUS[r.status] || ['', '#92a2d4']
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
            <span>{KIND_ICON[r.kind]}</span>
            <span style={{ flex: 1, color: '#e8ecff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.title || (r.kind === 'group' ? 'Группа' : 'Личный чат')}
            </span>
            <span style={{ fontSize: '0.76rem', color, whiteSpace: 'nowrap' }}>{label}</span>
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => remove(r.id)} title="Убрать">✕</button>
          </div>
        )
      })}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="a-btn a-btn--ghost a-btn--sm" onClick={addDm}>+ Личный чат</button>
        <button className="a-btn a-btn--ghost a-btn--sm" onClick={addGroup}>+ Группа</button>
        <button className="a-btn a-btn--ghost a-btn--sm" onClick={load}>⟳ Обновить</button>
      </div>

      {invite?.kind === 'dm' && invite.link && (
        <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
          Отправьте человеку ссылку — после «Старт» он станет активным:
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input className="a-input" readOnly value={invite.link} style={{ fontSize: '0.78rem' }} />
            <button className="a-btn a-btn--primary a-btn--sm" onClick={() => copy(invite.link)}>Копировать</button>
          </div>
        </div>
      )}
      {invite?.kind === 'dm' && !invite.link && (
        <div style={{ fontSize: '0.8rem', marginTop: 10, color: '#f4a840' }}>
          Клиентский бот не запущен (нет username). Впишите токен в Настройках и поднимите бот — ссылка появится.
        </div>
      )}
      {invite?.kind === 'group' && (
        <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
          Добавьте бота {invite.bot ? `@${invite.bot}` : '(клиентский бот)'} в группу заказчика и отправьте там команду:
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input className="a-input" readOnly value={invite.command} style={{ fontSize: '0.78rem' }} />
            <button className="a-btn a-btn--primary a-btn--sm" onClick={() => copy(invite.command)}>Копировать</button>
          </div>
        </div>
      )}
    </>
  )
}

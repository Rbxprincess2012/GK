import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/admin/Toast'
import { useAuth } from '@/context/AuthContext'
import { affectionate } from '@/lib/affection'

// Получатели отчётов клиента: личные чаты + группы, по каналам Telegram/MAX. Онбординг — через
// deep-link ссылку (личка) или команду /bind (группа). Показывается только для сохранённого клиента.
const KIND_ICON = { dm: '👤', group: '👥' }
const CH_ICON = { telegram: '✈️', max: '🟦' }
const STATUS = { pending: ['⏳ ожидает', '#f4a840'], active: ['✅ активен', '#2ecc71'] }

export function ClientRecipients({ clientId }) {
  const toast = useToast()
  const { user } = useAuth()
  const aff = affectionate(user?.first_name)
  const [list, setList] = useState([])
  const [channel, setChannel] = useState('telegram')
  const [invite, setInvite] = useState(null) // { kind, channel, link } | { kind:'group', command, bot }

  const load = useCallback(() => {
    api.get(`/clients/${clientId}/recipients`).then(({ data }) => setList(data || [])).catch(() => {})
  }, [clientId])
  useEffect(() => { load() }, [load])

  const addDm = () => api.post(`/clients/${clientId}/recipients/dm`, null, { params: { channel } })
    .then(({ data }) => { setInvite({ kind: 'dm', channel, link: data.invite_link }); load() }).catch(() => toast.error('Не удалось'))
  const addGroup = () => api.post(`/clients/${clientId}/recipients/group`, null, { params: { channel } })
    .then(({ data }) => { setInvite({ kind: 'group', channel, command: data.bind_command, bot: data.bot_username }); load() }).catch(() => toast.error('Не удалось'))
  const remove = (id) => api.delete(`/recipients/${id}`).then(() => load()).catch(() => toast.error('Не удалось'))
  const copy = (t) => navigator.clipboard.writeText(t).then(() => toast.success('Скопировано')).catch(() => {})

  const visible = list.filter((r) => r.status !== 'revoked')
  return (
    <>
      <div className="a-section-title">Получатели отчётов</div>
      <div className="a-muted" style={{ fontSize: '0.78rem', marginBottom: 8 }}>
        {aff}, тут всё просто: сюда уходит отчёт, когда ты подтверждаешь заявку. Можно добавить
        личный чат человека или общую группу заказчика — в Telegram или MAX. Выбери канал и жми «+».
      </div>
      {visible.length === 0 && (
        <div className="a-muted" style={{ fontSize: '0.82rem', marginBottom: 8 }}>Пока никого — добавьте получателя ниже.</div>
      )}
      {visible.map((r) => {
        const [label, color] = STATUS[r.status] || ['', '#92a2d4']
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
            <span title={r.channel === 'max' ? 'MAX' : 'Telegram'}>{CH_ICON[r.channel || 'telegram']}</span>
            <span>{KIND_ICON[r.kind]}</span>
            <span style={{ flex: 1, color: '#e8ecff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {r.title || (r.kind === 'group' ? 'Группа' : 'Личный чат')}
            </span>
            <span style={{ fontSize: '0.76rem', color, whiteSpace: 'nowrap' }}>{label}</span>
            <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => remove(r.id)} title="Убрать">✕</button>
          </div>
        )
      })}

      <div style={{ display: 'flex', gap: 6, marginTop: 10, alignItems: 'center' }}>
        <span className="a-muted" style={{ fontSize: '0.76rem' }}>Канал:</span>
        {['telegram', 'max'].map((ch) => (
          <button key={ch} type="button"
            className={`a-btn a-btn--sm ${channel === ch ? 'a-btn--primary' : 'a-btn--ghost'}`}
            onClick={() => { setChannel(ch); setInvite(null) }}>
            {CH_ICON[ch]} {ch === 'max' ? 'MAX' : 'Telegram'}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="a-btn a-btn--ghost a-btn--sm" onClick={addDm}>+ Личный чат</button>
        <button className="a-btn a-btn--ghost a-btn--sm" onClick={addGroup}>+ Группа</button>
        <button className="a-btn a-btn--ghost a-btn--sm" onClick={load}>⟳ Обновить</button>
      </div>

      {invite?.kind === 'dm' && invite.link && (
        <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
          {aff}, объясняю на пальцах: скопируй ссылку и отправь её человеку (СМС, почта, мессенджер).
          Он откроет, нажмёт «Старт» — и строка станет ✅ активен. Это личка: отчёт видит только он.
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input className="a-input" readOnly value={invite.link} style={{ fontSize: '0.78rem' }} />
            <button className="a-btn a-btn--primary a-btn--sm" onClick={() => copy(invite.link)}>Копировать</button>
          </div>
        </div>
      )}
      {invite?.kind === 'dm' && !invite.link && (
        <div style={{ fontSize: '0.8rem', marginTop: 10, color: '#f4a840' }}>
          {invite.channel === 'max' ? 'Клиентский MAX-бот' : 'Клиентский бот'} не запущен (нет username).
          Впишите токен в Настройках и поднимите бот — ссылка появится.
        </div>
      )}
      {invite?.kind === 'group' && (
        <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: 10 }}>
          {aff}, по группе так: добавь нашего бота {invite.bot ? `@${invite.bot}` : '(клиентский бот)'} в
          группу заказчика и отправь там вот эту команду — бот ответит «✅ Привязано».
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <input className="a-input" readOnly value={invite.command} style={{ fontSize: '0.78rem' }} />
            <button className="a-btn a-btn--primary a-btn--sm" onClick={() => copy(invite.command)}>Копировать</button>
          </div>
          <div style={{ marginTop: 6, color: '#f4a840' }}>
            ⚠️ Важно: в группе отчёт видят ВСЕ участники. Подключай группу, только если там сидит
            закрытая команда заказчика. Есть посторонние — лучше личный чат.
          </div>
        </div>
      )}
    </>
  )
}

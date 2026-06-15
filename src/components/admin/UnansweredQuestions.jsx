import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/admin/Toast'

// Раздел суперпользователя: вопросы, на которые ИИ-помощник не нашёл ответа (или упал).
// Ворклист — менеджеру в этих местах нужно ответить человеку и дополнить базу знаний.
// «Разобрано» убирает вопрос из списка (лог сохраняется). Параллельно при эскалации
// суперпользователю приходит уведомление в личку Telegram (см. Настройки → support_chat_id).
function fmtDate(s) {
  try { return new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) }
  catch { return '' }
}

export function UnansweredQuestions() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(() => {
    api.get('/assistant/unanswered')
      .then(({ data }) => { setItems(data?.items || []); setLoaded(true) })
      .catch(() => setLoaded(true))
  }, [])
  useEffect(() => { load() }, [load])

  const resolve = (id) => api.post(`/assistant/unanswered/${id}/resolve`)
    .then(() => { setItems((l) => l.filter((x) => x.id !== id)); toast.success('Помечено разобранным') })
    .catch(() => toast.error('Не удалось'))

  return (
    <div className="a-card" style={{ marginBottom: 16 }}>
      <div className="a-section-title" style={{ marginTop: 0 }}>
        Вопросы без ответа {items.length > 0 && <span className="a-badge-count">{items.length}</span>}
      </div>
      <div className="a-note">
        Сюда попадают вопросы сотрудников, на которые ИИ-помощник не нашёл ответа. Ответьте человеку и
        при необходимости дополните базу знаний — потом жмите «Разобрано». При новом таком вопросе вам
        придёт уведомление в личку Telegram (если задан chat_id ниже в реквизитах компании).
      </div>
      {!loaded ? (
        <div className="a-muted" style={{ fontSize: '0.85rem' }}>Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="a-muted" style={{ fontSize: '0.85rem' }}>Пока нет — ИИ справляется сам 👍</div>
      ) : (
        <div className="a-unans-list">
          {items.map((q) => (
            <div key={q.id} className="a-unans-item">
              <div className="a-unans-head">
                <span className="a-unans-tag">{q.ok === false ? '⚠️ ошибка' : '❓ не знает'}</span>
                <span className="a-muted" style={{ fontSize: '0.74rem' }}>{fmtDate(q.created_at)}</span>
                <button className="a-btn a-btn--ghost a-btn--sm" style={{ marginLeft: 'auto' }}
                  onClick={() => resolve(q.id)}>Разобрано</button>
              </div>
              <div className="a-unans-q">{q.question}</div>
              {q.answer && <div className="a-unans-a">Ответ ИИ: {q.answer}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

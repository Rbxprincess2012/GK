import { useState, useEffect, useCallback } from 'react'
import api from '@/lib/api'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

// Быстрое сообщение клиенту: выбор шаблона → готовый текст → копирование в буфер + диплинк
// в личный чат (Telegram/MAX). Telegram по номеру ?text= не подставляет — поэтому копируем текст.
export function ClientMessageModal({ order, onClose }) {
  const toast = useToast()
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('report')
  const [data, setData] = useState(null) // { body, deeplinks, phone, report_url }
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/settings/client-templates').then(({ data }) => setTemplates(data || [])).catch(() => {})
  }, [])

  // setState только в .then-колбэках (асинхронно) — иначе линтер ругается на каскадные рендеры.
  const loadMessage = useCallback(() => {
    api.get(`/client-message/${order.id}`, { params: templateId ? { template: templateId } : {} })
      .then(({ data }) => setData(data)).catch(() => setData(null)).finally(() => setLoading(false))
  }, [order.id, templateId])
  useEffect(() => { loadMessage() }, [loadMessage])

  const log = (channels) => {
    if (!data) return
    api.post(`/client-message/${order.id}/log`, { body: data.body, template: templateId, channels }).catch(() => {})
  }

  const copy = async () => {
    if (!data) return
    try { await navigator.clipboard.writeText(data.body); toast.success('Текст скопирован — вставьте в чат клиента'); log('copied') }
    catch { toast.error('Не удалось скопировать') }
  }

  const openChat = (url) => {
    if (!url) return
    copy()
    window.open(url, '_blank', 'noopener')
  }

  return (
    <Modal title="Сообщить клиенту" onClose={onClose} width={560}
      footer={<>
        <button className="a-btn a-btn--ghost" onClick={onClose}>Закрыть</button>
        <button className="a-btn a-btn--primary" onClick={copy} disabled={!data}>📋 Копировать текст</button>
      </>}>
      <label className="a-field"><span>Шаблон</span>
        <select className="a-select" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
        </select>
      </label>

      <label className="a-field" style={{ marginTop: 10 }}><span>Текст сообщения</span>
        <textarea className="a-input" rows={10} value={loading ? 'Загрузка…' : (data?.body || '')}
          onChange={(e) => setData((d) => ({ ...d, body: e.target.value }))} />
      </label>

      <div className="a-muted" style={{ fontSize: '0.78rem', margin: '6px 0 10px' }}>
        Telegram по номеру не подставляет текст автоматически — поэтому текст копируется в буфер,
        а кнопка открывает чат с клиентом. Вставьте текст и отправьте.
      </div>

      {(data?.client_chat || data?.deeplinks) ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {data.client_chat && (
            <button className="a-btn a-btn--primary a-btn--sm" onClick={() => openChat(data.client_chat)}>💬 Открыть чат клиента + копировать</button>
          )}
          {data.deeplinks && (
            <>
              <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openChat(data.deeplinks.telegram)}>✈️ Telegram доверенного</button>
              <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openChat(data.deeplinks.max)}>🟦 MAX</button>
            </>
          )}
        </div>
      ) : (
        <div className="a-muted" style={{ fontSize: '0.8rem' }}>
          У клиента не задан чат для отчётов и нет телефона доверенного. Добавьте Telegram-чат в карточке клиента — или скопируйте текст и отправьте вручную.
        </div>
      )}

      {data?.report_url && (
        <div className="a-muted" style={{ fontSize: '0.78rem', marginTop: 10 }}>
          Публичный фотоотчёт: <a className="a-maplink" href={data.report_url} target="_blank" rel="noreferrer">{data.report_url}</a>
        </div>
      )}
    </Modal>
  )
}

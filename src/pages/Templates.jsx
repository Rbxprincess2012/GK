import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { useToast } from '@/components/admin/Toast'

// Зеркало серверных дефолтов (server/src/routes/settings.js → DEFAULT_TEMPLATES)
// для кнопки «Вернуть по умолчанию». Тексты должны совпадать с бэкендом.
const DEFAULT_CLIENT_TEMPLATES = [
  { id: 'report', title: 'Вывоз выполнен', body: 'Здравствуйте, {client}!\n\nЗаявка №{number} от {date} — выполнено ✅\n\nОбъект: {address}\nВодитель: {driver}\n\nПо участкам:\n{sections}\n\nСумма: {amount}\n\nФотоотчёт: {report_url}' },
  { id: 'accepted', title: 'Заявка принята', body: 'Здравствуйте, {client}!\n\nВаша заявка №{number} принята в работу на {date}.\nОбъект: {address}\n\nСообщим, когда вывоз будет выполнен.' },
  { id: 'enroute', title: 'Машина выехала', body: '{client}, машина выехала к вам на объект {address}.\nВодитель: {driver}.' },
  { id: 'partial', title: 'Вывоз частично', body: 'Здравствуйте, {client}!\n\nЗаявка №{number} от {date} выполнена частично.\nОбъект: {address}\n\nПо участкам:\n{sections}\n\nФотоотчёт: {report_url}' },
]
// Подсказка по сценарию отправки для каждого предопределённого шаблона —
// где именно в интерфейсе этот текст уходит клиенту.
const TEMPLATE_HINTS = {
  report: 'Авто-отправка при нажатии «Завершить работу над заявкой» (модалка «Сообщить клиенту» открывается с этим шаблоном). Уходит всем Telegram-получателям клиента.',
  accepted: 'Выбирается вручную в модалке «Сообщить клиенту» — уведомить, что заявка принята в работу (до выезда машины).',
  enroute: 'Выбирается вручную в модалке «Сообщить клиенту» — уведомить, что машина выехала на объект.',
  partial: 'Выбирается вручную в модалке «Сообщить клиенту», когда часть участков перенесена в ручную обработку.',
}

export default function Templates() {
  const toast = useToast()
  const [templates, setTemplates] = useState([])
  useEffect(() => {
    api.get('/settings/client-templates').then(({ data }) => setTemplates(Array.isArray(data) ? data : [])).catch(() => {})
  }, [])

  const setTpl = (i, patch) => setTemplates((arr) => arr.map((t, j) => (j === i ? { ...t, ...patch } : t)))
  const addTpl = () => setTemplates((arr) => [...arr, { id: `tpl_${Date.now()}`, title: 'Новый шаблон', body: '' }])
  const delTpl = (i) => setTemplates((arr) => arr.filter((_, j) => j !== i))
  const resetTpl = (i) => {
    const def = DEFAULT_CLIENT_TEMPLATES.find((d) => d.id === templates[i]?.id)
    if (!def) return
    setTpl(i, { title: def.title, body: def.body })
    toast.success('Восстановлен стандартный текст')
  }
  const saveTemplates = async () => {
    try {
      const clean = templates.filter((t) => t.title.trim() && t.body.trim())
      const { data } = await api.put('/settings/client-templates', clean)
      setTemplates(Array.isArray(data) ? data : clean)
      toast.success('Шаблоны сохранены')
    } catch { toast.error('Не удалось сохранить шаблоны') }
  }

  return (
    <div className="a-page a-settings" style={{ maxWidth: 880 }}>
      <div className="a-page-header"><h2>Шаблоны сообщений</h2></div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>Шаблоны сообщений клиенту</div>
        <div className="a-muted" style={{ fontSize: '0.78rem', marginTop: -6, marginBottom: 12 }}>
          Текст для отправки клиенту в личку (диплинк) и в бот. Плейсхолдеры подставляются автоматически:{' '}
          <code>{'{client}'}</code> <code>{'{number}'}</code> <code>{'{date}'}</code> <code>{'{address}'}</code>{' '}
          <code>{'{driver}'}</code> <code>{'{sections}'}</code> <code>{'{amount}'}</code> <code>{'{report_url}'}</code>.
        </div>
        {templates.map((t, i) => {
          const hint = TEMPLATE_HINTS[t.id]
          const hasDefault = DEFAULT_CLIENT_TEMPLATES.some((d) => d.id === t.id)
          return (
            <div key={t.id} className="a-tpl-card">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
                <label className="a-field" style={{ flex: 1 }}><span>Название</span>
                  <input className="a-input" value={t.title} onChange={(e) => setTpl(i, { title: e.target.value })} />
                </label>
                <button className="a-btn a-btn--danger a-btn--sm" onClick={() => delTpl(i)} title="Удалить шаблон">✕</button>
              </div>
              <div className="a-tpl-hint">
                {hint || 'Произвольный шаблон — выбирается вручную при отправке клиенту.'}
              </div>
              <label className="a-field"><span>Текст</span>
                <textarea className="a-input" rows={5} value={t.body} onChange={(e) => setTpl(i, { body: e.target.value })} />
              </label>
              <div className="a-tpl-actions">
                {hasDefault && (
                  <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => resetTpl(i)} title="Вернуть стандартный текст">↺ Вернуть по умолчанию</button>
                )}
                <button className="a-btn a-btn--primary a-btn--sm" onClick={saveTemplates}>Сохранить</button>
              </div>
            </div>
          )
        })}
        <button className="a-btn a-btn--ghost a-btn--sm" style={{ marginTop: 4 }} onClick={addTpl}>+ Шаблон</button>
      </div>
    </div>
  )
}

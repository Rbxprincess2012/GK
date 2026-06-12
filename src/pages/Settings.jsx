import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

// Токены сгруппированы по интеграции; у каждого — своя подпись и подсказка.
const TOKEN_GROUPS = [
  {
    title: 'Telegram', icon: '✈️', items: [
      ['telegram_client_bot_token', 'Клиентский бот', 'Токен от @BotFather для бота с заказчиками'],
      ['telegram_driver_bot_token', 'Водительский бот', 'Токен бота для водителей'],
    ],
  },
  {
    title: 'MAX', icon: '🟦', items: [
      ['max_bot_token', 'Токен бота', 'Для сообщений в мессенджере MAX'],
    ],
  },
  {
    title: 'Яндекс', icon: '🟡', items: [
      ['yandex_geocoder_key', 'Ключ Геокодера', 'Координаты по адресу · Кабинет разработчика → API Геокодера'],
      ['yandex_jsapi_key', 'Ключ JavaScript API', 'Интерактивная карта смены · Кабинет разработчика → JavaScript API'],
      ['yandex_api_key', 'API-ключ Cloud', 'SpeechKit + GPT (распознавание речи, ИИ)'],
      ['yandex_folder_id', 'Folder ID', 'Идентификатор каталога Yandex Cloud'],
    ],
  },
  {
    title: 'Прочее', icon: '🔗', items: [
      ['n8n_service_token', 'Сервисный токен n8n', 'Для интеграционных сценариев'],
    ],
  },
]

// Зеркало серверных дефолтов (server/src/routes/settings.js → DEFAULT_TEMPLATES)
// для кнопки «Вернуть по умолчанию». Тексты должны совпадать с бэкендом.
const DEFAULT_CLIENT_TEMPLATES = [
  { id: 'report', title: 'Вывоз выполнен', body: 'Здравствуйте, {client}!\n\nЗаявка №{number} от {date} — выполнено ✅\n\nОбъект: {address}\nВодитель: {driver}\n\nПо участкам:\n{sections}\n\nСумма: {amount}\n\nФотоотчёт: {report_url}' },
  { id: 'accepted', title: 'Заявка принята', body: 'Здравствуйте, {client}!\n\nВаша заявка №{number} принята в работу на {date}.\nОбъект: {address}\n\nСообщим, когда вывоз будет выполнен.' },
  { id: 'enroute', title: 'Машина выехала', body: '{client}, машина выехала к вам на объект {address}.\nВодитель: {driver}.' },
  { id: 'partial', title: 'Вывоз частично', body: 'Здравствуйте, {client}!\n\nЗаявка №{number} от {date} выполнена частично.\nОбъект: {address}\n\nПо участкам:\n{sections}\n\nФотоотчёт: {report_url}' },
]
// Подсказка по сценарию отправки для каждого предопределённого шаблона.
const TEMPLATE_HINTS = {
  report: 'Отправляется автоматически при нажатии «Завершить работу над заявкой и оповестить клиента» — всем Telegram-получателям клиента (бот должен быть добавлен в их чат/группу).',
  accepted: 'Уведомление, что заявка принята в работу. Отправляется вручную — до выезда машины.',
  enroute: 'Уведомление, что машина выехала на объект. Отправляется вручную.',
  partial: 'Для частично выполненной заявки (часть участков перенесена в ручную обработку). Выбирается вручную при отправке.',
}

const KEY = 'dispatcher_settings'
const defaults = {
  day_start: '07:00', day_end: '19:00',
  fuel_price: '', fuel_default_norm: '30',
}
function load() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...defaults } }
}

export default function Settings() {
  const toast = useToast()
  const [form, setForm] = useState(load)
  const [confirmReset, setConfirmReset] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const save = () => { localStorage.setItem(KEY, JSON.stringify(form)); toast.success('Настройки сохранены') }

  // токены интеграций (с бэкенда)
  const [tokens, setTokens] = useState({})
  // база (адрес + координаты) и параметры распределения — в БД
  const [base, setBase] = useState({ address: '', lat: null, lng: null })
  const [distribution, setDistribution] = useState({ km_weight: 0.1, region: '', geocoder: 'nominatim' })
  const [savingBase, setSavingBase] = useState(false)
  // Шаблоны сообщений клиенту (диплинк в личку + бот).
  const [templates, setTemplates] = useState([])
  useEffect(() => {
    api.get('/settings/tokens').then(({ data }) => setTokens(data || {})).catch(() => {})
    api.get('/settings/base').then(({ data }) => setBase(data || { address: '', lat: null, lng: null })).catch(() => {})
    api.get('/settings/distribution').then(({ data }) => setDistribution({ km_weight: 0.1, region: '', geocoder: 'nominatim', ...data })).catch(() => {})
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
  const setToken = (k) => (e) => setTokens({ ...tokens, [k]: e.target.value })
  const saveTokens = async () => {
    try { await api.put('/settings/tokens', tokens); toast.success('Токены сохранены') }
    catch { toast.error('Не удалось сохранить токены') }
  }
  const saveBase = async () => {
    setSavingBase(true)
    try {
      const { data } = await api.put('/settings/base', { address: base.address })
      setBase(data)
      toast.success(data.lat != null ? 'База сохранена и геокодирована' : 'База сохранена (координаты не найдены — проверьте ключ Геокодера)')
    } catch { toast.error('Не удалось сохранить базу') }
    finally { setSavingBase(false) }
  }
  const saveDistribution = async () => {
    try {
      const { data } = await api.put('/settings/distribution', {
        km_weight: Number(distribution.km_weight) || 0,
        region: distribution.region || '',
        geocoder: distribution.geocoder || 'nominatim',
      })
      setDistribution({ km_weight: 0.1, region: '', geocoder: 'nominatim', ...data })
      toast.success('Параметры распределения сохранены')
    } catch { toast.error('Не удалось сохранить') }
  }

  return (
    <div className="a-page a-settings" style={{ maxWidth: 880 }}>
      <div className="a-page-header"><h2>Настройки</h2></div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>Токены интеграций</div>
        <div className="a-muted" style={{ fontSize: '0.78rem', marginTop: -6, marginBottom: 14 }}>
          Используются ботами, геокодером и n8n. Доступны менеджеру, директору и суперпользователю.
        </div>
        {TOKEN_GROUPS.map((group) => (
          <div key={group.title} className="a-token-group">
            <div className="a-token-group-title"><span>{group.icon}</span>{group.title}</div>
            <div className="a-token-grid">
              {group.items.map(([k, label, hint]) => (
                <div key={k} className="a-token-item">
                  <label htmlFor={`tok-${k}`}>{label}</label>
                  <input id={`tok-${k}`} className="a-input" type="password" autoComplete="new-password"
                    value={tokens[k] || ''} onChange={setToken(k)} placeholder="не задан" />
                  {hint && <div className="a-token-hint">{hint}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
        <button className="a-btn a-btn--primary" style={{ marginTop: 16 }} onClick={saveTokens}>Сохранить токены</button>
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>Смены</div>
        <div className="a-field-row">
          <label className="a-field"><span>Начало дневной смены</span>
            <input className="a-input" type="time" value={form.day_start} onChange={set('day_start')} />
          </label>
          <label className="a-field"><span>Конец дневной смены</span>
            <input className="a-input" type="time" value={form.day_end} onChange={set('day_end')} />
          </label>
        </div>
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>База (точка отсчёта километража)</div>
        <label className="a-field"><span>Адрес базы (куда свозится мусор)</span>
          <input className="a-input" value={base.address || ''} onChange={(e) => setBase({ ...base, address: e.target.value })} placeholder="Краснодар, …" />
        </label>
        <div className="a-muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
          {base.lat != null
            ? <>Координаты: {Number(base.lat).toFixed(5)}, {Number(base.lng).toFixed(5)} ✅</>
            : <>Координаты не заданы — при сохранении попробуем геокодировать по адресу.</>}
        </div>
        <button className="a-btn a-btn--primary" onClick={saveBase} disabled={savingBase}>
          {savingBase ? 'Сохраняю…' : 'Сохранить базу'}
        </button>
      </div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>Распределение нагрузки</div>
        <div className="a-field-row">
          <label className="a-field"><span>Вес километра в балле тяжести</span>
            <input className="a-input" type="number" step="0.01" min="0" value={distribution.km_weight}
              onChange={(e) => setDistribution({ ...distribution, km_weight: e.target.value })} />
          </label>
          <label className="a-field"><span>Город (для геокодинга)</span>
            <input className="a-input" value={distribution.region || ''} placeholder="Краснодар"
              onChange={(e) => setDistribution({ ...distribution, region: e.target.value })} />
          </label>
        </div>
        <label className="a-field"><span>Сервис геокодинга</span>
          <select className="a-select" value={distribution.geocoder || 'nominatim'}
            onChange={(e) => setDistribution({ ...distribution, geocoder: e.target.value })}>
            <option value="nominatim">OpenStreetMap (бесплатно, без ключа)</option>
            <option value="yandex">Яндекс (точнее, нужен активный ключ)</option>
          </select>
        </label>
        <div className="a-muted" style={{ fontSize: '0.78rem', marginBottom: 8, marginTop: 8 }}>
          0.1 ⇒ 10 км ≈ один заезд. «Город» обязателен для геокодинга (адреса объектов хранятся без города).
          OpenStreetMap находит ~¾ адресов бесплатно; промахи правьте координатами вручную в карточке объекта.
        </div>
        <button className="a-btn a-btn--primary" onClick={saveDistribution}>Сохранить параметры</button>
      </div>

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

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>Топливо</div>
        <div className="a-field-row">
          <label className="a-field"><span>Цена топлива, ₽/л</span>
            <input className="a-input" type="number" step="0.1" value={form.fuel_price} onChange={set('fuel_price')} />
          </label>
          <label className="a-field"><span>Норма по умолчанию, л/100км</span>
            <input className="a-input" type="number" step="0.1" value={form.fuel_default_norm} onChange={set('fuel_default_norm')} />
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="a-btn a-btn--primary" onClick={save}>Сохранить</button>
        <button className="a-btn a-btn--ghost" onClick={() => setConfirmReset(true)}>Сбросить</button>
      </div>

      <div className="a-muted" style={{ fontSize: '0.78rem', marginTop: 14 }}>
        Токены, база и параметры распределения хранятся в БД. Часы смен и топливо — пока локально в браузере.
      </div>

      {confirmReset && (
        <Modal title="Сбросить настройки?" onClose={() => setConfirmReset(false)}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={() => setConfirmReset(false)}>Отмена</button>
            <button className="a-btn a-btn--danger" onClick={() => { localStorage.removeItem(KEY); setForm({ ...defaults }); setConfirmReset(false); toast.success('Сброшено') }}>Сбросить</button>
          </>}>
          <div className="a-muted">Значения вернутся к стандартным.</div>
        </Modal>
      )}
    </div>
  )
}

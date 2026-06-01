import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

const TOKEN_FIELDS = [
  ['telegram_client_bot_token', 'Telegram — клиентский бот'],
  ['telegram_driver_bot_token', 'Telegram — водительский бот'],
  ['yandex_api_key', 'Yandex Cloud — API-ключ (SpeechKit + GPT)'],
  ['yandex_folder_id', 'Yandex Cloud — folder id'],
  ['n8n_service_token', 'Сервисный токен n8n'],
]

const KEY = 'dispatcher_settings'
const defaults = {
  day_start: '07:00', day_end: '19:00',
  base_address: '', fuel_price: '', fuel_default_norm: '30',
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

  // токены интеграций (с бэкенда, директор+)
  const [tokens, setTokens] = useState({})
  useEffect(() => {
    api.get('/settings/tokens').then(({ data }) => setTokens(data || {})).catch(() => {})
  }, [])
  const setToken = (k) => (e) => setTokens({ ...tokens, [k]: e.target.value })
  const saveTokens = async () => {
    try { await api.put('/settings/tokens', tokens); toast.success('Токены сохранены') }
    catch { toast.error('Не удалось сохранить токены') }
  }

  return (
    <div className="a-page" style={{ maxWidth: 640 }}>
      <div className="a-page-header"><h2>Настройки</h2></div>

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>Токены интеграций</div>
        {TOKEN_FIELDS.map(([k, label]) => (
          <label key={k} className="a-field"><span>{label}</span>
            <input className="a-input" type="password" autoComplete="off" value={tokens[k] || ''} onChange={setToken(k)} placeholder="—" />
          </label>
        ))}
        <button className="a-btn a-btn--primary" style={{ marginTop: 8 }} onClick={saveTokens}>Сохранить токены</button>
        <div className="a-muted" style={{ fontSize: '0.78rem', marginTop: 8 }}>
          Используются ботами/n8n. Видны только директору и суперпользователю.
        </div>
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
        <div className="a-section-title" style={{ marginTop: 0 }}>База и топливо</div>
        <label className="a-field"><span>Адрес базы (возврат машин)</span>
          <input className="a-input" value={form.base_address} onChange={set('base_address')} placeholder="Краснодар, …" />
        </label>
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
        Пока хранится локально в браузере. С появлением серверного хранилища настроек переедет в БД.
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

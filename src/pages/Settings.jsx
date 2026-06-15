import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { useAuth } from '@/context/AuthContext'
import { UnansweredQuestions } from '@/components/admin/UnansweredQuestions'

// Токены сгруппированы по интеграции; у каждого — своя подпись и подсказка.
const TOKEN_GROUPS = [
  {
    title: 'Telegram', icon: '✈️', items: [
      ['telegram_client_bot_token', 'Клиентский бот',
        'Зачем: бот шлёт отчёты о выполнении заявок заказчикам и доверенным лицам в Telegram. Где взять: @BotFather в Telegram → /newbot (или /token для готового бота). Отдельный токен от водительского.'],
      ['telegram_driver_bot_token', 'Водительский бот',
        'Зачем: бот водителя — смена, задачи, отметка участков, фотоотчёт. Где взять: @BotFather → отдельный бот (НЕ тот же токен, что у клиентского).'],
    ],
  },
  {
    title: 'MAX', icon: '🟦', items: [
      ['max_client_bot_token', 'Клиентский бот',
        'Зачем: то же, что Telegram-клиентский, но в мессенджере MAX (отчёты заказчикам/лицам). Где взять: кабинет MAX (dev.max.ru / кабинет бота) → Чат-боты → бот → Расширенные настройки → токен.'],
      ['max_driver_bot_token', 'Водительский бот',
        'Зачем: бот водителя в MAX. Где взять: кабинет MAX → отдельный бот (отдельный токен от клиентского).'],
    ],
  },
  {
    title: 'Яндекс', icon: '🟡', items: [
      ['yandex_geocoder_key', 'Ключ Геокодера',
        'Зачем: вычисляет координаты по адресу объекта (для карты и распределения). Где взять: console.yandex.cloud → API Геокодера (или кабинет разработчика Яндекс.Карт).'],
      ['yandex_jsapi_key', 'Ключ JavaScript API (карта)',
        'Зачем: интерактивная карта смены в админке. Где взять: кабинет разработчика Яндекс.Карт → JavaScript API.'],
      ['yandex_api_key', 'API-ключ Cloud (ИИ + голос)',
        'Зачем: ОДИН ключ на ИИ-помощника (YandexGPT) и распознавание речи (SpeechKit) — отдельный не нужен. Где взять: console.yandex.cloud → Сервисные аккаунты → putevo-ai → «Создать новый ключ» → «Создать API-ключ» (область yc.ai.foundationModels.execute, срок «без ограничения»). Сюда — СЕКРЕТ ключа (не идентификатор).'],
      ['yandex_folder_id', 'Folder ID (каталог)',
        'Зачем: идентификатор каталога Yandex Cloud — нужен вместе с ключом для ИИ/речи. ВАЖНО: это НЕ почта и не логин, а код вида b1g… У нас: b1gknn3t21eujoubtisf. Где: console.yandex.cloud → каталог вверху → его ID.'],
    ],
  },
  {
    title: 'Почта', icon: '✉️', items: [
      ['resend_api_key', 'Resend API-ключ',
        'Зачем: отправка писем (коды входа, приглашения) через Resend HTTP API — на VPS SMTP-порты закрыты, поэтому почта идёт через Resend. Где взять: resend.com → API Keys.'],
    ],
  },
  {
    title: 'Прочее', icon: '🔗', items: [
      ['dadata_token', 'Токен DaData',
        'Зачем: автозаполнение реквизитов компании по ИНН/ОГРН. Где взять: dadata.ru → личный кабинет → API-ключ (бесплатный тариф подходит).'],
      ['n8n_service_token', 'Сервисный токен n8n',
        'Зачем: общий секрет для интеграционных сценариев n8n (приём заявок, исходящие уведомления). Задаёшь любую длинную строку — она же прописывается в n8n.'],
    ],
  },
]

// Шкала «важности дальности» (km_weight) — пресеты с человеческими расшифровками.
// Балл нагрузки = заезды + вес × километры до базы.
const KM_PRESETS = [
  { value: 0, title: 'Дальность не учитывается', desc: 'Делим только по числу заездов — подходит, если объекты рядом.' },
  { value: 0.05, title: 'Дальность слабо важна', desc: 'Один заезд «весит» как 20 км. Город компактный, пробег вторичен.' },
  { value: 0.1, title: 'Баланс (рекомендуется)', desc: 'Один заезд «весит» как 10 км. Учитываем и число заездов, и пробег.' },
  { value: 0.2, title: 'Дальность важна', desc: 'Один заезд «весит» как 5 км. Объекты разбросаны — выравниваем пробег.' },
  { value: 0.5, title: 'Дальность решает', desc: 'Один заезд «весит» как 2 км. Главное — не гонять одного водителя далеко.' },
]

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
  const { user } = useAuth()
  const isSuper = user?.role === 'superuser' // токены интеграций — только суперпользователю
  const [form, setForm] = useState(load)
  const [confirmReset, setConfirmReset] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const save = () => { localStorage.setItem(KEY, JSON.stringify(form)); toast.success('Настройки сохранены') }

  // токены интеграций (с бэкенда)
  const [tokens, setTokens] = useState({})
  const [shownTokens, setShownTokens] = useState({}) // какие токены показаны открытым текстом
  const toggleShown = (k) => setShownTokens((s) => ({ ...s, [k]: !s[k] }))
  // база (адрес + координаты) и параметры распределения — в БД
  const [base, setBase] = useState({ address: '', lat: null, lng: null })
  const [distribution, setDistribution] = useState({ km_weight: 0.1, region: '', geocoder: 'nominatim' })
  const [savingBase, setSavingBase] = useState(false)
  // Данные компании-оператора (название — для шаблона приглашения доверенного лица).
  const [org, setOrg] = useState({ company_name: '' })
  useEffect(() => {
    if (isSuper) api.get('/settings/tokens').then(({ data }) => setTokens(data || {})).catch(() => {})
    api.get('/settings/base').then(({ data }) => setBase(data || { address: '', lat: null, lng: null })).catch(() => {})
    api.get('/settings/distribution').then(({ data }) => setDistribution({ km_weight: 0.1, region: '', geocoder: 'nominatim', ...data })).catch(() => {})
    api.get('/settings/org').then(({ data }) => setOrg({ company_name: '', ...data })).catch(() => {})
  }, [isSuper])
  const setOrgField = (k) => (e) => setOrg({ ...org, [k]: e.target.value })
  const [pulling, setPulling] = useState(false)
  const pullByInn = async () => {
    const query = (org.inn || '').trim()
    if (!query) { toast.error('Сначала укажите ИНН'); return }
    setPulling(true)
    try {
      const { data } = await api.post('/settings/dadata/party', { query })
      setOrg((o) => ({
        ...o,
        company_name: data.company_name || o.company_name,
        legal_name: data.legal_name || o.legal_name,
        inn: data.inn || o.inn,
        kpp: data.kpp || o.kpp,
        ogrn: data.ogrn || o.ogrn,
        legal_address: data.legal_address || o.legal_address,
      }))
      toast.success('Реквизиты подтянуты — проверьте и сохраните')
    } catch (e) {
      const err = e?.response?.data?.error
      toast.error(
        err === 'dadata_token_missing' ? 'Впишите токен DaData в «Токены интеграций» и сохраните'
          : err === 'not_found' ? 'Организация по ИНН не найдена'
            : 'Не удалось получить данные DaData',
      )
    } finally { setPulling(false) }
  }
  const saveOrg = async () => {
    try {
      const { data } = await api.put('/settings/org', org)
      setOrg({ company_name: '', ...data })
      toast.success('Сохранено')
    } catch { toast.error('Не удалось сохранить') }
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

      {isSuper && (
      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>Токены интеграций</div>
        <div className="a-note">
          Платформенные ключи (общий бот, Яндекс, DaData, n8n) — доступны только суперпользователю.
        </div>
        {TOKEN_GROUPS.map((group) => (
          <div key={group.title} className="a-token-group">
            <div className="a-token-group-title"><span>{group.icon}</span>{group.title}</div>
            <div className="a-token-grid">
              {group.items.map(([k, label, hint]) => (
                <div key={k} className="a-token-item">
                  <label htmlFor={`tok-${k}`}>{label}</label>
                  <div className="a-fieldrow">
                    <input id={`tok-${k}`} className="a-input"
                      type={shownTokens[k] ? 'text' : 'password'} autoComplete="new-password"
                      value={tokens[k] || ''} onChange={setToken(k)} placeholder="не задан" />
                    <button type="button" className="a-iconbtn" onClick={() => toggleShown(k)}
                      title={shownTokens[k] ? 'Скрыть' : 'Показать'} aria-label={shownTokens[k] ? 'Скрыть' : 'Показать'}>
                      {shownTokens[k] ? '🙈' : '👁'}
                    </button>
                  </div>
                  {hint && <div className="a-token-hint">{hint}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
        <button className="a-btn a-btn--primary" style={{ marginTop: 16 }} onClick={saveTokens}>Сохранить токены</button>
      </div>
      )}

      {isSuper && <UnansweredQuestions />}

      <div className="a-card" style={{ marginBottom: 16 }}>
        <div className="a-section-title" style={{ marginTop: 0 }}>Наша компания — реквизиты</div>
        <label className="a-field"><span>Название компании (для приглашений)</span>
          <input className="a-input" value={org.company_name || ''} placeholder="напр. Чистый город"
            onChange={setOrgField('company_name')} />
        </label>
        <div className="a-note">
          Короткое название — подставляется в текст приглашения доверенного лица («Копировать сообщение»).
        </div>
        <div className="a-field-row">
          <label className="a-field"><span>Юр. название</span>
            <input className="a-input" value={org.legal_name || ''} placeholder="ООО «Чистый город»" onChange={setOrgField('legal_name')} />
          </label>
        </div>
        <div className="a-field-row" style={{ alignItems: 'flex-end' }}>
          <label className="a-field"><span>ИНН</span>
            <input className="a-input" value={org.inn || ''} onChange={setOrgField('inn')} placeholder="10 или 12 цифр" />
          </label>
          <label className="a-field"><span>КПП</span>
            <input className="a-input" value={org.kpp || ''} onChange={setOrgField('kpp')} />
          </label>
          <label className="a-field"><span>ОГРН</span>
            <input className="a-input" value={org.ogrn || ''} onChange={setOrgField('ogrn')} />
          </label>
          <button className="a-btn a-btn--soft" style={{ flex: '0 0 auto', whiteSpace: 'nowrap', height: 40, boxSizing: 'border-box' }}
            onClick={pullByInn} disabled={pulling} title="Заполнить юр. реквизиты по ИНН через DaData">
            {pulling ? 'Загрузка…' : '↧ По ИНН'}
          </button>
        </div>
        <label className="a-field"><span>Юридический адрес</span>
          <input className="a-input" value={org.legal_address || ''} onChange={setOrgField('legal_address')} />
        </label>
        <div className="a-field-row">
          <label className="a-field"><span>Телефон</span>
            <input className="a-input" value={org.phone || ''} onChange={setOrgField('phone')} />
          </label>
          <label className="a-field"><span>E-mail</span>
            <input className="a-input" value={org.email || ''} onChange={setOrgField('email')} />
          </label>
        </div>

        {isSuper && (
          <>
            <label className="a-field"><span>Telegram chat_id для уведомлений ИИ</span>
              <input className="a-input" value={org.support_chat_id || ''} onChange={setOrgField('support_chat_id')}
                placeholder="напр. 123456789" />
            </label>
            <div className="a-note">
              Куда слать сигнал, когда ИИ-помощник не нашёл ответа. Как узнать свой ID: 1) откройте наш
              <b> бот-водитель</b> в Telegram и нажмите «Старт» (иначе бот не сможет вам писать); 2) напишите
              боту <b>@userinfobot</b> — он пришлёт ваш числовой chat_id; 3) вставьте его сюда и сохраните.
            </div>
          </>
        )}

        <div className="a-section-title">Банковские реквизиты</div>
        <label className="a-field"><span>Банк</span>
          <input className="a-input" value={org.bank_name || ''} onChange={setOrgField('bank_name')} />
        </label>
        <div className="a-field-row">
          <label className="a-field"><span>Расчётный счёт</span>
            <input className="a-input" value={org.bank_account || ''} onChange={setOrgField('bank_account')} />
          </label>
          <label className="a-field"><span>БИК</span>
            <input className="a-input" value={org.bik || ''} onChange={setOrgField('bik')} />
          </label>
        </div>
        <label className="a-field"><span>Корр. счёт</span>
          <input className="a-input" value={org.corr_account || ''} onChange={setOrgField('corr_account')} />
        </label>
        <div className="a-note">
          Понадобятся для выставления счетов и документов. Заполнять необязательно.
        </div>
        <button className="a-btn a-btn--primary" onClick={saveOrg}>Сохранить</button>
      </div>

      {/* Блок «Смены» (часы дневной смены) временно скрыт — заглушка, пока не используется.
          form.day_start/day_end и defaults оставлены, чтобы вернуть блок без переделок. */}

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
        <div className="a-field"><span>Важность дальности объекта при делёжке заявок</span></div>
        <div className="a-scale">
          {KM_PRESETS.map((p) => {
            const active = Number(distribution.km_weight) === p.value
            return (
              <label key={p.value} className={'a-scale-opt' + (active ? ' is-active' : '')}>
                <input type="radio" name="km_weight" checked={active}
                  onChange={() => setDistribution({ ...distribution, km_weight: p.value })} />
                <span className="a-scale-opt-text">
                  <span className="a-scale-opt-title">{p.title}</span>
                  <span className="a-scale-opt-desc">{p.desc}</span>
                </span>
              </label>
            )
          })}
        </div>
        <div className="a-field-row" style={{ marginTop: 12 }}>
          <label className="a-field"><span>Город (для геокодинга)</span>
            <input className="a-input" value={distribution.region || ''} placeholder="Краснодар"
              onChange={(e) => setDistribution({ ...distribution, region: e.target.value })} />
          </label>
          <label className="a-field"><span>Сервис геокодинга</span>
            <select className="a-select" value={distribution.geocoder || 'nominatim'}
              onChange={(e) => setDistribution({ ...distribution, geocoder: e.target.value })}>
              <option value="nominatim">OpenStreetMap (бесплатно, без ключа)</option>
              <option value="yandex">Яндекс (точнее, нужен активный ключ)</option>
            </select>
          </label>
        </div>
        <div className="a-note">
          Эти настройки применяются, когда в разделе <b>«Распределение»</b> нажимаешь кнопку
          <b> «⚖ Распределить»</b>: система сама предлагает справедливую раскладку заявок по водителям
          (нагрузка = заезды + вес × километры до базы), а ты подтверждаешь её кнопкой <b>«Применить»</b>.
          <br />
          Без координат объект считается «у базы» (0 км) — поэтому «Город» обязателен для геокодинга
          (адреса объектов хранятся без города). Яндекс точнее, OpenStreetMap — бесплатный запасной.
        </div>
        <button className="a-btn a-btn--primary" onClick={saveDistribution}>Сохранить параметры</button>
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

      <div className="a-note">
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

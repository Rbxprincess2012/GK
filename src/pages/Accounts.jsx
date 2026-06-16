import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

// Раздел супера «Учёт пользователей» — компании-заказчики SaaS + подписка + журнал
// посещений. Над тем же API /companies, что и прежний раздел «Клиенты» (слит сюда).

const EMPTY = {
  company_name: '', legal_name: '', inn: '', kpp: '', ogrn: '', legal_address: '',
  phone: '', email: '', bank_name: '', bank_account: '', bik: '', corr_account: '', director_email: '',
}

const fmtMoney = (n) => new Intl.NumberFormat('ru-RU').format(Math.round(n || 0))

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
function fmtDateTime(d) {
  if (!d) return '—'
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}
function fmtDur(sec) {
  sec = Math.max(0, Math.round(sec || 0))
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60)
  if (h) return `${h} ч ${m} мин`
  if (m) return `${m} мин`
  return sec ? '<1 мин' : '—'
}

function billingInfo(c) {
  const d = fmtDate(c.access_until)
  switch (c.billing_status) {
    case 'granted': return { label: 'Ждёт первого входа', color: '#f4b41b' }
    case 'trial': return { label: `Пробный — до ${d}`, color: '#2ea3b0' }
    case 'active': return { label: `Оплачено до ${d}`, color: '#4ade80' }
    case 'expired': return { label: `Период истёк ${d}`, color: '#ff6b6b' }
    default: return { label: 'Доступ не выдан', color: '#92a2d4' }
  }
}

export default function Accounts() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [tiers, setTiers] = useState([])
  const [editing, setEditing] = useState(null)
  const [pulling, setPulling] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [extend, setExtend] = useState(null) // { company, months, amount }
  const [stats, setStats] = useState({})     // { [companyId]: data | 'loading' }

  const load = () => api.get('/companies').then(({ data }) => setItems(Array.isArray(data) ? data : [])).catch(() => {})
  useEffect(() => {
    load()
    api.get('/public/pricing').then(({ data }) => setTiers(data.tiers || [])).catch(() => {})
  }, [])

  const setField = (k) => (e) => setEditing((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    try {
      if (editing.id) await api.patch(`/companies/${editing.id}`, pickReqs(editing))
      else await api.post('/companies', pickReqs(editing))
      toast.success('Сохранено'); setEditing(null); load()
    } catch { toast.error('Не удалось сохранить') }
  }

  const pullByInn = async () => {
    const query = (editing.inn || '').trim()
    if (!query) { toast.error('Сначала укажите ИНН'); return }
    setPulling(true)
    try {
      const { data } = await api.post('/settings/dadata/party', { query })
      setEditing((f) => ({
        ...f,
        company_name: data.short_name || data.company_name || f.company_name,
        legal_name: data.legal_name || f.legal_name,
        inn: data.inn || f.inn, kpp: data.kpp || f.kpp, ogrn: data.ogrn || f.ogrn,
        legal_address: data.legal_address || f.legal_address,
      }))
      toast.success('Реквизиты подтянуты — проверьте и сохраните')
    } catch (e) {
      const err = e?.response?.data?.error
      toast.error(err === 'dadata_token_missing' ? 'Впишите токен DaData в Настройках'
        : err === 'not_found' ? 'Организация по ИНН не найдена' : 'Не удалось получить данные DaData')
    } finally { setPulling(false) }
  }

  const grant = async (c) => {
    if (!c.director_email?.trim()) { toast.error('Сначала укажите email директора'); return }
    try {
      await api.post(`/companies/${c.id}/grant`)
      toast.success('Доступ предоставлен — директор получит письмо'); load()
    } catch (e) {
      toast.error(e?.response?.data?.error === 'email_taken' ? 'Этот email уже занят другим пользователем' : 'Не удалось выдать доступ')
    }
  }

  const doExtend = async () => {
    try {
      await api.post(`/companies/${extend.company.id}/extend`, { months: extend.months })
      toast.success(`Подписка продлена на ${extend.months} мес`); setExtend(null); load()
    } catch { toast.error('Не удалось продлить'); setExtend(null) }
  }

  const del = async () => {
    try { await api.delete(`/companies/${confirmDel.id}`); toast.success('Удалено'); setConfirmDel(null); load() }
    catch { toast.error('Не удалось удалить') }
  }

  const toggleStats = async (c) => {
    if (stats[c.id]) { setStats((s) => ({ ...s, [c.id]: undefined })); return }
    setStats((s) => ({ ...s, [c.id]: 'loading' }))
    try {
      const { data } = await api.get(`/companies/${c.id}/stats`)
      setStats((s) => ({ ...s, [c.id]: data }))
    } catch { setStats((s) => ({ ...s, [c.id]: undefined })); toast.error('Не удалось загрузить журнал') }
  }

  return (
    <div className="a-page" style={{ maxWidth: 1040 }}>
      <div className="a-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Учёт пользователей</h2>
        <button className="a-btn a-btn--primary" onClick={() => setEditing({ ...EMPTY })}>+ Компания</button>
      </div>

      {items.length === 0 && (
        <div className="a-muted" style={{ padding: '24px 4px' }}>Пока нет компаний-заказчиков. Добавьте первую.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((c) => {
          const bi = billingInfo(c)
          const st = stats[c.id]
          const visits = c.stats?.visits || 0
          return (
            <div key={c.id} className="a-card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
                {/* Слева — компания */}
                <div style={{ minWidth: 220, flex: '1 1 240px' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.02rem' }}>{c.company_name || c.legal_name || 'Без названия'}</div>
                  <div className="a-muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                    {c.inn ? `ИНН ${c.inn}` : 'ИНН не указан'}
                    {c.director_email ? ` · директор: ${c.director_email}` : ' · email директора не указан'}
                  </div>
                  <div style={{ marginTop: 6, fontSize: '0.78rem', color: '#92a2d4' }}>
                    Входов: <b style={{ color: '#cdd6f4' }}>{visits}</b>
                    {' · '}Время: <b style={{ color: '#cdd6f4' }}>{fmtDur(c.stats?.active_seconds)}</b>
                    {' · '}Последний: {fmtDateTime(c.stats?.last_login)}
                    {' · '}
                    <button className="a-linkbtn" onClick={() => toggleStats(c)} style={{ background: 'none', border: 'none', color: '#7aa2f7', cursor: 'pointer', padding: 0 }}>
                      {st ? 'скрыть' : 'журнал'}
                    </button>
                  </div>
                </div>

                {/* По центру — статус подписки (на месте «доверенных лиц») */}
                <div style={{ flex: '0 0 auto', textAlign: 'center', minWidth: 160 }}>
                  <div style={{ fontSize: '0.72rem', color: '#92a2d4', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Подписка</div>
                  <div style={{ fontWeight: 700, fontSize: '0.92rem', color: bi.color, marginTop: 2 }}>● {bi.label}</div>
                </div>

                {/* Справа — действия */}
                <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {c.access_status === 'none' && (
                    <button className="a-btn a-btn--primary a-btn--sm" onClick={() => grant(c)}>Предоставить доступ</button>
                  )}
                  <button className="a-btn a-btn--soft a-btn--sm" onClick={() => setEditing({ ...EMPTY, ...c })}>Изменить</button>
                  <button className="a-btn a-btn--danger a-btn--sm" onClick={() => setConfirmDel(c)}>Удалить</button>
                </div>
              </div>

              {/* Кнопки продления — оплата периода */}
              {c.access_status !== 'none' && tiers.length > 0 && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                  <span className="a-muted" style={{ fontSize: '0.8rem' }}>Оплачен период:</span>
                  {tiers.map((t) => (
                    <button key={t.months} className="a-btn a-btn--soft a-btn--sm"
                      title={`${fmtMoney(t.amount)} ₽${t.discount_pct ? ` (скидка ${t.discount_pct}%)` : ''}`}
                      onClick={() => setExtend({ company: c, months: t.months, amount: t.amount, discount: t.discount_pct })}>
                      +{t.months} мес · {fmtMoney(t.amount)} ₽
                    </button>
                  ))}
                </div>
              )}

              {/* Журнал посещений по сотрудникам */}
              {st && st !== 'loading' && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
                  <div className="a-objrow a-objrow--head" style={{ gridTemplateColumns: '2fr 1fr 1fr 1.4fr' }}>
                    <span>Сотрудник</span><span>Входов</span><span>Время</span><span>Последний вход</span>
                  </div>
                  {st.by_user.length === 0 && <div className="a-muted" style={{ padding: '8px 4px' }}>Пока нет входов.</div>}
                  {st.by_user.map((u) => (
                    <div key={u.user_id} className="a-objrow" style={{ gridTemplateColumns: '2fr 1fr 1fr 1.4fr' }}>
                      <span>{u.name || u.email || `#${u.user_id}`}</span>
                      <span>{u.visits}</span>
                      <span>{fmtDur(u.active_seconds)}</span>
                      <span className="a-muted">{fmtDateTime(u.last_login)}</span>
                    </div>
                  ))}
                </div>
              )}
              {st === 'loading' && <div className="a-muted" style={{ fontSize: '0.8rem' }}>Загрузка журнала…</div>}
            </div>
          )
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Компания-заказчик' : 'Новая компания'} onClose={() => setEditing(null)} width={640}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={() => setEditing(null)}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={save}>Сохранить</button>
          </>}>
          <div className="a-section-title" style={{ marginTop: 0 }}>Реквизиты</div>
          <label className="a-field"><span>Название компании</span>
            <input className="a-input" value={editing.company_name} onChange={setField('company_name')} placeholder="напр. Чистый город" />
          </label>
          <div className="a-field-row" style={{ alignItems: 'flex-end' }}>
            <label className="a-field"><span>ИНН</span>
              <input className="a-input" value={editing.inn} onChange={setField('inn')} placeholder="10 или 12 цифр" />
            </label>
            <label className="a-field"><span>КПП</span><input className="a-input" value={editing.kpp} onChange={setField('kpp')} /></label>
            <label className="a-field"><span>ОГРН</span><input className="a-input" value={editing.ogrn} onChange={setField('ogrn')} /></label>
            <button className="a-btn a-btn--soft" style={{ flex: '0 0 auto', whiteSpace: 'nowrap', height: 40, boxSizing: 'border-box' }}
              onClick={pullByInn} disabled={pulling} title="Заполнить реквизиты по ИНН через DaData">
              {pulling ? 'Загрузка…' : '↧ По ИНН'}
            </button>
          </div>
          <label className="a-field"><span>Юр. название</span>
            <input className="a-input" value={editing.legal_name} onChange={setField('legal_name')} placeholder="ООО «…»" />
          </label>
          <label className="a-field"><span>Юридический адрес</span>
            <input className="a-input" value={editing.legal_address} onChange={setField('legal_address')} />
          </label>
          <div className="a-field-row">
            <label className="a-field"><span>Телефон</span><input className="a-input" value={editing.phone} onChange={setField('phone')} /></label>
            <label className="a-field"><span>E-mail компании</span><input className="a-input" value={editing.email} onChange={setField('email')} /></label>
          </div>

          <div className="a-section-title">Банковские реквизиты</div>
          <label className="a-field"><span>Банк</span><input className="a-input" value={editing.bank_name} onChange={setField('bank_name')} /></label>
          <div className="a-field-row">
            <label className="a-field"><span>Расчётный счёт</span><input className="a-input" value={editing.bank_account} onChange={setField('bank_account')} /></label>
            <label className="a-field"><span>БИК</span><input className="a-input" value={editing.bik} onChange={setField('bik')} /></label>
          </div>
          <label className="a-field"><span>Корр. счёт</span><input className="a-input" value={editing.corr_account} onChange={setField('corr_account')} /></label>

          <div className="a-section-title">Директор</div>
          <label className="a-field"><span>Email директора (для доступа в систему)</span>
            <input className="a-input" type="email" value={editing.director_email} onChange={setField('director_email')} placeholder="director@company.ru" />
          </label>
          <div className="a-note">
            После сохранения нажмите «Предоставить доступ» — директор зарегистрируется по этому email.
            Пробный период начнётся с его первого входа.
          </div>
        </Modal>
      )}

      {extend && (
        <Modal title="Продление подписки" onClose={() => setExtend(null)}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={() => setExtend(null)}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={doExtend}>Подтвердить оплату</button>
          </>}>
          <div>
            Продлить «<b>{extend.company.company_name || extend.company.legal_name || extend.company.id}</b>» на{' '}
            <b>{extend.months} мес</b> за <b>{fmtMoney(extend.amount)} ₽</b>
            {extend.discount ? <span className="a-muted"> (скидка {extend.discount}%)</span> : null}?
          </div>
          <div className="a-note" style={{ marginTop: 10 }}>
            Срок прибавится к концу текущего периода (триала или прошлой оплаты), а если он уже истёк — отсчитается от сегодня.
          </div>
        </Modal>
      )}

      {confirmDel && (
        <Modal title="Удалить компанию?" onClose={() => setConfirmDel(null)}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={() => setConfirmDel(null)}>Отмена</button>
            <button className="a-btn a-btn--danger" onClick={del}>Удалить</button>
          </>}>
          <div className="a-muted">Компания «{confirmDel.company_name || confirmDel.legal_name || confirmDel.id}» будет удалена. Доступ директора при этом не отзывается автоматически.</div>
        </Modal>
      )}
    </div>
  )
}

// В /companies отправляем только реквизиты (без вычисляемых полей биллинга/журнала).
function pickReqs(o) {
  const keys = ['company_name', 'legal_name', 'inn', 'kpp', 'ogrn', 'legal_address',
    'phone', 'email', 'bank_name', 'bank_account', 'bik', 'corr_account', 'director_email']
  const out = {}
  for (const k of keys) out[k] = o[k] ?? ''
  return out
}

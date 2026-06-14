import { useState, useEffect } from 'react'
import api from '@/lib/api'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'

// Раздел суперпользователя «Клиенты» — компании-клиенты SaaS. Карточка с реквизитами
// + email директора + «Предоставить доступ» (открывает директору саморегистрацию).

const STATUS = {
  none: { label: 'Доступ не выдан', color: '#92a2d4' },
  granted: { label: 'Доступ выдан · ждёт регистрации', color: '#f4b41b' },
  registered: { label: 'Регистрируется · ждёт код', color: '#2ea3b0' },
  active: { label: 'Активен', color: '#4ade80' },
}

const EMPTY = {
  company_name: '', legal_name: '', inn: '', kpp: '', ogrn: '', legal_address: '',
  phone: '', email: '', bank_name: '', bank_account: '', bik: '', corr_account: '', director_email: '',
}

export default function Companies() {
  const toast = useToast()
  const [items, setItems] = useState([])
  const [editing, setEditing] = useState(null) // объект формы или null
  const [pulling, setPulling] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const load = () => api.get('/companies').then(({ data }) => setItems(Array.isArray(data) ? data : [])).catch(() => {})
  useEffect(() => { load() }, [])

  const setField = (k) => (e) => setEditing((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    try {
      if (editing.id) await api.patch(`/companies/${editing.id}`, editing)
      else await api.post('/companies', editing)
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

  const del = async () => {
    try { await api.delete(`/companies/${confirmDel.id}`); toast.success('Удалено'); setConfirmDel(null); load() }
    catch { toast.error('Не удалось удалить') }
  }

  return (
    <div className="a-page" style={{ maxWidth: 980 }}>
      <div className="a-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Клиенты</h2>
        <button className="a-btn a-btn--primary" onClick={() => setEditing({ ...EMPTY })}>+ Компания</button>
      </div>

      {items.length === 0 && (
        <div className="a-muted" style={{ padding: '24px 4px' }}>Пока нет компаний-клиентов. Добавьте первую.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {items.map((c) => {
          const st = STATUS[c.access_status] || STATUS.none
          return (
            <div key={c.id} className="a-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1.02rem' }}>{c.company_name || c.legal_name || 'Без названия'}</div>
                <div className="a-muted" style={{ fontSize: '0.82rem', marginTop: 4 }}>
                  {c.inn ? `ИНН ${c.inn}` : 'ИНН не указан'}
                  {c.director_email ? ` · директор: ${c.director_email}` : ' · email директора не указан'}
                </div>
                <div style={{ marginTop: 8, fontSize: '0.8rem', fontWeight: 600, color: st.color }}>● {st.label}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {c.access_status === 'none' && (
                  <button className="a-btn a-btn--primary a-btn--sm" onClick={() => grant(c)}>Предоставить доступ</button>
                )}
                <button className="a-btn a-btn--soft a-btn--sm" onClick={() => setEditing({ ...EMPTY, ...c })}>Изменить</button>
                <button className="a-btn a-btn--danger a-btn--sm" onClick={() => setConfirmDel(c)}>Удалить</button>
              </div>
            </div>
          )
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? 'Компания-клиент' : 'Новая компания'} onClose={() => setEditing(null)} width={640}
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
            После сохранения нажмите «Предоставить доступ» в карточке — директор сможет зарегистрироваться по этому email.
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

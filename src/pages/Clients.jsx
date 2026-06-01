import { useState, useEffect, useCallback } from 'react'
import { useClientsStore } from '@/store/clientsStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { StreetPicker } from '@/components/admin/StreetPicker'

const PAY = { cashless: 'Безнал', cash: 'Нал' }

const emptyClient = {
  type: 'ooo', legal_name: '', nickname: '', inn: '', kpp: '', ogrn: '',
  legal_address: '', bank_name: '', bank_account: '', bik: '', corr_account: '',
  email: '', phone: '', default_payment_method: 'cashless', requires_photo: false,
}

const emptyObject = {
  street_id: '', street_name: '', district_id: '', district: '', district_alias: '',
  house: '', building: '', informal_name: '', requires_photo: null, note: '',
}

export default function Clients() {
  const {
    clients, fetchClients, addClient, updateClient, removeClient,
    objectsByClient, fetchObjects, addObject, updateObject, removeObject, fetchInventory,
  } = useClientsStore()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null) // clientId
  const [inv, setInv] = useState({}) // { [objectId]: [containers] }

  const [editing, setEditing] = useState(null) // client modal
  const [form, setForm] = useState(emptyClient)
  const [objModal, setObjModal] = useState(null) // { clientId, object }
  const [objForm, setObjForm] = useState(emptyObject)

  useEffect(() => { fetchClients() }, [fetchClients])

  const loadInventory = useCallback(async (objs) => {
    const entries = await Promise.all(objs.map(async (o) => [o.id, await fetchInventory(o.id)]))
    setInv((prev) => ({ ...prev, ...Object.fromEntries(entries) }))
  }, [fetchInventory])

  const toggleExpand = async (cid) => {
    if (expanded === cid) { setExpanded(null); return }
    setExpanded(cid)
    if (!objectsByClient[cid]) {
      const objs = await fetchObjects(cid)
      loadInventory(objs)
    } else {
      loadInventory(objectsByClient[cid])
    }
  }

  // ── client modal ──
  const openClient = (c) => { setForm(c ? { ...emptyClient, ...c } : emptyClient); setEditing(c || {}) }
  const closeClient = () => setEditing(null)
  const saveClient = async () => {
    const payload = { ...form }
    Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k] })
    payload.type = form.type
    payload.legal_name = form.legal_name
    payload.requires_photo = !!form.requires_photo
    payload.default_payment_method = form.default_payment_method
    try {
      if (editing.id) await updateClient(editing.id, payload)
      else await addClient(payload)
      toast.success('Сохранено'); closeClient()
    } catch (e) {
      toast.error(e?.response?.data?.error === 'conflict' ? 'Дубликат (ИНН?)' : 'Ошибка сохранения')
    }
  }
  const delClient = async (c) => {
    if (!(await toast.confirm(`Удалить клиента «${c.nickname || c.legal_name}»? Объекты тоже удалятся.`))) return
    try { await removeClient(c.id); toast.success('Удалено') } catch { toast.error('Нельзя удалить (есть заявки?)') }
  }

  // ── object modal ──
  const openObject = (clientId, o) => {
    setObjForm(o ? {
      ...emptyObject, ...o,
      street_name: o.street_name || '', district: o.district || '',
      street_id: o.street_id ?? '', district_id: o.district_id ?? '',
    } : emptyObject)
    setObjModal({ clientId, object: o })
  }
  const closeObject = () => setObjModal(null)
  const saveObject = async () => {
    const payload = {
      client_id: objModal.clientId,
      street_id: objForm.street_id === '' ? null : Number(objForm.street_id),
      district_id: objForm.district_id === '' ? null : Number(objForm.district_id),
      house: objForm.house || undefined,
      building: objForm.building || undefined,
      informal_name: objForm.informal_name || undefined,
      note: objForm.note || undefined,
      requires_photo: objForm.requires_photo,
    }
    try {
      if (objModal.object?.id) await updateObject(objModal.object.id, payload)
      else await addObject(payload)
      const objs = await fetchObjects(objModal.clientId)
      loadInventory(objs)
      toast.success('Объект сохранён'); closeObject()
    } catch { toast.error('Ошибка сохранения объекта') }
  }
  const delObject = async (clientId, o) => {
    if (!(await toast.confirm(`Удалить объект «${objLabel(o)}»?`))) return
    try { await removeObject(o.id, clientId); toast.success('Удалено') } catch { toast.error('Нельзя удалить (есть заявки?)') }
  }

  const q = search.trim().toLowerCase()
  const filtered = clients.filter((c) =>
    !q || c.legal_name?.toLowerCase().includes(q) || c.nickname?.toLowerCase().includes(q) || c.inn?.includes(q)
  )

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Клиенты <span className="a-count">{clients.length}</span></h2>
        <div style={{ display: 'flex', gap: 10 }}>
          <input className="a-input" style={{ width: 220 }} placeholder="Поиск: имя, ИНН…"
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="a-btn a-btn--primary" onClick={() => openClient(null)}>+ Клиент</button>
        </div>
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th>Клиент</th><th>Тип</th><th>ИНН</th><th>Оплата</th><th>Телефон</th><th>Фото</th><th></th></tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const objs = objectsByClient[c.id]
              const isOpen = expanded === c.id
              return (
                <FragmentRows key={c.id}>
                  <tr>
                    <td style={{ fontWeight: 600 }}>
                      <button className="a-linklike" onClick={() => toggleExpand(c.id)}>
                        {isOpen ? '▾' : '▸'} {c.nickname || c.legal_name}
                      </button>
                      {c.nickname && <div className="a-muted" style={{ fontSize: '0.76rem' }}>{c.legal_name}</div>}
                    </td>
                    <td><span className={`a-badge a-badge--${c.type === 'ooo' ? 'purple' : 'orange'}`}>{c.type === 'ooo' ? 'ООО' : 'ИП'}</span></td>
                    <td className="a-muted">{c.inn || '—'}</td>
                    <td>{PAY[c.default_payment_method] || '—'}</td>
                    <td className="a-muted">{c.phone || '—'}</td>
                    <td>{c.requires_photo ? '📷' : '—'}</td>
                    <td>
                      <div className="a-actions">
                        <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openClient(c)}>✎</button>
                        <button className="a-btn a-btn--danger a-btn--sm" onClick={() => delClient(c)}>✕</button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="a-subrow">
                      <td colSpan={7}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span className="a-section-title" style={{ margin: 0 }}>Объекты</span>
                          <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openObject(c.id, null)}>+ Объект</button>
                        </div>
                        {!objs && <div className="a-empty">Загрузка…</div>}
                        {objs && objs.length === 0 && <div className="a-empty">Объектов нет</div>}
                        {objs && objs.map((o) => (
                          <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500 }}>{objLabel(o)}</div>
                              <div className="a-muted" style={{ fontSize: '0.78rem' }}>
                                {o.district || 'район не указан'}
                              </div>
                              <div style={{ marginTop: 4 }}>
                                {(inv[o.id]?.length
                                  ? inv[o.id].map((ct) => (
                                      <span key={ct.id} className={`a-inv${ct.state === 'empty' ? ' a-inv--empty' : ''}`}>
                                        {ct.type_name}{ct.number ? ` №${ct.number}` : ''}
                                      </span>
                                    ))
                                  : <span className="a-muted" style={{ fontSize: '0.78rem' }}>контейнеров нет</span>)}
                              </div>
                            </div>
                            <div className="a-actions">
                              <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openObject(c.id, o)}>✎</button>
                              <button className="a-btn a-btn--danger a-btn--sm" onClick={() => delObject(c.id, o)}>✕</button>
                            </div>
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </FragmentRows>
              )
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="a-loading">Клиентов нет</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ── Модалка клиента ── */}
      {editing && (
        <Modal
          title={editing.id ? (editing.nickname || editing.legal_name) : 'Новый клиент'}
          onClose={closeClient}
          width={560}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={closeClient}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={saveClient} disabled={!form.legal_name}>Сохранить</button>
          </>}
        >
          <div className="a-field-row">
            <label className="a-field"><span>Тип</span>
              <select className="a-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="ooo">ООО</option><option value="ip">ИП</option>
              </select>
            </label>
            <label className="a-field"><span>Оплата по умолчанию</span>
              <select className="a-select" value={form.default_payment_method} onChange={(e) => setForm({ ...form, default_payment_method: e.target.value })}>
                <option value="cashless">Безнал</option><option value="cash">Нал</option>
              </select>
            </label>
          </div>
          <label className="a-field"><span>Юр. название *</span>
            <input className="a-input" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="ООО «Пример»" />
          </label>
          <label className="a-field"><span>Неофициальное имя (ник)</span>
            <input className="a-input" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="Как называют в обиходе" />
          </label>
          <div className="a-field-row">
            <label className="a-field"><span>ИНН</span>
              <input className="a-input" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })} />
            </label>
            <label className="a-field"><span>КПП</span>
              <input className="a-input" value={form.kpp} onChange={(e) => setForm({ ...form, kpp: e.target.value })} />
            </label>
            <label className="a-field"><span>ОГРН</span>
              <input className="a-input" value={form.ogrn} onChange={(e) => setForm({ ...form, ogrn: e.target.value })} />
            </label>
          </div>
          <label className="a-field"><span>Юр. адрес</span>
            <input className="a-input" value={form.legal_address} onChange={(e) => setForm({ ...form, legal_address: e.target.value })} />
          </label>
          <div className="a-field-row">
            <label className="a-field"><span>Телефон</span>
              <input className="a-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label className="a-field"><span>E-mail</span>
              <input className="a-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
          </div>

          <div className="a-section-title">Банк</div>
          <label className="a-field"><span>Банк</span>
            <input className="a-input" value={form.bank_name} onChange={(e) => setForm({ ...form, bank_name: e.target.value })} />
          </label>
          <div className="a-field-row">
            <label className="a-field"><span>Расч. счёт</span>
              <input className="a-input" value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} />
            </label>
            <label className="a-field"><span>БИК</span>
              <input className="a-input" value={form.bik} onChange={(e) => setForm({ ...form, bik: e.target.value })} />
            </label>
          </div>
          <label className="a-field"><span>Корр. счёт</span>
            <input className="a-input" value={form.corr_account} onChange={(e) => setForm({ ...form, corr_account: e.target.value })} />
          </label>

          <label className="a-field a-field--check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={!!form.requires_photo} onChange={(e) => setForm({ ...form, requires_photo: e.target.checked })} />
            <span>Требует фотоотчёт по умолчанию</span>
          </label>
        </Modal>
      )}

      {/* ── Модалка объекта ── */}
      {objModal && (
        <Modal
          title={objModal.object?.id ? 'Объект' : 'Новый объект'}
          onClose={closeObject}
          width={480}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={closeObject}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={saveObject}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>Неофициальное название</span>
            <input className="a-input" value={objForm.informal_name} onChange={(e) => setObjForm({ ...objForm, informal_name: e.target.value })} placeholder="ЖК Маршалл, кафе у моста…" />
          </label>
          <label className="a-field"><span>Улица</span>
            <StreetPicker
              value={{ street_name: objForm.street_name }}
              onPick={(s) => setObjForm({ ...objForm, ...s })}
            />
          </label>
          {objForm.district && (
            <div className="a-muted" style={{ fontSize: '0.8rem', marginTop: -6, marginBottom: 6 }}>
              Район: <b style={{ color: '#c4acff' }}>{objForm.district}</b>{objForm.district_alias ? ` (${objForm.district_alias})` : ''} — подставлен автоматически
            </div>
          )}
          <div className="a-field-row">
            <label className="a-field"><span>Дом</span>
              <input className="a-input" value={objForm.house} onChange={(e) => setObjForm({ ...objForm, house: e.target.value })} />
            </label>
            <label className="a-field"><span>Корпус / строение</span>
              <input className="a-input" value={objForm.building} onChange={(e) => setObjForm({ ...objForm, building: e.target.value })} />
            </label>
          </div>
          <label className="a-field"><span>Примечание</span>
            <input className="a-input" value={objForm.note} onChange={(e) => setObjForm({ ...objForm, note: e.target.value })} placeholder="Код от ворот, контакт на месте…" />
          </label>
          <label className="a-field"><span>Фотоотчёт</span>
            <select className="a-select"
              value={objForm.requires_photo === null ? '' : String(objForm.requires_photo)}
              onChange={(e) => setObjForm({ ...objForm, requires_photo: e.target.value === '' ? null : e.target.value === 'true' })}>
              <option value="">Как у клиента</option>
              <option value="true">Обязателен</option>
              <option value="false">Не нужен</option>
            </select>
          </label>
        </Modal>
      )}
    </div>
  )
}

function objLabel(o) {
  if (o.informal_name) return o.informal_name
  const parts = [o.street_name, o.house && `д. ${o.house}`, o.building && `к. ${o.building}`].filter(Boolean)
  return parts.join(', ') || `Объект #${o.id}`
}

// react не позволяет несколько <tr> без обёртки в map — используем Fragment
function FragmentRows({ children }) { return children }

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClientsStore } from '@/store/clientsStore'
import api from '@/lib/api'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { StreetPicker } from '@/components/admin/StreetPicker'
import { PhoneMessengerField, MessengerTag } from '@/components/admin/PhoneMessengerField'

const PAY = { cashless: 'Безнал', cash: 'Нал' }

// Сборка/разбор «Фамилия Имя» для доверенных лиц.
const fullName = (last, first) => [last, first].map((s) => (s || '').trim()).filter(Boolean).join(' ')
const splitName = (name) => {
  const s = (name || '').trim()
  const i = s.indexOf(' ')
  return i < 0 ? { last_name: s, first_name: '' } : { last_name: s.slice(0, i), first_name: s.slice(i + 1).trim() }
}

// Буква для «аватара» компании — из имени без правовой формы и кавычек.
function clientInitial(c) {
  const base = (c.nickname || c.legal_name || '')
    .replace(/^(ООО|ИП|АО|ЗАО|ПАО|ОАО)\s*/i, '')
    .replace(/[«»"'`]/g, '')
    .trim()
  return (base[0] || c.legal_name?.[0] || '?').toUpperCase()
}

const emptyClient = {
  type: 'ooo', legal_name: '', nickname: '', inn: '', kpp: '', ogrn: '',
  legal_address: '', bank_name: '', bank_account: '', bik: '', corr_account: '',
  email: '', phone: '', default_payment_method: 'cashless', requires_photo: false,
  group_id: '',
}

const emptyObject = {
  city: '', street_id: '', street_name: '', district_id: '', district: '', district_alias: '',
  house: '', building: '', informal_name: '', requires_photo: null, note: '',
  lat: '', lng: '', geo_source: null,
  trusted_links: [], // [{ trusted_person_id, section_id|null }]
  sections: [],       // участки объекта (только у существующего объекта)
}

export default function Clients() {
  const {
    clients, fetchClients, addClient, updateClient, removeClient,
    groups, fetchGroups, addGroup, updateGroup, removeGroup,
    objectsByClient, fetchObjects, addObject, updateObject, removeObject, fetchInventory,
  } = useClientsStore()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(null) // clientId
  const [openGroups, setOpenGroups] = useState(() => new Set()) // groupId[]
  const [, setInv] = useState({}) // { [objectId]: [containers] } — заполняется для прогрева кэша

  const [editing, setEditing] = useState(null) // client modal
  const [form, setForm] = useState(emptyClient)
  const [objModal, setObjModal] = useState(null) // { clientId, object }
  const [objForm, setObjForm] = useState(emptyObject)
  const [objSaving, setObjSaving] = useState(false)
  const [groupModal, setGroupModal] = useState(null) // group modal
  const [groupForm, setGroupForm] = useState({ name: '', note: '' })
  const [personsModal, setPersonsModal] = useState(null) // ГК для управления списком лиц

  useEffect(() => { fetchClients(); fetchGroups() }, [fetchClients, fetchGroups])
  const [searchParams, setSearchParams] = useSearchParams()

  const toggleGroup = (gid) => setOpenGroups((prev) => {
    const next = new Set(prev)
    next.has(gid) ? next.delete(gid) : next.add(gid)
    return next
  })

  // ── group modal ──
  const openGroup = (g) => { setGroupForm(g ? { name: g.name, note: g.note || '' } : { name: '', note: '' }); setGroupModal(g || {}) }
  const closeGroup = () => setGroupModal(null)
  const saveGroup = async () => {
    const payload = { name: groupForm.name.trim(), note: groupForm.note || null }
    if (!payload.name) return
    try {
      if (groupModal.id) await updateGroup(groupModal.id, payload)
      else await addGroup(payload)
      toast.success('Сохранено'); closeGroup()
    } catch { toast.error('Ошибка сохранения') }
  }
  const delGroup = async (g) => {
    if (!(await toast.confirm(`Удалить группу «${g.name}»? Юрлица останутся, но потеряют привязку к группе.`))) return
    try { await removeGroup(g.id); await fetchClients(); toast.success('Удалено') } catch { toast.error('Ошибка удаления') }
  }

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
    // ГК: выбрана существующая, создаётся новая («__new__») или без группы.
    let groupId = form.group_id && form.group_id !== '__new__' ? Number(form.group_id) : null
    if (form.group_id === '__new__') {
      const name = (form.newGroupName || '').trim()
      if (!name) { toast.error('Укажите название новой ГК'); return }
      try { const g = await addGroup({ name, note: null }); groupId = g.id }
      catch { toast.error('Не удалось создать ГК'); return }
    }
    const payload = { ...form }
    delete payload.newGroupName
    Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k] })
    payload.type = form.type
    payload.legal_name = form.legal_name
    payload.requires_photo = !!form.requires_photo
    payload.default_payment_method = form.default_payment_method
    payload.group_id = groupId
    try {
      if (editing.id) await updateClient(editing.id, payload)
      else {
        const created = await addClient(payload)
        if (created?.id) {
          // Сразу раскрываем нового клиента (и его группу) — чтобы была видна кнопка «+ Объект».
          if (created.group_id) setOpenGroups((p) => new Set(p).add(created.group_id))
          setExpanded(created.id)
          fetchObjects(created.id)
        }
      }
      toast.success('Сохранено'); closeClient()
    } catch (e) {
      toast.error(e?.response?.data?.error === 'conflict' ? 'Дубликат (ИНН?)' : 'Ошибка сохранения')
    }
  }
  const delClient = async (c) => {
    if (!(await toast.confirm(`Удалить клиента «${c.nickname || c.legal_name}»? Удалить можно только клиента без объектов и заявок.`))) return
    try { await removeClient(c.id); toast.success('Удалено') }
    catch { toast.error('Нельзя удалить: у клиента есть объекты или заявки — сначала удалите их') }
  }

  // ── object modal ──
  const openObject = (clientId, o) => {
    setObjForm(o ? {
      ...emptyObject, ...o,
      street_name: o.street_name || '', district: o.district || '',
      street_id: o.street_id ?? '', district_id: o.district_id ?? '',
      trusted_links: (o.trusted_persons || []).map((p) => ({ trusted_person_id: p.id, section_id: p.section_id ?? null })),
      sections: o.sections || [],
    } : emptyObject)
    setObjModal({ clientId, object: o })
  }
  const closeObject = () => setObjModal(null)

  // Переход из раздела «Объекты»: ?client=<id>&object=<id> — раскрыть клиента и открыть объект.
  useEffect(() => {
    const clientId = searchParams.get('client')
    if (!clientId) return
    const cid = Number(clientId)
    const objectId = searchParams.get('object')
    ;(async () => {
      const objs = await fetchObjects(cid)
      loadInventory(objs)
      setExpanded(cid)
      const client = clients.find((c) => c.id === cid)
      if (client?.group_id) setOpenGroups((p) => new Set(p).add(client.group_id))
      if (objectId) {
        const obj = objs.find((o) => o.id === Number(objectId))
        if (obj) openObject(cid, obj)
      }
    })()
    setSearchParams({}, { replace: true })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps
  const objPayload = () => ({
    client_id: objModal.clientId,
    city: objForm.city || undefined,
    street_id: objForm.street_id === '' ? null : Number(objForm.street_id),
    district_id: objForm.district_id === '' ? null : Number(objForm.district_id),
    house: objForm.house || undefined,
    building: objForm.building || undefined,
    informal_name: objForm.informal_name || undefined,
    note: objForm.note || undefined,
    requires_photo: objForm.requires_photo,
    lat: objForm.lat === '' || objForm.lat == null ? undefined : Number(objForm.lat),
    lng: objForm.lng === '' || objForm.lng == null ? undefined : Number(objForm.lng),
    trusted_links: objForm.trusted_links || [],
  })

  // Сохранить объект, НЕ закрывая модалку — чтобы у нового объекта появился id и можно
  // было добавлять участки/доверенных лиц.
  const saveObjectInline = async () => {
    setObjSaving(true)
    try {
      const saved = objModal.object?.id ? await updateObject(objModal.object.id, objPayload()) : await addObject(objPayload())
      const objs = await fetchObjects(objModal.clientId)
      const fresh = objs.find((o) => o.id === saved.id) || saved
      setObjModal({ clientId: objModal.clientId, object: fresh })
      setObjForm((f) => ({ ...f, sections: fresh.sections || f.sections }))
      loadInventory(objs)
      toast.success('Объект сохранён')
    } catch { toast.error('Ошибка сохранения объекта') }
    finally { setObjSaving(false) }
  }

  const saveObject = async () => {
    try {
      if (objModal.object?.id) await updateObject(objModal.object.id, objPayload())
      else await addObject(objPayload())
      const objs = await fetchObjects(objModal.clientId)
      loadInventory(objs)
      toast.success('Объект сохранён'); closeObject()
    } catch { toast.error('Ошибка сохранения объекта') }
  }
  const delObject = async (clientId, o) => {
    if (!(await toast.confirm(`Удалить объект «${objLabel(o)}»?`))) return
    try { await removeObject(o.id, clientId); toast.success('Удалено') } catch { toast.error('Нельзя удалить (есть заявки?)') }
  }
  // Принудительный автогеокодинг существующего объекта (по адресу).
  const geocodeObj = async () => {
    if (!objModal?.object?.id) { toast.error('Сначала сохраните объект'); return }
    try {
      const { data } = await api.post(`/objects/${objModal.object.id}/geocode`)
      if (data?.lat != null) {
        setObjForm((f) => ({ ...f, lat: data.lat, lng: data.lng, geo_source: data.source }))
        toast.success('Координаты получены по адресу')
      } else if (data?.skipped === 'manual') toast.error('Координаты заданы вручную — авто не перезатирает')
      else toast.error('Геокодер не нашёл адрес (проверьте ключ в Настройках)')
    } catch { toast.error('Ошибка геокодинга') }
  }

  const q = search.trim().toLowerCase()
  const filtered = clients.filter((c) =>
    !q || c.legal_name?.toLowerCase().includes(q) || c.nickname?.toLowerCase().includes(q) || c.inn?.includes(q)
  )

  const grouped = groups.map((g) => ({ group: g, items: filtered.filter((c) => c.group_id === g.id) }))
  const ungrouped = filtered.filter((c) => !c.group_id)

  const renderClient = (c, { noAvatar = false } = {}) => {
    const objs = objectsByClient[c.id]
    const isOpen = expanded === c.id
    return (
      <div key={c.id} className={'a-client-card' + (isOpen ? ' is-open' : '')}>
              <div className="a-client-head" onClick={() => toggleExpand(c.id)}>
                <span className="a-client-caret">{isOpen ? '▾' : '▸'}</span>
                {noAvatar
                  ? <span className="a-icon-slot" aria-hidden="true" />
                  : <span className={'a-client-avatar' + (c.type === 'ip' ? ' a-client-avatar--ip' : '')}>{clientInitial(c)}</span>}
                <span className="a-client-id" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) 1fr 1fr 1fr', alignItems: 'center', gap: 14 }}>
                  <span className="a-client-legal">{c.legal_name}</span>
                  <span className="a-muted">{c.inn ? `ИНН ${c.inn}` : '—'}</span>
                  <span className="a-muted">{PAY[c.default_payment_method] || '—'}</span>
                  <span className="a-muted">{c.requires_photo ? '📷 фотоотчёт' : 'без фото'}</span>
                </span>
                <div className="a-actions">
                  <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => { e.stopPropagation(); openClient(c) }}>✎</button>
                  <button className="a-btn a-btn--danger a-btn--sm" onClick={(e) => { e.stopPropagation(); delClient(c) }}>✕</button>
                </div>
              </div>

              {isOpen && (
                <div className="a-client-body">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span className="a-muted" style={{ fontSize: '0.8rem' }}>Объекты клиента</span>
                    <button className="a-btn a-btn--primary a-btn--sm" onClick={() => openObject(c.id, null)}>+ Объект</button>
                  </div>
                  {!objs && <div className="a-empty">Загрузка…</div>}
                  {objs && objs.length === 0 && <div className="a-empty">Объектов нет</div>}
                  {objs && objs.length > 0 && (
                    <div className="a-objtable">
                      <div className="a-objrow a-objrow--head">
                        <span>Объект</span><span>Адрес</span><span>Участок</span><span>Доверенное лицо</span><span />
                      </div>
                      {objs.map((o) => {
                        const persons = o.trusted_persons || []
                        const secs = o.sections || []
                        // Одно доверенное лицо на участок; если участков нет — на сам объект.
                        const rows = secs.length
                          ? secs.map((s) => ({ section: s.name, person: persons.find((p) => p.section_id === s.id) || null }))
                          : [{ section: null, person: persons.find((p) => !p.section_id) || null }]
                        return (
                          <div key={o.id} className="a-objrow">
                            <span className="a-obj-title">🏢 {objName(o)}</span>
                            <span className="a-obj-cell a-muted">{objAddr(o)}</span>
                            <span className="a-objgrid2-col">
                              {rows.length
                                ? rows.map((r, i) => (
                                    <span key={i} className="a-obj-cell">
                                      {r.section ? `📍 ${r.section}` : <span className="a-muted">—</span>}
                                    </span>
                                  ))
                                : <span className="a-obj-cell a-muted">—</span>}
                            </span>
                            <span className="a-objgrid2-col">
                              {rows.map((r, i) => (
                                <span key={i} className="a-obj-cell a-person-line">
                                  {r.person ? <>
                                    <span className="a-person-name">👤 {r.person.name}</span>
                                    <span className="a-person-phone a-muted">{r.person.phone || '—'}</span>
                                    <MessengerTag value={r.person.messengers} />
                                  </> : <span className="a-muted">—</span>}
                                </span>
                              ))}
                            </span>
                            <span className="a-actions">
                              <button className="a-btn a-btn--ghost a-btn--sm" onClick={() => openObject(c.id, o)}>✎</button>
                              <button className="a-btn a-btn--danger a-btn--sm" onClick={() => delObject(c.id, o)}>✕</button>
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
    )
  }

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

      <div className="a-client-list">
        {filtered.length === 0 && <div className="a-card"><div className="a-empty">Клиентов нет</div></div>}

        {grouped.map(({ group, items }) => {
          if (q && items.length === 0) return null
          const gOpen = openGroups.has(group.id)
          return (
            <div key={'g' + group.id} className={'a-group-card' + (gOpen ? ' is-open' : '')}>
              <div className="a-group-head" onClick={() => toggleGroup(group.id)}>
                <span className="a-client-caret">{gOpen ? '▾' : '▸'}</span>
                <span className="a-group-badge">ГК</span>
                <span className="a-group-name">{group.name}</span>
                <div className="a-actions">
                  <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => { e.stopPropagation(); setPersonsModal(group) }} title="Доверенные лица группы">👤 Лица</button>
                  <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => { e.stopPropagation(); openGroup(group) }}>✎</button>
                  <button className="a-btn a-btn--danger a-btn--sm" onClick={(e) => { e.stopPropagation(); delGroup(group) }}>✕</button>
                </div>
              </div>
              {gOpen && (
                <div className="a-group-body">
                  {items.length === 0 && <div className="a-empty">Юрлиц нет</div>}
                  {items.map(renderClient)}
                </div>
              )}
            </div>
          )
        })}

        {ungrouped.map((c) => renderClient(c, { noAvatar: true }))}
      </div>

      {/* ── Модалка клиента ── */}
      {editing && (
        <Modal
          title={editing.id ? (editing.nickname || editing.legal_name) : 'Новый клиент'}
          onClose={closeClient}
          width={560}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={closeClient}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={saveClient} disabled={!form.legal_name || !form.inn}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>Группа компаний</span>
            <select className="a-select" value={form.group_id || ''} onChange={(e) => setForm({ ...form, group_id: e.target.value })}>
              <option value="">— без группы —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__new__">➕ Создать новую ГК…</option>
            </select>
          </label>
          {form.group_id === '__new__' && (
            <label className="a-field"><span>Название новой ГК <b style={{ color: '#ff4655' }}>*</b></span>
              <input className="a-input" value={form.newGroupName || ''} onChange={(e) => setForm({ ...form, newGroupName: e.target.value })} placeholder="ГК «Догма»" autoFocus />
            </label>
          )}
          <div className="a-field-row">
            <label className="a-field"><span>Тип</span>
              <select className="a-select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option value="ooo">ООО</option><option value="ip">ИП</option>
              </select>
            </label>
            <label className="a-field"><span>Оплата по умолчанию <b style={{ color: '#ff4655' }}>*</b></span>
              <select className="a-select" value={form.default_payment_method} onChange={(e) => setForm({ ...form, default_payment_method: e.target.value })}>
                <option value="cashless">Безнал</option><option value="cash">Нал</option>
              </select>
            </label>
          </div>
          <label className="a-field"><span>Наименование юридического лица <b style={{ color: '#ff4655' }}>*</b></span>
            <input className="a-input" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="ООО «Пример»" />
          </label>
          <label className="a-field"><span>Неофициальное имя (ник)</span>
            <input className="a-input" value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} placeholder="Как называют в обиходе" />
          </label>
          <div className="a-field-row">
            <label className="a-field"><span>ИНН <b style={{ color: '#ff4655' }}>*</b></span>
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
            <span>Требует фотоотчёт по умолчанию <b style={{ color: '#ff4655' }}>*</b></span>
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
            <button className="a-btn a-btn--ghost" onClick={closeObject}>Закрыть</button>
            <button className="a-btn a-btn--primary" onClick={saveObject}>Сохранить и закрыть</button>
          </>}
        >
          <div className="a-objmodal">
          <label className="a-field"><span>Название объекта</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="a-input" style={{ flex: 1 }} value={objForm.informal_name} onChange={(e) => setObjForm({ ...objForm, informal_name: e.target.value })} placeholder="ЖК Маршалл, кафе у моста…" />
              <button type="button" className="a-btn a-btn--primary" onClick={saveObjectInline} disabled={objSaving}
                title="Сохранить объект (не закрывая окно), чтобы добавить участки и доверенных лиц">
                {objSaving ? '…' : (objModal.object?.id ? 'Сохранить' : 'Создать')}
              </button>
            </div>
          </label>
          <label className="a-field"><span>Город (населённый пункт)</span>
            <input className="a-input" value={objForm.city} onChange={(e) => setObjForm({ ...objForm, city: e.target.value })} placeholder="Краснодар" />
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

          <div className="a-field-row" style={{ alignItems: 'flex-end' }}>
            <label className="a-field"><span>Широта (lat)</span>
              <input className="a-input" inputMode="decimal" value={objForm.lat ?? ''} placeholder="45.0355"
                onChange={(e) => setObjForm({ ...objForm, lat: e.target.value, geo_source: 'manual' })} />
            </label>
            <label className="a-field"><span>Долгота (lng)</span>
              <input className="a-input" inputMode="decimal" value={objForm.lng ?? ''} placeholder="38.9753"
                onChange={(e) => setObjForm({ ...objForm, lng: e.target.value, geo_source: 'manual' })} />
            </label>
            <button type="button" className="a-btn a-btn--ghost" style={{ marginBottom: 2 }} onClick={geocodeObj}
              title="Определить координаты по адресу через Яндекс">🔍 По адресу</button>
          </div>
          <div className="a-muted" style={{ fontSize: '0.76rem', marginTop: -4, marginBottom: 6 }}>
            {objForm.geo_source === 'manual'
              ? 'Координаты ручные — приоритетнее автопоиска и не перезатираются.'
              : objForm.lat
                ? `Координаты получены автоматически${objForm.geo_source ? ` (${objForm.geo_source})` : ''}. Можно поправить вручную.`
                : 'Точные координаты от доверенного лица надёжнее автопоиска по адресу.'}
          </div>

          <ObjectExtras
            clientId={objModal.clientId}
            objectId={objModal.object?.id}
            sections={objForm.sections}
            onSectionsChange={(sections) => setObjForm({ ...objForm, sections })}
            links={objForm.trusted_links}
            onLinksChange={(trusted_links) => setObjForm({ ...objForm, trusted_links })}
          />

          <label className="a-field"><span>Фотоотчёт</span>
            <select className="a-select"
              value={objForm.requires_photo === null ? '' : String(objForm.requires_photo)}
              onChange={(e) => setObjForm({ ...objForm, requires_photo: e.target.value === '' ? null : e.target.value === 'true' })}>
              <option value="">Как у клиента</option>
              <option value="true">Обязателен</option>
              <option value="false">Не нужен</option>
            </select>
          </label>
          </div>
        </Modal>
      )}

      {/* ── Модалка группы компаний ── */}
      {groupModal && (
        <Modal
          title={groupModal.id ? 'Группа компаний' : 'Новая группа компаний'}
          onClose={closeGroup}
          width={440}
          footer={<>
            <button className="a-btn a-btn--ghost" onClick={closeGroup}>Отмена</button>
            <button className="a-btn a-btn--primary" onClick={saveGroup} disabled={!groupForm.name.trim()}>Сохранить</button>
          </>}
        >
          <label className="a-field"><span>Название группы *</span>
            <input className="a-input" autoFocus value={groupForm.name}
              onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })} placeholder="ГК «Догма»" />
          </label>
          <label className="a-field"><span>Примечание</span>
            <input className="a-input" value={groupForm.note}
              onChange={(e) => setGroupForm({ ...groupForm, note: e.target.value })} />
          </label>
        </Modal>
      )}

      {/* ── Модалка управления доверенными лицами ГК ── */}
      {personsModal && (
        <GroupPersonsModal group={personsModal} onClose={() => setPersonsModal(null)} />
      )}
    </div>
  )
}

function objLabel(o) {
  if (o.informal_name) return o.informal_name
  return objAddr(o) || `Объект #${o.id}`
}

// Название объекта (без адреса) для отдельной колонки «Объект».
function objName(o) {
  return o.informal_name || objAddr(o) || `Объект #${o.id}`
}

// Адрес объекта одной строкой.
function objAddr(o) {
  const parts = [o.street_name, o.house && `д. ${o.house}`, o.building && `к. ${o.building}`].filter(Boolean)
  return parts.join(', ') || '—'
}

// Участки объекта + доверенные лица (с уровнем: весь объект или конкретный участок).
function ObjectExtras({ clientId, objectId, sections, onSectionsChange, links, onLinksChange }) {
  const { trustedByClient, fetchTrusted, addTrusted, updateTrusted, addSection, removeSection } = useClientsStore()
  const toast = useToast()
  const persons = trustedByClient[clientId] || []
  const emptyPf = { open: false, mode: 'create', id: null, last_name: '', first_name: '', name: '', phone: '', messengers: [], forSection: null }
  const [pf, setPf] = useState(emptyPf)
  // Черновики новых участков: каждая строка — поле + своя кнопка «Сохранить».
  const [drafts, setDrafts] = useState([])

  useEffect(() => { fetchTrusted(clientId) }, [clientId, fetchTrusted])

  // ── участки ──
  const addDraft = () => setDrafts((d) => [...d, { key: Date.now() + Math.random(), name: '' }])
  const updateDraft = (key, name) => setDrafts((d) => d.map((x) => (x.key === key ? { ...x, name } : x)))
  const removeDraft = (key) => setDrafts((d) => d.filter((x) => x.key !== key))
  const saveDraft = async (key) => {
    const d = drafts.find((x) => x.key === key)
    const name = (d?.name || '').trim()
    if (!name || !objectId) return
    try {
      const s = await addSection(objectId, name)
      onSectionsChange([...(sections || []), s]); removeDraft(key)
    } catch { toast.error('Не удалось добавить участок') }
  }
  const doRemoveSection = async (id) => {
    try {
      await removeSection(id)
      onSectionsChange((sections || []).filter((s) => s.id !== id))
      // снимаем назначение, висевшее на этом участке
      onLinksChange(links.filter((l) => l.section_id !== id))
    } catch { toast.error('Не удалось удалить участок') }
  }

  // ── доверенные лица: одно лицо на каждую «цель» (участок, либо объект если участков нет) ──
  const eq = (a, b) => (a ?? null) === (b ?? null)
  // Цели для назначения: участки (если есть) или сам объект.
  const targets = (sections && sections.length)
    ? sections.map((s) => ({ section_id: s.id, label: `📍 ${s.name}` }))
    : [{ section_id: null, label: '🏢 Объект целиком' }]
  const assignedFor = (sectionId) => links.find((l) => eq(l.section_id, sectionId))?.trusted_person_id ?? ''
  const setAssignment = (sectionId, personId) => {
    const rest = links.filter((l) => !eq(l.section_id, sectionId))
    onLinksChange(personId ? [...rest, { trusted_person_id: personId, section_id: sectionId ?? null }] : rest)
  }

  const onSelectFor = (sectionId, v) => {
    if (v === '__new__') { setPf({ ...emptyPf, open: true, mode: 'create', forSection: sectionId ?? null }); return }
    setAssignment(sectionId, v ? Number(v) : null)
  }
  const openEdit = (personId) => {
    const p = persons.find((x) => x.id === personId)
    if (!p) return
    const sp = splitName(p.name)
    setPf({ open: true, mode: 'edit', id: p.id, last_name: p.last_name ?? sp.last_name, first_name: p.first_name ?? sp.first_name, name: p.name, phone: p.phone || '', messengers: p.messengers || [], forSection: null })
  }
  const closePf = () => setPf(emptyPf)
  const savePf = async () => {
    if (!fullName(pf.last_name, pf.first_name)) { toast.error('Укажите фамилию или имя'); return }
    const payload = { last_name: pf.last_name.trim() || null, first_name: pf.first_name.trim() || null, name: fullName(pf.last_name, pf.first_name), phone: pf.phone || null, messengers: pf.messengers }
    try {
      if (pf.mode === 'edit') {
        await updateTrusted(pf.id, payload)
        await fetchTrusted(clientId)
      } else {
        const p = await addTrusted({ client_id: clientId, ...payload })
        await fetchTrusted(clientId)
        setAssignment(pf.forSection, p.id)
      }
      closePf()
    } catch { toast.error('Не удалось сохранить доверенное лицо') }
  }

  return (
    <>
      <div className="a-section-title">Участки {objectId ? <span className="a-count">{sections?.length || 0}</span> : ''}</div>
      {!objectId ? (
        <div className="a-muted" style={{ fontSize: '0.8rem', marginBottom: 4 }}>
          Участки можно добавить после сохранения объекта (кнопка «Создать» у названия).
        </div>
      ) : (
        <>
          {/* Сохранённые участки: поле + блёклая «Сохранено» */}
          {(sections || []).map((s) => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input className="a-input" style={{ flex: 1 }} value={s.name} disabled />
              <button type="button" className="a-btn a-btn--ghost a-btn--sm" disabled title="Участок сохранён">Сохранено</button>
              <button type="button" className="a-trusted-x" onClick={() => doRemoveSection(s.id)} title="Удалить участок">✕</button>
            </div>
          ))}
          {/* Черновики: поле + активная «Сохранить» */}
          {drafts.map((d) => (
            <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <input className="a-input" style={{ flex: 1 }} value={d.name} autoFocus
                placeholder="Номер или название участка"
                onChange={(e) => updateDraft(d.key, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); saveDraft(d.key) } }} />
              <button type="button" className="a-btn a-btn--primary a-btn--sm" disabled={!d.name.trim()} onClick={() => saveDraft(d.key)}>Сохранить</button>
              <button type="button" className="a-trusted-x" onClick={() => removeDraft(d.key)} title="Убрать строку">✕</button>
            </div>
          ))}
          <button type="button" className="a-btn a-btn--ghost a-btn--sm" style={{ marginTop: 6 }} onClick={addDraft}>+ Участок</button>
        </>
      )}

      <div className="a-section-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        Доверенные лица
        <button type="button" className="a-btn a-btn--ghost a-btn--sm"
          onClick={() => setPf({ ...emptyPf, open: true, mode: 'create', forSection: null })}>+ Доверенное лицо</button>
      </div>
      <div className="a-muted" style={{ fontSize: '0.78rem', marginBottom: 6 }}>
        Напротив каждого {sections?.length ? 'участка' : 'объекта'} — доверенное лицо из общего списка группы компаний.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {targets.map((t) => {
          const assignedId = assignedFor(t.section_id)
          return (
            <div key={String(t.section_id)} className="a-trust-row">
              <span className="a-trust-target">{t.label}</span>
              <select className="a-select" value={assignedId} onChange={(e) => onSelectFor(t.section_id, e.target.value)}>
                <option value="">— не назначено —</option>
                {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                <option value="__new__">➕ Создать нового…</option>
              </select>
              <button type="button" className="a-btn a-btn--ghost a-btn--sm" disabled={!assignedId}
                onClick={() => openEdit(Number(assignedId))} title="Редактировать лицо (имя, телефон, мессенджеры)">✎</button>
            </div>
          )
        })}
      </div>

      {pf.open && (
        <div className="a-card" style={{ padding: 12, marginTop: 4 }}>
          <div className="a-section-title" style={{ marginTop: 0 }}>
            {pf.mode === 'edit' ? 'Редактирование лица (применится во всей ГК)' : 'Новое доверенное лицо'}
          </div>
          <div className="a-field-row">
            <label className="a-field"><span>Фамилия</span>
              <input className="a-input" value={pf.last_name} autoFocus
                onChange={(e) => setPf({ ...pf, last_name: e.target.value })} placeholder="Иванов" />
            </label>
            <label className="a-field"><span>Имя</span>
              <input className="a-input" value={pf.first_name}
                onChange={(e) => setPf({ ...pf, first_name: e.target.value })} placeholder="Иван" />
            </label>
          </div>
          <PhoneMessengerField
            multi phone={pf.phone} messengers={pf.messengers}
            onChange={({ phone, messengers }) => setPf({ ...pf, phone, messengers })}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={closePf}>Отмена</button>
            <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={savePf} disabled={!fullName(pf.last_name, pf.first_name)}>
              {pf.mode === 'edit' ? 'Сохранить' : 'Добавить лицо'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// Центральный список доверенных лиц группы компаний: добавление / редактирование / удаление.
function GroupPersonsModal({ group, onClose }) {
  const { trustedByGroup, fetchGroupTrusted, addTrusted, updateTrusted, removeTrusted } = useClientsStore()
  const toast = useToast()
  const persons = trustedByGroup[group.id] || []
  const emptyPf = { open: false, mode: 'create', id: null, last_name: '', first_name: '', name: '', phone: '', messengers: [] }
  const [pf, setPf] = useState(emptyPf)

  useEffect(() => { fetchGroupTrusted(group.id) }, [group.id, fetchGroupTrusted])

  const openCreate = () => setPf({ ...emptyPf, open: true, mode: 'create' })
  const openEdit = (p) => { const sp = splitName(p.name); setPf({ open: true, mode: 'edit', id: p.id, last_name: p.last_name ?? sp.last_name, first_name: p.first_name ?? sp.first_name, name: p.name, phone: p.phone || '', messengers: p.messengers || [] }) }
  const close = () => setPf(emptyPf)
  const save = async () => {
    if (!fullName(pf.last_name, pf.first_name)) { toast.error('Укажите фамилию или имя'); return }
    const payload = { last_name: pf.last_name.trim() || null, first_name: pf.first_name.trim() || null, name: fullName(pf.last_name, pf.first_name), phone: pf.phone || null, messengers: pf.messengers }
    try {
      if (pf.mode === 'edit') await updateTrusted(pf.id, payload)
      else await addTrusted({ group_id: group.id, ...payload })
      await fetchGroupTrusted(group.id); close()
    } catch { toast.error('Не удалось сохранить') }
  }
  const del = async (p) => {
    if (!(await toast.confirm(`Удалить лицо «${p.name}»? Оно снимется со всех объектов группы.`))) return
    try { await removeTrusted(p.id); await fetchGroupTrusted(group.id) } catch { toast.error('Не удалось удалить') }
  }

  return (
    <Modal title={`Доверенные лица — ${group.name}`} onClose={onClose} width={520}>
      <div className="a-muted" style={{ fontSize: '0.8rem', marginBottom: 8 }}>
        Общий список лиц группы. Доступны для всех юрлиц и объектов этой ГК.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {persons.length === 0 && <div className="a-empty">Лиц пока нет</div>}
        {persons.map((p) => (
          <div key={p.id} className="a-trust-row">
            <span className="a-person-name" style={{ flex: '1 1 auto' }}>👤 {p.name}</span>
            <span className="a-person-phone a-muted">{p.phone || '—'}</span>
            <MessengerTag value={p.messengers} />
            <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={() => openEdit(p)} title="Редактировать">✎</button>
            <button type="button" className="a-btn a-btn--danger a-btn--sm" onClick={() => del(p)} title="Удалить">✕</button>
          </div>
        ))}
      </div>

      {!pf.open && (
        <button type="button" className="a-btn a-btn--ghost a-btn--sm" style={{ marginTop: 10 }} onClick={openCreate}>+ Доверенное лицо</button>
      )}

      {pf.open && (
        <div className="a-card" style={{ padding: 12, marginTop: 10 }}>
          <div className="a-section-title" style={{ marginTop: 0 }}>{pf.mode === 'edit' ? 'Редактирование лица' : 'Новое лицо'}</div>
          <div className="a-field-row">
            <label className="a-field"><span>Фамилия</span>
              <input className="a-input" autoFocus value={pf.last_name} onChange={(e) => setPf({ ...pf, last_name: e.target.value })} placeholder="Иванов" />
            </label>
            <label className="a-field"><span>Имя</span>
              <input className="a-input" value={pf.first_name} onChange={(e) => setPf({ ...pf, first_name: e.target.value })} placeholder="Иван" />
            </label>
          </div>
          <PhoneMessengerField
            multi phone={pf.phone} messengers={pf.messengers}
            onChange={({ phone, messengers }) => setPf({ ...pf, phone, messengers })}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={close}>Отмена</button>
            <button type="button" className="a-btn a-btn--primary a-btn--sm" onClick={save} disabled={!fullName(pf.last_name, pf.first_name)}>Сохранить</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

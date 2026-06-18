import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClientsStore } from '@/store/clientsStore'
import api from '@/lib/api'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { AddressAutocomplete } from '@/components/admin/AddressAutocomplete'
import { PhoneMessengerField, MessengerTag, TelegramIcon, MaxIcon } from '@/components/admin/PhoneMessengerField'
import { formatPhone, toNational, toFull, formatNat } from '@/lib/phone'
import { ClientRecipients } from '@/components/admin/ClientRecipients'
import { TrustedPersonChannels } from '@/components/admin/TrustedPersonChannels'

const PAY = { cashless: 'Безнал', cash: 'Нал' }

// Достаём осмысленную причину из ответа API (раскрываем «глухие» тосты).
const apiErr = (e, fallback) => {
  const d = e?.response?.data
  const reason = d?.error || d?.message || e?.message
  return reason ? `${fallback}: ${reason}` : fallback
}

// Сборка/разбор «Фамилия Имя» для доверенных лиц.
const fullName = (last, first) => [last, first].map((s) => (s || '').trim()).filter(Boolean).join(' ')
const splitName = (name) => {
  const s = (name || '').trim()
  const i = s.indexOf(' ')
  return i < 0 ? { last_name: s, first_name: '' } : { last_name: s.slice(0, i), first_name: s.slice(i + 1).trim() }
}

// Тип клиента (ООО/ИП) определяем по названию — отдельное поле не нужно,
// DaData и так отдаёт короткое имя с правовой формой («ООО …» / «ИП …»).
const deriveType = (name) => /^\s*(ИП|ИНДИВИДУАЛЬНЫЙ\s+ПРЕДПРИНИМАТЕЛЬ)\b/i.test(name || '') ? 'ip' : 'ooo'

// Буква для «аватара» компании — из имени без правовой формы и кавычек.
function clientInitial(c) {
  const base = (c.legal_name || '')
    .replace(/^(ООО|ИП|АО|ЗАО|ПАО|ОАО)\s*/i, '')
    .replace(/[«»"'`]/g, '')
    .trim()
  return (base[0] || c.legal_name?.[0] || '?').toUpperCase()
}

const emptyClient = {
  type: 'ooo', legal_name: '', inn: '', kpp: '', ogrn: '',
  legal_address: '', bank_name: '', bank_account: '', bik: '', corr_account: '',
  email: '', phone: '', default_payment_method: 'cashless',
  group_id: '', chats: {},
}

const emptyObject = {
  city: '', street_id: '', street_name: '', district_id: '', district: '', district_alias: '',
  address_raw: '', house: '', building: '', informal_name: '', requires_photo: true, note: '',
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
  const [pullingInn, setPullingInn] = useState(false)
  const [bankQuery, setBankQuery] = useState('')   // БИК или название банка для DaData
  const [pullingBank, setPullingBank] = useState(false)
  const [objModal, setObjModal] = useState(null) // { clientId, object }
  const [objForm, setObjForm] = useState(emptyObject)
  const [objSaving, setObjSaving] = useState(false)
  const [groupModal, setGroupModal] = useState(null) // group modal
  const [groupForm, setGroupForm] = useState({ name: '', note: '' })
  const [personsModal, setPersonsModal] = useState(null) // ГК для управления списком лиц
  const [clientPersonsModal, setClientPersonsModal] = useState(null) // клиент вне ГК — свой список лиц
  const [msgrModal, setMsgrModal] = useState(null) // настройки мессенджеров клиента (отдельным окном)

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
    delete payload.id; delete payload.created_at // строго-валидатор не примет служебные ключи
    Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k] })
    payload.chats = form.chats || {}
    payload.type = deriveType(form.legal_name)
    payload.legal_name = form.legal_name
    payload.default_payment_method = form.default_payment_method
    payload.group_id = groupId
    try {
      if (editing.id) {
        await updateClient(editing.id, payload)
        toast.success('Сохранено')
      } else {
        const created = await addClient(payload)
        if (created?.id) {
          // Сразу раскрываем нового клиента (и его группу) — чтобы была видна кнопка «+ Объект».
          if (created.group_id) setOpenGroups((p) => new Set(p).add(created.group_id))
          setExpanded(created.id)
          fetchObjects(created.id)
          // НЕ закрываем окно: теперь у клиента есть id → прямо здесь появятся карточки
          // получателей (MAX/Telegram) без повторного открытия модалки. (как у объектов)
          setEditing(created)
          toast.success('Клиент сохранён — ниже подключите группу для отчётов')
        }
      }
    } catch (e) {
      const d = e?.response?.data
      let msg = 'Ошибка сохранения'
      if (d?.error === 'conflict') msg = 'Дубликат: клиент с таким ИНН уже есть'
      else if (d?.error === 'fk_violation') msg = 'Неверная ссылка (группа компаний?)'
      else if (d?.error === 'validation' && Array.isArray(d.issues)) {
        // Показываем понятные русские сообщения из валидатора (по одному на поле).
        const msgs = [...new Set(d.issues.map((i) => i.message).filter(Boolean))]
        msg = msgs.length ? msgs.join('. ') : 'Проверьте правильность заполнения полей'
      } else if (d?.error) msg = `Ошибка сохранения: ${d.error}`
      toast.error(msg)
    }
  }
  const delClient = async (c) => {
    if (!(await toast.confirm(`Удалить клиента «${c.legal_name}»? Удалить можно только клиента без объектов и заявок.`))) return
    try { await removeClient(c.id); toast.success('Удалено') }
    catch { toast.error('Нельзя удалить: у клиента есть объекты или заявки — сначала удалите их') }
  }

  // ── object modal ──
  const openObject = (clientId, o) => {
    setObjForm(o ? {
      ...emptyObject, ...o,
      street_name: o.street_name || '', district: o.district || '', address_raw: o.address_raw || '',
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
    address_raw: objForm.address_raw || undefined,
    house: objForm.house || undefined,
    building: objForm.building || undefined,
    informal_name: objForm.informal_name || undefined,
    note: objForm.note || undefined,
    requires_photo: objForm.requires_photo === false ? false : true,
    lat: objForm.lat === '' || objForm.lat == null ? undefined : Number(objForm.lat),
    lng: objForm.lng === '' || objForm.lng == null ? undefined : Number(objForm.lng),
    geo_source: objForm.geo_source || undefined,
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
    } catch (e) { toast.error(apiErr(e, 'Ошибка сохранения объекта')) }
    finally { setObjSaving(false) }
  }

  const saveObject = async () => {
    try {
      if (objModal.object?.id) await updateObject(objModal.object.id, objPayload())
      else await addObject(objPayload())
      const objs = await fetchObjects(objModal.clientId)
      loadInventory(objs)
      toast.success('Объект сохранён'); closeObject()
    } catch (e) { toast.error(apiErr(e, 'Ошибка сохранения объекта')) }
  }
  const delObject = async (clientId, o) => {
    if (!(await toast.confirm(`Удалить объект «${objLabel(o)}»?`))) return
    try { await removeObject(o.id, clientId); toast.success('Удалено') } catch { toast.error('Нельзя удалить (есть заявки?)') }
  }
  // Автозаполнение реквизитов клиента по ИНН через DaData.
  const pullClientByInn = async () => {
    const query = (form.inn || '').trim()
    if (!query) { toast.error('Сначала укажите ИНН'); return }
    setPullingInn(true)
    try {
      const { data } = await api.post('/settings/dadata/party', { query })
      setForm((f) => ({
        ...f,
        // Короткое название с правовой формой («ООО "АЛВА"»), а не полное «ОБЩЕСТВО С…».
        legal_name: data.company_name || data.legal_name || f.legal_name,
        inn: data.inn || f.inn,
        kpp: data.kpp || f.kpp,
        ogrn: data.ogrn || f.ogrn,
        legal_address: data.legal_address || f.legal_address,
      }))
      toast.success('Реквизиты подтянуты из DaData — проверьте и сохраните')
    } catch (e) {
      const err = e?.response?.data?.error
      toast.error(
        err === 'dadata_token_missing' ? 'Токен DaData не задан в Настройках'
          : err === 'not_found' ? 'Организация по ИНН не найдена'
            : 'Не удалось получить данные DaData',
      )
    } finally { setPullingInn(false) }
  }
  // Автозаполнение банковских реквизитов по БИК или названию через DaData (одно поле).
  const pullBank = async () => {
    const query = bankQuery.trim()
    if (!query) { toast.error('Введите БИК или название банка'); return }
    setPullingBank(true)
    try {
      const { data } = await api.post('/settings/dadata/bank', { query })
      const b = Array.isArray(data) ? data[0] : null
      if (!b) { toast.error('Банк не найден'); return }
      setForm((f) => ({ ...f, bank_name: b.bank_name || f.bank_name, bik: b.bik || f.bik, corr_account: b.corr_account || f.corr_account }))
      toast.success('Банк подтянут из DaData — проверьте и сохраните')
    } catch (e) {
      const err = e?.response?.data?.error
      toast.error(err === 'dadata_token_missing' ? 'Токен DaData не задан в Настройках' : 'Не удалось получить данные банка')
    } finally { setPullingBank(false) }
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
  // Копируем «lat, lng» в буфер — удобно вставить в поисковик/карты.
  const copyCoords = async () => {
    if (objForm.lat == null || objForm.lat === '' || objForm.lng == null || objForm.lng === '') {
      toast.error('Координаты не заданы'); return
    }
    const text = `${objForm.lat}, ${objForm.lng}`
    try {
      await navigator.clipboard.writeText(text)
      toast.success(`Скопировано: ${text}`)
    } catch { toast.error('Не удалось скопировать') }
  }

  const q = search.trim().toLowerCase()
  const filtered = clients.filter((c) =>
    !q || c.legal_name?.toLowerCase().includes(q) || c.inn?.includes(q)
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
                <span className="a-client-id" style={{ display: 'grid', gridTemplateColumns: 'minmax(200px, 2fr) 1fr 1fr', alignItems: 'center', gap: 14 }}>
                  <span className="a-client-legal">{c.legal_name}</span>
                  <span className="a-muted">{c.inn ? `ИНН ${c.inn}` : '—'}</span>
                  <span className="a-muted">{PAY[c.default_payment_method] || '—'}</span>
                </span>
                <div className="a-actions">
                  {!c.group_id && (
                    <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => { e.stopPropagation(); setClientPersonsModal(c) }} title="Доверенные лица — получают отчёты о выполнении заявок и служат контактами для водителей на конкретном объекте или участке">👤 Доверенные лица</button>
                  )}
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
                            <span className="a-obj-title">
                              🏢 {objName(o)}
                              {o.requires_photo !== false
                                ? <span className="a-obj-photo" title="Требуется фотоотчёт"> · 📷</span>
                                : <span className="a-obj-photo a-muted" title="Фотоотчёт не требуется"> · без фото</span>}
                            </span>
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
                                    <span className="a-person-phone a-muted">{r.person.phone ? formatPhone(r.person.phone) : '—'}</span>
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
                  <button className="a-btn a-btn--ghost a-btn--sm" onClick={(e) => { e.stopPropagation(); setPersonsModal(group) }} title="Доверенные лица — получают отчёты о выполнении заявок и служат контактами для водителей на конкретном объекте или участке">👤 Доверенные лица</button>
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
          title={editing.id ? editing.legal_name : 'Новый клиент'}
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
          {/* ИНН выше названия: вводим ИНН → «По ИНН» подтягивает короткое название и реквизиты.
              Тип (ООО/ИП) отдельным полем не нужен — определяем по названию автоматически. */}
          <div className="a-field-row" style={{ alignItems: 'flex-end' }}>
            <label className="a-field"><span>ИНН <b style={{ color: '#ff4655' }}>*</b></span>
              <input className="a-input" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pullClientByInn() } }} />
            </label>
            <label className="a-field"><span>КПП</span>
              <input className="a-input" value={form.kpp} onChange={(e) => setForm({ ...form, kpp: e.target.value })} />
            </label>
            <button type="button" className="a-btn a-btn--soft" style={{ flex: '0 0 auto', whiteSpace: 'nowrap', height: 40, boxSizing: 'border-box' }}
              onClick={pullClientByInn} disabled={pullingInn} title="Заполнить название и реквизиты по ИНН через DaData">
              {pullingInn ? '…' : '↧ По ИНН'}
            </button>
          </div>
          <label className="a-field"><span>Наименование юридического лица <b style={{ color: '#ff4655' }}>*</b></span>
            <input className="a-input" value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} placeholder="ООО «Пример»" />
          </label>
          <label className="a-field"><span>Оплата по умолчанию <b style={{ color: '#ff4655' }}>*</b></span>
            <select className="a-select" value={form.default_payment_method} onChange={(e) => setForm({ ...form, default_payment_method: e.target.value })}>
              <option value="cashless">Безнал</option><option value="cash">Нал</option>
            </select>
          </label>
          {/* ОГРН — на всю ширину, чтобы помещалась вся запись (13–15 цифр). */}
          <label className="a-field"><span>ОГРН</span>
            <input className="a-input" value={form.ogrn} onChange={(e) => setForm({ ...form, ogrn: e.target.value })} />
          </label>
          {/* Юр. адрес — в две строки на случай длинного адреса. */}
          <label className="a-field"><span>Юр. адрес</span>
            <textarea className="a-input" rows={2} style={{ resize: 'vertical' }}
              value={form.legal_address} onChange={(e) => setForm({ ...form, legal_address: e.target.value })} />
          </label>
          <div className="a-field-row">
            <label className="a-field"><span>Телефон</span>
              <input className="a-input" inputMode="tel" placeholder="+7 9XX XXX-XX-XX"
                value={'+7' + (toNational(form.phone) ? ' ' + formatNat(toNational(form.phone)) : ' ')}
                onChange={(e) => setForm({ ...form, phone: toFull(toNational(e.target.value)) })} />
            </label>
            <label className="a-field"><span>E-mail</span>
              <input className="a-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
          </div>
          <div className="a-section-title">Групповой чат для отчётов</div>
          {editing.id ? (
            <>
              <div className="a-note" style={{ marginBottom: 8 }}>
                Подключение мессенджеров заказчика (MAX, Telegram) для отчётов — отдельным окном.
                Статусы сохраняются сразу при включении. Чтобы отчёты приходили конкретным лицам —
                раздел «Доверенные лица».
              </div>
              <button type="button" className="a-btn a-btn--soft" style={{ width: '100%' }}
                onClick={() => setMsgrModal(editing)}>✉️ Настроить мессенджеры для отчётов</button>
            </>
          ) : (
            <div className="a-note">
              Здесь подключается групповой чат заказчика — туда уходит отчёт, когда подтверждаешь
              заявку. <b>Настройка мессенджеров (MAX и Telegram) станет доступна после сохранения
              клиента</b>: заполни данные и нажми «Сохранить» внизу — окно не закроется. Чтобы отчёты
              приходили конкретным лицам — раздел «Доверенные лица».
            </div>
          )}

          <div className="a-section-title">Банковские реквизиты</div>
          {/* Автозаполнение по БИК или названию банка через DaData (одно поле). */}
          <label className="a-field"><span>Поиск банка (БИК или название)</span>
            <div className="a-fieldrow">
              <input className="a-input" value={bankQuery} placeholder="044525225 или «Сбербанк»"
                onChange={(e) => setBankQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pullBank() } }} />
              <button type="button" className="a-btn a-btn--soft" onClick={pullBank} disabled={pullingBank}
                title="Подтянуть банк, БИК и корр. счёт через DaData" style={{ whiteSpace: 'nowrap' }}>{pullingBank ? '…' : '↧ Найти'}</button>
            </div>
          </label>
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
        </Modal>
      )}

      {/* ── Модалка мессенджеров для отчётов (отдельным окном поверх карточки клиента) ── */}
      {msgrModal && (
        <Modal
          title={`Мессенджеры для отчётов — ${msgrModal.legal_name}`}
          onClose={() => setMsgrModal(null)}
          width={560}
          footer={<button className="a-btn a-btn--primary" onClick={() => setMsgrModal(null)}>Применить</button>}
        >
          <ClientRecipients clientId={msgrModal.id} />
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
          <label className="a-field"><span>Адрес (поиск по РФ)</span>
            <AddressAutocomplete
              key={objModal.object?.id ?? 'new'}
              value={objForm.address_raw}
              onPick={(s) => setObjForm((f) => ({
                ...f,
                address_raw: s.value,
                city: s.city || f.city,
                house: s.house || f.house,
                lat: s.lat ?? '', lng: s.lng ?? '',
                geo_source: s.lat != null ? 'dadata' : f.geo_source,
                // свободный адрес → справочник Краснодара не используем
                street_id: '', street_name: '', district_id: '', district: '', district_alias: '',
              }))}
            />
          </label>
          <label className="a-field"><span>Город (населённый пункт)</span>
            <input className="a-input" value={objForm.city} onChange={(e) => setObjForm({ ...objForm, city: e.target.value })} placeholder="Краснодар" />
          </label>
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

          <div className="a-field-row">
            <label className="a-field"><span>Широта (lat)</span>
              <input className="a-input" inputMode="decimal" value={objForm.lat ?? ''} placeholder="45.0355"
                onChange={(e) => setObjForm({ ...objForm, lat: e.target.value, geo_source: 'manual' })} />
            </label>
            <label className="a-field"><span>Долгота (lng)</span>
              <input className="a-input" inputMode="decimal" value={objForm.lng ?? ''} placeholder="38.9753"
                onChange={(e) => setObjForm({ ...objForm, lng: e.target.value, geo_source: 'manual' })} />
            </label>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            <button type="button" className="a-btn a-btn--ghost" style={{ flex: 1 }} onClick={geocodeObj}
              title="Определить координаты по адресу через Яндекс">🔍 По адресу</button>
            <button type="button" className="a-btn a-btn--ghost" style={{ flex: 1 }} onClick={copyCoords}
              disabled={objForm.lat == null || objForm.lat === '' || objForm.lng == null || objForm.lng === ''}
              title="Скопировать координаты в буфер обмена">📋 Копировать координаты</button>
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
            onSectionsChange={(sections) => setObjForm((f) => ({ ...f, sections }))}
            links={objForm.trusted_links}
            onLinksChange={(trusted_links) => setObjForm((f) => ({ ...f, trusted_links }))}
            onRemoveSection={(id) => setObjForm((f) => ({
              ...f,
              sections: (f.sections || []).filter((s) => s.id !== id),
              trusted_links: (f.trusted_links || []).filter((l) => l.section_id !== id),
            }))}
          />

          <label className="a-field"><span>Фотоотчёт</span>
            <select className="a-select"
              value={objForm.requires_photo === false ? 'false' : 'true'}
              onChange={(e) => setObjForm({ ...objForm, requires_photo: e.target.value === 'true' })}>
              <option value="true">Необходим</option>
              <option value="false">Не требуется</option>
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

      {/* ── Модалка доверенных лиц одиночного клиента (вне ГК) ── */}
      {clientPersonsModal && (
        <ClientPersonsModal client={clientPersonsModal} onClose={() => setClientPersonsModal(null)} />
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

// Адрес объекта одной строкой. Фолбэк на свободный address_raw (DaData, любой город).
function objAddr(o) {
  const parts = [o.street_name, o.house && `д. ${o.house}`, o.building && `к. ${o.building}`].filter(Boolean)
  return parts.join(', ') || o.address_raw || '—'
}

// Участки объекта + доверенные лица (с уровнем: весь объект или конкретный участок).
function ObjectExtras({ clientId, objectId, sections, onSectionsChange, links, onLinksChange, onRemoveSection }) {
  const { trustedByClient, fetchTrusted, addSection, removeSection } = useClientsStore()
  const toast = useToast()
  const persons = trustedByClient[clientId] || []
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
    } catch (e) { toast.error(apiErr(e, 'Не удалось добавить участок')) }
  }
  const doRemoveSection = async (id) => {
    try {
      await removeSection(id)
      onRemoveSection(id) // атомарно убирает и участок, и висевшее на нём лицо
    } catch (e) { toast.error(apiErr(e, 'Не удалось удалить участок')) }
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

  const onSelectFor = (sectionId, v) => setAssignment(sectionId, v ? Number(v) : null)

  return (
    <>
      <div className="a-section-title">Участки</div>
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

      <div className="a-section-title">Доверенные лица</div>
      <div className="a-note">
        Напротив каждого {sections?.length ? 'участка' : 'объекта'} — лицо из списка клиента/ГК. Создаются и редактируются кнопкой «👤 Лица» у клиента или группы.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
        {targets.map((t) => {
          const assignedId = assignedFor(t.section_id)
          return (
            <div key={String(t.section_id)} className="a-trust-row">
              <span className="a-trust-target">{t.label}</span>
              <select className="a-select" value={assignedId} title={persons.find((p) => p.id === assignedId)?.name || ''}
                onChange={(e) => onSelectFor(t.section_id, e.target.value)}>
                <option value="">— не назначено —</option>
                {persons.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )
        })}
      </div>
    </>
  )
}

// Центральный список доверенных лиц одиночного клиента (вне ГК).
// TG-значок лица в списке: зелёный = привязан (active), янтарный = приглашение
// отправлено (pending), серый = мессенджер выбран, но привязки ещё нет.
function PersonTgTag({ on, status }) {
  if (!on) return null
  const cls = status === 'active' ? 'is-active' : status === 'pending' ? 'is-pending' : 'is-off'
  const title = status === 'active'
    ? 'Telegram привязан — отчёты приходят'
    : status === 'pending'
      ? 'Приглашение отправлено — ожидает'
      : 'Telegram выбран, но не привязан'
  return <span className={'a-mtag a-mtag--tg ' + cls} title={title}><TelegramIcon /></span>
}

// Зеркало GroupPersonsModal, но пул считается по клиенту (poolForClient).
function ClientPersonsModal({ client, onClose }) {
  const { trustedByClient, fetchTrusted, addTrusted, updateTrusted, removeTrusted } = useClientsStore()
  const toast = useToast()
  const persons = trustedByClient[client.id] || []
  const emptyPf = { open: false, mode: 'create', id: null, last_name: '', first_name: '', name: '', phone: '', messengers: [], chats: {} }
  const [pf, setPf] = useState(emptyPf)

  useEffect(() => { fetchTrusted(client.id) }, [client.id, fetchTrusted])

  const openCreate = () => setPf({ ...emptyPf, open: true, mode: 'create' })
  const openEdit = (p) => { const sp = splitName(p.name); setPf({ open: true, mode: 'edit', id: p.id, last_name: p.last_name ?? sp.last_name, first_name: p.first_name ?? sp.first_name, name: p.name, phone: p.phone || '', messengers: p.messengers || [], chats: p.chats || {} }) }
  const close = () => setPf(emptyPf)
  const save = async () => {
    if (!fullName(pf.last_name, pf.first_name)) { toast.error('Укажите фамилию или имя'); return }
    const payload = { last_name: pf.last_name.trim() || null, first_name: pf.first_name.trim() || null, name: fullName(pf.last_name, pf.first_name), phone: pf.phone || null, messengers: pf.messengers, chats: pf.chats || {} }
    try {
      if (pf.mode === 'edit') await updateTrusted(pf.id, payload)
      else await addTrusted({ client_id: client.id, ...payload })
      await fetchTrusted(client.id); close()
    } catch { toast.error('Не удалось сохранить') }
  }
  const del = async (p) => {
    if (!(await toast.confirm(`Удалить лицо «${p.name}»? Оно снимется со всех объектов клиента.`))) return
    try { await removeTrusted(p.id); await fetchTrusted(client.id) } catch { toast.error('Не удалось удалить') }
  }
  const reloadPersons = () => fetchTrusted(client.id)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => { setRefreshing(true); try { await reloadPersons() } finally { setRefreshing(false) } }
  const pfTgStatus = persons.find((x) => x.id === pf.id)?.tg_status
  const pfMaxStatus = persons.find((x) => x.id === pf.id)?.max_status

  return (
    <Modal title={`Доверенные лица — ${client.legal_name}`} onClose={onClose} width={520}>
      <div className="a-persons-head">
        <div className="a-muted" style={{ fontSize: '0.8rem' }}>
          Общий список лиц клиента. Доступны на всех его объектах. Если клиента позже добавить в группу компаний, лицами управляют на уровне ГК.
        </div>
        <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={refresh} disabled={refreshing} title="Обновить статусы привязки Telegram">{refreshing ? '…' : '↻ Обновить'}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {persons.length === 0 && <div className="a-empty">Лиц пока нет</div>}
        {persons.map((p) => (
          <div key={p.id} className="a-person-row">
            <span className="a-person-name">👤 {p.name}</span>
            <span className="a-person-phone a-muted">{p.phone ? formatPhone(p.phone) : '—'}</span>
            <span className="a-person-tg"><PersonTgTag on={(p.messengers || []).includes('telegram')} status={p.tg_status} /></span>
            <span className="a-person-max">{(p.messengers || []).includes('max') && <MaxIcon />}</span>
            <span className="a-person-row-actions">
              <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={() => openEdit(p)} title="Редактировать">✎</button>
              <button type="button" className="a-btn a-btn--danger a-btn--sm" onClick={() => del(p)} title="Удалить">✕</button>
            </span>
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
          <TrustedPersonChannels
            personId={pf.mode === 'edit' ? pf.id : null}
            personName={pf.first_name || pf.name}
            tgStatus={pfTgStatus}
            maxStatus={pfMaxStatus}
            hasTg={(pf.messengers || []).includes('telegram')}
            hasMax={(pf.messengers || []).includes('max')}
            onChanged={reloadPersons}
          />
          <div className="a-form-actions">
            <button type="button" className="a-btn a-btn--ghost" onClick={close}>Отмена</button>
            <button type="button" className="a-btn a-btn--primary" onClick={save} disabled={!fullName(pf.last_name, pf.first_name)}>Сохранить</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

// Центральный список доверенных лиц группы компаний: добавление / редактирование / удаление.
function GroupPersonsModal({ group, onClose }) {
  const { trustedByGroup, fetchGroupTrusted, addTrusted, updateTrusted, removeTrusted } = useClientsStore()
  const toast = useToast()
  const persons = trustedByGroup[group.id] || []
  const emptyPf = { open: false, mode: 'create', id: null, last_name: '', first_name: '', name: '', phone: '', messengers: [], chats: {} }
  const [pf, setPf] = useState(emptyPf)

  useEffect(() => { fetchGroupTrusted(group.id) }, [group.id, fetchGroupTrusted])

  const openCreate = () => setPf({ ...emptyPf, open: true, mode: 'create' })
  const openEdit = (p) => { const sp = splitName(p.name); setPf({ open: true, mode: 'edit', id: p.id, last_name: p.last_name ?? sp.last_name, first_name: p.first_name ?? sp.first_name, name: p.name, phone: p.phone || '', messengers: p.messengers || [], chats: p.chats || {} }) }
  const close = () => setPf(emptyPf)
  const save = async () => {
    if (!fullName(pf.last_name, pf.first_name)) { toast.error('Укажите фамилию или имя'); return }
    const payload = { last_name: pf.last_name.trim() || null, first_name: pf.first_name.trim() || null, name: fullName(pf.last_name, pf.first_name), phone: pf.phone || null, messengers: pf.messengers, chats: pf.chats || {} }
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
  const reloadPersons = () => fetchGroupTrusted(group.id)
  const [refreshing, setRefreshing] = useState(false)
  const refresh = async () => { setRefreshing(true); try { await reloadPersons() } finally { setRefreshing(false) } }
  const pfTgStatus = persons.find((x) => x.id === pf.id)?.tg_status
  const pfMaxStatus = persons.find((x) => x.id === pf.id)?.max_status

  return (
    <Modal title={`Доверенные лица — ${group.name}`} onClose={onClose} width={520}>
      <div className="a-persons-head">
        <div className="a-muted" style={{ fontSize: '0.8rem' }}>
          Общий список лиц группы. Доступны для всех юрлиц и объектов этой ГК.
        </div>
        <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={refresh} disabled={refreshing} title="Обновить статусы привязки Telegram">{refreshing ? '…' : '↻ Обновить'}</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {persons.length === 0 && <div className="a-empty">Лиц пока нет</div>}
        {persons.map((p) => (
          <div key={p.id} className="a-person-row">
            <span className="a-person-name">👤 {p.name}</span>
            <span className="a-person-phone a-muted">{p.phone ? formatPhone(p.phone) : '—'}</span>
            <span className="a-person-tg"><PersonTgTag on={(p.messengers || []).includes('telegram')} status={p.tg_status} /></span>
            <span className="a-person-max">{(p.messengers || []).includes('max') && <MaxIcon />}</span>
            <span className="a-person-row-actions">
              <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={() => openEdit(p)} title="Редактировать">✎</button>
              <button type="button" className="a-btn a-btn--danger a-btn--sm" onClick={() => del(p)} title="Удалить">✕</button>
            </span>
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
          <TrustedPersonChannels
            personId={pf.mode === 'edit' ? pf.id : null}
            personName={pf.first_name || pf.name}
            tgStatus={pfTgStatus}
            maxStatus={pfMaxStatus}
            hasTg={(pf.messengers || []).includes('telegram')}
            hasMax={(pf.messengers || []).includes('max')}
            onChanged={reloadPersons}
          />
          <div className="a-form-actions">
            <button type="button" className="a-btn a-btn--ghost" onClick={close}>Отмена</button>
            <button type="button" className="a-btn a-btn--primary" onClick={save} disabled={!fullName(pf.last_name, pf.first_name)}>Сохранить</button>
          </div>
        </div>
      )}
    </Modal>
  )
}

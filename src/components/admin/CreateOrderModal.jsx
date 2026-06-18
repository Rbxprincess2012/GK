import { useState, useEffect, useMemo } from 'react'
import { useClientsStore } from '@/store/clientsStore'
import { useOrdersStore } from '@/store/ordersStore'
import { useContainersStore } from '@/store/containersStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { TimeSlotSelect } from '@/components/admin/DesiredTime'
import { DateField } from '@/components/admin/DateField'
import api from '@/lib/api'

const ACTIONS = [['place', 'Установить'], ['replace', 'Заменить'], ['haul', 'Забрать']]
const clientLabel = (c) => c.legal_name || `Клиент #${c.id}`
// Лейбл объекта: неформальное имя без дубля заказчика. Объекты часто названы
// «<Заказчик> · <Объект>» — заказчик уже выбран рядом, поэтому срезаем его префикс
// (а если имя ровно = заказчику — показываем адрес).
const objLabel = (o, clientNames = []) => {
  let inf = (o.informal_name || '').trim()
  for (const raw of clientNames) {
    const name = (raw || '').trim()
    if (!name) continue
    const low = inf.toLowerCase()
    if (low === name.toLowerCase()) { inf = ''; break }
    if (low.startsWith(name.toLowerCase())) {
      const rest = inf.slice(name.length).replace(/^[\s·•\-—,|/]+/, '').trim()
      if (rest) { inf = rest; break }
    }
  }
  const addr = [o.street_name, o.house && `д. ${o.house}`].filter(Boolean).join(', ')
  return inf || addr || `Объект №${o.id}`
}

const newItem = () => ({ action: 'replace', section_id: '', quantity: 1, container_type_id: '', container_numbers: '' })

// Ручное создание заявки менеджером (статус new → дальше распределяется как обычно).
export function CreateOrderModal({ onClose, onCreated }) {
  const { clients, fetchClients, objectsByClient, fetchObjects } = useClientsStore()
  const { addOrder } = useOrdersStore()
  const { types: contTypes, fetchTypes } = useContainersStore()
  const toast = useToast()

  const [clientId, setClientId] = useState('')
  const [objectId, setObjectId] = useState('')
  const [service, setService] = useState('container') // тип услуги = slug типа машины
  const [vtypes, setVtypes] = useState([])            // справочник типов машин
  const [grappleRuns, setGrappleRuns] = useState(1)   // число ходок (навальный вывоз)
  const [items, setItems] = useState([newItem()])
  const [desiredDate, setDesiredDate] = useState('')
  const [desiredTime, setDesiredTime] = useState('')
  const [payment, setPayment] = useState('cashless')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchClients(); fetchTypes() }, [fetchClients, fetchTypes])
  useEffect(() => { api.get('/vehicle-types', { params: { active: 1 } }).then(({ data }) => setVtypes(data)).catch(() => {}) }, [])

  // Смена клиента → грузим его объекты, сбрасываем зависимые поля.
  const changeClient = (id) => {
    setClientId(id); setObjectId('')
    if (!id) return
    fetchObjects(Number(id))
    const c = clients.find((x) => x.id === Number(id))
    if (c?.default_payment_method) setPayment(c.default_payment_method)
  }

  // Заказчики в дропдауне — по алфавиту (как видит менеджер: ник/название).
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'ru')),
    [clients],
  )
  const objects = useMemo(() => objectsByClient[Number(clientId)] || [], [objectsByClient, clientId])
  const selectedClient = clients.find((x) => x.id === Number(clientId))
  const clientNames = [selectedClient?.legal_name]
  const currentObject = objects.find((o) => o.id === Number(objectId))
  const sections = currentObject?.sections || []

  // Стандартный размер: отмеченный в настройках (is_default), иначе первый из справочника.
  // Если в позиции размер не выбран — подставляем стандартный (и в отображении, и при сохранении).
  const defaultTypeId = useMemo(() => (contTypes.find((t) => t.is_default) || contTypes[0])?.id ?? '', [contTypes])
  const sizeOf = (it) => (it.container_type_id !== '' ? it.container_type_id : (defaultTypeId !== '' ? String(defaultTypeId) : ''))

  const changeObject = (id) => setObjectId(id)

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const addRow = () => setItems((arr) => [...arr, newItem()])
  const delRow = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i))

  const canSave = useMemo(() => Number(objectId) > 0 && !saving, [objectId, saving])

  // Навальный вывоз = любой тип ≠ 'container' (грейфер/газель/самосвал): без контейнеров.
  const isBulk = service !== 'container'

  const save = async () => {
    if (!Number(objectId)) { toast.error('Выберите объект'); return }
    const payloadItems = isBulk ? [] : items
      .filter((it) => Number(it.quantity) > 0)
      .map((it) => ({
        action: it.action,
        section_id: it.section_id === '' ? null : Number(it.section_id),
        quantity: Number(it.quantity),
        // Набор полей не зависит от действия: отправляем то, что заполнил менеджер
        // (размер подставляется стандартным; номер уходит как есть, даже на «Установить»).
        container_type_id: sizeOf(it) !== '' ? Number(sizeOf(it)) : null,
        container_numbers: it.container_numbers?.trim() || null,
      }))
    const payload = {
      object_id: Number(objectId),
      desired_date: desiredDate || undefined,
      desired_time: desiredTime || undefined,
      payment_method: payment,
      amount: payment === 'cash' && amount !== '' ? Number(amount) : null,
      note: note.trim() || undefined,
      ...(isBulk
        ? { service_type: service, grapple_runs: Math.max(1, Number(grappleRuns) || 1) }
        : { service_type: 'container', ...(payloadItems.length ? { items: payloadItems } : {}) }),
    }
    setSaving(true)
    try {
      await addOrder(payload)
      toast.success('Заявка создана')
      onCreated?.()
    } catch {
      toast.error('Не удалось создать заявку')
    } finally { setSaving(false) }
  }

  return (
    <Modal
      title="Новая заявка"
      onClose={onClose}
      width={820}
      footer={<>
        <button className="a-btn a-btn--ghost" onClick={onClose}>Отмена</button>
        <button className="a-btn a-btn--primary" onClick={save} disabled={!canSave}>Создать</button>
      </>}
    >
      <div className="a-field-row">
        <label className="a-field"><span>Заказчик *</span>
          <select className="a-select" value={clientId} onChange={(e) => changeClient(e.target.value)}>
            <option value="">— выберите —</option>
            {sortedClients.map((c) => <option key={c.id} value={c.id}>{clientLabel(c)}</option>)}
          </select>
        </label>
        <label className="a-field"><span>Объект *</span>
          <select className="a-select" value={objectId} onChange={(e) => changeObject(e.target.value)} disabled={!clientId}>
            <option value="">{clientId ? '— выберите —' : 'сначала заказчик'}</option>
            {objects.map((o) => <option key={o.id} value={o.id}>{objLabel(o, clientNames)}</option>)}
          </select>
        </label>
      </div>

      <div className="a-section-title">Тип услуги (тип машины)</div>
      <div className="a-field-row">
        <label className="a-field"><span>Услуга</span>
          <select className="a-select" value={service} onChange={(e) => setService(e.target.value)}>
            {vtypes.length === 0 && <option value="container">Контейнеры</option>}
            {vtypes.map((t) => <option key={t.slug} value={t.slug}>{t.carries_containers ? t.name : `${t.name} (вывоз навалом)`}</option>)}
          </select>
        </label>
        {isBulk && (
          <label className="a-field"><span>Число ходок</span>
            <input className="a-input" type="number" min={1} value={grappleRuns}
              onChange={(e) => setGrappleRuns(e.target.value)} title="Сколько кузовов/ходок" />
          </label>
        )}
      </div>

      {isBulk ? (
        <div className="a-muted" style={{ fontSize: '0.82rem' }}>
          🚛 Вывоз навалом — контейнеры не нужны. Детали укажите в комментарии.
        </div>
      ) : (
      <>
      <div className="a-section-title">Позиции</div>
      {items.map((it, i) => (
        <div key={i} className="a-posrow" style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
          <label className="a-field" style={{ flex: '0 0 auto', width: 140 }}><span>Действие</span>
            <select className="a-select" value={it.action} onChange={(e) => setItem(i, { action: e.target.value })}>
              {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {sections.length > 0 && (
            <label className="a-field" style={{ flex: '0 0 auto', width: 120 }}><span>Участок</span>
              <select className="a-select" value={it.section_id} onChange={(e) => setItem(i, { section_id: e.target.value })}>
                <option value="">Весь объект</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <label className="a-field" style={{ flex: '0 0 auto', width: 100 }}><span>Размер</span>
            <select className="a-select" value={sizeOf(it)}
              onChange={(e) => setItem(i, { container_type_id: e.target.value })}
              title="По размеру подбирается машина">
              <option value="">— размер —</option>
              {contTypes.map((ct) => <option key={ct.id} value={ct.id}>{ct.volume != null ? `${Number(ct.volume)} м³` : ct.name}</option>)}
            </select>
          </label>
          <label className="a-field" style={{ flex: '0 0 auto', width: 120 }}><span>№ контейнера</span>
            <input className="a-input" value={it.container_numbers}
              onChange={(e) => setItem(i, { container_numbers: e.target.value })}
              placeholder="напр. 12, 15" title="Номер(а) контейнера" />
          </label>
          <label className="a-field" style={{ flex: '0 0 auto', width: 72 }}><span>Кол-во</span>
            <input className="a-input" type="number" min={1} value={it.quantity}
              onChange={(e) => setItem(i, { quantity: e.target.value })} />
          </label>
          <button type="button" className="a-x" style={{ flex: '0 0 auto' }}
            onClick={() => delRow(i)} disabled={items.length === 1} title="Удалить позицию">✕</button>
        </div>
      ))}
      <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={addRow}>+ Позиция</button>
      </>
      )}

      <div className="a-section-title">Детали</div>
      <div className="a-field-row">
        <label className="a-field"><span>Дата заезда</span>
          <DateField value={desiredDate} onChange={setDesiredDate} style={{ width: '100%' }} />
        </label>
        <label className="a-field"><span>Желаемое время</span>
          <TimeSlotSelect value={desiredTime} onChange={setDesiredTime} />
        </label>
      </div>
      <div className="a-field-row">
        <label className="a-field"><span>Оплата</span>
          <select className="a-select" value={payment} onChange={(e) => setPayment(e.target.value)}>
            <option value="cashless">Безнал</option>
            <option value="cash">Наличные</option>
          </select>
        </label>
        {payment === 'cash' && (
          <label className="a-field"><span>Сумма, ₽</span>
            <input className="a-input" type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="напр. 3500" />
          </label>
        )}
      </div>
      {/* Доверенное лицо в заявке не выбираем: оно прикреплено к объекту/участку на уровне
          клиента — оттуда берётся и контакт для водителя, и адресаты отчётов. */}
      <label className="a-field"><span>Комментарий</span>
        <textarea className="a-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Детали, код от ворот, контакт на месте…" />
      </label>
    </Modal>
  )
}

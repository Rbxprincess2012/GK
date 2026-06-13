import { useState, useEffect, useMemo } from 'react'
import { useClientsStore } from '@/store/clientsStore'
import { useOrdersStore } from '@/store/ordersStore'
import { Modal } from '@/components/admin/Modal'
import { useToast } from '@/components/admin/Toast'
import { TimeSlotSelect } from '@/components/admin/DesiredTime'

const ACTIONS = [['place', 'Поставить'], ['replace', 'Заменить'], ['haul', 'Забрать']]
const clientLabel = (c) => c.nickname || c.legal_name || `Клиент #${c.id}`
const norm = (s) => (s || '').trim().toLowerCase()
// Лейбл объекта: неформальное имя, но если оно совпадает с названием заказчика —
// не дублируем (заказчик уже выбран рядом), показываем адрес.
const objLabel = (o, clientNames = []) => {
  const inf = (o.informal_name || '').trim()
  const dupClient = inf && clientNames.some((n) => norm(n) === norm(inf))
  const addr = [o.street_name, o.house && `д. ${o.house}`].filter(Boolean).join(', ')
  return (inf && !dupClient ? inf : '') || addr || `Объект №${o.id}`
}

const newItem = () => ({ action: 'replace', section_id: '', quantity: 1 })

// Ручное создание заявки менеджером (статус new → дальше распределяется как обычно).
export function CreateOrderModal({ onClose, onCreated }) {
  const { clients, fetchClients, objectsByClient, fetchObjects, trustedByClient, fetchTrusted } = useClientsStore()
  const { addOrder } = useOrdersStore()
  const toast = useToast()

  const [clientId, setClientId] = useState('')
  const [objectId, setObjectId] = useState('')
  const [items, setItems] = useState([newItem()])
  const [desiredDate, setDesiredDate] = useState('')
  const [desiredTime, setDesiredTime] = useState('')
  const [payment, setPayment] = useState('cashless')
  const [amount, setAmount] = useState('')
  const [trustedId, setTrustedId] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchClients() }, [fetchClients])

  // Смена клиента → грузим его объекты и доверенных лиц, сбрасываем зависимые поля.
  const changeClient = (id) => {
    setClientId(id); setObjectId(''); setTrustedId('')
    if (!id) return
    fetchObjects(Number(id))
    fetchTrusted(Number(id))
    const c = clients.find((x) => x.id === Number(id))
    if (c?.default_payment_method) setPayment(c.default_payment_method)
  }

  // Заказчики в дропдауне — по алфавиту (как видит менеджер: ник/название).
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => clientLabel(a).localeCompare(clientLabel(b), 'ru')),
    [clients],
  )
  const objects = objectsByClient[Number(clientId)] || []
  const persons = trustedByClient[Number(clientId)] || []
  const selectedClient = clients.find((x) => x.id === Number(clientId))
  const clientNames = [selectedClient?.legal_name, selectedClient?.nickname]
  const currentObject = objects.find((o) => o.id === Number(objectId))
  const sections = currentObject?.sections || []

  const setItem = (i, patch) => setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...patch } : it)))
  const addRow = () => setItems((arr) => [...arr, newItem()])
  const delRow = (i) => setItems((arr) => arr.filter((_, idx) => idx !== i))

  const canSave = useMemo(() => Number(objectId) > 0 && !saving, [objectId, saving])

  const save = async () => {
    if (!Number(objectId)) { toast.error('Выберите объект'); return }
    const payloadItems = items
      .filter((it) => Number(it.quantity) > 0)
      .map((it) => ({
        action: it.action,
        section_id: it.section_id === '' ? null : Number(it.section_id),
        quantity: Number(it.quantity),
      }))
    const payload = {
      object_id: Number(objectId),
      desired_date: desiredDate || undefined,
      desired_time: desiredTime || undefined,
      payment_method: payment,
      amount: payment === 'cash' && amount !== '' ? Number(amount) : null,
      trusted_person_id: trustedId ? Number(trustedId) : null,
      note: note.trim() || undefined,
      ...(payloadItems.length ? { items: payloadItems } : {}),
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
      width={560}
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
          <select className="a-select" value={objectId} onChange={(e) => setObjectId(e.target.value)} disabled={!clientId}>
            <option value="">{clientId ? '— выберите —' : 'сначала заказчик'}</option>
            {objects.map((o) => <option key={o.id} value={o.id}>{objLabel(o, clientNames)}</option>)}
          </select>
        </label>
      </div>

      <div className="a-section-title">Позиции</div>
      {items.map((it, i) => (
        <div key={i} className="a-field-row" style={{ alignItems: 'flex-end' }}>
          <label className="a-field"><span>Действие</span>
            <select className="a-select" value={it.action} onChange={(e) => setItem(i, { action: e.target.value })}>
              {ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          {sections.length > 0 && (
            <label className="a-field"><span>Участок</span>
              <select className="a-select" value={it.section_id} onChange={(e) => setItem(i, { section_id: e.target.value })}>
                <option value="">Весь объект</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <label className="a-field" style={{ maxWidth: 96 }}><span>Кол-во</span>
            <input className="a-input" type="number" min={1} value={it.quantity}
              onChange={(e) => setItem(i, { quantity: e.target.value })} />
          </label>
          <button type="button" className="a-btn a-btn--danger a-btn--sm" style={{ marginBottom: 2 }}
            onClick={() => delRow(i)} disabled={items.length === 1} title="Удалить позицию">✕</button>
        </div>
      ))}
      <button type="button" className="a-btn a-btn--ghost a-btn--sm" onClick={addRow}>+ Позиция</button>

      <div className="a-section-title">Детали</div>
      <div className="a-field-row">
        <label className="a-field"><span>Дата заезда</span>
          <input className="a-input" type="date" value={desiredDate} onChange={(e) => setDesiredDate(e.target.value)} />
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
      <label className="a-field"><span>Доверенное лицо</span>
        <select className="a-select" value={trustedId} onChange={(e) => setTrustedId(e.target.value)} disabled={!clientId}>
          <option value="">— не указано —</option>
          {persons.map((p) => <option key={p.id} value={p.id}>{p.name}{p.phone ? ` · ${p.phone}` : ''}</option>)}
        </select>
      </label>
      <label className="a-field"><span>Комментарий</span>
        <textarea className="a-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Детали, код от ворот, контакт на месте…" />
      </label>
    </Modal>
  )
}

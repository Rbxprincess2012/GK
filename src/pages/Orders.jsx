import { useState, useEffect, useCallback } from 'react'
import { useOrdersStore } from '@/store/ordersStore'
import { useObjectsStore } from '@/store/objectsStore'
import { useContainersStore } from '@/store/containersStore'
import { Modal } from '@/components/admin/Modal'
import { OrderModal } from '@/components/admin/OrderModal'
import { useToast } from '@/components/admin/Toast'
import { STATUS, clientName, orderTitle } from '@/lib/orderUi'

const FILTERS = [['', 'Все'], ['pending_review', 'На проверке'], ['new', 'Новые'], ['assigned', 'Назначены'], ['done', 'Выполнены'], ['closed', 'Закрыты']]

function objName(o) {
  if (!o) return ''
  return o.informal_name || [o.street_name, o.house && `д. ${o.house}`].filter(Boolean).join(', ') || `#${o.id}`
}

const emptyItem = { action: 'place', container_type_id: '', quantity: 1, waste_class: '' }

export default function Orders() {
  const { orders, fetchOrders, getOrder, addOrder } = useOrdersStore()
  const { objects, fetchAll } = useObjectsStore()
  const { types, fetchTypes } = useContainersStore()
  const toast = useToast()
  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [detail, setDetail] = useState(null)

  const refresh = useCallback(() => fetchOrders(filter ? { status: filter } : {}), [fetchOrders, filter])
  useEffect(() => { refresh() }, [refresh])
  useEffect(() => { fetchAll(); fetchTypes() }, [fetchAll, fetchTypes])

  const openDetail = async (o) => {
    const full = await getOrder(o.id)
    setDetail({ ...o, ...full })
  }

  return (
    <div className="a-page">
      <div className="a-page-header">
        <h2>Заявки <span className="a-count">{orders.length}</span></h2>
        <button className="a-btn a-btn--primary" onClick={() => setCreating(true)} disabled={!objects.length}>+ Заявка</button>
      </div>

      <div className="a-chip-bar">
        {FILTERS.map(([v, label]) => (
          <button key={v} className={'a-chip' + (filter === v ? ' active' : '')} onClick={() => setFilter(v)}>{label}</button>
        ))}
      </div>

      <div className="a-table-wrap">
        <table className="a-table">
          <thead>
            <tr><th>№</th><th>Клиент</th><th>Объект</th><th>Район</th><th>Желаемая дата</th><th>Водитель</th><th>Статус</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(o)}>
                <td style={{ fontWeight: 700 }}>{o.number ? `#${o.number}` : <span className="a-muted" style={{ fontWeight: 400 }}>черновик</span>}</td>
                <td>{clientName(o)}</td>
                <td className="a-muted">{orderTitle(o)}</td>
                <td>{o.district ? <span className="a-badge a-badge--purple">{o.district_alias || o.district}</span> : '—'}</td>
                <td className="a-muted">{o.desired_date?.slice(0, 10) || '—'}{o.desired_time ? ` ${o.desired_time.slice(0, 5)}` : ''}</td>
                <td className="a-muted">{o.driver_name || '—'}</td>
                <td><span className={`a-badge a-badge--${STATUS[o.status]?.[1]}`}>{STATUS[o.status]?.[0]}</span></td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} className="a-loading">Заявок нет</td></tr>}
          </tbody>
        </table>
      </div>

      {creating && (
        <CreateOrder
          objects={objects} types={types}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); refresh() }}
          addOrder={addOrder} toast={toast}
        />
      )}

      {detail && (
        <OrderModal
          order={detail} types={types}
          onClose={() => setDetail(null)}
          onChanged={() => { refresh(); setDetail(null) }}
        />
      )}
    </div>
  )
}

// ── Создание заявки ──
function CreateOrder({ objects, types, onClose, onSaved, addOrder, toast }) {
  const [form, setForm] = useState({ object_id: '', payment_method: '', desired_date: '', desired_time: '', note: '' })
  const [items, setItems] = useState([{ ...emptyItem, container_type_id: types[0]?.id ?? '' }])

  const setItem = (i, patch) => setItems((arr) => arr.map((it, j) => (j === i ? { ...it, ...patch } : it)))
  const addItem = () => setItems((arr) => [...arr, { ...emptyItem, container_type_id: types[0]?.id ?? '' }])
  const delItem = (i) => setItems((arr) => arr.filter((_, j) => j !== i))

  const valid = form.object_id && items.every((it) => it.container_type_id && it.quantity > 0)

  const save = async () => {
    const payload = {
      object_id: Number(form.object_id),
      items: items.map((it) => ({
        action: it.action,
        container_type_id: Number(it.container_type_id),
        quantity: Number(it.quantity),
        ...(it.waste_class ? { waste_class: it.waste_class } : {}),
      })),
      ...(form.payment_method ? { payment_method: form.payment_method } : {}),
      ...(form.desired_date ? { desired_date: form.desired_date } : {}),
      ...(form.desired_time ? { desired_time: form.desired_time } : {}),
      ...(form.note ? { note: form.note } : {}),
    }
    try { await addOrder(payload); toast.success('Заявка создана'); onSaved() }
    catch { toast.error('Ошибка создания заявки') }
  }

  return (
    <Modal
      title="Новая заявка" onClose={onClose} width={560}
      footer={<>
        <button className="a-btn a-btn--ghost" onClick={onClose}>Отмена</button>
        <button className="a-btn a-btn--primary" onClick={save} disabled={!valid}>Создать</button>
      </>}
    >
      <label className="a-field"><span>Объект *</span>
        <select className="a-select" value={form.object_id} onChange={(e) => setForm({ ...form, object_id: e.target.value })}>
          <option value="">— выберите объект —</option>
          {objects.map((o) => (
            <option key={o.id} value={o.id}>{(o.client_nickname || o.client_legal_name)} · {objName(o)}</option>
          ))}
        </select>
      </label>

      <div className="a-section-title">Позиции</div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 8 }}>
          <label className="a-field" style={{ flex: '0 0 120px' }}><span>Действие</span>
            <select className="a-select" value={it.action} onChange={(e) => setItem(i, { action: e.target.value })}>
              <option value="place">Установить</option>
              <option value="replace">Заменить</option>
              <option value="haul">Вывезти</option>
            </select>
          </label>
          <label className="a-field" style={{ flex: 1 }}><span>Тип</span>
            <select className="a-select" value={it.container_type_id} onChange={(e) => setItem(i, { container_type_id: e.target.value })}>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="a-field" style={{ flex: '0 0 64px' }}><span>Кол-во</span>
            <input className="a-input" type="number" min={1} value={it.quantity} onChange={(e) => setItem(i, { quantity: e.target.value })} />
          </label>
          <label className="a-field" style={{ flex: '0 0 80px' }}><span>Класс</span>
            <select className="a-select" value={it.waste_class} onChange={(e) => setItem(i, { waste_class: e.target.value })}>
              <option value="">—</option><option value="4">4</option><option value="5">5</option>
            </select>
          </label>
          {items.length > 1 && <button className="a-btn a-btn--danger a-btn--sm" style={{ marginBottom: 2 }} onClick={() => delItem(i)}>✕</button>}
        </div>
      ))}
      <button className="a-btn a-btn--ghost a-btn--sm" onClick={addItem}>+ Позиция</button>

      <div className="a-section-title">Детали</div>
      <div className="a-field-row">
        <label className="a-field"><span>Желаемая дата</span>
          <input className="a-input" type="date" value={form.desired_date} onChange={(e) => setForm({ ...form, desired_date: e.target.value })} />
        </label>
        <label className="a-field"><span>Время</span>
          <input className="a-input" type="time" value={form.desired_time} onChange={(e) => setForm({ ...form, desired_time: e.target.value })} />
        </label>
        <label className="a-field"><span>Оплата</span>
          <select className="a-select" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
            <option value="">Как у клиента</option>
            <option value="cashless">Безнал</option><option value="cash">Нал</option>
          </select>
        </label>
      </div>
      <label className="a-field"><span>Примечание</span>
        <input className="a-input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
      </label>
    </Modal>
  )
}
